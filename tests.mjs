// tests.mjs — headless, dependency-free test harness for logic.js.
// Run with:  node tests.mjs
// Prints PASS/FAIL lines; exits non-zero if any assertion fails.

import { readFileSync } from "node:fs";
import {
  tasksForDay,
  isDayComplete,
  currentStreak,
  toggleCompletion,
  serializeState,
  deserializeState,
  dayOfWeek,
  addDays,
  monthKeyOf,
  previousMonthKey,
  monthLabel,
  lastDateOfMonth,
  formatLongDate,
  instructionDates,
  instructionDayCount,
  recordDaysForMonth,
  monthHasRecord,
  ageOn,
  kidAgeFor,
  describeRecurrence,
  buildMonthlyRecordHtml,
  recordFileName,
  escapeHtml,
} from "./logic.js";
import { defaultConfig } from "./config.default.js";
import { createSync, normaliseAddress, TOKEN_HEADER } from "./sync.js";

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    passed++;
    console.log("PASS  " + name);
  } else {
    failed++;
    console.log("FAIL  " + name);
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name + (a === e ? "" : `  (got ${a}, expected ${e})`), a === e);
}

// --- Fixed, known calendar anchors (verified by hand) -------------------
// 2026-06-15 is a MONDAY. 2026-06-18 is a THURSDAY. 2026-06-20 is a SATURDAY.
const MON = "2026-06-15";
const TUE = "2026-06-16";
const WED = "2026-06-17";
const THU = "2026-06-18";
const FRI = "2026-06-19";
const SAT = "2026-06-20";
const SUN = "2026-06-21";

check("dayOfWeek Monday=1", dayOfWeek(MON) === 1);
check("dayOfWeek Thursday=4", dayOfWeek(THU) === 4);
check("dayOfWeek Saturday=6", dayOfWeek(SAT) === 6);
check("addDays forward across week", addDays(MON, 5) === SAT);
check("addDays backward", addDays(MON, -1) === "2026-06-14");
check("addDays month rollover", addDays("2026-06-30", 1) === "2026-07-01");

// --- Test config exercising all three recurrence kinds ------------------
const config = {
  parentPin: "1234",
  kids: [
    {
      id: "kid",
      name: "Kid",
      tasks: [
        { id: "t-daily", label: "Daily", icon: "⭐", recurrence: { type: "daily" } },
        { id: "t-wd", label: "Weekdays", icon: "📘", recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] } },
        { id: "t-weekly", label: "Weekly Thu", icon: "🔬", recurrence: { type: "weekly", day: 4 } },
      ],
    },
  ],
};

// --- Recurrence resolution ---------------------------------------------
eq("Monday due tasks", tasksForDay(config, "kid", MON).map((t) => t.id), ["t-daily", "t-wd"]);
eq("Thursday due tasks (adds weekly)", tasksForDay(config, "kid", THU).map((t) => t.id), ["t-daily", "t-wd", "t-weekly"]);
eq("Saturday due tasks (daily only)", tasksForDay(config, "kid", SAT).map((t) => t.id), ["t-daily"]);
eq("Unknown kid -> empty", tasksForDay(config, "nope", MON), []);

// --- isDayComplete ------------------------------------------------------
let comps = {};
check("empty day not complete (Monday has due tasks)", isDayComplete(config, "kid", MON, comps) === false);

comps = toggleCompletion(comps, "kid", MON, "t-daily");
check("one of two done -> not complete", isDayComplete(config, "kid", MON, comps) === false);

comps = toggleCompletion(comps, "kid", MON, "t-wd");
check("both done -> complete", isDayComplete(config, "kid", MON, comps) === true);

// A day with no due tasks: invent a config with a weekly-only task on Sat.
const sparse = { kids: [{ id: "k", tasks: [{ id: "x", recurrence: { type: "weekly", day: 1 } }] }] };
check("day with zero due tasks -> complete", isDayComplete(sparse, "k", SAT, {}) === true);

