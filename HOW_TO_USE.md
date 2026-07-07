# How to Use Lumen

A practical, step-by-step guide — from running the project locally to
building your own `.lmp` packages. For the formal package format, see
[`LMP_SPECIFICATION.md`](./LMP_SPECIFICATION.md). For the architecture
overview, see [`README.md`](./README.md).

---

## 1. Running the project

Lumen has no build step — it's vanilla HTML/CSS/JS. It does need a real
HTTP origin (not `file://`) because it uses ES module imports and a
service worker, both of which browsers block on `file://`.

```bash
# Option A — Python
python3 -m http.server 8080

# Option B — Node
npx serve .
```

Then open `http://localhost:8080` (or whatever port you used) in your
browser. On first load you'll see the **"No music found"** empty state —
that's expected. Lumen ships with no bundled songs.

---

## 2. Importing songs

Two ways:

1. **Import songs** button — on the Home empty state, or on the Library
   page toolbar. Opens your device's file picker; select one or more
   audio files (mp3, m4a, wav, ogg, flac, aac).
2. **Drag and drop** — drag audio files from your file manager onto the
   browser window at any time; a drop overlay appears while dragging.

While importing, Lumen reads each file's ID3 tags (title, artist, album,
genre, embedded cover) directly in the browser. If a file has no embedded
cover, a placeholder is generated automatically — no network request is
made for this.

---

## 3. Everyday features

| Feature | Where |
|---|---|
| Play / pause / next / previous | Mini player, always visible at the bottom |
| Shuffle | Shuffle icon in the mini player |
| Favorite a song | Heart icon on any song row, or in the mini player |
| Search | Library page — searches title, artist, and album |
| Sleep timer | Settings → Sleep timer — pick 15/30/45/60 minutes |
| Create a playlist | Playlists page → name it → Create |
| Add songs to a playlist | Expand a playlist → Add songs → check the ones you want |
| Reorder a playlist | Expand it, drag rows by the handle |
| Add lyrics | Tap the cover in the mini player → Add lyrics |
| Switch theme | Settings → Theme → Dark / Light / System |
| Switch language | Settings → Language → English / فارسی (flips to RTL) |

---

## 4. Exporting a Music Package (.lmp)

Use this to back up your library, or to share a curated set of songs and
playlists with someone else running Lumen (or any app implementing the
`.lmp` spec).

1. Go to **Settings → Music Package (.lmp) → Export Package**.
2. In the dialog, confirm or edit the **package name** and optionally add
   your name as **author**.
3. Click **Export**. Lumen builds the package (you'll see a progress
   dialog) and your browser downloads a `.lmp` file.
4. A success dialog confirms how many songs and playlists were included.

The exported file bundles every song's audio, cover, and lyrics (if any),
plus any playlist that includes at least one exported song.

> This is different from **Settings → Export library**, which is a raw
> JSON backup of absolutely everything (including settings, recently
> played, and play counts) for restoring on the same app. `.lmp` is the
> portable, shareable format meant to travel between libraries.

---

## 5. Importing a Music Package (.lmp)

1. Go to **Settings → Music Package (.lmp) → Import Package**.
2. Choose a `.lmp` file.
3. Lumen reads, then validates the package (you'll see each stage in the
   progress dialog), then imports it.
4. You'll get either:
   - A **success dialog** with a count of songs/playlists added (and a
     short list of anything skipped, if some entries were invalid), or
   - A **friendly error dialog** explaining what was wrong, if the file
     wasn't a valid package at all.

Songs whose id already exists in your library are imported as new,
separate entries (not merged or overwritten) — playlists from the package
are updated to point at the right copy automatically.

---

## 6. Creating your own `.lmp` package

You don't need Lumen itself to create a package — any text editor and
your OS's normal "compress to zip" feature is enough.

1. **Create a folder** with this layout:

   ```
   my-music-package/
   ├── manifest.json
   ├── songs/
   ├── covers/
   ├── lyrics/
   ├── metadata/
   └── playlists/
   ```

