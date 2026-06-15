// app.js — UI layer. Wires pure logic.js to the DOM and IndexedDB.
// All clock reads, DOM access, and storage live HERE (never in logic.js).

import {
  tasksForDay,
  isDayComplete,
  currentStreak,
  toggleCompletion,
  serializeState,
  deserializeState,
} from "./logic.js";
import { defaultConfig } from "./config.default.js";

// ---------------------------------------------------------------------------
// IndexedDB (tiny key/value store; one object store "kv")
// ---------------------------------------------------------------------------
const DB_NAME = "homeschool";
const DB_VERSION = 1;
const STORE = "kv";

// Storage is best-effort. On iOS Safari IndexedDB can be unavailable or fail
// to open on load; if so we degrade to in-memory (the app still works for the
// session, it just won't persist) rather than showing a blank screen.
let storageOK = true;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    let settled = false;
    // iOS sometimes never fires success/error on first open — time out.
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error("IndexedDB open timed out")); }
    }, 3000);
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      clearTimeout(timer); reject(e); return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(req.result); } };
    req.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(req.error); } };
  });
}

async function kvGet(key) {
  if (!storageOK) return undefined;
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch (e) {
    storageOK = false;
    return undefined;
  }
}

async function kvSet(key, value) {
  if (!storageOK) return;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    storageOK = false;
  }
}

// ---------------------------------------------------------------------------
// Local date helper (the ONE allowed clock read, kept out of logic.js)
// ---------------------------------------------------------------------------
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// ---------------------------------------------------------------------------
// App state (in memory; mirrored to IndexedDB)
// ---------------------------------------------------------------------------
const state = {
  config: null,
  completions: {},
  activeKidId: null,
  today: todayStr(),
};

async function loadState() {
  let config = await kvGet("config");
  if (!config) {
    // Deep clone the seed so edits never touch the imported module object.
    config = JSON.parse(JSON.stringify(defaultConfig));
    await kvSet("config", config);
  }
  const completions = (await kvGet("completions")) || {};
  state.config = config;
  state.completions = completions;
  if (!state.activeKidId || !config.kids.some((k) => k.id === state.activeKidId)) {
    state.activeKidId = config.kids[0] ? config.kids[0].id : null;
  }
}

async function saveConfig() { await kvSet("config", state.config); }
async function saveCompletions() { await kvSet("completions", state.completions); }

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  switcher: $("profile-switcher"),
  greeting: $("kid-greeting"),
  streak: $("streak"),
  rings: $("rings"),
  emptyNote: $("empty-note"),
  freetime: $("freetime-banner"),
  parentBtn: $("parent-btn"),
  pinOverlay: $("pin-overlay"),
  pinInput: $("pin-input"),
  pinError: $("pin-error"),
  pinOk: $("pin-ok"),
  pinCancel: $("pin-cancel"),
  parentOverlay: $("parent-overlay"),
  parentBody: $("parent-body"),
  parentClose: $("parent-close"),
  addKid: $("add-kid"),
  exportBtn: $("export-btn"),
  importBtn: $("import-btn"),
  importFile: $("import-file"),
};

// ---------------------------------------------------------------------------
// Render: profile switcher
// ---------------------------------------------------------------------------
function renderSwitcher() {
  els.switcher.innerHTML = "";
  for (const kid of state.config.kids) {
    const tab = document.createElement("button");
    tab.className = "profile-tab";
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(kid.id === state.activeKidId));
    tab.innerHTML =
      `<span class="profile-avatar" aria-hidden="true">${kid.name ? kid.name[0] : "?"}</span>` +
      `<span>${escapeHtml(kid.name || "Kid")}</span>`;
    tab.addEventListener("click", () => {
      state.activeKidId = kid.id;
      renderAll();
    });
    els.switcher.appendChild(tab);
  }
}

