/**
 * pages/library.js
 * ---------------------------------------------------------------
 * The full, searchable list of every imported song. Always shows
 * an "Import songs" action, even when the library already has
 * content, so adding more is never more than one tap away.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { Songs } from "../database/db.js";
import { createSongRow } from "../components/songRow.js";
import { createEmptyState } from "../components/emptyState.js";
import { t, getLang } from "../services/i18nService.js";
import { localizeNumber } from "../utils/format.js";
import { playSong, getCurrentSong, toggleFavorite, on } from "../services/audioEngine.js";

let searchTerm = "";
let unsubscribeTrackChange = null;

export async function renderLibrary(container, { onImportRequested, onSongRemoved }) {
  clearNode(container);
  unsubscribeTrackChange?.();
  unsubscribeTrackChange = null;
  const lang = getLang();
  const allSongs = await Songs.all();

  const head = el("div", { class: "page-head" }, [
    el("h1", {}, t("library.title")),
    el("p", { class: "sub" }, t("library.subtitle")),
  ]);
  container.appendChild(head);

  const toolbar = el("div", { class: "library-toolbar" });
  const searchWrap = el("div", { class: "search-inline" });
  const searchInput = el("input", {
    type: "search",
    "aria-label": t("common.search"),
    placeholder: t("library.searchPlaceholder"),
  });
  searchInput.value = searchTerm;
  searchWrap.appendChild(searchInput);
  const importBtn = el("button", { class: "btn primary" }, t("library.importMore"));
  importBtn.addEventListener("click", onImportRequested);
  toolbar.append(searchWrap, importBtn);
  container.appendChild(toolbar);

  if (!allSongs.length) {
    container.appendChild(
      createEmptyState({
        actionLabel: t("home.importFirst"),
        onAction: onImportRequested,
      })
    );
    return;
  }

  container.appendChild(
    el("div", { class: "count-label" }, t("library.songCount", { count: localizeNumber(allSongs.length, lang) }))
  );

  const listWrap = el("div", { class: "song-list" });
  container.appendChild(listWrap);

  function draw() {
    clearNode(listWrap);
    const term = searchTerm.trim().toLowerCase();
    const filtered = allSongs
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .filter((s) => !term || s.title.toLowerCase().includes(term) || s.artist.toLowerCase().includes(term) || (s.album || "").toLowerCase().includes(term));

    if (!filtered.length) {
      listWrap.appendChild(el("p", { class: "empty-state" }, t("library.noResults")));
      return;
    }
    const current = getCurrentSong();
    filtered.forEach((song) => {
      listWrap.appendChild(createSongRow(song, {
        isPlaying: !!current && current.id === song.id,
        onPlay: (s) => playSong(s, filtered),
        onToggleFavorite: (s) => toggleFavorite(s),
        onRemove: async (s) => {
          await onSongRemoved(s);
          const idx = allSongs.findIndex((x) => x.id === s.id);
          if (idx > -1) allSongs.splice(idx, 1);
          draw();
        },
      }));
    });
  }

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value;
    draw();
  });

  unsubscribeTrackChange = on("trackchange", draw);
  draw();
}
