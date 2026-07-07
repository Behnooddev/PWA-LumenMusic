# 🎧 Lumen — Music Player PWA Template

A production-ready, open-source starting point for building your own music
player: dark canvas, warm yellow glow, glassmorphism, and an offline-first
architecture built on IndexedDB. **It ships with zero bundled music** —
import your own songs and Lumen takes care of the rest.

Created by **Behnood Shafiei** — [github.com/Behnooddev](https://github.com/Behnooddev)

![status](https://img.shields.io/badge/status-template-ffd146)
![stack](https://img.shields.io/badge/stack-vanilla%20JS-black)
![storage](https://img.shields.io/badge/storage-IndexedDB-blue)
![offline](https://img.shields.io/badge/offline-first-success)
![format](https://img.shields.io/badge/package-.lmp-ffd146)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

---

## ✨ Features

- **No bundled music, ever** — first launch shows a clean "No music found"
  empty state with an **Import your first song** button. This is a
  template, not an app containing anyone's personal library.
- **Automatic metadata** — importing reads ID3 tags (title, artist, album,
  embedded cover) directly in the browser, with a beautifully generated
  placeholder cover when none exists.
- **IndexedDB-backed** — songs, playlists, favorites, recently played, play
  counts, lyrics, and settings all persist locally across reloads. No
  server, no account.
- **Full playback suite** — shuffle, favorites, recently played, search,
  sleep timer, and drag-and-drop playlist reordering.
- **Reactive visualizer** — a smooth, glowing frequency visualizer built
  directly on the Web Audio API (`AnalyserNode`), with eased animation so
  it never looks jittery.
- **Bilingual, fully translated UI** — every string lives in
  `src/locales/en.json` / `src/locales/fa.json`. Persian mode flips the
  whole interface to RTL with a Persian-friendly font stack and Persian
  digits where appropriate.
- **Three themes** — dark, light, and system (follows the OS and updates
  live if it changes).
- **Import / export library** — back up or migrate your entire library
  (songs, playlists, favorites, settings) as a single JSON file.
- **Lumen Music Package (`.lmp`)** — export a portable, shareable package
  of songs, covers, lyrics, and playlists (a plain ZIP file with a custom
  extension), and import packages built by Lumen or by hand. See
  [`LMP_SPECIFICATION.md`](./LMP_SPECIFICATION.md).
- **Accessible by default** — keyboard navigation, ARIA labels and roles,
  visible focus states, and `prefers-reduced-motion` support.
- **Installable PWA** — Add to Home Screen on iOS Safari, or install from
  the browser on desktop.

---

## 📸 Screenshots

> Replace these once you've imported your own music.

| Empty state | Library | Lyrics |
|---|---|---|
| `docs/screenshot-empty.png` | `docs/screenshot-library.png` | `docs/screenshot-lyrics.png` |

---

## 🏗 Architecture overview

Lumen is deliberately framework-free: vanilla HTML, CSS, and ES modules,
with no build step. The app is organized around a clear separation of
concerns:

```
index.html          → app shell: topbar, side menu, mini player, lyrics modal
manifest.json         → PWA manifest
sw.js                  → service worker (caches the app shell for offline use)

src/
  main.js               → entry point: boots services, wires the router
  database/
    db.js                 → the ONLY module that talks to IndexedDB directly
  services/
    metadataService.js     → hand-written ID3v2 tag + cover-art parser
    coverService.js         → canvas-based placeholder cover generator
    importService.js        → turns picked files into stored song records
    audioEngine.js           → owns <audio>, queue, shuffle, play/favorite events
    visualizerService.js      → smooth Web Audio API canvas visualizer
    i18nService.js             → loads locales, applies translations, RTL
    themeService.js             → dark / light / system theme
    sleepTimerService.js         → countdown that pauses playback
    transferService.js            → full library export / import as JSON
    lmpService.js                  → .lmp package validate / import / export
  pages/                → one render(container) function per page
    home.js  library.js  playlists.js  favorites.js  settings.js  about.js
  components/           → reusable UI pieces
    songRow.js  miniPlayer.js  lyricsModal.js  sideMenu.js
    emptyState.js  importPanel.js  lmpDialog.js
  utils/                → small stateless helpers
    dom.js  format.js  id.js
    zip.js                  → dependency-free ZIP reader/writer
    inflate.js               → dependency-free raw DEFLATE decompressor
  locales/              → en.json, fa.json — every UI string
  lyrics/               → lyrics system docs + data-shape example (no real lyrics)
  styles/
    main.css              → theme tokens, layout, components, RTL, a11y
  assets/
    icons/                → app icons (192, 512, apple-touch, maskable)
```

**Data flow:** UI components never touch IndexedDB or `<audio>` directly.
Pages and components call into `services/` and `database/db.js`, and the
audio engine emits events (`trackchange`, `playstate`, `timeupdate`,
`favorite`) that any part of the UI can subscribe to via `on(event, cb)`.

---

## ⚠️ About copyright — read this before publishing your fork

This template is designed to be copyright-safe out of the box:

- No audio files are bundled.
- No lyrics are bundled — the **Lyrics** feature is a blank, per-song
  editor the user fills in themselves (see `src/lyrics/README.md`).
- Cover art is either read from the user's own files (ID3 `APIC` frames)
  or generated on-device as an abstract placeholder — never downloaded or
  bundled.

Everything a user imports is licensed content *they* provide, stored only
in their own browser via IndexedDB. If you fork this template into a
public product, keep it that way: don't bundle audio, lyrics, or cover art
you don't have the rights to distribute.

---

## 📲 Installing as a PWA

**iOS (iPhone/iPad) — Safari:** Share icon → **Add to Home Screen** → Add.
Must be Safari for the iOS install prompt to appear.

**Desktop — Chrome / Edge:** click the install icon in the address bar, or
the browser menu → *Install Lumen…*.

---

## 🎵 Using the app

- **Import songs** — Home or Library → **Import songs**, or just drag audio
  files anywhere onto the window.
- **Favorites** — tap the heart on any song or in the mini player.
- **Playlists** — create one on the Playlists page, expand it, **Add
  songs**, then drag rows to reorder.
- **Search** — Library page has an inline search across title, artist, and
  album.
- **Sleep timer** — Settings → Sleep timer → pick a duration; playback
  pauses automatically when it ends.
- **Lyrics** — tap the cover in the mini player, then **Add lyrics** to
  paste your own (optionally with `[m:ss]` sync tags).
- **Backup / migrate** — Settings → **Export library** downloads a JSON
  file with everything; **Import library** restores it on any device.
- **Share a package** — Settings → **Export Package (.lmp)** bundles songs,
  covers, lyrics, and playlists into one portable file; **Import Package
  (.lmp)** brings one in. See the full guide in
  [`HOW_TO_USE.md`](./HOW_TO_USE.md).

---

## 📦 Lumen Music Package (`.lmp`)

`.lmp` is Lumen's portable package format for sharing or backing up a
music collection — **it's just a ZIP archive with a renamed extension.**
No proprietary container, no encryption, fully inspectable with any zip
tool.

```
package.lmp
│
├── manifest.json      → packageName, version, author, description, ...
├── songs/              → audio files
├── covers/              → cover images
├── lyrics/               → one bilingual JSON file per song
├── metadata/              → one JSON file per song (title, artist, paths...)
└── playlists/              → playlist JSON files (store song ids only)
```

The app **always reads song information from `metadata/*.json`** — never
from filenames or folder structure — so a package's songs can be named
anything internally.

Before importing, Lumen validates the manifest, required folders,
metadata files, and every referenced audio/cover/lyrics path, and shows a
friendly error (or a partial-success summary with warnings) rather than
failing silently.

- **Full format reference:** [`LMP_SPECIFICATION.md`](./LMP_SPECIFICATION.md)
- **Step-by-step guide:** [`HOW_TO_USE.md`](./HOW_TO_USE.md)

### How to create `.lmp` files (for users)

You don't need Lumen to build a package — a text editor and your OS's zip
tool are enough:

1. Create a folder like this:

   ```
   my-music-package/
   ├── manifest.json
   ├── songs/
   ├── covers/
   ├── lyrics/
   ├── metadata/
   └── playlists/
   ```

2. Fill `manifest.json` with your package info (name, version, author,
   description).
3. Add your audio files inside `songs/`.
4. Add cover images inside `covers/`.
5. Add lyrics JSON files inside `lyrics/`.
6. Add metadata JSON files inside `metadata/` — one per song, referencing
   the matching audio/cover/lyrics paths.
7. Add playlist JSON files inside `playlists/` (optional).
8. Compress the folder into a ZIP file.
9. Rename the file extension from `.zip` to `.lmp`:

   ```
   my-music-package.zip → my-music-package.lmp
   ```

That's the whole process — `.lmp` is just a ZIP file with a custom
extension. Full field-by-field details and validation rules are in
[`LMP_SPECIFICATION.md`](./LMP_SPECIFICATION.md).

---

## 🧱 Tech stack

- **HTML5 / CSS3** — custom properties, glassmorphism (`backdrop-filter`),
  CSS grid/flexbox, RTL layout, `prefers-reduced-motion`
- **Vanilla JavaScript (ES modules)** — no framework, no bundler
- **IndexedDB** — songs, playlists, favorites, recents, lyrics, settings
- **Web Audio API** — `AnalyserNode`-powered visualizer
- **Service Worker + Cache API** — offline app shell
- **Web App Manifest** — installable on iOS and desktop
- **Hand-written ID3v2 parser** — no external tag-reading dependency
- **Hand-written ZIP reader/writer + raw DEFLATE decompressor** — powers
  `.lmp` packages with no external dependency; reads both STORE and
  DEFLATE-compressed archives (i.e. zips made by normal OS tools)

No npm dependencies, no build step. Clone it, serve it, done.

---

## 🖥 Running locally

Service workers and ES module imports both require a real origin (not
`file://`). Serve the folder with any static server:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080`.

---

## 🚀 Deploying

Any static host works — GitHub Pages, Netlify, Vercel, Cloudflare Pages.

For GitHub Pages: push to GitHub → **Settings → Pages → Deploy from
branch → `main` / root** → visit the published URL.

---

## 🔭 Future improvements

- [ ] Background audio + Media Session API (iOS lock-screen controls)
- [ ] Crossfade between tracks
- [ ] Repeat-one / repeat-all modes
- [ ] Word-level lyric sync
- [ ] Multi-select batch import with per-file progress
- [ ] Optional selective export (choose which playlists/songs to include)

---

## 📄 License

MIT — see [`LICENSE`](./LICENSE). The license covers the Lumen source code
only; it does not grant rights to any audio, lyrics, or cover art a user
imports into the app.

---

## 📚 More documentation

- [`HOW_TO_USE.md`](./HOW_TO_USE.md) — step-by-step guide: running the
  project, importing songs, playlists, lyrics, exporting/importing
  packages, and customizing the code.
- [`LMP_SPECIFICATION.md`](./LMP_SPECIFICATION.md) — the complete `.lmp`
  format specification.
- [`src/lyrics/README.md`](./src/lyrics/README.md) — the lyrics system in
  detail.

---

Created by **Behnood Shafiei** — [github.com/Behnooddev](https://github.com/Behnooddev)