// --- toggleCompletion immutability & toggle behavior --------------------
const before = {};
const after = toggleCompletion(before, "kid", MON, "t-daily");
check("toggle does not mutate input (input stays empty)", Object.keys(before).length === 0);
check("toggle marks task complete", after.kid[MON]["t-daily"] === true);
const back = toggleCompletion(after, "kid", MON, "t-daily");
check("toggle again clears it", back.kid && back.kid[MON] && back.kid[MON]["t-daily"] === undefined);
check("toggle returns a new object reference", after !== before);

// --- currentStreak: consecutive complete days, stops at a gap -----------
// Build completions where Tue,Wed,Thu,Fri (relative to SAT) are all complete,
// but Monday is NOT — so streak measured up to SAT should be 4 then stop.
function completeDay(c, kidId, date) {
  let out = c;
  for (const t of tasksForDay(config, kidId, date)) {
    out = toggleCompletion(out, kidId, date, t.id);
  }
  return out;
}

let streakComps = {};
streakComps = completeDay(streakComps, "kid", TUE);
streakComps = completeDay(streakComps, "kid", WED);
streakComps = completeDay(streakComps, "kid", THU);
streakComps = completeDay(streakComps, "kid", FRI);
// MON deliberately left incomplete (gap), SAT/SUN not completed either.
// Streak measured AS OF SAT counts prior complete days: Fri,Thu,Wed,Tue = 4,
// then Mon is incomplete -> stop.
check("streak counts 4 consecutive prior complete days", currentStreak(config, "kid", SAT, streakComps) === 4);

// Streak measured AS OF FRI: counts Thu,Wed,Tue = 3, Mon incomplete -> stop.
check("streak stops at the Monday gap", currentStreak(config, "kid", FRI, streakComps) === 3);

// No completions at all -> streak 0.
check("no completions -> streak 0", currentStreak(config, "kid", SAT, {}) === 0);

// Streak skips days with no due tasks: complete the daily on SUN, then
// measure as of SUN looking back — Saturday only has the daily task; if it's
// not done, the run breaks. Confirm a zero result when prior day incomplete.
check("incomplete prior day -> streak 0 as of SUN", currentStreak(config, "kid", SUN, {}) === 0);

// --- serialize / deserialize round-trip ---------------------------------
const state = { config, completions: streakComps };
const json = serializeState(state);
const round = deserializeState(json);
eq("serialize->deserialize config round-trips", round.config, config);
eq("serialize->deserialize completions round-trips", round.completions, streakComps);
check("deserialize accepts an already-parsed object", deserializeState({ config, completions: {} }).completions !== undefined);
check("serializeState produces a string", typeof json === "string");

// ========================================================================
// PHASE 3 — resource titles + the monthly record
// ========================================================================

// --- Date helpers used by the record ------------------------------------
check("monthKeyOf strips the day", monthKeyOf("2026-08-14") === "2026-08");
check("previousMonthKey mid-year", previousMonthKey("2026-08") === "2026-07");
check("previousMonthKey crosses the year boundary", previousMonthKey("2026-01") === "2025-12");
check("monthLabel is human", monthLabel("2026-08") === "August 2026");
check("lastDateOfMonth 31-day month", lastDateOfMonth("2026-08") === "2026-08-31");
check("lastDateOfMonth 30-day month", lastDateOfMonth("2026-09") === "2026-09-30");
check("lastDateOfMonth February 2028 (leap)", lastDateOfMonth("2028-02") === "2028-02-29");
check("formatLongDate spells everything out",
  formatLongDate("2026-08-14") === "Friday 14 August 2026");
check("recordFileName is dated", recordFileName("2026-08") === "instruction-record-2026-08.html");

