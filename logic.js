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
//         tasks: [ { id, label, icon, recurrence } ] }
//     ]
//   }
//
//   recurrence is one of:
//     { type: "daily" }
//     { type: "weekdays", days: [1,2,3,4,5] }   // 0=Sun .. 6=Sat
//     { type: "weekly",   day: 3 }              // a single weekday 0..6
//
//   completions = {
//     [kidId]: {
//       [date]: { [taskId]: true }   // presence === completed
//     }
//   }
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
export function toggleCompletion(completions, kidId, date, taskId) {
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
  } else {
    dayMap[taskId] = true;
  }

  kidMap[date] = dayMap;
  next[kidId] = kidMap;
  return next;
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
