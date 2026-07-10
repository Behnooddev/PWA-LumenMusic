/**
 * services/audioEngine.js
 * ---------------------------------------------------------------
 * Owns the single <audio> element and all playback state: current
 * queue, current song, shuffle order, repeat mode, playback speed,
 * and play-count / recently-played bookkeeping. UI modules subscribe
 * via `on(event, cb)` instead of touching <audio> directly.
 *
 * Events emitted:
 *   trackchange  -> (song)
 *   playstate    -> (isPlaying)
 *   timeupdate   -> (currentTime, duration)
 *   favorite     -> (song)
 *   queuechange  -> (queue)
 *   repeatchange -> (mode)
 *   ratechange   -> (rate)
 *   variantchange -> (variant)
 * ---------------------------------------------------------------
 */

import { Songs, Recents, Settings } from "../database/db.js";

const bus = new EventTarget();
export function on(event, cb) {
  const handler = (e) => cb(...(e.detail || []));
  bus.addEventListener(event, handler);
  return () => bus.removeEventListener(event, handler);
}
function emit(event, ...args) {
  bus.dispatchEvent(new CustomEvent(event, { detail: args }));
}

export const audioEl = new Audio();
audioEl.preload = "metadata";

let queue = [];
let shuffleOrder = null; // array of indices when shuffle is on
let shuffleEnabled = false;
let position = -1; // index into shuffleOrder (if shuffling) or queue
let currentSong = null;
let currentObjectUrl = null;
let currentVariant = "vocals"; // "vocals" | "instrumental"

export const REPEAT_MODES = ["off", "all", "one"];
let repeatMode = "off";
let playbackRate = 1;

const REPEAT_SETTINGS_KEY = "repeatMode";
const RATE_SETTINGS_KEY = "playbackRate";

/** Restores persisted repeat mode / playback speed. Call once at boot. */
export async function restorePlaybackPreferences() {
  const savedRepeat = await Settings.get(REPEAT_SETTINGS_KEY, "off");
  if (REPEAT_MODES.includes(savedRepeat)) repeatMode = savedRepeat;

  const savedRate = await Settings.get(RATE_SETTINGS_KEY, 1);
  if (typeof savedRate === "number" && savedRate > 0) {
    playbackRate = savedRate;
    audioEl.playbackRate = savedRate;
  }
}

export function getRepeatMode() {
  return repeatMode;
}

export async function cycleRepeatMode() {
  const idx = REPEAT_MODES.indexOf(repeatMode);
  repeatMode = REPEAT_MODES[(idx + 1) % REPEAT_MODES.length];
  await Settings.set(REPEAT_SETTINGS_KEY, repeatMode);
  emit("repeatchange", repeatMode);
  return repeatMode;
}

export function getPlaybackRate() {
  return playbackRate;
}

export async function setPlaybackRate(rate) {
  playbackRate = rate;
  audioEl.playbackRate = rate;
  await Settings.set(RATE_SETTINGS_KEY, rate);
  emit("ratechange", rate);
}

function effectiveIndexToQueueIndex(idx) {
  return shuffleEnabled && shuffleOrder ? shuffleOrder[idx] : idx;
}

function buildShuffleOrder() {
  const idxs = queue.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  shuffleOrder = idxs;
}

export function setShuffle(enabled) {
  shuffleEnabled = enabled;
  if (enabled) {
    buildShuffleOrder();
    // keep the currently playing song as the "first" shuffled position
    if (currentSong) {
      const queueIdx = queue.findIndex((s) => s.id === currentSong.id);
      const posInShuffle = shuffleOrder.indexOf(queueIdx);
      if (posInShuffle > -1) {
        [shuffleOrder[0], shuffleOrder[posInShuffle]] = [shuffleOrder[posInShuffle], shuffleOrder[0]];
        position = 0;
      }
    }
  }
}

export function isShuffleOn() {
  return shuffleEnabled;
}

export function getCurrentSong() {
  return currentSong;
}

/**
 * Lets external code (e.g. after attaching an instrumental version)
 * refresh the engine's view of the current song without a full
 * playSong() call. Emits trackchange so subscribed UI re-renders.
 */
export function refreshCurrentSong(updatedSong) {
  if (currentSong && updatedSong && currentSong.id === updatedSong.id) {
    currentSong = updatedSong;
    emit("trackchange", currentSong);
  }
}

export function getCurrentVariant() {
  return currentVariant;
}

export function getQueue() {
  return queue;
}

export function getQueuePosition() {
  return position;
}