// --- Age at the end of the covered month -------------------------------
check("ageOn 2019-03-12 at 2026-08-31", ageOn("2019-03-12", "2026-08-31") === 7);
check("ageOn 2019-03-12 at 2026-03-11", ageOn("2019-03-12", "2026-03-11") === 6);
check("ageOn 2019-03-12 at 2026-03-12", ageOn("2019-03-12", "2026-03-12") === 7);
check("ageOn 2021-06-30 at 2026-06-30", ageOn("2021-06-30", "2026-06-30") === 5);
check("ageOn 2021-06-30 at 2026-06-29", ageOn("2021-06-30", "2026-06-29") === 4);
check("ageOn 2020-02-29 at 2026-02-28", ageOn("2020-02-29", "2026-02-28") === 6);
check("ageOn 2020-02-29 at 2026-03-01", ageOn("2020-02-29", "2026-03-01") === 6);
check("ageOn 2024-02-29 at 2028-02-29", ageOn("2024-02-29", "2028-02-29") === 4);
check("ageOn 2018-12-31 at 2026-01-01", ageOn("2018-12-31", "2026-01-01") === 7);
check("ageOn 2026-08-31 at 2026-08-31", ageOn("2026-08-31", "2026-08-31") === 0);
check("ageOn rejects a birth date after the target date", ageOn("2026-09-15", "2026-08-31") === null);
check("ageOn rejects an undefined birth date", ageOn(undefined, "2026-08-31") === null);
check("ageOn rejects a non-padded birth date", ageOn("2019-3-12", "2026-08-31") === null);
check("ageOn rejects 2019-02-29", ageOn("2019-02-29", "2026-08-31") === null);
check("ageOn rejects month 13", ageOn("2019-13-01", "2026-08-31") === null);

check("kidAgeFor prefers born over a stale age",
  kidAgeFor({ born: "2019-03-12", age: 5 }, "2026-08-31") === 7);
check("kidAgeFor falls back to age", kidAgeFor({ age: 5 }, "2026-08-31") === 5);
check("kidAgeFor gives null for neither", kidAgeFor({}, "2026-08-31") === null);

// --- Human recurrence descriptions ------------------------------------
check("describeRecurrence daily",
  describeRecurrence({ type: "daily" }) === "Every day");
check("describeRecurrence Monday to Friday",
  describeRecurrence({ type: "weekdays", days: [1, 2, 3, 4, 5] }) === "Monday to Friday");
check("describeRecurrence unordered Monday to Friday",
  describeRecurrence({ type: "weekdays", days: [5, 4, 3, 2, 1] }) === "Monday to Friday");
check("describeRecurrence all seven days",
  describeRecurrence({ type: "weekdays", days: [0, 1, 2, 3, 4, 5, 6] }) === "Every day");
check("describeRecurrence several weekdays",
  describeRecurrence({ type: "weekdays", days: [1, 3, 5] }) === "Mondays, Wednesdays and Fridays");
check("describeRecurrence one weekday",
  describeRecurrence({ type: "weekdays", days: [3] }) === "Wednesdays");
check("describeRecurrence weekly",
  describeRecurrence({ type: "weekly", day: 3 }) === "Wednesdays");
check("describeRecurrence empty days",
  describeRecurrence({ type: "weekdays", days: [] }) === "No days set");
check("describeRecurrence missing recurrence",
  describeRecurrence(undefined) === "No days set");
check("describeRecurrence invalid weekly day",
  describeRecurrence({ type: "weekly", day: 9 }) === "No days set");

// --- A config carrying resource titles ----------------------------------
const recConfig = {
  kids: [
    {
      id: "kidA", name: "Child 1", age: 7,
      tasks: [
        { id: "t-maths", label: "Maths", icon: "🧮", resource: "Beast Academy Level 3", recurrence: { type: "daily" } },
        { id: "t-music", label: "Music", icon: "🎵", resource: "Piano at home", recurrence: { type: "daily" } },
        { id: "t-bare", label: "Nature walk", icon: "🌳", recurrence: { type: "daily" } },
      ],
    },
    { id: "kidB", name: "Child 2", age: 5, tasks: [
        { id: "t-phonics", label: "Phonics", icon: "🔤", resource: "Structured synthetic phonics", recurrence: { type: "daily" } },
    ] },
  ],
};

const AUG14 = "2026-08-14";
const AUG20 = "2026-08-20";
const SEP02 = "2026-09-02";

function tick(c, kidId, date, taskId) {
  const kid = recConfig.kids.find((k) => k.id === kidId);
  const task = kid.tasks.find((t) => t.id === taskId);
  return toggleCompletion(c, kidId, date, taskId, { label: task.label, resource: task.resource || "" });
}

