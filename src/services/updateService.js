/**
 * services/updateService.js
 * ---------------------------------------------------------------
 * Checks the project's GitHub repository for a newer version than
 * the one currently running, so users get a friendly "update
 * available" prompt instead of silently running stale code.
 *
 * Strategy:
 *   1. Try GitHub Releases (`/releases/latest`) first.
 *   2. If the repo has no releases (404), fall back to the latest
 *      commit on the default branch, comparing commit SHAs instead
 *      of version tags.
 *   3. Cache the result (and the timestamp of the last check) in the
 *      settings store, so reloads within CHECK_INTERVAL_MS reuse the
 *      cached answer instead of hitting the API again.
 *   4. Never let a failed/offline check break app boot — every
 *      network call here is wrapped and swallowed on failure.
 * ---------------------------------------------------------------
 */

import { Settings } from "../database/db.js";

const REPO = "Behnooddev/PWA-LumenMusic";
const API_BASE = `https://api.github.com/repos/${REPO}`;

// Bump this when cutting a new release so the comparison below has
// something to compare against. If the repo has releases, this should
// match the tag_name (without a leading "v") of the version this code
// corresponds to.
export const CURRENT_VERSION = "2.1.0";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours — avoid hammering the API
const REMIND_LATER_MS = 24 * 60 * 60 * 1000;  // "remind later" = ask again in a day

const SETTINGS_KEY = "updateCheck";

function stripLeadingV(tag) {
  return String(tag || "").replace(/^v/i, "");
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    const err = new Error(`GitHub API returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchLatestReleaseOrCommit() {
  try {
    const release = await fetchJson(`${API_BASE}/releases/latest`);
    return {
      kind: "release",
      identifier: stripLeadingV(release.tag_name),
      name: release.name || release.tag_name,
      changelog: (release.body || "").trim(),
      url: release.html_url,
      publishedAt: release.published_at,
    };
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  for (const branch of ["main", "master"]) {
    try {
      const commit = await fetchJson(`${API_BASE}/commits/${branch}`);
      return {
        kind: "commit",
        identifier: commit.sha,
        name: `Latest commit (${commit.sha.slice(0, 7)})`,
        changelog: (commit.commit?.message || "").trim(),
        url: commit.html_url,
        publishedAt: commit.commit?.author?.date,
      };
    } catch {
      // try the next branch name
    }
  }

  throw new Error("Couldn't reach GitHub releases or commits for this repository.");
}

/**
 * Checks for an update, respecting the cache interval unless `force`
 * is set. Resolves with `{ available, info }` (or `{ available: false,
 * reason }`) and never throws, so it's always safe to call during boot.
 */
export async function checkForUpdate({ force = false } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { available: false, reason: "offline" };
  }

  const cached = await Settings.get(SETTINGS_KEY, null);
  const now = Date.now();

  if (!force && cached?.lastCheckedAt && now - cached.lastCheckedAt < CHECK_INTERVAL_MS) {
    return evaluateCached(cached);
  }

  let latest;
  try {
    latest = await fetchLatestReleaseOrCommit();
  } catch {
    return cached ? evaluateCached(cached) : { available: false, reason: "unreachable" };
  }

  const baselineIdentifier = latest.kind === "commit"
    ? (cached?.latest?.kind === "commit" ? cached.latest.identifier : latest.identifier)
    : CURRENT_VERSION;

  const isNewer = latest.identifier !== baselineIdentifier;

  const toStore = { latest, lastCheckedAt: now, dismissedIdentifier: cached?.dismissedIdentifier, remindAfter: cached?.remindAfter };
  await Settings.set(SETTINGS_KEY, toStore);

  return evaluateCached(toStore, isNewer);
}

function evaluateCached(cached, freshlyDetectedNewer = null) {
  if (!cached?.latest) return { available: false };

  const isNewer = freshlyDetectedNewer !== null
    ? freshlyDetectedNewer
    : cached.latest.kind === "release"
      ? cached.latest.identifier !== CURRENT_VERSION
      : false;

  if (!isNewer) return { available: false };

  const snoozed = cached.dismissedIdentifier === cached.latest.identifier
    && cached.remindAfter
    && Date.now() < cached.remindAfter;

  if (snoozed) return { available: false, reason: "snoozed" };

  return { available: true, info: cached.latest };
}

/** Snoozes the current update for REMIND_LATER_MS. */
export async function remindLater(identifier) {
  const cached = await Settings.get(SETTINGS_KEY, null);
  if (!cached) return;
  cached.dismissedIdentifier = identifier;
  cached.remindAfter = Date.now() + REMIND_LATER_MS;
  await Settings.set(SETTINGS_KEY, cached);
}

/**
 * Forces the waiting service worker to activate and reloads once it
 * takes control, so "Update now" actually applies the new app shell.
 */
export async function applyUpdateAndReload() {
  if (!("serviceWorker" in navigator)) {
    location.reload();
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    location.reload();
    return;
  }

  try { await reg.update(); } catch { /* offline or unreachable — ignore */ }

  const waiting = reg.waiting;
  if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });

  setTimeout(() => { if (!reloaded) location.reload(); }, 800);
}
