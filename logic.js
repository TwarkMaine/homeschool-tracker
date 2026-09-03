// logic.js — PURE logic module for the homeschool tracker.
//
// HARD RULES for this file:
//   - No DOM (document/window), no storage (indexedDB/localStorage),
//     no clocks (Date.now / new Date() with no args). Everything is a
//     pure function of its arguments so it can be unit-tested under Node
//     AND loaded in the browser via <script type="module">.
//   - Dates are LOCAL "YYYY-MM-DD" strings, always passed in by the caller.
//
// Data shapes (see config.default.js for a worked example):
//
//   config = {
//     parentPin: "1234",
//     kids: [
//       { id, name, age, theme,
//         tasks: [ { id, label, icon, resource, recurrence } ] }
//     ]
//   }
//
//   `resource` names the actual material by title ("Beast Academy Level 3"),
//   as opposed to `label`, which names the subject ("Maths"). It is what makes
//   the printed monthly record legible to someone who has never seen the app.
//
//   recurrence is one of:
//     { type: "daily" }
//     { type: "weekdays", days: [1,2,3,4,5] }   // 0=Sun .. 6=Sat
//     { type: "weekly",   day: 3 }              // a single weekday 0..6
//
//   completions = {
//     [kidId]: {
//       [date]: { [taskId]: entry }   // presence === completed
//     }
//   }
//
//   entry is either:
//     true                          legacy, written before 2026-08-22
//     { label, resource }           a snapshot of what the task was CALLED on
//                                   the day it was ticked
//
//   The snapshot exists because the record must not change when the curriculum
//   does. A parent can rename "Maths" or move a child from Beast Academy Level
//   3 to Level 4 at any time, and is expected to. Resolving names from the live
//   config at print time would silently rewrite March's record in September,
//   which would make the whole record worthless as evidence. So each tick
//   stores the words it will one day be printed with, and the current config is
//   only a fallback for entries written before this existed.
//
//   state = { config, completions }   // the round-trippable bundle

// ----------------------------------------------------------------------
// Date helpers (pure — operate on "YYYY-MM-DD" strings only)
// ----------------------------------------------------------------------

// Parse a local YYYY-MM-DD string into its numeric parts. We construct a
// Date with explicit args (allowed: deterministic, no hidden clock read)
// purely to derive the weekday, then never leak the Date object out.
function parseDateParts(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error("Invalid date string (expected YYYY-MM-DD): " + date);
  return { year: +m[1], month: +m[2], day: +m[3] };
}

// Day of week for a local date string. 0=Sunday .. 6=Saturday.
export function dayOfWeek(date) {
  const { year, month, day } = parseDateParts(date);
  // Construct at local noon to avoid any DST edge weirdness.
  return new Date(year, month - 1, day, 12, 0, 0).getDay();
}

