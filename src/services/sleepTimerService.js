/**
 * services/sleepTimerService.js
 * ---------------------------------------------------------------
 * Minimal countdown that pauses the given audio element after N
 * minutes. Exposes a subscribe() so the Settings page (or anywhere
 * else) can show a live "pauses in mm:ss" label.
 * ---------------------------------------------------------------
 */

let timeoutId = null;
let intervalId = null;
let endsAt = null;
const listeners = new Set();

function notify() {
  const remainingMs = endsAt ? Math.max(0, endsAt - Date.now()) : 0;
  listeners.forEach((cb) => cb(remainingMs));
}

export function onTick(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function startSleepTimer(minutes, onFire) {
  cancelSleepTimer();
  const ms = minutes * 60 * 1000;
  endsAt = Date.now() + ms;
  timeoutId = setTimeout(() => {
    onFire?.();
    cancelSleepTimer();
  }, ms);
  intervalId = setInterval(notify, 1000);
  notify();
}

export function cancelSleepTimer() {
  if (timeoutId) clearTimeout(timeoutId);
  if (intervalId) clearInterval(intervalId);
  timeoutId = null;
  intervalId = null;
  endsAt = null;
  notify();
}

export function isSleepTimerActive() {
  return !!endsAt;
}
