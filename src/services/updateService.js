/**
 * services/updateService.js
 * ---------------------------------------------------------------
 * UpdateService — a lightweight, dependency-free update checker
 * based on a single file: /version.json. This replaces the earlier
 * GitHub Releases/Commits-based checker entirely.
 *
 * How "current" vs "latest" works:
 *   - "Current" = version.json as served from THIS app's own cache
 *     (a plain `fetch("version.json")` hits the service worker's
 *     cache-first handler, returning whatever was precached when
 *     this build was installed).
 *   - "Latest" = version.json fetched fresh from the network with a
 *     cache-busting `?t=<timestamp>` query string, bypassing the SW
 *     cache entirely.
 *
 * Shipping a new version is therefore just: edit version.json (bump
 * `version`/`build`, update `changelog`) and deploy. No other file
 * needs to change for the update check itself to work.
 * ---------------------------------------------------------------
 */

import { Settings } from "../database/db.js";
import { isNewerVersion } from "../utils/semver.js";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // avoid hammering the server
const SETTINGS_KEY = "updateCheckV2";

async function fetchVersionInfo(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`version.json returned ${res.status}`);
  const data = await res.json();
  if (!data || typeof data.version !== "string") throw new Error("version.json is missing a version field");
  return data;
}

async function getCurrentVersionInfo() {
  // Deliberately NOT cache-busted — this should resolve from the
  // service worker's cache-first handler, reflecting what THIS
  // installed build shipped with.
  return fetchVersionInfo("version.json");
}

async function getLatestVersionInfo() {
  return fetchVersionInfo(`version.json?t=${Date.now()}`);
}

/**
 * Checks for an update, respecting the cache interval unless `force`
 * is set. Never throws — any failure (offline, 404, malformed JSON)
 * resolves as `{ available: false }` so a broken/missing version.json
 * can never block the app or spam retries.
 */
export async function checkForUpdate({ force = false } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { available: false, reason: "offline" };
  }

  const cached = await Settings.get(SETTINGS_KEY, null);
  const now = Date.now();
  if (!force && cached?.lastCheckedAt && now - cached.lastCheckedAt < CHECK_INTERVAL_MS) {
    return evaluate(cached);
  }

  let current, latest;
  try {
    [current, latest] = await Promise.all([getCurrentVersionInfo(), getLatestVersionInfo()]);
  } catch {
    // Minimize network noise: don't retry immediately just because
    // this attempt failed. Fall back to whatever was last cached.
    return cached ? evaluate(cached) : { available: false, reason: "unreachable" };
  }

  const toStore = {
    current,
    latest,
    lastCheckedAt: now,
    dismissedVersion: cached?.dismissedVersion,
  };
  await Settings.set(SETTINGS_KEY, toStore);
  return evaluate(toStore);
}

function evaluate(stored) {
  if (!stored?.current || !stored?.latest) return { available: false };
  const newer = isNewerVersion(stored.latest.version, stored.current.version);
  if (!newer) return { available: false };

  // "Later" remembers the choice only until an even newer version
  // shows up — re-dismissing the *same* latest version keeps it quiet.
  if (stored.dismissedVersion === stored.latest.version) {
    return { available: false, reason: "dismissed" };
  }

  return { available: true, current: stored.current, latest: stored.latest };
}

/** "Later" — remember this specific version as dismissed. */
export async function dismissVersion(version) {
  const cached = await Settings.get(SETTINGS_KEY, null);
  if (!cached) return;
  cached.dismissedVersion = version;
  await Settings.set(SETTINGS_KEY, cached);
}

/**
 * "Update Now": forces the browser to check for a new sw.js, waits
 * for it to install and activate (which also runs the SW's own
 * outdated-cache cleanup — see sw.js's `activate` handler), and only
 * then reloads. Times out gracefully rather than leaving the UI
 * stuck if something goes wrong.
 *
 * `onStage(stage)` is called with "checking" | "installing" |
 * "activating" | "timeout" so the UI can reflect progress.
 */
export async function applyUpdateAndReload(onStage) {
  if (!("serviceWorker" in navigator)) {
    location.reload();
    return;
  }

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    location.reload();
    return;
  }

  onStage?.("checking");

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    const timeoutId = setTimeout(() => { onStage?.("timeout"); finish(); }, 12000);

    function activateWaiting(worker) {
      onStage?.("installing");
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") {
          onStage?.("activating");
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    }

    if (reg.waiting) {
      activateWaiting(reg.waiting);
    } else {
      reg.addEventListener("updatefound", () => {
        if (reg.installing) activateWaiting(reg.installing);
      });
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      clearTimeout(timeoutId);
      finish();
    });

    reg.update().catch(() => { clearTimeout(timeoutId); finish(); });
  });

  location.reload();
}
