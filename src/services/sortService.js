/**
 * services/sortService.js
 * ---------------------------------------------------------------
 * A single, reusable sorting engine for every song list in the app
 * (Library, Favorites, a Playlist's songs, Phone Music). Sort choice
 * is persisted per list context so each page remembers its own
 * preference independently.
 * ---------------------------------------------------------------
 */

import { Settings } from "../database/db.js";

export const SORT_METHODS = [
  "az", "za", "artist", "album",
  "recentlyAdded", "oldestAdded",
  "mostPlayed", "leastPlayed",
  "duration", "custom",
];

const SETTINGS_KEY = "sortPreferences";

const COMPARATORS = {
  az: (a, b) => a.title.localeCompare(b.title),
  za: (a, b) => b.title.localeCompare(a.title),
  artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
  album: (a, b) => (a.album || "").localeCompare(b.album || "") || a.title.localeCompare(b.title),
  recentlyAdded: (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0),
  oldestAdded: (a, b) => (a.dateAdded || 0) - (b.dateAdded || 0),
  mostPlayed: (a, b) => (b.playCount || 0) - (a.playCount || 0),
  leastPlayed: (a, b) => (a.playCount || 0) - (b.playCount || 0),
  duration: (a, b) => (b.duration || 0) - (a.duration || 0),
  // "custom" = whatever order the caller already has (e.g. a playlist's
  // manually drag-reordered songIds) — no comparator needed.
  custom: null,
};

/** Sorts a copy of `songs` by `method`; unknown methods fall back to "custom" (no-op). */
export function sortSongs(songs, method) {
  const comparator = COMPARATORS[method];
  if (!comparator) return songs.slice();
  return songs.slice().sort(comparator);
}

export async function getSortPreference(context, fallback = "recentlyAdded") {
  const prefs = await Settings.get(SETTINGS_KEY, {});
  return prefs[context] || fallback;
}

export async function setSortPreference(context, method) {
  const prefs = await Settings.get(SETTINGS_KEY, {});
  prefs[context] = method;
  await Settings.set(SETTINGS_KEY, prefs);
}
