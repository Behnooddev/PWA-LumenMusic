/**
 * services/importService.js
 * ---------------------------------------------------------------
 * Turns a FileList of user-selected audio files into song records:
 * reads ID3 metadata, generates a placeholder cover when needed,
 * and writes everything into IndexedDB via database/db.js.
 * ---------------------------------------------------------------
 */

import { Songs } from "../database/db.js";
import { extractMetadata, blobToDataUrl } from "./metadataService.js";
import { generatePlaceholderCover } from "./coverService.js";
import { generateId } from "../utils/id.js";

const ACCEPTED_TYPE_PREFIX = "audio";

export function isAudioFile(file) {
  return file.type.startsWith(ACCEPTED_TYPE_PREFIX) || /\.(mp3|m4a|wav|ogg|flac|aac|aif|aiff|caf)$/i.test(file.name);
}

/**
 * Imports a list of File objects. Calls onProgress(current, total) as it
 * goes so the UI can show a spinner/counter. Returns the imported songs.
 */
export async function getExistingFingerprints() {
  const all = await Songs.all();
  return new Set(all.map((s) => s.sourceFingerprint).filter(Boolean));
}

/**
 * Attaches an instrumental version to an existing song. This is the
 * manual-import path for the vocal/instrumental switcher — the same
 * `song.instrumentalBlob` field this populates is exactly what a
 * future AI stem-separation feature would populate too, so the
 * player's switching logic (audioEngine.switchVariant) never needs
 * to change regardless of how the instrumental was obtained.
 */
export async function attachInstrumental(song, file) {
  const updated = {
    ...song,
    instrumentalBlob: file,
    instrumentalMimeType: file.type || "audio/mpeg",
  };
  await Songs.update(updated);
  return updated;
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function importFiles(fileList, onProgress) {
  const files = Array.from(fileList).filter(isAudioFile);
  const imported = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.name);

    try {
      // extractMetadata has its own internal timeout for duration
      // reading, but this outer timeout is a second safety net: no
      // single problematic file (of any kind) should ever be able to
      // freeze the rest of a multi-file import.
      const meta = await withTimeout(
        extractMetadata(file),
        10000,
        { title: file.name.replace(/\.[^/.]+$/, ""), artist: "Unknown Artist", album: "", genre: "", cover: null, duration: 0 }
      );
      const cover = meta.cover
        ? await blobToDataUrl(meta.cover)
        : generatePlaceholderCover(meta.title || file.name);

      const song = {
        id: generateId("song"),
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        genre: meta.genre || "",
        duration: meta.duration,
        cover,
        audioBlob: file,
        mimeType: file.type || "audio/mpeg",
        favorite: false,
        playCount: 0,
        dateAdded: Date.now(),
        // name+size fingerprint — not a content hash, but enough to
        // avoid re-importing the same file twice from Phone Music
        // without reading every byte of every candidate file.
        sourceFingerprint: `${file.name}:${file.size}`,
      };

      await Songs.add(song);
      imported.push(song);
    } catch (err) {
      // One unreadable file (e.g. a DRM-protected or corrupt track)
      // shouldn't abort the rest of the batch — skip it and continue.
      console.warn(`Skipped "${file.name}" — couldn't be imported:`, err);
    }
  }

  return imported;
}
