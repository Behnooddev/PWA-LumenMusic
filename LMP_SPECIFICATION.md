# Lumen Music Package (.lmp) — Specification v1

**Format version:** 1
**Status:** Stable
**Maintainer:** Behnood Shafiei ([github.com/Behnooddev](https://github.com/Behnooddev))

---

## 1. What is `.lmp`?

A `.lmp` file is a **ZIP archive with a custom file extension**. It bundles
songs, cover art, bilingual lyrics, per-song metadata, and playlists into
one portable file that can be shared, backed up, or moved between devices
running Lumen (or any compatible player that implements this spec).

There is no proprietary container format and no encryption. Any standard
ZIP tool can open a `.lmp` file once it's renamed to `.zip` — this is
intentional, to keep the format simple, inspectable, and future-proof.

Users are never expected to interact with a package's internal folders
directly through the app; import and export are single-click actions.
The internal structure below is for developers building or inspecting
packages by hand.

---

## 2. Compression

- **Writing:** Lumen exports packages using the ZIP **STORE** method (no
  compression). Audio and image files are already compressed formats, so
  little would be gained by compressing them again, and STORE keeps the
  writer simple and fast.
- **Reading:** Lumen's importer supports both **STORE** (method `0`) and
  **DEFLATE** (method `8`), because a package built by zipping a folder
  with a normal OS tool (Finder, Explorer, `zip`, 7-Zip, etc.) will use
  DEFLATE by default. Other compression methods (e.g. BZIP2, LZMA) are
  not supported and will produce a validation error naming the offending
  file.

---

## 3. Folder structure

```
package.lmp
│
├── manifest.json
├── songs/
│     └── <id>.<ext>          (mp3, m4a, wav, ogg, flac, aac)
├── covers/
│     └── <id>.<ext>          (png, jpg, jpeg, webp)
├── lyrics/
│     └── <id>.json
├── metadata/
│     └── <id>.json           (one file per song — required)
└── playlists/
      └── <name>.json         (optional, any number)
```

- `<id>` is any string unique within the package (letters, numbers,
  hyphens, underscores recommended). It's the same id used to cross-
  reference a song from its metadata, lyrics, and playlist entries.
- Only `manifest.json` and at least one valid file under `metadata/` are
  strictly required. Everything else (`covers/`, `lyrics/`, `playlists/`)
  is optional.
- Folder entries themselves (e.g. a `songs/` directory entry with no
  file) are ignored by the reader.

---

## 4. `manifest.json`

Sits at the package root. Describes the package as a whole.

| Field                  | Type   | Required | Description                                  |
|-------------------------|--------|:--------:|-----------------------------------------------|
| `packageName`           | string | recommended | Human-readable name shown after import.    |
| `version`               | string | no       | Free-form version string for the package itself (e.g. `"1.2.0"`). |
| `author`                | string | no       | Package creator's name.                       |
| `description`           | string | no       | Short free-form description.                  |
| `createdAt`              | string | no       | ISO 8601 timestamp.                            |
| `packageFormatVersion`   | number | recommended | The `.lmp` spec version this package targets (currently `1`). |

```json
{
  "packageName": "Road Trip Collection",
  "version": "1.0.0",
  "author": "Behnood Shafiei",
  "description": "Songs for long drives",
  "createdAt": "2026-07-06T12:00:00.000Z",
  "packageFormatVersion": 1
}
```

A missing or unparsable `manifest.json` fails validation immediately — it's
the one file every `.lmp` package must have.

---

## 5. `metadata/<id>.json`

One file per song. **The application reads song information from these
files — never from folder names or file names.**

| Field       | Type    | Required | Description                                             |
|-------------|---------|:--------:|-----------------------------------------------------------|
| `id`        | string  | yes      | Must match the filename (without `.json`) and the id referenced by lyrics/playlists. |
| `title`     | string  | yes      | Song title.                                                |
| `artist`    | string  | yes      | Artist name.                                               |
| `album`     | string  | no       | Album name.                                                |
| `duration`  | number  | no       | Duration in seconds. If omitted or invalid, treated as `0`. |
| `genre`     | string  | no       | Genre.                                                     |
| `song`      | string  | yes      | Path to the audio file, relative to the package root (e.g. `"songs/perfect.mp3"`). Must exist in the archive. |
| `cover`     | string \| null | no | Path to a cover image, relative to the package root, or `null`/omitted. If missing or unresolvable, Lumen generates a placeholder cover automatically. |
| `lyrics`    | string \| null | no | Path to a lyrics JSON file, relative to the package root, or `null`/omitted. |

```json
{
  "id": "perfect",
  "title": "Perfect",
  "artist": "Ed Sheeran",
  "album": "÷ (Divide)",
  "duration": 263,
  "genre": "Pop",
  "song": "songs/perfect.mp3",
  "cover": "covers/perfect.jpg",
  "lyrics": "lyrics/perfect.json"
}
```

**Note on copyright:** the example above uses a well-known song purely to
illustrate the schema. Lumen ships with no bundled audio, lyrics, or cover
art — anything in a `.lmp` package is content the package's creator is
responsible for having the rights to distribute.

---

## 6. `lyrics/<id>.json`

Bilingual lyrics for one song. Each language is an array of lines — either
plain strings, or objects with a `time` (seconds) for sync highlighting.

```json
{
  "id": "perfect",
  "languages": {
    "en": [
      { "time": 0, "text": "First line" },
      { "time": 4, "text": "Second line" }
    ],
    "fa": [
      "متن ترانه بدون زمان‌بندی هم قابل قبول است"
    ]
  }
}
```

- Both `en` and `fa` are optional; an empty array (or an absent key) means
  no lyrics in that language.
- Lines may mix plain strings and `{ time, text }` objects within the same
  array — plain strings just won't highlight during playback.
- If the referenced lyrics file is missing or invalid JSON, the affected
  song still imports — just without lyrics — and a warning is surfaced.

---

## 7. `playlists/<name>.json`

Any number of files. Playlists **only store song ids** — all display
information (title, artist, cover, etc.) always comes from `metadata/`.

| Field         | Type     | Required | Description                          |
|---------------|----------|:--------:|----------------------------------------|
| `name`        | string   | yes      | Playlist name.                        |
| `description` | string   | no       | Free-form description.                |
| `songs`       | string[] | yes      | Ordered array of song ids referencing `metadata/<id>.json` entries. |

```json
{
  "name": "Road Trip",
  "description": "Travel playlist",
  "songs": ["perfect", "yellow", "home"]
}
```

Song ids in a playlist that don't correspond to a successfully-imported
song are silently dropped; a playlist left with zero valid songs after
that filtering is skipped entirely (with a warning), rather than creating
an empty playlist.

---

## 8. Validation rules (what the importer checks)

Performed **before** any data is written to the library:

1. `manifest.json` exists at the archive root and is valid JSON.
2. At least one file under `metadata/` exists, is valid JSON, and has
   the required fields (`id`, `title`, `artist`, `song`).
3. For each metadata entry, its `song` path resolves to a real file in
   the archive. If not, that song is skipped with a warning — it does
   not fail the whole import.
4. If a `cover` path is given but doesn't resolve, that song still
   imports, using a generated placeholder cover instead (warning shown).
5. If a `lyrics` path is given but doesn't resolve or isn't valid JSON,
   that song still imports without lyrics (warning shown).
6. Each `playlists/*.json` file must have `name` and a `songs` array to
   be considered; otherwise it's skipped (warning shown).
7. If **zero** songs pass validation, the whole import is rejected with a
   friendly error — there's nothing importable in the package.

The result is a three-tier outcome, matching how the in-app dialog
presents things:

- **Hard failure** (nothing imported) — missing manifest, no metadata
  files, or every song reference broken.
- **Partial success** — some songs/playlists imported, others skipped;
  shown as a success dialog with a warnings list.
- **Full success** — everything in the package imported cleanly.

---

## 9. Id collisions

If an imported song's `id` already exists in the local library, Lumen
generates a new internal id for the imported copy rather than overwriting
the existing song. Playlist song-id references are remapped accordingly
during that same import, so playlists still point at the right song.

---

## 10. Extending the format

`packageFormatVersion` exists so future changes (new optional fields, new
top-level folders) can be introduced without breaking older packages.
Unknown fields in any `.lmp` JSON file are ignored by the current reader,
not rejected — so forward-compatible additions are safe.

---

## 11. Reference implementation

Lumen's own reader/writer lives at:

- `src/utils/zip.js` — ZIP reader/writer (STORE write; STORE + DEFLATE read)
- `src/utils/inflate.js` — dependency-free raw DEFLATE decompressor
- `src/services/lmpService.js` — validation, import, and export logic

No third-party libraries are used for any of this, by design — the whole
format is meant to be simple enough to read, audit, and reimplement from
this document alone.
