# Lyrics system

Lumen ships with **no bundled lyrics** — the lyrics system is entirely
user-driven and copyright-safe by construction. There is nothing to
configure here at build time; lyrics are added per-song, at runtime,
through the app itself, and stored in the `lyrics` object store in
IndexedDB (see `src/database/db.js`).

## How it works

1. Play any song and tap its cover in the mini player to open the
   **Lyrics** sheet.
2. If nothing's been added yet, tap **Add lyrics** and paste in text you
   have the rights to use — your own writing, something in the public
   domain, or lyrics from a source that permits it.
3. Lumen stores separate English and Persian (فارسی) versions per song,
   switchable with the EN / FA tabs.

## Optional sync tags

Plain lines display as static text. To sync a line to a timestamp so it
highlights during playback, prefix it with `[m:ss]`:

```
[0:00] First line, highlights at the very start
[0:12] Second line, highlights at 12 seconds
This line has no tag, so it just displays without highlighting
```

## Data shape

Each song's lyrics are stored as:

```json
{
  "songId": "song_...",
  "en": "[0:00] Hello\n[0:04] World",
  "fa": "[0:00] سلام\n[0:04] دنیا"
}
```

`example.json` in this folder shows the shape for reference — it is a
template, not real lyrics for any real song.
