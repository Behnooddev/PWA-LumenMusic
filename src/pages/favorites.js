/**
 * pages/favorites.js
 */

import { el, clearNode } from "../utils/dom.js";
import { Songs } from "../database/db.js";
import { createSongRow } from "../components/songRow.js";
import { t } from "../services/i18nService.js";
import { playSong, getCurrentSong, toggleFavorite, on } from "../services/audioEngine.js";

let unsubscribeTrackChange = null;

export async function renderFavorites(container) {
  clearNode(container);
  unsubscribeTrackChange?.();
  unsubscribeTrackChange = null;
  const allSongs = await Songs.all();

  container.appendChild(el("div", { class: "page-head" }, [
    el("h1", {}, t("favorites.title")),
    el("p", { class: "sub" }, t("favorites.subtitle")),
  ]));

  const listWrap = el("div", { class: "song-list" });
  container.appendChild(listWrap);

  function draw() {
    clearNode(listWrap);
    const favSongs = allSongs.filter((s) => s.favorite);
    if (!favSongs.length) {
      listWrap.appendChild(el("p", { class: "empty-state" }, t("favorites.empty")));
      return;
    }
    const current = getCurrentSong();
    favSongs.forEach((song) => {
      listWrap.appendChild(createSongRow(song, {
        isPlaying: !!current && current.id === song.id,
        onPlay: (s) => playSong(s, favSongs),
        onToggleFavorite: async (s) => {
          await toggleFavorite(s);
          s.favorite = !s.favorite;
          draw();
        },
      }));
    });
  }

  unsubscribeTrackChange = on("trackchange", draw);
  draw();
}
