// config.default.js — SEED curriculum for the homeschool tracker.
//
// This is DATA, not code. The parent edits this through Parent Mode in the
// app (which writes the edited copy into IndexedDB / local storage). This file
// is only the first-run default. Feel free to hand-edit it too — it's
// deliberately plain and well-commented.
//
// NOTE: names below are neutral placeholders on purpose (this file lives in a
// public repo). Set the real names once on the device in Parent Mode (PIN
// 1234); they are saved only on that device and never come back here.
//
// Shape:
//   parentPin : 4-digit string gating Parent Mode (default "1234").
//   kids[]    : each kid has id / name / age / theme and a list of tasks.
//   tasks[]   : id / label / icon (emoji) / recurrence.
//
// recurrence is one of:
//   { type: "daily" }                       fires every day
//   { type: "weekdays", days: [1,2,3,4,5] } fires on listed weekdays
//   { type: "weekly",   day: 3 }            fires on one weekday
//
// Weekday numbers: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
// Mon–Fri is [1,2,3,4,5].

export const defaultConfig = {
  parentPin: "1234",

  kids: [
    // ----------------------------------------------------------------
    // Older child (placeholder) — a reader; gets text labels + icons.
    // Rename in Parent Mode.
    // ----------------------------------------------------------------
    {
      id: "child-a",
      name: "Child 1",
      age: 7,
      theme: "violet",
      tasks: [
        {
          id: "a-music",
          label: "Music",
          icon: "🎵",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "a-booktalk",
          label: "Book talk / Reading",
          icon: "📚",
          recurrence: { type: "daily" },
        },
        {
          id: "a-beast",
          label: "Beast Academy",
          icon: "🧮",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "a-bio",
          label: "Biology",
          icon: "🔬",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
      ],
    },

    // ----------------------------------------------------------------
    // Younger child (placeholder) — non-reader. View leans on the big
    // emoji icons; text labels render but aren't required. Rename in
    // Parent Mode.
    // ----------------------------------------------------------------
    {
      id: "child-b",
      name: "Child 2",
      age: 5,
      theme: "teal",
      tasks: [
        {
          id: "b-phonics",
          label: "Phonics",
          icon: "🔤",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "b-khan",
          label: "Khan Kids",
          icon: "🦘",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "b-readaloud",
          label: "Read-aloud",
          icon: "📖",
          recurrence: { type: "daily" },
        },
      ],
    },
  ],
};

export default defaultConfig;