// ---------------------------------------------------------------------------
// Render: today view (rings, streak, free time)
// ---------------------------------------------------------------------------
function renderToday() {
  const kid = state.config.kids.find((k) => k.id === state.activeKidId);
  if (!kid) return;

  document.body.setAttribute("data-theme", kid.theme || "violet");
  els.greeting.textContent = `Hi ${kid.name}! 👋`;

  const due = tasksForDay(state.config, kid.id, state.today);
  const complete = isDayComplete(state.config, kid.id, state.today, state.completions);
  const streak = currentStreak(state.config, kid.id, state.today, state.completions);

  els.streak.textContent = streak > 0 ? `🔥 ${streak}-day streak` : "";

  // Rings
  els.rings.innerHTML = "";
  els.emptyNote.hidden = due.length !== 0;
  for (const task of due) {
    const done = isTaskDone(kid.id, state.today, task.id);
    const ring = document.createElement("button");
    ring.className = "ring" + (done ? " done" : "");
    ring.type = "button";
    ring.setAttribute("aria-pressed", String(done));
    ring.setAttribute("aria-label", (task.label || "Task") + (done ? " (done)" : ""));
    ring.innerHTML =
      `<span class="ring-circle" aria-hidden="true">${task.icon || "⭐"}</span>` +
      `<span class="ring-label">${escapeHtml(task.label || "")}</span>`;
    ring.addEventListener("click", () => onToggle(kid.id, task.id));
    els.rings.appendChild(ring);
  }

  // Free time banner shows only when there were tasks AND all are done.
  els.freetime.hidden = !(due.length > 0 && complete);
}

function isTaskDone(kidId, date, taskId) {
  return Boolean(
    state.completions[kidId] &&
      state.completions[kidId][date] &&
      state.completions[kidId][date][taskId]
  );
}

async function onToggle(kidId, taskId) {
  state.completions = toggleCompletion(state.completions, kidId, state.today, taskId);
  await saveCompletions();
  renderToday();
}

function renderAll() {
  renderSwitcher();
  renderToday();
}

// ---------------------------------------------------------------------------
// Midnight rollover: recompute "today" when the app regains focus.
// ---------------------------------------------------------------------------
function checkRollover() {
  const now = todayStr();
  if (now !== state.today) {
    state.today = now;
    renderAll();
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkRollover();
});
window.addEventListener("focus", checkRollover);

// ---------------------------------------------------------------------------
// Parent mode: PIN gate
// ---------------------------------------------------------------------------
els.parentBtn.addEventListener("click", () => {
  els.pinInput.value = "";
  els.pinError.hidden = true;
  els.pinOverlay.hidden = false;
  els.pinInput.focus();
});
els.pinCancel.addEventListener("click", () => (els.pinOverlay.hidden = true));
els.pinOk.addEventListener("click", tryPin);
els.pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryPin();
});

function tryPin() {
  const expected = (state.config.parentPin || "1234").trim();
  if (els.pinInput.value.trim() === expected) {
    els.pinOverlay.hidden = true;
    openParentPanel();
  } else {
    els.pinError.hidden = false;
    els.pinInput.value = "";
  }
}

// ---------------------------------------------------------------------------
// Parent mode: curriculum editor
// ---------------------------------------------------------------------------
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function openParentPanel() {
  renderParentPanel();
  els.parentOverlay.hidden = false;
}
els.parentClose.addEventListener("click", async () => {
  await saveConfig();
  els.parentOverlay.hidden = true;
  // Active kid may have been removed/renamed; refresh main view.
  if (!state.config.kids.some((k) => k.id === state.activeKidId)) {
    state.activeKidId = state.config.kids[0] ? state.config.kids[0].id : null;
  }
  renderAll();
});

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 8);
}

function renderParentPanel() {
  els.parentBody.innerHTML = "";
  state.config.kids.forEach((kid, kidIdx) => {
    els.parentBody.appendChild(renderKidBlock(kid, kidIdx));
  });
}