2. **Fill in `manifest.json`:**

   ```json
   {
     "packageName": "My Music Package",
     "version": "1.0.0",
     "author": "Your Name",
     "description": "A short description",
     "createdAt": "2026-07-06T00:00:00Z",
     "packageFormatVersion": 1
   }
   ```

3. **Add your audio files** inside `songs/` — name them however you like
   (e.g. `songs/track1.mp3`).

4. **Add cover images** inside `covers/` (e.g. `covers/track1.jpg`) —
   optional; Lumen generates a placeholder if you skip this.

5. **Add lyrics** inside `lyrics/` as one JSON file per song (optional):

   ```json
   {
     "id": "track1",
     "languages": {
       "en": ["First line", "Second line"],
       "fa": []
     }
   }
   ```

6. **Add metadata** inside `metadata/` — one JSON file per song, matching
   the audio file's id:

   ```json
   {
     "id": "track1",
     "title": "My Song",
     "artist": "My Name",
     "album": "",
     "duration": 180,
     "genre": "",
     "song": "songs/track1.mp3",
     "cover": "covers/track1.jpg",
     "lyrics": "lyrics/track1.json"
   }
   ```

7. **Add playlists** inside `playlists/` (optional):

   ```json
   { "name": "My Playlist", "description": "", "songs": ["track1"] }
   ```

8. **Compress the folder** into a ZIP file using your OS:
   - **macOS:** right-click the folder → *Compress*.
   - **Windows:** right-click the folder → *Send to* → *Compressed
     (zipped) folder*.
   - **Linux:** `zip -r my-music-package.zip my-music-package/`

9. **Rename the extension** from `.zip` to `.lmp`:

   ```
   my-music-package.zip → my-music-package.lmp
   ```

That's it — `.lmp` is just a ZIP file with a renamed extension. You can
always rename it back to `.zip` to inspect or edit it with any archive
tool.

See [`LMP_SPECIFICATION.md`](./LMP_SPECIFICATION.md) for the full field
reference and validation rules.

---

## 7. How playlists work

- A playlist is just a name plus an ordered list of song ids.
- Playlists never store song details (title, artist, cover) directly —
  those always come from the song record itself, so renaming or
  re-tagging a song updates it everywhere it appears.
- Reordering is drag-and-drop, saved immediately to IndexedDB.

## 8. How lyrics work

- Lyrics are entirely user-provided — Lumen ships with none.
- Add them per-song from the mini player's lyrics sheet.
- Optional `[m:ss]` tags at the start of a line sync it to that timestamp
  during playback; untagged lines just display statically.
- English and Persian are stored separately per song.

## 9. How metadata works

- On import, ID3v2 tags (title, artist, album, genre, embedded cover) are
  read directly from the audio file in the browser.
- Anything not found in the tags falls back sensibly: title from the
  filename, "Unknown Artist" for artist, and a generated placeholder for
  the cover.
- When importing a `.lmp` package, metadata always comes from that
  package's `metadata/*.json` files — never inferred from filenames.

---

## 10. Customizing the project (for developers)

Lumen is deliberately unbundled and dependency-free, so most
customization is just editing the relevant file directly:

| Want to change... | Edit |
|---|---|
| Colors, spacing, glass effect | `src/styles/main.css` (CSS custom properties at the top) |
| UI text / add a language | `src/locales/en.json`, `src/locales/fa.json` (copy one to add a new language, then wire it into the language segmented control in `src/pages/settings.js`) |
| A page's layout or behavior | `src/pages/*.js` |
| A reusable UI piece | `src/components/*.js` |
| Storage schema | `src/database/db.js` |
| Playback behavior | `src/services/audioEngine.js` |
| Metadata reading | `src/services/metadataService.js` |
| `.lmp` import/export logic | `src/services/lmpService.js` |
| The visualizer | `src/services/visualizerService.js` |

No bundler is involved, so changes take effect on a simple page reload.

---

Created by **Behnood Shafiei** — [github.com/Behnooddev](https://github.com/Behnooddev)
