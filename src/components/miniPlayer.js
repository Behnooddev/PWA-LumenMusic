/**
 * components/miniPlayer.js
 * ---------------------------------------------------------------
 * Fixed bottom bar. Subscribes to audioEngine events and never
 * touches <audio> directly — all playback goes through the engine.
 * ---------------------------------------------------------------
 */

import { $ } from "../utils/dom.js";
import { localizeTime } from "../utils/format.js";
import { getLang, t } from "../services/i18nService.js";
import { createVisualizer } from "../services/visualizerService.js";
import {
  audioEl, on, togglePlay, playNext, playPrev,
  toggleFavorite, seekTo, setShuffle, isShuffleOn, getCurrentSong,
} from "../services/audioEngine.js";

export function initMiniPlayer({ onOpenLyrics }) {
  const miniPlayer = $("#miniPlayer");
  const miniTitle = $("#miniTitle");
  const miniArtist = $("#miniArtist");
  const miniCover = $("#miniCover");
  const miniOpenLyrics = $("#miniOpenLyrics");
  const playBtn = $("#playBtn");
  const playIcon = $("#playIcon");
  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");
  const shuffleBtn = $("#shuffleBtn");
  const favBtn = $("#miniFavBtn");
  const progressTrack = $("#miniProgressTrack");
  const progressFill = $("#miniProgressFill");
  const canvas = $("#waveform");

  const visualizer = createVisualizer({ canvas, audioElement: audioEl });
  visualizer.start();
  visualizer.onIntensity((peak) => {
    miniPlayer.classList.toggle("intense", peak > 0.4);
  });

  function renderSong(song) {
    if (!song) return;
    miniTitle.textContent = song.title;
    miniArtist.textContent = song.artist;
    miniCover.src = song.cover || "src/assets/icons/icon-192.png";
    favBtn.classList.toggle("active", !!song.favorite);
    favBtn.setAttribute("aria-pressed", String(!!song.favorite));
    favBtn.setAttribute("aria-label", song.favorite ? t("player.unfavorite") : t("player.favorite"));
    favBtn.textContent = song.favorite ? "♥" : "♡";
  }

  on("trackchange", (song) => {
    renderSong(song);
    visualizer.resume();
  });

  on("playstate", (isPlaying) => {
    playIcon.innerHTML = isPlaying
      ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>'
      : '<path d="M8 5v14l11-7z" fill="currentColor"/>';
    playBtn.setAttribute("aria-label", isPlaying ? t("player.pause") : t("player.play"));
  });

  on("timeupdate", (currentTime, duration) => {
    if (!duration) return;
    progressFill.style.width = `${(currentTime / duration) * 100}%`;
  });

  on("favorite", (song) => {
    const current = getCurrentSong();
    if (current && current.id === song.id) renderSong(song);
  });

  playBtn.addEventListener("click", () => { visualizer.resume(); togglePlay(); });
  prevBtn.addEventListener("click", () => { visualizer.resume(); playPrev(); });
  nextBtn.addEventListener("click", () => { visualizer.resume(); playNext(); });

  shuffleBtn.addEventListener("click", () => {
    const next = !isShuffleOn();
    setShuffle(next);
    shuffleBtn.classList.toggle("active", next);
    shuffleBtn.setAttribute("aria-pressed", String(next));
    shuffleBtn.setAttribute("aria-label", next ? t("player.shuffleOn") : t("player.shuffleOff"));
  });

  favBtn.addEventListener("click", () => {
    const song = getCurrentSong();
    if (song) toggleFavorite(song);
  });

  progressTrack.addEventListener("click", (e) => {
    const rect = progressTrack.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seekTo(Math.min(1, Math.max(0, ratio)));
  });
  progressTrack.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") seekTo(Math.min(1, (audioEl.currentTime + 5) / (audioEl.duration || 1)));
    if (e.key === "ArrowLeft") seekTo(Math.max(0, (audioEl.currentTime - 5) / (audioEl.duration || 1)));
  });

  miniOpenLyrics.addEventListener("click", () => onOpenLyrics?.(getCurrentSong()));
}
