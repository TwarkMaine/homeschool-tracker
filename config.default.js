// config.default.js — SEED curriculum for the homeschool tracker.
//
// This is DATA, not code. The parent edits this through Parent Mode in the
// app (which writes the edited copy into IndexedDB). This file is only the
// first-run default. Feel free to hand-edit it too — it's deliberately plain
// and well-commented.
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
    // Leni, 7 — a reader, gets text labels alongside icons.
    // ----------------------------------------------------------------
    {
      id: "leni",
      name: "Leni",
      age: 7,
      theme: "violet",
      tasks: [
        {
          id: "leni-music",
          label: "Music",
          icon: "🎵",
          recurrence: { type: "weekdays", days: [1, 3, 5] }, // Mon/Wed/Fri
        },
        {
          id: "leni-booktalk",
          label: "Book talk / Reading",
          icon: "📚",
          recurrence: { type: "daily" },
        },
        {
          id: "leni-beast",
          label: "Beast Academy",
          icon: "🧮",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "leni-bio",
          label: "Biology",
          icon: "🔬",
          recurrence: { type: "weekly", day: 4 }, // Thursdays
        },
      ],
    },

    // ----------------------------------------------------------------
    // Johann, 5 — non-reader. His view leans on the big emoji icons;
    // text labels still render but are not required to use his rings.
    // ----------------------------------------------------------------
    {
      id: "johann",
      name: "Johann",
      age: 5,
      theme: "teal",
      tasks: [
        {
          id: "johann-phonics",
          label: "Phonics",
          icon: "🔤",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "johann-khan",
          label: "Khan Kids",
          icon: "🦘",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "johann-readaloud",
          label: "Read-aloud",
          icon: "📖",
          recurrence: { type: "daily" },
        },
      ],
    },
  ],
};

export default defaultConfig;