function renderKidBlock(kid, kidIdx) {
  const block = document.createElement("div");
  block.className = "kid-block";

  // Head: name + remove kid
  const head = document.createElement("div");
  head.className = "kid-block-head";
  const nameInput = document.createElement("input");
  nameInput.className = "kid-name";
  nameInput.value = kid.name || "";
  nameInput.addEventListener("input", () => { kid.name = nameInput.value; autosave(); });
  head.appendChild(nameInput);

  const delKid = document.createElement("button");
  delKid.className = "btn btn-danger";
  delKid.type = "button";
  delKid.textContent = "Remove kid";
  delKid.addEventListener("click", () => {
    if (confirm(`Remove ${kid.name}?`)) {
      state.config.kids.splice(kidIdx, 1);
      autosave();
      renderParentPanel();
    }
  });
  head.appendChild(delKid);
  block.appendChild(head);

  // Tasks
  (kid.tasks || []).forEach((task, taskIdx) => {
    block.appendChild(renderTaskRow(kid, task, taskIdx));
  });

  // Add task
  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-secondary add-task-btn";
  addBtn.type = "button";
  addBtn.textContent = "+ Add task";
  addBtn.addEventListener("click", () => {
    if (!kid.tasks) kid.tasks = [];
    kid.tasks.push({
      id: uid(kid.id || "task"),
      label: "New task",
      icon: "⭐",
      recurrence: { type: "daily" },
    });
    autosave();
    renderParentPanel();
  });
  block.appendChild(addBtn);

  return block;
}

function renderTaskRow(kid, task, taskIdx) {
  const row = document.createElement("div");
  row.className = "task-row";

  const icon = document.createElement("input");
  icon.className = "task-icon";
  icon.value = task.icon || "";
  icon.setAttribute("aria-label", "Icon");
  icon.addEventListener("input", () => { task.icon = icon.value; autosave(); });
  row.appendChild(icon);

  const label = document.createElement("input");
  label.className = "task-label";
  label.value = task.label || "";
  label.setAttribute("aria-label", "Task name");
  label.addEventListener("input", () => { task.label = label.value; autosave(); });
  row.appendChild(label);

  // Recurrence type
  const sel = document.createElement("select");
  sel.className = "rec-type";
  for (const [val, txt] of [["daily", "Daily"], ["weekdays", "Weekdays"], ["weekly", "Weekly"]]) {
    const o = document.createElement("option");
    o.value = val; o.textContent = txt;
    if (task.recurrence && task.recurrence.type === val) o.selected = true;
    sel.appendChild(o);
  }
  row.appendChild(sel);

  // Day picker (used by weekdays + weekly)
  const picker = document.createElement("span");
  picker.className = "weekday-picker";
  row.appendChild(picker);

  function rebuildPicker() {
    picker.innerHTML = "";
    const type = task.recurrence.type;
    if (type === "daily") return;
    const isWeekly = type === "weekly";
    for (let d = 0; d < 7; d++) {
      const wrap = document.createElement("label");
      const input = document.createElement("input");
      input.type = isWeekly ? "radio" : "checkbox";
      input.name = isWeekly ? `weekly-${task.id}` : "";
      if (isWeekly) input.checked = task.recurrence.day === d;
      else input.checked = Array.isArray(task.recurrence.days) && task.recurrence.days.includes(d);
      input.addEventListener("change", () => {
        if (isWeekly) {
          task.recurrence = { type: "weekly", day: d };
        } else {
          const set = new Set(task.recurrence.days || []);
          if (input.checked) set.add(d); else set.delete(d);
          task.recurrence = { type: "weekdays", days: [...set].sort((a, b) => a - b) };
        }
        autosave();
      });
      wrap.appendChild(input);
      wrap.appendChild(document.createTextNode(WEEKDAYS[d]));
      picker.appendChild(wrap);
    }
  }

  sel.addEventListener("change", () => {
    const type = sel.value;
    if (type === "daily") task.recurrence = { type: "daily" };
    else if (type === "weekdays") task.recurrence = { type: "weekdays", days: task.recurrence.days || [1, 2, 3, 4, 5] };
    else task.recurrence = { type: "weekly", day: typeof task.recurrence.day === "number" ? task.recurrence.day : 1 };
    rebuildPicker();
    autosave();
  });
  rebuildPicker();

  // Remove task
  const del = document.createElement("button");
  del.className = "btn btn-danger row-tools";
  del.type = "button";
  del.textContent = "✕";
  del.setAttribute("aria-label", "Remove task");
  del.addEventListener("click", () => {
    kid.tasks.splice(taskIdx, 1);
    autosave();
    renderParentPanel();
  });
  row.appendChild(del);

  return row;
}

