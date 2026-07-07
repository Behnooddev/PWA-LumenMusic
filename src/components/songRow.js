/**
 * components/songRow.js
 * ---------------------------------------------------------------
 * One reusable row: cover, title, artist, duration, play count,
 * favorite toggle, and a play button. Optional drag handle and
 * remove button for playlist contexts.
 * ---------------------------------------------------------------
 */

import { el, escapeHtml } from "../utils/dom.js";
import { localizeTime, localizeNumber } from "../utils/format.js";
import { t, getLang } from "../services/i18nService.js";

export function createSongRow(song, {
  isPlaying = false,
  onPlay,
  onToggleFavorite,
  onRemove,
  draggable = false,
} = {}) {
  const lang = getLang();

  const row = el("div", {
    class: `song-row${isPlaying ? " playing" : ""}`,
    dataset: { id: song.id },
    role: "listitem",
    tabindex: "0",
    "aria-label": `${song.title} — ${song.artist}`,
  });

  if (draggable) {
    row.draggable = true;
    row.classList.add("draggable");
    const handle = el("span", { class: "drag-handle", "aria-hidden": "true" }, "⠿");
    row.appendChild(handle);
  }

  const cover = el("img", {
    class: "song-cover",
    src: song.cover || "src/assets/icons/icon-192.png",
    alt: "",
    loading: "lazy",
  });

  const meta = el("div", { class: "song-meta" }, [
    el("div", { class: "song-title" }, song.title),
    el("div", { class: "song-artist" }, song.artist),
  ]);

  const favBtn = el("button", {
    class: `song-fav-btn${song.favorite ? " active" : ""}`,
    "aria-label": song.favorite ? t("player.unfavorite") : t("player.favorite"),
    "aria-pressed": String(!!song.favorite),
  }, song.favorite ? "♥" : "♡");
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onToggleFavorite?.(song);
  });

  const side = el("div", { class: "song-side" }, [
    el("div", { class: "song-stats" }, [
      el("div", { class: "song-duration" }, localizeTime(song.duration, lang)),
      el("div", { class: "song-plays" }, localizeNumber(song.playCount || 0, lang)),
    ]),
    favBtn,
    el("button", {
      class: "song-play-btn",
      "aria-label": `${t("player.play")} ${escapeHtml(song.title)}`,
    }, playIconSvg()),
  ]);

  if (onRemove) {
    const removeBtn = el("button", {
      class: "song-remove-btn",
      "aria-label": t("common.delete"),
    }, "✕");
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove(song);
    });
    side.appendChild(removeBtn);
  }

  row.append(cover, meta, side);

  const triggerPlay = (e) => {
    if (e.target.closest(".song-fav-btn") || e.target.closest(".song-remove-btn")) return;
    onPlay?.(song);
  };
  row.addEventListener("click", triggerPlay);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      triggerPlay(e);
    }
  });

  return row;
}

function playIconSvg() {
  const wrapper = document.createElement("span");
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
  return wrapper.firstElementChild;
}
