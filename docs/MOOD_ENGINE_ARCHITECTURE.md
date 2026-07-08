# Mood Engine — Architecture (Design Only, Not Enabled)

**Status:** Design-stage. Nothing in this document is wired into the app's
UI or navigation. The isolated data layer described below exists as real,
working code (`src/services/moodEngineService.js`) so the eventual feature
has a tested foundation to build on, but it is never imported by
`main.js`, never exposed in the menu, and has zero effect on the app
today.

This exists so a future implementation doesn't require a database
redesign — the extension points are already in place.

---

## 1. Goal

Transform Lumen into an emotionally-aware music player: the user picks a
mood once a day, can tag songs with moods, can build mood-based
playlists, and — eventually — the app learns from listening behavior to
suggest music without being asked.

## 2. Why a separate database

The Mood Engine's data (daily mood picks, song-to-mood tags, listening
signals) is additive and speculative — it's likely to change shape
several times before the feature ships. Rather than bump the main
`lumen-db` version and touch the schema real users' libraries already
depend on, mood data lives in its own IndexedDB database (`lumen-mood-db`,
managed entirely by `moodEngineService.js`). This means:

- Zero risk to the stable song/playlist/settings schema.
- The Mood Engine's own schema can iterate freely (version bumps only
  affect its own, currently-empty database).
- A future "enable Mood Engine" toggle is just: start writing to a
  database that's already there, and add a UI layer on top of the
  service functions that already exist.

## 3. Data model

### 3.1 Daily mood selection — `dailyMoods` store (keyPath: `date`, `YYYY-MM-DD`)

```js
{
  date: "2026-07-10",       // one entry per calendar day
  mood: "focused",           // one of MOOD_LABELS
  selectedAt: 1752000000000, // epoch ms
}
```

### 3.2 Song-to-mood tags — `songMoodTags` store (keyPath: `songId`)

```js
{
  songId: "song_abc123",
  moods: ["happy", "energetic"], // a song may belong to multiple moods
  updatedAt: 1752000000000,
}
```

This is intentionally keyed by `songId` from the *main* database, not
duplicated song data — the Mood Engine only ever stores references, the
same principle already used by playlists (`songIds` only, never copies of
title/artist/etc).

### 3.3 Mood playlists — `moodPlaylists` store (keyPath: `id`)

```js
{
  id: "moodpl_xyz",
  name: "Sunday Reset",
  moods: ["calm", "relaxed"],   // songs matching ANY of these moods
  manualSongIds: [],             // optional manual additions/overrides
  createdAt: 1752000000000,
}
```

### 3.4 Listening signals — `listeningSignals` store (keyPath: auto-increment)

Raw behavioral events, collected regardless of whether the Mood Engine UI
is enabled, so that once it *is* enabled there's already history to learn
from. Each row:

```js
{
  id: 1,                     // autoIncrement
  songId: "song_abc123",
  event: "played" | "skipped" | "replayed" | "favorited",
  timestamp: 1752000000000,
  hourOfDay: 14,              // 0-23, precomputed for fast bucketing
  dayOfWeek: 4,                // 0-6
  listenedMs: 41000,            // how long they listened before the event
}
```

`hourOfDay`/`dayOfWeek` are precomputed at write time so future queries
("what do they listen to on weekday afternoons") don't need to scan and
re-derive dates from every row.

## 4. Extension points (interfaces that already exist)

`src/services/moodEngineService.js` exports these function signatures
today, fully implemented against the isolated database above, but never
called from anywhere in the app:

| Function | Purpose |
|---|---|
| `getTodaysMood()` | Reads today's mood selection, if any |
| `setTodaysMood(mood)` | Records the day's mood pick |
| `tagSongMoods(songId, moods)` | Assigns mood tags to a song |
| `getSongMoods(songId)` | Reads a song's mood tags |
| `getSongsForMood(mood, allSongs)` | Filters a song list by mood tag |
| `createMoodPlaylist(name, moods)` | Defines a mood-based playlist |
| `recordListeningSignal(event)` | Appends one behavioral data point |
| `getListeningSignals(filter)` | Queries raw signals for analysis |

None of these are imported by `main.js` or any page/component. They're
callable in isolation but produce no user-visible effect until a future
UI layer calls them.

## 5. Future recommendation algorithm (design sketch, not implemented)

The eventual scoring function for "what should play next" combines:

```
score(song) =
    w1 * manualMoodMatch(song, todaysMood)        // did the user pick this mood today?
  + w2 * songMoodTagMatch(song, todaysMood)        // does the song carry that mood tag?
  + w3 * recencyDecayedPlayCount(song)              // popular, but decayed by time
  + w4 * favoriteBoost(song)                         // favorited songs rank higher
  + w5 * timeOfDayAffinity(song, currentHour)         // learned from listeningSignals
  + w6 * dayOfWeekAffinity(song, currentDay)           // ditto
  - w7 * skipPenalty(song)                              // frequently-skipped songs rank lower
  + w8 * replayBoost(song)                               // frequently-replayed songs rank higher
```

`w1..w8` are tunable weights. Early versions can hardcode them; a later
version could fit them per-user from `listeningSignals` (a simple
logistic regression or even a hand-tuned heuristic would work — nothing
here requires a specific ML framework). Because every input is already a
well-defined, queryable field in the isolated database, swapping the
scoring function for a proper model later doesn't require touching the
schema — only `moodEngineService.js`'s internals change.

## 6. UI extension points (not built yet)

When this ships, the natural integration points are:

- A first-launch-of-the-day prompt (similar to the sleep-timer dialog
  pattern) asking "How are you feeling today?"
- A "moods" filter chip row on the Library/Home page
- A mood indicator and quick-tag action on `components/songRow.js`
- A new "Mood Playlists" section, reusing `pages/playlists.js`'s existing
  card/detail pattern
- `services/sortService.js` could gain a `moodAffinity` sort method once
  scoring exists

None of these exist today — they're listed so the eventual implementation
has a map of where each piece plugs into the current architecture.
