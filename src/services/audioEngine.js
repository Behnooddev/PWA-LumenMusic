/**
 * services/audioEngine.js
 * ---------------------------------------------------------------
 * Owns the single <audio> element and all playback state: current
 * queue, current song, shuffle order, and play-count / recently-
 * played bookkeeping. UI modules subscribe via `on(event, cb)`
 * instead of touching <audio> directly.
 *
 * Events emitted:
 *   trackchange  -> (song)
 *   playstate    -> (isPlaying)
 *   timeupdate   -> (currentTime, duration)
 *   favorite     -> (song)
 *   queuechange  -> (queue)
 * ---------------------------------------------------------------
 */

import { Songs, Recents } from "../database/db.js";

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

export function getQueue() {
  return queue;
}

export function setQueue(newQueue) {
  queue = newQueue;
  if (shuffleEnabled) buildShuffleOrder();
  emit("queuechange", queue);
}

async function loadSongIntoElement(song) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  if (song.audioBlob) {
    currentObjectUrl = URL.createObjectURL(song.audioBlob);
    audioEl.src = currentObjectUrl;
  } else if (song.audioSrc) {
    audioEl.src = song.audioSrc;
  }
}

export async function playSong(song, newQueue) {
  if (newQueue) setQueue(newQueue);
  const idxInQueue = queue.findIndex((s) => s.id === song.id);
  position = shuffleEnabled ? (shuffleOrder?.indexOf(idxInQueue) ?? 0) : idxInQueue;
  currentSong = song;

  await loadSongIntoElement(song);
  emit("trackchange", currentSong);
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
  await loadSongIntoElement(song);
  emit("trackchange", currentSong);
  try { await audioEl.play(); } catch { /* ignore autoplay rejection */ }
  const updated = await Songs.incrementPlayCount(song.id);
  if (updated) currentSong = updated;
  await Recents.record(song.id);
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
audioEl.addEventListener("ended", () => playNext());
audioEl.addEventListener("timeupdate", () => emit("timeupdate", audioEl.currentTime, audioEl.duration));