let autosaveTimer = null;
function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { saveConfig(); }, 250);
}

// Add kid
els.addKid.addEventListener("click", () => {
  const themes = ["violet", "teal", "amber", "rose"];
  const id = uid("kid");
  state.config.kids.push({
    id,
    name: "New kid",
    theme: themes[state.config.kids.length % themes.length],
    tasks: [],
  });
  autosave();
  renderParentPanel();
});

// ---------------------------------------------------------------------------
// Backup: export / import (uses logic.js serialize/deserialize)
// ---------------------------------------------------------------------------
els.exportBtn.addEventListener("click", () => {
  const json = serializeState({ config: state.config, completions: state.completions });
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `homeschool-backup-${state.today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

els.importBtn.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files && els.importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const restored = deserializeState(text);
    if (!restored.config || !Array.isArray(restored.config.kids)) {
      alert("That file doesn't look like a valid backup.");
      return;
    }
    state.config = restored.config;
    state.completions = restored.completions || {};
    await saveConfig();
    await saveCompletions();
    state.activeKidId = state.config.kids[0] ? state.config.kids[0].id : null;
    renderParentPanel();
    renderAll();
    alert("Backup imported. 🎉");
  } catch (e) {
    alert("Could not read that file: " + e.message);
  } finally {
    els.importFile.value = "";
  }
});

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Service worker registration (offline app shell).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* offline support is best-effort; app still works without it */
    });
  });
}

// ---------------------------------------------------------------------------
// Visible error reporting — never show a silent blank screen.
// ---------------------------------------------------------------------------
function showFatal(msg) {
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText =
    "margin:24px;padding:16px 20px;border-radius:12px;background:#fff3f3;" +
    "color:#7a1020;font:16px/1.5 -apple-system,system-ui,sans-serif;" +
    "border:1px solid #f0b3b3;max-width:640px;";
  box.textContent = "The tracker hit a snag: " + msg;
  document.body.appendChild(box);
}
window.addEventListener("error", (e) =>
  showFatal((e.message || "script error") + (e.filename ? " (" + e.filename + ")" : ""))
);
window.addEventListener("unhandledrejection", (e) =>
  showFatal(String((e.reason && e.reason.message) || e.reason || "promise error"))
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  try {
    await loadState();
    // If storage never came up, run from the seed so the app still works.
    if (!state.config) {
      state.config = JSON.parse(JSON.stringify(defaultConfig));
      state.completions = {};
      state.activeKidId = state.config.kids[0] ? state.config.kids[0].id : null;
    }
    renderAll();
    if (!storageOK) {
      const note = document.createElement("div");
      note.style.cssText =
        "margin:12px 16px;padding:8px 12px;border-radius:10px;background:#fff8e6;" +
        "color:#6b4e00;font:14px/1.4 -apple-system,system-ui,sans-serif;border:1px solid #f0d99b;";
      note.textContent =
        "⚠️ This device isn't letting the app save progress (check Safari isn't in Private mode). It still works for now, but taps won't be remembered.";
      document.body.insertBefore(note, document.body.firstChild);
    }
  } catch (err) {
    showFatal((err && err.message) || String(err));
  }
})();
