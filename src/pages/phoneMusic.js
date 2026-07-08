/**
 * pages/phoneMusic.js
 * ---------------------------------------------------------------
 * Per-platform behavior (see also services/phoneMusicService.js):
 *
 *   Android + File System Access API support
 *     -> real folder picker, recursive scan, search/sort/select,
 *        "Import selected" writes chosen files into the library
 *        (skipping ones already imported, via sourceFingerprint).
 *
 *   Desktop
 *     -> shows the existing library (same data as Library page) —
 *        there's no "phone" storage concept to browse here, so this
 *        page is intentionally just another lens on your library.
 *
 *   iOS / any other browser without directory-picker support
 *     -> a clear, honest explanation of the limitation, with a
 *        button that opens the normal file-picker import flow
 *        instead of pretending to support something the platform
 *        genuinely cannot do.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { Songs } from "../database/db.js";
import { createSongRow } from "../components/songRow.js";
import { createSortControl } from "../components/sortControl.js";
import { sortSongs } from "../services/sortService.js";
import { t } from "../services/i18nService.js";
import { isAndroid, isIOS, supportsDirectoryPicker } from "../utils/platform.js";
import { pickDirectory, scanDirectoryForAudio } from "../services/phoneMusicService.js";
import { importFiles, getExistingFingerprints } from "../services/importService.js";
import { playSong, getCurrentSong, toggleFavorite, on } from "../services/audioEngine.js";

let unsubscribeTrackChange = null;

export async function renderPhoneMusic(container, { onImportRequested }) {
  clearNode(container);
  unsubscribeTrackChange?.();
  unsubscribeTrackChange = null;

  container.appendChild(el("div", { class: "page-head" }, [
    el("h1", {}, t("phoneMusic.title")),
    el("p", { class: "sub" }, t("phoneMusic.subtitle")),
  ]));

  if (isAndroid() && supportsDirectoryPicker()) {
    renderAndroidScanner(container);
  } else if (!isAndroid() && !isIOS()) {
    await renderDesktopLibraryView(container);
  } else {
    renderUnsupportedNotice(container, onImportRequested);
  }
}

/* ------------------------------------------------------------------
   Android — real device folder scan
------------------------------------------------------------------ */

