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
  return file.type.startsWith(ACCEPTED_TYPE_PREFIX) || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name);
}

/**
 * Imports a list of File objects. Calls onProgress(current, total) as it
 * goes so the UI can show a spinner/counter. Returns the imported songs.
 */
export async function importFiles(fileList, onProgress) {
  const files = Array.from(fileList).filter(isAudioFile);
  const imported = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.name);

    const meta = await extractMetadata(file);
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
    };

    await Songs.add(song);
    imported.push(song);
  }

  return imported;
}
