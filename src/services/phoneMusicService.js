/**
 * services/phoneMusicService.js
 * ---------------------------------------------------------------
 * "Phone Music" lets a user browse audio files living on their
 * device outside the app's own library, and choose which ones to
 * import. The only browser-portable way to do this is the File
 * System Access API (`showDirectoryPicker`), which today means
 * Chromium-based browsers — in practice, Android. iOS Safari has no
 * equivalent API at all, so that platform gets an honest explanation
 * instead of a fake/partial feature (see pages/phoneMusic.js).
 * ---------------------------------------------------------------
 */

import { isAudioFile } from "./importService.js";

/** Recursively walks a FileSystemDirectoryHandle, yielding audio File objects. */
export async function scanDirectoryForAudio(directoryHandle, onFile) {
  const results = [];
  async function walk(dirHandle) {
    for await (const [, handle] of dirHandle.entries()) {
      if (handle.kind === "file") {
        const file = await handle.getFile();
        if (isAudioFile(file)) {
          results.push(file);
          onFile?.(file, results.length);
        }
      } else if (handle.kind === "directory") {
        await walk(handle);
      }
    }
  }
  await walk(directoryHandle);
  return results;
}

export async function pickDirectory() {
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error("This browser doesn't support picking a folder directly.");
  }
  return window.showDirectoryPicker();
}