let rec = {};
rec = tick(rec, "kidA", AUG14, "t-maths");
rec = tick(rec, "kidA", AUG14, "t-music");
rec = tick(rec, "kidA", AUG20, "t-maths");
rec = tick(rec, "kidA", SEP02, "t-maths");
rec = tick(rec, "kidB", AUG14, "t-phonics");

// --- Snapshot on tick ---------------------------------------------------
eq("tick stores the label and resource of the day",
  rec.kidA[AUG14]["t-maths"], { label: "Maths", resource: "Beast Academy Level 3" });
check("tick without a snapshot still stores plain true",
  toggleCompletion({}, "kidA", AUG14, "t-maths").kidA[AUG14]["t-maths"] === true);
check("a snapshotted entry still counts as complete",
  isDayComplete({ kids: [{ id: "kidA", tasks: [{ id: "t-maths", recurrence: { type: "daily" } }] }] },
    "kidA", AUG14, rec) === true);
check("untick removes a snapshotted entry",
  toggleCompletion(rec, "kidA", AUG14, "t-maths").kidA[AUG14]["t-maths"] === undefined);

// --- instructionDates / instructionDayCount -----------------------------
eq("instruction dates are the days actually worked",
  instructionDates(rec, "kidA"), [AUG14, AUG20, SEP02]);
check("days this year counts up to the date given",
  instructionDayCount(rec, "kidA", "2026-08-31") === 2);
check("days this year includes later months when asked later",
  instructionDayCount(rec, "kidA", "2026-12-31") === 3);
check("days this year ignores a different year",
  instructionDayCount(rec, "kidA", "2027-12-31") === 0);
check("a kid with no history has no days", instructionDayCount(rec, "nobody", "2026-12-31") === 0);

// --- recordDaysForMonth -------------------------------------------------
const augA = recordDaysForMonth(recConfig, "kidA", "2026-08", rec);
eq("August has the two days worked", augA.map((r) => r.date), [AUG14, AUG20]);
eq("the 14th lists both subjects in curriculum order",
  augA[0].items.map((i) => i.label), ["Maths", "Music"]);
eq("the 14th names the material used",
  augA[0].items.map((i) => i.resource), ["Beast Academy Level 3", "Piano at home"]);
check("the row carries a human date", augA[0].longDate === "Friday 14 August 2026");
eq("a month with nothing in it is empty",
  recordDaysForMonth(recConfig, "kidA", "2026-07", rec), []);
check("month with any child's history is offerable",
  monthHasRecord(recConfig, "2026-08", rec) === true);
check("month with no history is not offered",
  monthHasRecord(recConfig, "2026-07", rec) === false);

// --- THE DEFECT THIS FIXES: the curriculum changes, the record does not --
// Damon is promised he can rename a subject or move a child to the next book
// without a developer. If the record read names from the live config, doing so
// would silently rewrite every past month. It must not.
const renamedConfig = JSON.parse(JSON.stringify(recConfig));
renamedConfig.kids[0].tasks[0].label = "Mathematics";
renamedConfig.kids[0].tasks[0].resource = "Beast Academy Level 4";
const augRenamed = recordDaysForMonth(renamedConfig, "kidA", "2026-08", rec);
check("renaming a subject does NOT rewrite the past month's subject",
  augRenamed[0].items[0].label === "Maths");
check("changing the book does NOT rewrite the past month's book",
  augRenamed[0].items[0].resource === "Beast Academy Level 3");
// The same month can hold both wordings: the 2nd was ticked as "Maths", the
// 10th after the rename as "Mathematics". Each day keeps its own.
const sepMixed = recordDaysForMonth(renamedConfig, "kidA", "2026-09",
  toggleCompletion(rec, "kidA", "2026-09-10", "t-maths",
    { label: "Mathematics", resource: "Beast Academy Level 4" }));
eq("each day in a month keeps the wording it was ticked with",
  sepMixed.map((r) => r.items[0].label), ["Maths", "Mathematics"]);
eq("and the book title it was ticked with",
  sepMixed.map((r) => r.items[0].resource),
  ["Beast Academy Level 3", "Beast Academy Level 4"]);

