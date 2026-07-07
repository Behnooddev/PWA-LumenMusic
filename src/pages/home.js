/**
 * pages/home.js
 * ---------------------------------------------------------------
 * First thing users see. If the library is empty, shows the
 * "No music found" empty state with an import CTA. Otherwise shows
 * a small "continue listening" shelf, a favorites shortcut, and the
 * full library below.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { Songs, Recents } from "../database/db.js";
import { createSongRow } from "../components/songRow.js";
import { createEmptyState } from "../components/emptyState.js";
import { t } from "../services/i18nService.js";
import { playSong, getCurrentSong, toggleFavorite, on } from "../services/audioEngine.js";

// renderHome() runs every time the user navigates to Home. Without
// tracking this, each visit would add another "trackchange" listener
// bound to the previous render's (now-detached) container, leaking
// memory and doing redundant work forever. Only one stays live.
let unsubscribeTrackChange = null;

export async function renderHome(container, { onImportRequested }) {
  clearNode(container);
  unsubscribeTrackChange?.();
  unsubscribeTrackChange = null;

  const allSongs = await Songs.all();

  if (!allSongs.length) {
    container.appendChild(
      el("div", { class: "page-head" }, [
        el("h1", { "data-i18n": "home.title" }, t("home.title")),
        el("p", { class: "sub", "data-i18n": "home.subtitle" }, t("home.subtitle")),
      ])
    );
    container.appendChild(
      createEmptyState({
        title: t("home.emptyTitle"),
        body: t("home.emptyBody"),
        actionLabel: t("home.importFirst"),
        onAction: onImportRequested,
      })
    );
    return;
  }

  const head = el("div", { class: "page-head" }, [
    el("h1", {}, t("home.title")),
    el("p", { class: "sub" }, t("home.subtitle")),
  ]);
  container.appendChild(head);

  // ---- continue listening ----
  const recents = await Recents.all();
  const recentSongs = recents
    .map((r) => allSongs.find((s) => s.id === r.id))
    .filter(Boolean)
    .slice(0, 5);

  if (recentSongs.length) {
    container.appendChild(el("h2", { class: "section-label" }, t("home.continueListening")));
    const list = el("div", { class: "song-list" });
    recentSongs.forEach((song) => list.appendChild(buildRow(song, allSongs)));
    container.appendChild(list);
  }

  // ---- favorites shortcut ----
  const favSongs = allSongs.filter((s) => s.favorite).slice(0, 5);
  if (favSongs.length) {
    container.appendChild(el("h2", { class: "section-label" }, t("home.yourFavorites")));
    const list = el("div", { class: "song-list" });
    favSongs.forEach((song) => list.appendChild(buildRow(song, allSongs)));
    container.appendChild(list);
  }

  // ---- everything ----
  container.appendChild(el("h2", { class: "section-label" }, t("library.title")));
  const fullList = el("div", { class: "song-list" });
  allSongs
    .slice()
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .forEach((song) => fullList.appendChild(buildRow(song, allSongs)));
  container.appendChild(fullList);

  function refreshPlayingHighlight() {
    const current = getCurrentSong();
    container.querySelectorAll(".song-row").forEach((row) => {
      row.classList.toggle("playing", !!current && row.dataset.id === current.id);
    });
  }
  unsubscribeTrackChange = on("trackchange", refreshPlayingHighlight);
}

function buildRow(song, queue) {
  const current = getCurrentSong();
  return createSongRow(song, {
    isPlaying: !!current && current.id === song.id,
    onPlay: (s) => playSong(s, queue),
    onToggleFavorite: (s) => toggleFavorite(s),
  });
}
