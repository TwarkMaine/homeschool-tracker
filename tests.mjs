// tests.mjs — headless, dependency-free test harness for logic.js.
// Run with:  node tests.mjs
// Prints PASS/FAIL lines; exits non-zero if any assertion fails.

import {
  tasksForDay,
  isDayComplete,
  currentStreak,
  toggleCompletion,
  serializeState,
  deserializeState,
  dayOfWeek,
  addDays,
} from "./logic.js";

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

// ------------------------------------------------------------------------
console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
