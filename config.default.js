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
//   tasks[]   : id / label / icon (emoji) / resource / recurrence.
//
// `label` is the SUBJECT, short enough to sit under a ring ("Maths").
// `resource` is the MATERIAL, named by title ("Beast Academy"). Only `label`
// appears on the kids' screen. `resource` exists for the printed monthly
// record, where the reader may be a lawyer who has never seen this app and
// needs to know what the child actually worked from. Both are editable in
// Parent Mode, and the record keeps whatever the title was on the day of the
// tick, so changing a resource here never rewrites a month already recorded.
//
// Name the material, not the position in it. "Beast Academy Level 3" survives
// the year; "Beast Academy page 74" is wrong by Thursday, and a stale title in
// a record is worse than a general one.
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
          resource: "One-to-one piano tuition at home, with a termly goal",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "a-booktalk",
          label: "Reading",
          icon: "📚",
          resource: "Independent reading from the home library, followed by a book conversation",
          recurrence: { type: "daily" },
        },
        {
          id: "a-beast",
          label: "Maths",
          icon: "🧮",
          resource: "Beast Academy (level set by the Beast Academy placement test)",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "a-bio",
          label: "Biology",
          icon: "🔬",
          resource: "Khan Academy Biology",
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
          // Deliberately describes the method rather than naming a programme:
          // the choice between Jolly Phonics, Sounds-Write and "Teach Your
          // Child to Read in 100 Easy Lessons" is still open. Replace this
          // with the programme's title in Parent Mode once it is picked.
          resource: "Structured synthetic phonics (programme not yet chosen)",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "b-khan",
          label: "Early maths and literacy",
          icon: "🦘",
          resource: "Khan Academy Kids",
          recurrence: { type: "weekdays", days: [1, 2, 3, 4, 5] }, // Mon–Fri
        },
        {
          id: "b-readaloud",
          label: "Read-aloud",
          icon: "📖",
          resource: "Read-aloud and audiobooks from the home library and Libby",
          recurrence: { type: "daily" },
        },
      ],
    },
  ],
};

export default defaultConfig;
