/**
 * pages/favorites.js
 */

import { el, clearNode } from "../utils/dom.js";
import { Songs } from "../database/db.js";
import { createSongRow } from "../components/songRow.js";
import { createSortControl } from "../components/sortControl.js";
import { sortSongs } from "../services/sortService.js";
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

  const sortRow = el("div", { class: "count-and-sort" });
  const sortControl = createSortControl("favorites", { fallback: "recentlyAdded", onChange: () => draw() });
  sortRow.append(el("div"), sortControl.element);
  container.appendChild(sortRow);

  const listWrap = el("div", { class: "song-list" });
  container.appendChild(listWrap);

  function draw() {
    clearNode(listWrap);
    const favSongs = sortSongs(allSongs.filter((s) => s.favorite), sortControl.getMethod());
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