// Deleting a task entirely: history survives, with its own wording.
const prunedConfig = JSON.parse(JSON.stringify(recConfig));
prunedConfig.kids[0].tasks = prunedConfig.kids[0].tasks.filter((t) => t.id !== "t-music");
const augPruned = recordDaysForMonth(prunedConfig, "kidA", "2026-08", rec);
check("deleting a task keeps its past days in the record",
  augPruned[0].items.length === 2);
check("a deleted task still prints the name it was ticked with",
  augPruned[0].items[1].label === "Music");

// Legacy entries (written before snapshots existed) fall back to config.
let legacy = toggleCompletion({}, "kidA", AUG14, "t-maths"); // bare `true`
check("a legacy entry falls back to the current curriculum name",
  recordDaysForMonth(recConfig, "kidA", "2026-08", legacy)[0].items[0].label === "Maths");
check("a legacy entry for a deleted task prints its id, flagged removed",
  recordDaysForMonth(prunedConfig, "kidA", "2026-08",
    toggleCompletion({}, "kidA", AUG14, "t-music"))[0].items[0].removed === true);

// --- The printed page ---------------------------------------------------
const html = buildMonthlyRecordHtml({
  config: recConfig, completions: rec, monthKey: "2026-08", generatedOn: "2026-09-01",
});

function frontOf(documentHtml) {
  const start = documentHtml.indexOf('<section class="record-page front-page">');
  const next = documentHtml.indexOf('<section class="record-page', start + 1);
  return documentHtml.slice(start, next === -1 ? undefined : next);
}

const front = frontOf(html);
check("record is a complete HTML document", /^<!DOCTYPE html>/.test(html) && /<\/html>/.test(html));
check("record names the month in full", html.includes("August 2026"));
check("record names each child", html.includes("Child 1") && html.includes("Child 2"));
check("record shows the child's age", html.includes("age 7"));
check("record spells out the date of the 14th", html.includes("Friday 14 August 2026"));
check("record names the material by title", html.includes("Beast Academy Level 3"));
check("record shows the running count for the year",
  html.includes("Days of instruction in 2026 so far"));
check("record states when it was produced", html.includes("Tuesday 1 September 2026"));
check("record gives a child with no days an explicit line, not a blank",
  buildMonthlyRecordHtml({ config: recConfig, completions: {}, monthKey: "2026-08", generatedOn: "2026-09-01" })
    .includes("No days of instruction were recorded"));
check("record carries print rules so it paginates", html.includes("@page"));

