// sync.js — the ONE file in this app allowed to make a network call.
//
// What it does: when a parent has typed an address into Parent Mode, post the
// whole state (the same JSON the Export button writes) to that address, with
// the token in a header. Nothing else in the app may call out; tests.mjs scans
// every other source file and fails if one ever gains a fetch.
//
// What it must never do: carry an address of its own. The address and the
// token come from device storage via getSettings(). The public template ships
// with both empty, so an install that never typed an address sends nothing,
// which is exactly the app of 22 August 2026. tests.mjs proves this file
// contains no host and reads the address from settings.
//
// Failure is silent by design. The iPad is often offline, the home computer is
// sometimes asleep, and neither is an error a child should see. The only
// visible trace is "Last sent home" in Parent Mode, written on success only.
//
// No imports: this file stays testable in Node with a fake fetch.

const DEFAULT_DELAY_MS = 4000;

export const TOKEN_HEADER = "X-Homeschool-Token";

// Trim an address as typed. Empty means "send nothing".
export function normaliseAddress(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

// Build the sender. Everything with a side effect is injectable so the tests
// can drive it without a network or a real clock.
//
//   getSettings()  -> { address, token }         (from device storage)
//   getPayload()   -> string                     (serializeState(...))
//   onSent(isoTime)                              (record the success)
//   fetchImpl      -> fetch                      (default: global fetch)
//   isOnline()     -> boolean                    (default: navigator.onLine)
//   now()          -> ISO string                 (default: new Date())
//   delayMs                                       (debounce window)
export function createSync(opts) {
  const delayMs = typeof opts.delayMs === "number" ? opts.delayMs : DEFAULT_DELAY_MS;
  const doFetch = opts.fetchImpl || ((url, init) => fetch(url, init));
  const isOnline =
    opts.isOnline ||
    (() => typeof navigator === "undefined" || navigator.onLine !== false);
  const now = opts.now || (() => new Date().toISOString());

  let timer = null;
  let inFlight = false;
  let sendAgain = false;
  let sends = 0; // count of attempts that actually reached fetch (for tests)

  // Send right now if there is somewhere to send to. Returns true only on a
  // 2xx answer. Never throws.
  async function sendNow() {
    const settings = opts.getSettings() || {};
    const address = normaliseAddress(settings.address);
    if (!address) return false;
    if (!isOnline()) return false;
    if (inFlight) {
      // A tap landed while a send was in the air: go again when it lands, so
      // the last state always gets through.
      sendAgain = true;
      return false;
    }
    inFlight = true;
    try {
      sends++;
      const headers = { "Content-Type": "application/json" };
      const token = typeof settings.token === "string" ? settings.token.trim() : "";
      if (token) headers[TOKEN_HEADER] = token;
      const res = await doFetch(address, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers,
        body: opts.getPayload(),
      });
      if (res && res.ok) {
        if (opts.onSent) await opts.onSent(now());
        return true;
      }
      return false;
    } catch (e) {
      return false; // offline, asleep, refused: all normal, all silent
    } finally {
      inFlight = false;
      if (sendAgain) {
        sendAgain = false;
        scheduleSend();
      }
    }
  }

  // Send soon. A burst of taps within the window becomes one send.
  function scheduleSend() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      sendNow();
    }, delayMs);
  }

  function pending() {
    return timer !== null;
  }

  function sendCount() {
    return sends;
  }

  return { sendNow, scheduleSend, pending, sendCount };
}