// Return the date string for `date` shifted by `deltaDays` (can be negative).
export function addDays(date, deltaDays) {
  const { year, month, day } = parseDateParts(date);
  const d = new Date(year, month - 1, day, 12, 0, 0);
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// ----------------------------------------------------------------------
// Recurrence resolution
// ----------------------------------------------------------------------

// Does a single recurrence rule fire on the given date?
function recurrenceMatches(recurrence, date) {
  if (!recurrence || !recurrence.type) return false;
  const dow = dayOfWeek(date);
  switch (recurrence.type) {
    case "daily":
      return true;
    case "weekdays":
      return Array.isArray(recurrence.days) && recurrence.days.includes(dow);
    case "weekly":
      return recurrence.day === dow;
    default:
      return false;
  }
}

function findKid(config, kidId) {
  if (!config || !Array.isArray(config.kids)) return null;
  return config.kids.find((k) => k.id === kidId) || null;
}

// The list of task instances due for a kid on a given date.
// Returns the task objects (label/icon/id/recurrence) that fire that day.
export function tasksForDay(config, kidId, date) {
  const kid = findKid(config, kidId);
  if (!kid || !Array.isArray(kid.tasks)) return [];
  return kid.tasks.filter((t) => recurrenceMatches(t.recurrence, date));
}

// ----------------------------------------------------------------------
// Completion queries
// ----------------------------------------------------------------------

// Is a specific task completed for kid/date?
export function isTaskComplete(completions, kidId, date, taskId) {
  return Boolean(
    completions &&
      completions[kidId] &&
      completions[kidId][date] &&
      completions[kidId][date][taskId]
  );
}

// Is the whole day complete (every due task done)?
// A day with zero due tasks is considered complete (nothing to do).
export function isDayComplete(config, kidId, date, completions) {
  const due = tasksForDay(config, kidId, date);
  if (due.length === 0) return true;
  return due.every((t) => isTaskComplete(completions, kidId, date, t.id));
}

// Count of consecutive COMPLETE days strictly BEFORE `date`, walking
// backwards until the first incomplete day. `date` itself is not counted
// (today's streak only "banks" once the prior days form a run); this keeps
// the number stable as today's tasks are still being worked.
export function currentStreak(config, kidId, date, completions) {
  let streak = 0;
  let cursor = addDays(date, -1);
  // Guard against pathological loops; 3650 days = ~10 years is plenty.
  for (let i = 0; i < 3650; i++) {
    if (isDayComplete(config, kidId, cursor, completions)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

// ----------------------------------------------------------------------
// Mutations (immutable — always return a NEW completions structure)
// ----------------------------------------------------------------------

// Toggle a task's completion for kid/date. Never mutates the input.
//
// `snapshot` is optional {label, resource}: what the task was called at the
// moment of the tick. When given it is stored instead of a bare `true`, so the
// printed record keeps the day's own wording even if the curriculum changes
// later. Omitting it stores `true` and keeps the old behaviour exactly.
export function toggleCompletion(completions, kidId, date, taskId, snapshot) {
  const next = {};
  // Shallow-clone each level we touch; leave untouched branches by reference.
  for (const k of Object.keys(completions || {})) {
    next[k] = completions[k];
  }
  const kidMap = {};
  for (const d of Object.keys((completions && completions[kidId]) || {})) {
    kidMap[d] = completions[kidId][d];
  }
  const dayMap = {};
  for (const t of Object.keys((kidMap[date]) || {})) {
    dayMap[t] = kidMap[date][t];
  }

  if (dayMap[taskId]) {
    delete dayMap[taskId];
  } else if (snapshot && (snapshot.label || snapshot.resource)) {
    dayMap[taskId] = {
      label: snapshot.label || "",
      resource: snapshot.resource || "",
    };
  } else {
    dayMap[taskId] = true;
  }

  kidMap[date] = dayMap;
  next[kidId] = kidMap;
  return next;
}

// ----------------------------------------------------------------------
// The monthly record (Phase 3b)
//
// These functions turn the completion history the rings already write into
// a printable page. They read; they never change how completions work.
// ----------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const PLURAL_DAY_NAMES = [
  "Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays",
];

function validDateParts(date) {
  if (typeof date !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const parts = { year: +match[1], month: +match[2], day: +match[3] };
  const roundTrip = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  return roundTrip.getFullYear() === parts.year &&
    roundTrip.getMonth() + 1 === parts.month && roundTrip.getDate() === parts.day
    ? parts
    : null;
}

export function ageOn(born, date) {
  const birth = validDateParts(born);
  const on = validDateParts(date);
  if (!birth || !on || born > date) return null;
  const lastDay = new Date(on.year, birth.month, 0, 12, 0, 0).getDate();
  const anniversaryDay = Math.min(birth.day, lastDay);
  const beforeAnniversary = on.month < birth.month ||
    (on.month === birth.month && on.day < anniversaryDay);
  return on.year - birth.year - (beforeAnniversary ? 1 : 0);
}

export function kidAgeFor(kid, date) {
  const fromBirth = ageOn(kid && kid.born, date);
  if (fromBirth !== null) return fromBirth;
  return kid && Number.isFinite(kid.age) ? kid.age : null;
}

export function describeRecurrence(recurrence) {
  if (!recurrence || typeof recurrence !== "object") return "No days set";
  if (recurrence.type === "daily") return "Every day";
  if (recurrence.type === "weekly") {
    return Number.isInteger(recurrence.day) && recurrence.day >= 0 && recurrence.day <= 6
      ? PLURAL_DAY_NAMES[recurrence.day]
      : "No days set";
  }
  if (recurrence.type !== "weekdays" || !Array.isArray(recurrence.days)) {
    return "No days set";
  }
  const days = [...new Set(recurrence.days.filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6
  ))].sort((a, b) => a - b);
  if (days.length === 0) return "No days set";
  if (days.length === 7) return "Every day";
  if (days.length === 5 && days.every((day, index) => day === index + 1)) {
    return "Monday to Friday";
  }
  if (days.length === 1) return PLURAL_DAY_NAMES[days[0]];
  const names = days.map((day) => PLURAL_DAY_NAMES[day]);
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function parseMonthParts(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) throw new Error("Invalid month string (expected YYYY-MM): " + monthKey);
  return { year: +m[1], month: +m[2] };
}

// "2026-08-14" -> "2026-08"
export function monthKeyOf(date) {
  const { year, month } = parseDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

// "2026-01" -> "2025-12"
export function previousMonthKey(monthKey) {
  const { year, month } = parseMonthParts(monthKey);
  const y = month === 1 ? year - 1 : year;
  const mo = month === 1 ? 12 : month - 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

// "2026-08" -> "August 2026"
export function monthLabel(monthKey) {
  const { year, month } = parseMonthParts(monthKey);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

// "2026-08" -> "2026-08-31" (day 0 of the NEXT month is the last of this one)
export function lastDateOfMonth(monthKey) {
  const { year, month } = parseMonthParts(monthKey);
  const day = new Date(year, month, 0, 12, 0, 0).getDate();
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

// "2026-08-14" -> "Thursday 14 August 2026". Written out in full because the
// reader of this page may never have seen an ISO date in their life.
export function formatLongDate(date) {
  const { year, month, day } = parseDateParts(date);
  return `${DAY_NAMES[dayOfWeek(date)]} ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

// Every date on which this kid completed at least one task, ascending.
export function instructionDates(completions, kidId) {
  const byDate = (completions && completions[kidId]) || {};
  return Object.keys(byDate)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Object.keys(byDate[d] || {}).length > 0)
    .sort();
}

// Days of instruction in the calendar year of `throughDate`, counting that
// date and everything before it. This is the running count the record shows.
export function instructionDayCount(completions, kidId, throughDate) {
  const year = String(parseDateParts(throughDate).year);
  return instructionDates(completions, kidId).filter(
    (d) => d.slice(0, 4) === year && d <= throughDate
  ).length;
}

// What a single stored entry should be PRINTED as. Resolution order matters:
//
//   1. the snapshot written on the day of the tick   <- authoritative
//   2. the task as the curriculum names it TODAY     <- legacy entries only
//   3. the bare task id                              <- deleted + no snapshot
//
// Step 2 is a fallback, never the primary source. If it were primary, renaming
// a subject would retroactively rewrite every past month.
function resolveEntry(entry, taskId, task) {
  if (entry && typeof entry === "object") {
    return {
      id: taskId,
      label: entry.label || (task && task.label) || taskId,
      resource: entry.resource || "",
      icon: (task && task.icon) || "",
      removed: false,
    };
  }
  if (task) {
    return {
      id: taskId,
      label: task.label || taskId,
      resource: task.resource || "",
      icon: task.icon || "",
      removed: false,
    };
  }
  return { id: taskId, label: taskId, resource: "", icon: "", removed: true };
}

// The month's entries for one kid: one row per day worked, each row listing
// the subjects done that day with the material used.
//
// A task completed in the past and later deleted from the curriculum still has
// history under its id. If it was ticked after snapshots existed it prints
// normally, with its own wording. If not, it prints its id and is flagged
// `removed` — better than dropping it (which understates the record) or
// printing a blank line (which confuses the reader).
export function recordDaysForMonth(config, kidId, monthKey, completions) {
  const kid = findKid(config, kidId);
  const tasks = (kid && Array.isArray(kid.tasks) ? kid.tasks : []);
  const order = new Map(tasks.map((t, i) => [t.id, i]));

  return instructionDates(completions, kidId)
    .filter((d) => d.slice(0, 7) === monthKey)
    .map((date) => {
      const doneIds = Object.keys(completions[kidId][date]).filter(
        (id) => completions[kidId][date][id]
      );
      const items = doneIds
        .sort((a, b) => {
          const ia = order.has(a) ? order.get(a) : Number.MAX_SAFE_INTEGER;
          const ib = order.has(b) ? order.get(b) : Number.MAX_SAFE_INTEGER;
          return ia === ib ? a.localeCompare(b) : ia - ib;
        })
        .map((id) =>
          resolveEntry(completions[kidId][date][id], id, tasks.find((t) => t.id === id))
        );
      return { date, longDate: formatLongDate(date), items };
    })
    .filter((row) => row.items.length > 0);
}

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// The whole point of the file: does this month contain anything worth saving?
export function monthHasRecord(config, monthKey, completions) {
  const kids = (config && Array.isArray(config.kids)) ? config.kids : [];
  return kids.some((k) => recordDaysForMonth(config, k.id, monthKey, completions).length > 0);
}

// Print styles live inside the generated file so the saved page is standalone.
// NO external references of any kind: no fonts, no images, no scripts, no
// links off the page. The record must open and print on a device that has
// never heard of this app, and must never reach the network.
const RECORD_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f4f2ee;
    color: #1c1917;
    font: 15px/1.55 "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .record-page {
    background: #fff;
    max-width: 190mm;
    margin: 16px auto;
    padding: 20mm 18mm;
    box-shadow: 0 1px 4px rgba(0,0,0,.14);
  }
  .record-head { border-bottom: 2px solid #1c1917; padding-bottom: 12px; }
  .record-head h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: .01em; }
  .record-head .period { font-size: 26px; font-weight: 700; margin: 6px 0 0; }
  .record-head .who { font-size: 16px; margin: 2px 0 0; color: #44403c; }
  .facts { margin: 14px 0 20px; padding: 0; border: 1px solid #d6d3d1; }
  .facts div {
    display: flex; justify-content: space-between; gap: 16px;
    padding: 7px 12px; border-bottom: 1px solid #e7e5e4;
  }
  .facts div:last-child { border-bottom: 0; }
  .facts dt { margin: 0; color: #44403c; }
  .facts dd { margin: 0; font-weight: 700; text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  caption { text-align: left; font-weight: 700; padding: 0 0 8px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; }
  thead th { border-bottom: 1.5px solid #1c1917; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
  tbody tr { border-bottom: 1px solid #e7e5e4; }
  td.date { white-space: nowrap; width: 34%; }
  ul.subjects { margin: 0; padding: 0; list-style: none; }
  ul.subjects li { margin: 0 0 7px; }
  ul.subjects li:last-child { margin-bottom: 0; }
  .subject { font-weight: 700; }
  .resource { display: block; color: #44403c; }
  .unnamed, .removed { display: block; color: #78716c; font-style: italic; }
  .none { padding: 18px 0; color: #57534e; font-style: italic; }
  .front-page h2 { font-size: 16px; margin: 14px 0 6px; }
  .front-page .record-head .period { font-size: 22px; }
  .front-page .facts { margin: 10px 0 12px; }
  .front-page .facts div { padding: 5px 12px; }
  .front-page th, .front-page td { padding: 5px 8px; }
  .front-page thead th { font-size: 12px; }
  .front-page .footnote { margin-top: 14px; padding-top: 8px; }
  table.children td, table.programme td { font-size: 13px; }
  td.num { text-align: right; white-space: nowrap; }
  .footnote {
    margin-top: 22px; padding-top: 12px; border-top: 1px solid #d6d3d1;
    font-size: 12.5px; line-height: 1.5; color: #44403c;
  }
  @media print {
    body { background: #fff; }
    .record-page { box-shadow: none; margin: 0; padding: 0; max-width: none; page-break-after: always; }
    .record-page:last-of-type { page-break-after: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
  @page { size: A4; margin: 16mm; }
`;

function renderItem(item) {
  if (item.removed) {
    return `<li><span class="subject">${escapeHtml(item.label)}</span>` +
      `<span class="removed">no longer part of the curriculum</span></li>`;
  }
  const resource = item.resource
    ? `<span class="resource">${escapeHtml(item.resource)}</span>`
    : `<span class="unnamed">material not named in the curriculum</span>`;
  return `<li><span class="subject">${escapeHtml(item.label)}</span>${resource}</li>`;
}

function renderFrontPage(config, monthKey, completions, generatedOn) {
  const kids = (config && Array.isArray(config.kids)) ? config.kids : [];
  const label = monthLabel(monthKey);
  const lastDate = lastDateOfMonth(monthKey);
  const { year } = parseMonthParts(monthKey);
  const children = kids.length
    ? `<table class="children">
      <thead><tr><th scope="col">Name</th><th scope="col">Age at the end of ${escapeHtml(label)}</th><th scope="col">Days of instruction in ${escapeHtml(year)} so far</th></tr></thead>
      <tbody>
${kids.map((kid) => {
  const age = kidAgeFor(kid, lastDate);
  return `        <tr><td>${escapeHtml(kid.name || "Child")}</td>` +
    `<td class="num">${escapeHtml(age === null ? "not recorded" : age)}</td>` +
    `<td class="num">${escapeHtml(instructionDayCount(completions, kid.id, lastDate))}</td></tr>`;
}).join("\n")}
      </tbody>
    </table>`
    : `<p class="none">No children are set in the app.</p>`;
  const programmes = kids.map((kid) => {
    const tasks = Array.isArray(kid.tasks) ? kid.tasks : [];
    const programme = tasks.length
      ? `<table class="programme">
      <thead><tr><th scope="col">Subject</th><th scope="col">Book or programme</th><th scope="col">Days</th></tr></thead>
      <tbody>
${tasks.map((task) => {
  const material = task.resource
    ? escapeHtml(task.resource)
    : `<span class="unnamed">material not named in the curriculum</span>`;
  return `        <tr><td>${escapeHtml(task.label || task.id)}</td>` +
    `<td>${material}</td><td>${escapeHtml(describeRecurrence(task.recurrence))}</td></tr>`;
}).join("\n")}
      </tbody>
    </table>`
      : `<p class="none">No subjects are set in the app for this child.</p>`;
    return `    <h2>${escapeHtml(kid.name || "Child")}'s weekly programme</h2>\n${programme}`;
  }).join("\n");

  return `  <section class="record-page front-page">
    <header class="record-head">
      <h1>Home education record</h1>
      <p class="period">${escapeHtml(label)}</p>
      <p class="who">Front page: the year, the children and the programme</p>
    </header>
    <dl class="facts">
      <div><dt>Year covered</dt><dd>${escapeHtml(year)}</dd></div>
      <div><dt>This file covers</dt><dd>${escapeHtml(label)}</dd></div>
      <div><dt>This record was produced on</dt><dd>${escapeHtml(formatLongDate(generatedOn))}</dd></div>
    </dl>
    <h2>The children</h2>
${children}
${programmes}
    <p class="footnote">This front page describes the weekly programme as it was set in the family's checklist app on the date this record was produced. The pages that follow record, for each child, what was actually marked complete on each day, in the wording used on that day. Each child's age is given as at the last day of the month covered.</p>
  </section>`;
}

function renderKidPage(config, kid, monthKey, completions, generatedOn) {
  const rows = recordDaysForMonth(config, kid.id, monthKey, completions);
  const lastDate = lastDateOfMonth(monthKey);
  const { year } = parseMonthParts(monthKey);
  const yearToDate = instructionDayCount(completions, kid.id, lastDate);
  const age = kidAgeFor(kid, lastDate);
  const who = age !== null
    ? `${escapeHtml(kid.name || "Child")}, age ${escapeHtml(String(age))}`
    : escapeHtml(kid.name || "Child");

  const body = rows.length
    ? `<table>
      <caption>Days of instruction, ${escapeHtml(monthLabel(monthKey))}</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Subjects studied, and the material used</th></tr></thead>
      <tbody>
${rows.map((r) =>
  `        <tr><td class="date">${escapeHtml(r.longDate)}</td>` +
  `<td><ul class="subjects">${r.items.map(renderItem).join("")}</ul></td></tr>`
).join("\n")}
      </tbody>
    </table>`
    : `<p class="none">No days of instruction were recorded for this child in ${escapeHtml(monthLabel(monthKey))}.</p>`;

  return `  <section class="record-page">
    <header class="record-head">
      <h1>Record of daily instruction</h1>
      <p class="period">${escapeHtml(monthLabel(monthKey))}</p>
      <p class="who">${who}</p>
    </header>
    <dl class="facts">
      <div><dt>Days of instruction this month</dt><dd>${rows.length}</dd></div>
      <div><dt>Days of instruction in ${year} so far</dt><dd>${yearToDate}</dd></div>
      <div><dt>This record was produced on</dt><dd>${escapeHtml(formatLongDate(generatedOn))}</dd></div>
    </dl>
${body}
    <p class="footnote">
      Each entry above was recorded on the day it describes, at the time the work
      was completed, using a checklist app on the family's tablet. Nothing in this
      record was entered afterwards. The subjects listed are those marked complete
      that day, and the line beneath each subject names the material followed.
      This record covers the supervised daily study block. It does not include
      samples of the child's own work, and independent practice tracked by
      Beast Academy or Khan Academy is held in those services' own dated accounts.
    </p>
  </section>`;
}

// Build the complete, standalone, printable record for one month.
// Returns an HTML document as a string, with a front page then one page per child.
export function buildMonthlyRecordHtml({ config, completions, monthKey, generatedOn }) {
  const kids = (config && Array.isArray(config.kids)) ? config.kids : [];
  const history = completions || {};
  const pages = [renderFrontPage(config, monthKey, history, generatedOn), ...kids
    .map((kid) => renderKidPage(config, kid, monthKey, history, generatedOn))]
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Record of daily instruction ${escapeHtml(monthLabel(monthKey))}</title>
<style>${RECORD_CSS}</style>
</head>
<body>
${pages}
</body>
</html>
`;
}

// Suggested filename for the saved month, e.g. "instruction-record-2026-08.html".
export function recordFileName(monthKey) {
  return `instruction-record-${monthKey}.html`;
}

// ----------------------------------------------------------------------
// Serialization (round-trippable backup of the whole state bundle)
// ----------------------------------------------------------------------

export function serializeState(state) {
  return JSON.stringify(
    {
      version: 1,
      config: state.config,
      completions: state.completions || {},
    },
    null,
    2
  );
}

export function deserializeState(json) {
  const obj = typeof json === "string" ? JSON.parse(json) : json;
  return {
    config: obj.config,
    completions: obj.completions || {},
  };
}