check("record has a front page plus one page per child",
  (html.match(/class="record-page/g) || []).length === recConfig.kids.length + 1);
check("the front page comes first",
  html.indexOf('class="record-page front-page"') < html.indexOf('class="record-page"'));
check("front page names the record",
  front.includes("Home education record") && front.includes("Year covered") &&
  front.includes("2026") && front.includes("August 2026") &&
  front.includes("Tuesday 1 September 2026"));
check("front page names each child",
  front.includes("Child 1") && front.includes("Child 2"));
check("front page lists the programme with material and days",
  front.includes("Beast Academy Level 3") && front.includes("Piano at home") &&
  front.includes("Every day") && front.includes("material not named in the curriculum"));

const weekdayFront = frontOf(buildMonthlyRecordHtml({
  config: { kids: [{ id: "k", name: "Child", age: 6, tasks: [
    { id: "t", label: "Maths", resource: "Book", recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] } },
  ] }] },
  completions: {}, monthKey: "2026-08", generatedOn: "2026-09-01",
}));
check("front page says Monday to Friday for a weekday task",
  weekdayFront.includes("Monday to Friday"));
check("front page shows the days count per child",
  front.includes('<td class="num">2</td>') && front.includes('<td class="num">1</td>') &&
  front.includes("Days of instruction in 2026 so far"));
check("front page carries its footnote",
  front.includes("This front page describes the weekly programme as it was set in the family's checklist app on the date this record was produced."));

const bornHtml = buildMonthlyRecordHtml({
  config: { kids: [{ id: "k", name: "Child", born: "2019-03-12", age: 5, tasks: [] }] },
  completions: {}, monthKey: "2026-08", generatedOn: "2026-09-01",
});
const bornFront = frontOf(bornHtml);
const bornKidPage = bornHtml.slice(bornHtml.indexOf('<section class="record-page', bornHtml.indexOf('<section class="record-page front-page">') + 1));
check("front page computes the age from the birth date",
  bornFront.includes('<td class="num">7</td>') && !bornFront.includes('<td class="num">5</td>'));
check("the child's page uses the same computed age",
  bornKidPage.includes("age 7") && !bornKidPage.includes("age 5"));

const unknownAgeHtml = buildMonthlyRecordHtml({
  config: { kids: [{ id: "k", name: "Mystery Child", tasks: [] }] },
  completions: {}, monthKey: "2026-08", generatedOn: "2026-09-01",
});
const unknownAgeFront = frontOf(unknownAgeHtml);
const unknownAgeKidPage = unknownAgeHtml.slice(unknownAgeHtml.indexOf('<section class="record-page', unknownAgeHtml.indexOf('<section class="record-page front-page">') + 1));
check("front page says not recorded when no age is known",
  unknownAgeFront.includes("not recorded") && unknownAgeKidPage.includes("Mystery Child") &&
  !unknownAgeKidPage.includes("Mystery Child, age"));
check("front page handles a child with no subjects",
  unknownAgeFront.includes("No subjects are set in the app for this child."));

const noKidsHtml = buildMonthlyRecordHtml({
  config: { kids: [] }, completions: {}, monthKey: "2026-08", generatedOn: "2026-09-01",
});
check("front page handles no children",
  frontOf(noKidsHtml).includes("No children are set in the app.") &&
  (noKidsHtml.match(/class="record-page/g) || []).length === 1);

// A resource title containing HTML must not break (or inject into) the page.
const nastyConfig = { kids: [{ id: "k", name: "A<script>x</script>", age: 6,
  tasks: [{ id: "t", label: "Sub<b>ject", resource: "Book \"&\" <i>Co</i>", recurrence: { type: "daily" } }] }] };
const nastyHtml = buildMonthlyRecordHtml({
  config: nastyConfig,
  completions: toggleCompletion({}, "k", AUG14, "t", { label: "Sub<b>ject", resource: "Book \"&\" <i>Co</i>" }),
  monthKey: "2026-08", generatedOn: "2026-09-01",
});
check("a name containing markup is escaped, not executed",
  !nastyHtml.includes("<script>x</script>") && nastyHtml.includes("&lt;script&gt;"));
check("front page escapes markup in names and titles",
  frontOf(nastyHtml).includes("&lt;script&gt;") &&
  !frontOf(nastyHtml).includes("<script>x") &&
  frontOf(nastyHtml).includes("Book &quot;&amp;&quot; &lt;i&gt;Co&lt;/i&gt;"));
check("escapeHtml handles quotes and ampersands",
  escapeHtml('a&b"c<d') === "a&amp;b&quot;c&lt;d");

// --- HARD CONSTRAINT: the record file reaches nothing ---------------------
// The saved page must open on any device, offline, forever, and must never
// call out. No scripts, no images, no fonts, no links, no URLs at all.
check("record contains no script tag", !/<script/i.test(html));
check("record loads nothing external", !/\bsrc\s*=|<link\b|@import|url\s*\(/i.test(html));
check("record contains no URL of any kind", !/https?:\/\//i.test(html));

// ========================================================================
// PHASE 4 — the app sends its own state home, to an address a parent typed
// ========================================================================

// --- HARD CONSTRAINT: exactly one file may make a network call ------------
// Until 2026-09-10 the rule was "no network write path, ever". Now sync.js is
// the one file allowed to call out, and only to an address read from device
// storage. Every other file must still fail this scan the day it gains a
// call, and sync.js must never carry a host of its own. Enforced by the
// build, not by a promise. The service worker is exempt from the call scan:
// it fetches the app's OWN files from its own origin to work offline.
const appSource = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const logicSource = readFileSync(new URL("./logic.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const syncSource = readFileSync(new URL("./sync.js", import.meta.url), "utf8");
const seedSource = readFileSync(new URL("./config.default.js", import.meta.url), "utf8");
const swSource = readFileSync(new URL("./service-worker.js", import.meta.url), "utf8");
const OUTBOUND = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|new\s+EventSource|navigator\.connection/;
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "");
check("app.js has no way to send anything", !OUTBOUND.test(appSource));
check("logic.js has no way to send anything", !OUTBOUND.test(logicSource));
check("index.html has no way to send anything", !OUTBOUND.test(htmlSource));
check("config.default.js has no way to send anything", !OUTBOUND.test(seedSource));
check("sync.js is the one file that can send (so the scan is live)", OUTBOUND.test(syncSource));
check("sync.js reads the address from settings, not from itself",
  /getSettings\s*\(\)/.test(syncSource) && /normaliseAddress\(\s*settings\.address\s*\)/.test(syncSource));
check("sync.js carries no host, address or scheme of its own",
  !/:\/\//.test(stripComments(syncSource)) && !/\b[a-z0-9-]+\.(ts\.net|local|com|io|net|org|dev)\b/i.test(stripComments(syncSource)));
check("sync.js imports nothing", !/^\s*import\s/m.test(syncSource));
check("the service worker never names an outside host",
  !/https?:\/\/(?!www\.w3\.org)/i.test(stripComments(swSource)));
check("no source file embeds a remote host",
  ![appSource, logicSource, htmlSource, syncSource, seedSource].some((s) =>
    /https?:\/\/(?!www\.w3\.org)/i.test(stripComments(s))));
check("the public seed carries no address and no token",
  !/\b(address|token|sync)\b/i.test(stripComments(seedSource)) &&
  defaultConfig.sync === undefined && defaultConfig.address === undefined && defaultConfig.token === undefined);
check("the service worker caches sync.js with the shell", swSource.includes('"./sync.js"'));

// --- HARD CONSTRAINT: no dependencies, no build step ---------------------
check("logic.js imports nothing", !/^\s*import\s/m.test(logicSource));
check("app.js imports only local files",
  [...appSource.matchAll(/from\s+["']([^"']+)["']/g)].every((m) => m[1].startsWith("./")));

// --- sync.js behaviour, driven with a fake fetch -------------------------
check("normaliseAddress trims", normaliseAddress("  https://x  ") === "https://x");
check("normaliseAddress of nothing is empty", normaliseAddress(undefined) === "" && normaliseAddress("   ") === "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeFetch(behaviour) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (behaviour === "throw") throw new Error("network down");
    if (behaviour === "reject") return { ok: false, status: 403 };
    return { ok: true, status: 204 };
  };
  return { calls, impl };
}
const payload = serializeState({ config: recConfig, completions: rec });

// No address: nothing is ever sent, whatever else happens.
{
  const f = fakeFetch("ok");
  let sentAt = null;
  const s = createSync({ getSettings: () => ({ address: "", token: "abc" }), getPayload: () => payload,
    onSent: (t) => { sentAt = t; }, fetchImpl: f.impl, isOnline: () => true, delayMs: 5 });
  const r = await s.sendNow();
  s.scheduleSend(); await sleep(20);
  check("empty address: sendNow sends nothing", r === false && f.calls.length === 0);
  check("empty address: scheduled send sends nothing", f.calls.length === 0 && sentAt === null);
}
// Address set: one POST, token in the header, body is the export JSON.
{
  const f = fakeFetch("ok");
  let sentAt = null;
  const s = createSync({ getSettings: () => ({ address: " https://home.example/ipad ", token: " secret-word " }),
    getPayload: () => payload, onSent: (t) => { sentAt = t; }, fetchImpl: f.impl, isOnline: () => true,
    now: () => "2026-09-10T14:32:00.000Z", delayMs: 5 });
  const r = await s.sendNow();
  check("with an address: sendNow reports success on 2xx", r === true && f.calls.length === 1);
  check("the address is used trimmed", f.calls[0].url === "https://home.example/ipad");
  check("it is a POST with no cookies", f.calls[0].init.method === "POST" && f.calls[0].init.credentials === "omit");
  check("the token rides in the header, trimmed", f.calls[0].init.headers[TOKEN_HEADER] === "secret-word");
  check("the body is JSON", f.calls[0].init.headers["Content-Type"] === "application/json");
  const body = JSON.parse(f.calls[0].init.body);
  check("the body is the same shape the Export button writes",
    body.version === 1 && body.config && body.completions && f.calls[0].init.body === payload);
  check("the body never carries the token", !f.calls[0].init.body.includes("secret-word"));
  check("success records the time", sentAt === "2026-09-10T14:32:00.000Z");
}
// A burst of taps is one send.
{
  const f = fakeFetch("ok");
  const s = createSync({ getSettings: () => ({ address: "https://home.example/ipad", token: "t" }),
    getPayload: () => payload, fetchImpl: f.impl, isOnline: () => true, delayMs: 10 });
  s.scheduleSend(); s.scheduleSend(); s.scheduleSend();
  check("a scheduled send is pending", s.pending() === true);
  await sleep(40);
  check("three taps inside the window make one send", f.calls.length === 1);
  check("nothing is pending afterwards", s.pending() === false);
}
// Failure is silent: a thrown fetch or a refused token never throws and never
// records a time.
{
  for (const mode of ["throw", "reject"]) {
    const f = fakeFetch(mode);
    let sentAt = null;
    const s = createSync({ getSettings: () => ({ address: "https://home.example/ipad", token: "t" }),
      getPayload: () => payload, onSent: (t) => { sentAt = t; }, fetchImpl: f.impl, isOnline: () => true, delayMs: 5 });
    let threw = false;
    let r;
    try { r = await s.sendNow(); } catch (e) { threw = true; }
    check(`a ${mode === "throw" ? "dead network" : "refused send"} is silent`, !threw && r === false && sentAt === null);
  }
}
// Offline: nothing is attempted.
{
  const f = fakeFetch("ok");
  const s = createSync({ getSettings: () => ({ address: "https://home.example/ipad", token: "t" }),
    getPayload: () => payload, fetchImpl: f.impl, isOnline: () => false, delayMs: 5 });
  const r = await s.sendNow();
  check("offline: nothing is attempted", r === false && f.calls.length === 0);
}
// A tap during a send in flight is not lost: it goes again after landing.
{
  let release;
  const gate = new Promise((res) => { release = res; });
  const calls = [];
  const slowFetch = async (url, init) => { calls.push(init.body); if (calls.length === 1) await gate; return { ok: true }; };
  let version = 0;
  const s = createSync({ getSettings: () => ({ address: "https://home.example/ipad", token: "t" }),
    getPayload: () => String(++version), fetchImpl: slowFetch, isOnline: () => true, delayMs: 5 });
  const first = s.sendNow();
  const second = await s.sendNow();
  check("a send during a send is not started twice", second === false && calls.length === 1);
  release();
  await first;
  await sleep(30);
  check("but the newer state goes out once the first lands", calls.length === 2 && calls[1] === "2");
}
// The app wires the sender to the tap, the open, and the parent panel.
check("app.js sends after a tick", /await saveCompletions\(\);\s*renderToday\(\);\s*sync\.scheduleSend\(\);/.test(appSource));
check("app.js sends on every open", /renderAll\(\);\s*\/\/[^\n]*\n\s*sync\.scheduleSend\(\);/.test(appSource));
check("app.js keeps the address out of the config and the export",
  /kvGet\("sync"\)/.test(appSource) && /kvSet\("sync"/.test(appSource) &&
  !/state\.config\.(sync|address|token)/.test(appSource));
check("Parent Mode shows the last send", htmlSource.includes('id="sync-status"') && appSource.includes("Last sent home"));
check("the address field ships empty", /id="sync-address"[^>]*\/>/.test(htmlSource) && !/id="sync-address"[^>]*value=/.test(htmlSource));

// --- PHASE 3a: every seeded task names its material ----------------------
for (const kid of defaultConfig.kids) {
  for (const task of kid.tasks) {
    check(`seed: "${task.label}" names the material it uses`,
      typeof task.resource === "string" && task.resource.trim().length > 0);
  }
}
check("the seed still uses placeholder names, never real ones",
  defaultConfig.kids.every((k) => /^Child \d$/.test(k.name)));
check("the seed carries no birth date",
  defaultConfig.kids.every((k) => k.born === undefined));

// ------------------------------------------------------------------------
console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