export function setQueue(newQueue) {
  queue = newQueue;
  if (shuffleEnabled) buildShuffleOrder();
  emit("queuechange", queue);
}

async function loadSongIntoElement(song, variant = "vocals") {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  const blob = variant === "instrumental" && song.instrumentalBlob ? song.instrumentalBlob : song.audioBlob;
  if (blob) {
    currentObjectUrl = URL.createObjectURL(blob);
    audioEl.src = currentObjectUrl;
  } else if (song.audioSrc) {
    audioEl.src = song.audioSrc;
  }
  audioEl.playbackRate = playbackRate;
}

export async function playSong(song, newQueue) {
  if (newQueue) setQueue(newQueue);
  const idxInQueue = queue.findIndex((s) => s.id === song.id);
  position = shuffleEnabled ? (shuffleOrder?.indexOf(idxInQueue) ?? 0) : idxInQueue;
  currentSong = song;
  currentVariant = "vocals";

  await loadSongIntoElement(song, currentVariant);
  emit("trackchange", currentSong);
  emit("variantchange", currentVariant);
  try {
    await audioEl.play();
  } catch {
    /* iOS may require a user gesture; the calling click satisfies this */
  }

  const updated = await Songs.incrementPlayCount(song.id);
  if (updated) currentSong = updated;
  await Recents.record(song.id);
}

export function togglePlay() {
  if (!currentSong) {
    if (queue.length) playSong(queue[0], queue);
    return;
  }
  if (audioEl.paused) audioEl.play();
  else audioEl.pause();
}

async function playSongDirect(song) {
  currentSong = song;
  currentVariant = "vocals";
  await loadSongIntoElement(song, currentVariant);
  emit("trackchange", currentSong);
  emit("variantchange", currentVariant);
  try { await audioEl.play(); } catch { /* ignore autoplay rejection */ }
  const updated = await Songs.incrementPlayCount(song.id);
  if (updated) currentSong = updated;
  await Recents.record(song.id);
}

/**
 * Switches between the original recording and an instrumental version,
 * if one is attached to the current song (`song.instrumentalBlob`).
 * Preserves playback position and play/pause state across the switch.
 *
 * This is the extension point for future AI stem separation: a future
 * service would only need to populate `song.instrumentalBlob` (e.g. on
 * demand, or ahead of time) — this switching logic doesn't change.
 */
export async function switchVariant(variant) {
  if (!currentSong) return { ok: false, reason: "no-song" };
  if (variant === "instrumental" && !currentSong.instrumentalBlob) {
    return { ok: false, reason: "unavailable" };
  }
  if (variant === currentVariant) return { ok: true };

  const wasPlaying = !audioEl.paused;
  const resumeAt = audioEl.currentTime;

  currentVariant = variant;
  await loadSongIntoElement(currentSong, variant);
  audioEl.currentTime = resumeAt;
  if (wasPlaying) {
    try { await audioEl.play(); } catch { /* ignore */ }
  }
  emit("variantchange", currentVariant);
  return { ok: true };
}

export function hasInstrumental(song = currentSong) {
  return !!song?.instrumentalBlob;
}

export function playNext() {
  if (!queue.length) return;
  let nextPos = position + 1;
  if (nextPos >= queue.length) nextPos = 0;
  position = nextPos;
  const queueIdx = effectiveIndexToQueueIndex(position);
  const song = queue[queueIdx];
  if (song) playSongDirect(song);
}

export function playPrev() {
  if (!queue.length) return;
  let prevPos = position - 1;
  if (prevPos < 0) prevPos = queue.length - 1;
  position = prevPos;
  const queueIdx = effectiveIndexToQueueIndex(position);
  const song = queue[queueIdx];
  if (song) playSongDirect(song);
}

export async function toggleFavorite(song) {
  const updated = await Songs.setFavorite(song.id, !song.favorite);
  if (currentSong && currentSong.id === song.id) currentSong = updated;
  emit("favorite", updated);
  return updated;
}

export function seekTo(ratio) {
  if (audioEl.duration) audioEl.currentTime = ratio * audioEl.duration;
}

audioEl.addEventListener("play", () => emit("playstate", true));
audioEl.addEventListener("pause", () => emit("playstate", false));
audioEl.addEventListener("ended", () => {
  if (repeatMode === "one") {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
    return;
  }
  if (repeatMode === "off" && position >= queue.length - 1) {
    // last song in the queue and not repeating — stop instead of
    // silently wrapping back to the first song.
    return;
  }
  playNext();
});
audioEl.addEventListener("timeupdate", () => emit("timeupdate", audioEl.currentTime, audioEl.duration));