function renderAndroidScanner(container) {
  const pickBtn = el("button", { class: "btn primary" }, t("phoneMusic.chooseFolder"));
  const statusEl = el("p", { class: "panel-hint" }, t("phoneMusic.scanHint"));
  container.append(pickBtn, statusEl);

  const toolbar = el("div", { class: "library-toolbar" }, []);
  const searchInput = el("input", { type: "search", placeholder: t("library.searchPlaceholder") });
  toolbar.appendChild(el("div", { class: "search-inline" }, [searchInput]));
  const listWrap = el("div", { class: "song-list" });
  const importBar = el("div", { class: "phone-music-import-bar" });
  toolbar.style.display = "none";
  listWrap.style.display = "none";
  importBar.style.display = "none";
  container.append(toolbar, listWrap, importBar);

  let scannedFiles = [];
  let selected = new Set();
  let searchTerm = "";
  let existingFingerprints = new Set();
  let sortControl = null;

  pickBtn.addEventListener("click", async () => {
    let dirHandle;
    try {
      dirHandle = await pickDirectory();
    } catch {
      return; // user cancelled the picker — nothing to report
    }

    statusEl.textContent = t("phoneMusic.scanning");
    existingFingerprints = await getExistingFingerprints();

    scannedFiles = await scanDirectoryForAudio(dirHandle, (file, count) => {
      statusEl.textContent = t("phoneMusic.scanningCount", { count });
    });

    selected = new Set(
      scannedFiles
        .filter((f) => !existingFingerprints.has(`${f.name}:${f.size}`))
        .map((f) => f.name + ":" + f.size)
    );

    statusEl.textContent = t("phoneMusic.foundCount", { count: scannedFiles.length });
    toolbar.style.display = "";
    listWrap.style.display = "";
    importBar.style.display = "";

    if (!sortControl) {
      sortControl = createSortControl("phoneMusic", { fallback: "az", methods: ["az", "za"], onChange: draw });
      toolbar.appendChild(sortControl.element);
    }
    draw();
  });

  searchInput.addEventListener("input", () => { searchTerm = searchInput.value; draw(); });

  function draw() {
    clearNode(listWrap);
    const term = searchTerm.trim().toLowerCase();
    const pseudoSongs = scannedFiles
      .filter((f) => !term || f.name.toLowerCase().includes(term))
      .map((f) => ({ title: f.name.replace(/\.[^/.]+$/, ""), artist: "", file: f }));
    const sorted = sortControl ? sortSongs(pseudoSongs, sortControl.getMethod()) : pseudoSongs;

    sorted.forEach(({ title, file }) => {
      const fingerprint = `${file.name}:${file.size}`;
      const alreadyImported = existingFingerprints.has(fingerprint);
      const row = el("label", { class: `phone-file-row${alreadyImported ? " already-imported" : ""}` });
      const checkbox = el("input", { type: "checkbox" });
      checkbox.checked = selected.has(fingerprint);
      checkbox.disabled = alreadyImported;
      checkbox.addEventListener("change", () => {
        checkbox.checked ? selected.add(fingerprint) : selected.delete(fingerprint);
        updateImportBar();
      });
      row.append(
        checkbox,
        el("span", { class: "phone-file-name" }, title),
        alreadyImported ? el("span", { class: "phone-file-badge" }, t("phoneMusic.alreadyInLibrary")) : null
      );
      listWrap.appendChild(row);
    });

    updateImportBar();
  }

  function updateImportBar() {
    clearNode(importBar);
    const count = [...selected].filter((fp) => !existingFingerprints.has(fp)).length;
    const importBtn = el("button", { class: "btn primary" }, t("phoneMusic.importSelected", { count }));
    importBtn.disabled = count === 0;
    importBtn.addEventListener("click", async () => {
      const filesToImport = scannedFiles.filter((f) => selected.has(`${f.name}:${f.size}`));
      importBtn.disabled = true;
      importBtn.textContent = t("phoneMusic.importing");
      const imported = await importFiles(filesToImport, (i, totalCount) => {
        importBtn.textContent = t("phoneMusic.importingProgress", { current: i, total: totalCount });
      });
      existingFingerprints = await getExistingFingerprints();
      statusEl.textContent = t("phoneMusic.importedCount", { count: imported.length });
      draw();
    });
    importBar.appendChild(importBtn);
  }
}

/* ------------------------------------------------------------------
   Desktop — just another view of the library
------------------------------------------------------------------ */

async function renderDesktopLibraryView(container) {
  const allSongs = await Songs.all();
  container.appendChild(el("p", { class: "panel-hint" }, t("phoneMusic.desktopHint")));

  if (!allSongs.length) {
    container.appendChild(el("p", { class: "empty-state" }, t("library.noResults")));
    return;
  }

  const sortRow = el("div", { class: "count-and-sort" });
  const sortControl = createSortControl("phoneMusic-desktop", { fallback: "recentlyAdded", onChange: () => draw() });
  sortRow.append(el("div"), sortControl.element);
  container.appendChild(sortRow);

  const listWrap = el("div", { class: "song-list" });
  container.appendChild(listWrap);

  function draw() {
    clearNode(listWrap);
    const sorted = sortSongs(allSongs, sortControl.getMethod());
    const current = getCurrentSong();
    sorted.forEach((song) => {
      listWrap.appendChild(createSongRow(song, {
        isPlaying: !!current && current.id === song.id,
        onPlay: (s) => playSong(s, sorted),
        onToggleFavorite: (s) => toggleFavorite(s),
      }));
    });
  }

  unsubscribeTrackChange = on("trackchange", draw);
  draw();
}

/* ------------------------------------------------------------------
   iOS / unsupported — honest graceful degradation
------------------------------------------------------------------ */

function renderUnsupportedNotice(container, onImportRequested) {
  const panel = el("div", { class: "panel glass phone-music-limitation" }, [
    el("div", { class: "empty-state-icon", "aria-hidden": "true" }, "📱"),
    el("h2", { class: "empty-state-title" }, t("phoneMusic.unsupportedTitle")),
    el("p", { class: "empty-state-body" }, t("phoneMusic.unsupportedBody")),
  ]);
  const importBtn = el("button", { class: "btn primary large" }, t("home.importFirst"));
  importBtn.addEventListener("click", onImportRequested);
  panel.appendChild(importBtn);
  container.appendChild(panel);
}
