# Homeschool Tracker

A tiny, local, no-build-step PWA. Each kid sees today's tasks as big "rings,"
taps to complete them, and when every ring is closed a **Free time unlocked**
banner appears. A PIN-gated Parent Mode edits the curriculum.

No framework, no bundler, no npm, no accounts, no cloud, no network writes.
Plain HTML/CSS/JS that will still run in five years by just opening the files.

## Run it locally

Serve the folder statically (needed so the service worker + IndexedDB behave),
then open it on the iPad over your LAN:

```bash
cd homeschool-tracker
python3 -m http.server 8000
# then on the iPad, browse to  http://<your-computer-ip>:8000/
```

You can also just open `index.html` directly in a browser for a quick look
(the service worker may not register from `file://`, but the app still works).

## Install to the iPad home screen

1. Open the served URL in **Safari** on the iPad.
2. Tap **Share → Add to Home Screen**.
3. Launch it from the home screen — it runs full-screen and works offline.

## Where the curriculum lives

The seed curriculum is `config.default.js` (two kids: **Leni**, 7, and
**Johann**, 5). It is plain, commented data — edit it directly if you like.

On first run the app copies that seed into IndexedDB; after that, edits made in
**Parent Mode** are what's used. Each task has an emoji icon, a label, and a
recurrence: `daily`, `weekdays` (a set of weekdays), or `weekly` (one weekday).

## Parent Mode

Tap the ⚙️ button (top-right) and enter the PIN.

**Default PIN: `1234`** (stored in the config; change it by editing
`config.default.js` or your live config). Parent Mode lets you add/remove/rename
kids and tasks, set recurrence, and **Export / Import** a JSON backup.

## Tests

Pure logic lives in `logic.js` (no DOM, no storage, no clock) and is unit-tested
with a dependency-free Node harness:

```bash
node tests.mjs
```

All assertions print `PASS`/`FAIL`; the process exits non-zero on any failure.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell: profile switcher, rings, banners, parent dialogs |
| `styles.css` | Calm, large-touch-target iPad styling |
| `logic.js` | **Pure** module: recurrence, completion, streak, (de)serialize |
| `app.js` | DOM + IndexedDB wiring, parent mode, backup, midnight rollover |
| `config.default.js` | Seed curriculum (editable data) |
| `manifest.webmanifest` + `service-worker.js` | PWA install + offline shell |
| `tests.mjs` | `node tests.mjs` test harness |
