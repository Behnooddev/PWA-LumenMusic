/**
 * services/moodEngineService.js
 * ---------------------------------------------------------------
 * NOT ENABLED. This is the architecture-only groundwork for the
 * future Mood Engine described in docs/MOOD_ENGINE_ARCHITECTURE.md.
 *
 * Nothing in the app imports this file. It exists so the eventual
 * feature has a working, isolated data layer to build a UI on top
 * of, without requiring a redesign of the main `lumen-db` schema.
 *
 * It deliberately uses its own IndexedDB database (separate from
 * database/db.js) so iterating on this schema — which is expected
 * to change before the feature ships — carries zero risk to the
 * song/playlist/settings data real users already depend on.
 * ---------------------------------------------------------------
 */

const DB_NAME = "lumen-mood-db";
const DB_VERSION = 1;

export const MOOD_LABELS = [
  "happy", "sad", "relaxed", "focused", "angry",
  "romantic", "energetic", "tired", "calm", "excited",
];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("dailyMoods")) {
        db.createObjectStore("dailyMoods", { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains("songMoodTags")) {
        db.createObjectStore("songMoodTags", { keyPath: "songId" });
      }
      if (!db.objectStoreNames.contains("moodPlaylists")) {
        db.createObjectStore("moodPlaylists", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("listeningSignals")) {
        const store = db.createObjectStore("listeningSignals", { keyPath: "id", autoIncrement: true });
        store.createIndex("songId", "songId");
        store.createIndex("timestamp", "timestamp");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(storeName, mode = "readonly") {
  const db = await openDb();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/* ----------------------------- daily mood ----------------------------- */

export async function getTodaysMood() {
  const store = await tx("dailyMoods");
  const row = await wrap(store.get(todayKey()));
  return row?.mood ?? null;
}

export async function setTodaysMood(mood) {
  if (!MOOD_LABELS.includes(mood)) throw new Error(`Unknown mood: ${mood}`);
  const store = await tx("dailyMoods", "readwrite");
  return wrap(store.put({ date: todayKey(), mood, selectedAt: Date.now() }));
}

/* ----------------------------- song mood tags ----------------------------- */

export async function tagSongMoods(songId, moods) {
  const invalid = moods.filter((m) => !MOOD_LABELS.includes(m));
  if (invalid.length) throw new Error(`Unknown mood(s): ${invalid.join(", ")}`);
  const store = await tx("songMoodTags", "readwrite");
  return wrap(store.put({ songId, moods, updatedAt: Date.now() }));
}

export async function getSongMoods(songId) {
  const store = await tx("songMoodTags");
  const row = await wrap(store.get(songId));
  return row?.moods ?? [];
}

/** Filters an already-loaded song list (from the main db) by mood tag. */
export async function getSongsForMood(mood, allSongs) {
  const store = await tx("songMoodTags");
  const allTags = await wrap(store.getAll());
  const matchingIds = new Set(allTags.filter((t) => t.moods.includes(mood)).map((t) => t.songId));
  return allSongs.filter((s) => matchingIds.has(s.id));
}

/* ----------------------------- mood playlists ----------------------------- */

export async function createMoodPlaylist(name, moods) {
  const id = `moodpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const store = await tx("moodPlaylists", "readwrite");
  const record = { id, name, moods, manualSongIds: [], createdAt: Date.now() };
  await wrap(store.put(record));
  return record;
}

export async function getMoodPlaylists() {
  const store = await tx("moodPlaylists");
  return wrap(store.getAll());
}

/* ----------------------------- listening signals ----------------------------- */

/**
 * @param {{ songId: string, event: "played"|"skipped"|"replayed"|"favorited", listenedMs?: number }} event
 */
export async function recordListeningSignal(event) {
  const now = new Date();
  const store = await tx("listeningSignals", "readwrite");
  return wrap(store.add({
    songId: event.songId,
    event: event.event,
    listenedMs: event.listenedMs ?? 0,
    timestamp: now.getTime(),
    hourOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
  }));
}

export async function getListeningSignals({ songId } = {}) {
  const store = await tx("listeningSignals");
  if (songId) {
    const index = store.index("songId");
    return wrap(index.getAll(songId));
  }
  return wrap(store.getAll());
}
