/**
 * components/playerSheet.js
 * ---------------------------------------------------------------
 * The bottom sheet opened by tapping the mini player. This is the
 * central playback controller: large art, full transport controls,
 * shuffle/repeat, favorite, seek with time labels, playback speed,
 * vocal/instrumental switching, and buttons into Lyrics and Queue.
 * ---------------------------------------------------------------
 */

import { $, el, clearNode } from "../utils/dom.js";
import { localizeTime } from "../utils/format.js";
import { t, getLang } from "../services/i18nService.js";
import { createSongRow } from "./songRow.js";
import { attachInstrumental } from "../services/importService.js";
import {
  audioEl, on, togglePlay, playNext, playPrev, toggleFavorite, seekTo,
  setShuffle, isShuffleOn, getCurrentSong, getRepeatMode, cycleRepeatMode,
  getPlaybackRate, setPlaybackRate, switchVariant, getCurrentVariant,
  hasInstrumental, getQueue, playSong, refreshCurrentSong,
} from "../services/audioEngine.js";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function initPlayerSheet({ onOpenLyrics }) {
  const modal = $("#playerSheetModal");
  const backdrop = $("#playerSheetBackdrop");
  const closeBtn = $("#playerSheetClose");
  const cover = $("#sheetCover");
  const titleEl = $("#sheetTitle");
  const artistEl = $("#sheetArtist");

  const progressTrack = $("#sheetProgressTrack");
  const progressFill = $("#sheetProgressFill");
  const currentTimeEl = $("#sheetCurrentTime");
  const remainingTimeEl = $("#sheetRemainingTime");

  const shuffleBtn = $("#sheetShuffleBtn");
  const prevBtn = $("#sheetPrevBtn");
  const playBtn = $("#sheetPlayBtn");
  const playIcon = $("#sheetPlayIcon");
  const nextBtn = $("#sheetNextBtn");
  const repeatBtn = $("#sheetRepeatBtn");
  const repeatOneBadge = $("#repeatOneBadge");

  const favBtn = $("#sheetFavBtn");
  const speedBtn = $("#sheetSpeedBtn");
  const variantBtn = $("#sheetVariantBtn");
  const lyricsBtn = $("#sheetLyricsBtn");
  const queueBtn = $("#sheetQueueBtn");
  const speedPanel = $("#sheetSpeedPanel");
  const queuePanel = $("#sheetQueuePanel");

  let isDragging = false;

  function open() {
    if (!getCurrentSong()) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    renderSong(getCurrentSong());
    renderRepeatUI();
    renderShuffleUI();
    renderSpeedUI();
    renderVariantUI();
    closeBtn.focus();
  }

  function close() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    speedPanel.hidden = true;
    queuePanel.hidden = true;
  }

  function renderSong(song) {
    if (!song) return;
    titleEl.textContent = song.title;
    artistEl.textContent = song.artist;
    cover.src = song.cover || "src/assets/icons/icon-192.png";
    favBtn.classList.toggle("active", !!song.favorite);
    favBtn.setAttribute("aria-pressed", String(!!song.favorite));
    favBtn.textContent = song.favorite ? "♥" : "♡";
    favBtn.setAttribute("aria-label", song.favorite ? t("player.unfavorite") : t("player.favorite"));
    renderVariantUI();
  }

  function updateProgressUI(currentTime, duration) {
    const lang = getLang();
    if (duration) progressFill.style.width = `${(currentTime / duration) * 100}%`;
    currentTimeEl.textContent = localizeTime(currentTime, lang);
    remainingTimeEl.textContent = duration ? `-${localizeTime(duration - currentTime, lang)}` : "-0:00";
  }

  function renderShuffleUI() {
    const active = isShuffleOn();
    shuffleBtn.classList.toggle("active", active);
    shuffleBtn.setAttribute("aria-pressed", String(active));
  }

  function renderRepeatUI() {
    const mode = getRepeatMode();
    repeatBtn.classList.toggle("active", mode !== "off");
    repeatBtn.setAttribute("aria-pressed", String(mode !== "off"));
    repeatBtn.setAttribute("aria-label", mode === "one" ? t("player.repeatOne") : mode === "all" ? t("player.repeatAll") : t("player.repeatOff"));
    repeatOneBadge.hidden = mode !== "one";
  }

  function renderSpeedUI() {
    speedBtn.textContent = `${getPlaybackRate()}x`;
  }

  function renderVariantUI() {
    const song = getCurrentSong();
    const available = hasInstrumental(song);
    const variant = getCurrentVariant();
    variantBtn.textContent = variant === "instrumental" ? t("player.instrumental") : t("player.vocals");
    variantBtn.classList.toggle("disabled-hint", !available);
  }

  // ---- open/close ----
  $("#miniExpand").addEventListener("click", open);
  $("#miniExpand").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  // ---- transport ----
  playBtn.addEventListener("click", togglePlay);
  prevBtn.addEventListener("click", playPrev);
  nextBtn.addEventListener("click", playNext);
  shuffleBtn.addEventListener("click", () => { setShuffle(!isShuffleOn()); renderShuffleUI(); });
  repeatBtn.addEventListener("click", async () => { await cycleRepeatMode(); renderRepeatUI(); });
  favBtn.addEventListener("click", () => { const s = getCurrentSong(); if (s) toggleFavorite(s); });

  on("trackchange", (song) => {
    renderSong(song);
    updateProgressUI(0, song?.duration || 0);
    if (!queuePanel.hidden) renderQueuePanel();
  });
  on("playstate", (isPlaying) => {
    playIcon.innerHTML = isPlaying
      ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>'
      : '<path d="M8 5v14l11-7z" fill="currentColor"/>';
    playBtn.setAttribute("aria-label", isPlaying ? t("player.pause") : t("player.play"));
  });
  on("timeupdate", (currentTime, duration) => { if (!isDragging) updateProgressUI(currentTime, duration); });
  on("favorite", (song) => { if (getCurrentSong()?.id === song.id) renderSong(song); });
  on("variantchange", renderVariantUI);

  // ---- seek (pointer drag, same pattern as the mini player) ----
  function ratioFromEvent(e) {
    const rect = progressTrack.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }
  progressTrack.addEventListener("pointerdown", (e) => {
    if (!audioEl.duration) return;
    isDragging = true;
    progressTrack.classList.add("dragging");
    progressTrack.setPointerCapture(e.pointerId);
    const ratio = ratioFromEvent(e);
    updateProgressUI(ratio * audioEl.duration, audioEl.duration);
    seekTo(ratio);
  });
  progressTrack.addEventListener("pointermove", (e) => {
    if (!isDragging || !audioEl.duration) return;
    const ratio = ratioFromEvent(e);
    updateProgressUI(ratio * audioEl.duration, audioEl.duration);
    seekTo(ratio);
  });
  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    progressTrack.classList.remove("dragging");
    try { progressTrack.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
  progressTrack.addEventListener("pointerup", endDrag);
  progressTrack.addEventListener("pointercancel", endDrag);

  // ---- playback speed panel ----
  speedBtn.addEventListener("click", () => {
    queuePanel.hidden = true;
    speedPanel.hidden = !speedPanel.hidden;
    if (!speedPanel.hidden) renderSpeedPanel();
  });
  function renderSpeedPanel() {
    clearNode(speedPanel);
    const list = el("div", { class: "sheet-speed-list" });
    SPEEDS.forEach((speed) => {
      const btn = el("button", {
        class: `sheet-speed-item${speed === getPlaybackRate() ? " active" : ""}`,
      }, `${speed}x`);
      btn.addEventListener("click", async () => {
        await setPlaybackRate(speed);
        renderSpeedUI();
        renderSpeedPanel();
      });
      list.appendChild(btn);
    });
    speedPanel.appendChild(list);
  }

  // ---- vocal / instrumental ----
  variantBtn.addEventListener("click", async () => {
    const song = getCurrentSong();
    if (!hasInstrumental(song)) {
      variantBtn.classList.add("shake");
      setTimeout(() => variantBtn.classList.remove("shake"), 400);
      showNoInstrumentalHint();
      return;
    }
    const nextVariant = getCurrentVariant() === "vocals" ? "instrumental" : "vocals";
    await switchVariant(nextVariant);
    renderVariantUI();
  });
  function showNoInstrumentalHint() {
    clearNode(speedPanel);
    speedPanel.hidden = false;
    queuePanel.hidden = true;
    speedPanel.append(
      el("p", { class: "sheet-hint" }, t("player.noInstrumental")),
      buildAddInstrumentalButton()
    );
  }

  function buildAddInstrumentalButton() {
    const wrap = el("div", { class: "sheet-add-instrumental" });
    const btn = el("button", { class: "btn ghost" }, t("player.addInstrumental"));
    const fileInput = $("#instrumentalFileInput");
    btn.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
    const handleChange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const song = getCurrentSong();
      if (!song) return;
      const updated = await attachInstrumental(song, file);
      refreshCurrentSong(updated);
      renderVariantUI();
      speedPanel.hidden = true;
    };
    fileInput.onchange = handleChange;
    wrap.appendChild(btn);
    return wrap;
  }

  // ---- lyrics ----
  lyricsBtn.addEventListener("click", () => {
    const song = getCurrentSong();
    if (!song) return;
    close(); // avoid stacking two full-screen sheets at once
    onOpenLyrics?.(song);
  });

  // ---- queue ----
  queueBtn.addEventListener("click", () => {
    speedPanel.hidden = true;
    queuePanel.hidden = !queuePanel.hidden;
    if (!queuePanel.hidden) renderQueuePanel();
  });
  function renderQueuePanel() {
    clearNode(queuePanel);
    const queue = getQueue();
    if (!queue.length) {
      queuePanel.appendChild(el("p", { class: "sheet-hint" }, t("player.emptyQueue")));
      return;
    }
    const current = getCurrentSong();
    const list = el("div", { class: "sheet-queue-list" });
    queue.forEach((song) => {
      list.appendChild(createSongRow(song, {
        isPlaying: !!current && current.id === song.id,
        onPlay: (s) => playSong(s, queue),
      }));
    });
    queuePanel.appendChild(list);
  }

  return { open, close };
}
