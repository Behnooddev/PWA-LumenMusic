/**
 * pages/playlists.js
 * ---------------------------------------------------------------
 * Create / delete playlists, expand one to see its songs, add
 * songs from the library, and reorder via native HTML5 drag & drop.
 * ---------------------------------------------------------------
 */

import { el, clearNode } from "../utils/dom.js";
import { Playlists, Songs } from "../database/db.js";
import { createSongRow } from "../components/songRow.js";
import { t } from "../services/i18nService.js";
import { localizeNumber } from "../utils/format.js";
import { getLang } from "../services/i18nService.js";
import { playSong, getCurrentSong } from "../services/audioEngine.js";
import { generateId } from "../utils/id.js";

let expandedId = null;

export async function renderPlaylists(container) {
  clearNode(container);
  const lang = getLang();
  const [playlists, allSongs] = await Promise.all([Playlists.all(), Songs.all()]);

  container.appendChild(el("div", { class: "page-head" }, [
    el("h1", {}, t("playlists.title")),
    el("p", { class: "sub" }, t("playlists.subtitle")),
  ]));

  const createPanel = el("div", { class: "panel glass" });
  const createRow = el("div", { class: "playlist-create" });
  const nameInput = el("input", { type: "text", placeholder: t("playlists.createPlaceholder") });
  const createBtn = el("button", { class: "btn primary" }, t("playlists.createButton"));
  createBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    await Playlists.add({ id: generateId("pl"), name, songIds: [], dateCreated: Date.now() });
    nameInput.value = "";
    renderPlaylists(container);
  });
  createRow.append(nameInput, createBtn);
  createPanel.appendChild(createRow);
  container.appendChild(createPanel);

  const listWrap = el("div", { class: "playlist-list" });
  container.appendChild(listWrap);

  if (!playlists.length) {
    listWrap.appendChild(el("p", { class: "empty-state" }, t("playlists.empty")));
    return;
  }

  playlists.forEach((playlist) => {
    listWrap.appendChild(buildPlaylistCard(playlist, allSongs, lang, container));
  });
}

function buildPlaylistCard(playlist, allSongs, lang, rootContainer) {
  const isOpen = expandedId === playlist.id;
  const card = el("div", { class: `playlist-card-wrap${isOpen ? " open" : ""}` });

  const header = el("div", { class: "playlist-card" }, [
    el("div", {}, [
      el("div", { class: "name" }, playlist.name),
      el("div", { class: "count" }, t("playlists.songsCount", { count: localizeNumber(playlist.songIds.length, lang) })),
    ]),
    el("div", { class: "playlist-card-actions" }, [
      (() => {
        const del = el("button", { class: "btn ghost", "aria-label": t("common.delete") }, "✕");
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(t("playlists.deleteConfirm"))) return;
          await Playlists.remove(playlist.id);
          renderPlaylists(rootContainer);
        });
        return del;
      })(),
    ]),
  ]);
  header.addEventListener("click", () => {
    expandedId = isOpen ? null : playlist.id;
    renderPlaylists(rootContainer);
  });
  card.appendChild(header);

  if (isOpen) {
    card.appendChild(buildPlaylistDetail(playlist, allSongs, lang, rootContainer));
  }

  return card;
}

function buildPlaylistDetail(playlist, allSongs, lang, rootContainer) {
  const detail = el("div", { class: "playlist-detail" });
  const songs = playlist.songIds.map((id) => allSongs.find((s) => s.id === id)).filter(Boolean);

  const addBtn = el("button", { class: "btn ghost" }, t("playlists.addSongs"));
  addBtn.addEventListener("click", () => {
    detail.appendChild(buildAddSongsPanel(playlist, allSongs, rootContainer));
    addBtn.remove();
  });
  detail.appendChild(addBtn);

  if (!songs.length) {
    detail.appendChild(el("p", { class: "empty-state" }, t("playlists.emptySongs")));
    return detail;
  }

  detail.appendChild(el("p", { class: "reorder-hint" }, t("playlists.reorderHint")));
  const list = el("div", { class: "song-list draggable-list" });
  detail.appendChild(list);

  let dragFromId = null;

  songs.forEach((song) => {
    const current = getCurrentSong();
    const row = createSongRow(song, {
      isPlaying: !!current && current.id === song.id,
      draggable: true,
      onPlay: (s) => playSong(s, songs),
      onRemove: async (s) => {
        playlist.songIds = playlist.songIds.filter((id) => id !== s.id);
        await Playlists.update(playlist);
        renderPlaylists(rootContainer);
      },
    });

    row.addEventListener("dragstart", () => { dragFromId = song.id; row.classList.add("dragging"); });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (!dragFromId || dragFromId === song.id) return;
      const ids = playlist.songIds.slice();
      const fromIdx = ids.indexOf(dragFromId);
      const toIdx = ids.indexOf(song.id);
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragFromId);
      playlist.songIds = ids;
      await Playlists.update(playlist);
      renderPlaylists(rootContainer);
    });

    list.appendChild(row);
  });

  return detail;
}

function buildAddSongsPanel(playlist, allSongs, rootContainer) {
  const panel = el("div", { class: "add-songs-panel" });
  const available = allSongs.filter((s) => !playlist.songIds.includes(s.id));

  if (!available.length) {
    panel.appendChild(el("p", { class: "empty-state" }, t("library.noResults")));
    return panel;
  }

  available.forEach((song) => {
    const row = el("label", { class: "add-song-check" });
    const checkbox = el("input", { type: "checkbox" });
    row.append(checkbox, el("span", {}, `${song.title} — ${song.artist}`));
    panel.appendChild(row);
    checkbox.addEventListener("change", async () => {
      if (checkbox.checked) playlist.songIds.push(song.id);
      else playlist.songIds = playlist.songIds.filter((id) => id !== song.id);
      await Playlists.update(playlist);
    });
  });

  const doneBtn = el("button", { class: "btn primary" }, t("common.save"));
  doneBtn.addEventListener("click", () => renderPlaylists(rootContainer));
  panel.appendChild(doneBtn);

  return panel;
}
