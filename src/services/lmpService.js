/**
 * services/lmpService.js
 * ---------------------------------------------------------------
 * .lmp ("Lumen Music Package") is a ZIP archive with a fixed
 * internal layout:
 *
 *   manifest.json
 *   songs/<id>.<ext>
 *   covers/<id>.<ext>
 *   lyrics/<id>.json      { id, languages: { en: [...], fa: [...] } }
 *   metadata/<id>.json    { id, title, artist, album, duration, genre,
 *                            song, cover, lyrics }
 *   playlists/<name>.json { name, description, songs: [id, ...] }
 *
 * This module validates a package before touching IndexedDB, then
 * performs the import, and separately builds an export package from
 * the current library. See LMP_SPECIFICATION.md for the full format.
 * ---------------------------------------------------------------
 */

import { createZip, readZip } from "../utils/zip.js";
import { Songs, Playlists, Lyrics, Recents, exportAllRaw } from "../database/db.js";
import { generatePlaceholderCover } from "./coverService.js";
import { generateId } from "../utils/id.js";

export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled.");
    this.name = "ExportCancelledError";
  }
}

const PACKAGE_FORMAT_VERSION = 1;

export class LmpValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "LmpValidationError";
    this.details = details; // array of friendly strings for a bulleted dialog
  }
}

/* ------------------------------------------------------------------
   shared helpers
------------------------------------------------------------------ */

function extensionFromMime(mime, kind) {
  const map = kind === "audio"
    ? { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac", "audio/aac": "aac" }
    : { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" };
  return map[mime] || (kind === "audio" ? "mp3" : "jpg");
}

function guessMimeFromExtension(ext) {
  const map = {
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
    flac: "audio/flac", aac: "audio/aac",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

async function dataUrlToBytes(dataUrl) {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToDataUrl(bytes, mime) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mime });
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Converts our internal lyrics text ("[m:ss] line\n...") to the spec's line-array form. */
function lyricsTextToLines(text) {
  if (!text) return [];
  return text.split("\n").map((line) => {
    const m = line.match(/^\[(\d+):(\d{2})\]\s*(.*)$/);
    if (m) return { time: Number(m[1]) * 60 + Number(m[2]), text: m[3] };
    return { time: null, text: line };
  });
}

/** Converts the spec's lyric line array (strings or {time,text} objects) back to our text format. */
function lyricsLinesToText(lines) {
  if (!Array.isArray(lines)) return "";
  return lines.map((line) => {
    if (typeof line === "string") return line;
    if (line && typeof line === "object") {
      const t = typeof line.time === "number" ? line.time : (typeof line.startTime === "number" ? line.startTime : null);
      const text = line.text ?? "";
      if (t !== null && isFinite(t)) {
        const mins = Math.floor(t / 60);
        const secs = String(Math.floor(t % 60)).padStart(2, "0");
        return `[${mins}:${secs}] ${text}`;
      }
      return text;
    }
    return "";
  }).join("\n");
}

/* ------------------------------------------------------------------
   validation (read-only — never touches IndexedDB)
------------------------------------------------------------------ */

/**
 * Validates a parsed ZIP (Map<path, Uint8Array>) against the .lmp spec.
 * Returns { manifest, songs: [{id, metadata, ...}], playlists: [...], warnings }
 * or throws LmpValidationError with `.details` for a friendly bulleted list.
 */
export function validatePackage(entries) {
  const errors = [];
  const warnings = [];

  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) {
    throw new LmpValidationError("This file isn't a valid Lumen Music Package.", [
      "Missing manifest.json at the package root.",
    ]);
  }

  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new LmpValidationError("This file isn't a valid Lumen Music Package.", [
      "manifest.json isn't valid JSON.",
    ]);
  }

  if (!manifest.packageName) warnings.push("manifest.json is missing a packageName — using a default name.");
  if (!manifest.packageFormatVersion) warnings.push("manifest.json doesn't declare a packageFormatVersion — assuming it's compatible.");

  const metadataFiles = [...entries.keys()].filter((k) => k.startsWith("metadata/") && k.endsWith(".json"));
  if (!metadataFiles.length) {
    throw new LmpValidationError("This package doesn't contain any songs.", [
      "No files found under metadata/.",
    ]);
  }

  const validSongs = [];
  for (const path of metadataFiles) {
    let meta;
    try {
      meta = JSON.parse(new TextDecoder().decode(entries.get(path)));
    } catch {
      warnings.push(`Skipped ${path}: not valid JSON.`);
      continue;
    }

    const missing = ["id", "title", "artist", "song"].filter((k) => !meta[k]);
    if (missing.length) {
      warnings.push(`Skipped ${path}: missing required field(s) ${missing.join(", ")}.`);
      continue;
    }

    if (!entries.has(meta.song)) {
      warnings.push(`Skipped "${meta.title}": audio file "${meta.song}" not found in the package.`);
      continue;
    }

    let coverOk = true;
    if (meta.cover && !entries.has(meta.cover)) {
      warnings.push(`"${meta.title}": cover "${meta.cover}" not found — a placeholder cover will be used instead.`);
      coverOk = false;
    }

    let lyricsOk = true;
    if (meta.lyrics && !entries.has(meta.lyrics)) {
      warnings.push(`"${meta.title}": lyrics file "${meta.lyrics}" not found — importing without lyrics.`);
      lyricsOk = false;
    }

    let instrumentalOk = true;
    if (meta.instrumental && !entries.has(meta.instrumental)) {
      warnings.push(`"${meta.title}": instrumental file "${meta.instrumental}" not found — importing without it.`);
      instrumentalOk = false;
    }

    validSongs.push({ metadata: meta, hasCover: coverOk, hasLyrics: lyricsOk, hasInstrumental: instrumentalOk });
  }

  if (!validSongs.length) {
    throw new LmpValidationError("None of the songs in this package could be validated.", warnings);
  }

  const playlistFiles = [...entries.keys()].filter((k) => k.startsWith("playlists/") && k.endsWith(".json"));
  const validPlaylists = [];
  for (const path of playlistFiles) {
    let pl;
    try {
      pl = JSON.parse(new TextDecoder().decode(entries.get(path)));
    } catch {
      warnings.push(`Skipped ${path}: not valid JSON.`);
      continue;
    }
    if (!pl.name || !Array.isArray(pl.songs)) {
      warnings.push(`Skipped ${path}: missing "name" or "songs" array.`);
      continue;
    }
    validPlaylists.push(pl);
  }

  return { manifest, songs: validSongs, playlists: validPlaylists, warnings, errors };
}

/* ------------------------------------------------------------------
   import
------------------------------------------------------------------ */

/**
 * Imports a .lmp File: reads the ZIP, validates it, then writes songs,
 * lyrics, and playlists into IndexedDB. Calls onProgress(stage, current,
 * total) as it goes. Throws LmpValidationError on structural problems.
 */
export async function importPackage(file, onProgress) {
  onProgress?.("reading", 0, 1);
  const buffer = await file.arrayBuffer();

  let entries;
  try {
    entries = readZip(buffer);
  } catch (err) {
    throw new LmpValidationError("This file couldn't be read as a Lumen Music Package.", [err.message]);
  }

  onProgress?.("validating", 0, 1);
  const validated = validatePackage(entries);

  const idMap = new Map(); // package song id -> final stored song id
  let imported = 0;

  for (let i = 0; i < validated.songs.length; i++) {
    const { metadata, hasCover, hasLyrics, hasInstrumental } = validated.songs[i];
    onProgress?.("importing", i + 1, validated.songs.length);

    const audioBytes = entries.get(metadata.song);
    const ext = (metadata.song.split(".").pop() || "mp3").toLowerCase();
    const mimeType = guessMimeFromExtension(ext);
    const audioBlob = new Blob([audioBytes], { type: mimeType });

    let cover;
    if (hasCover && metadata.cover) {
      const coverBytes = entries.get(metadata.cover);
      const coverExt = (metadata.cover.split(".").pop() || "jpg").toLowerCase();
      cover = await bytesToDataUrl(coverBytes, guessMimeFromExtension(coverExt));
    } else {
      cover = generatePlaceholderCover(metadata.title);
    }

    let instrumentalBlob = null;
    let instrumentalMimeType = null;
    if (hasInstrumental && metadata.instrumental && entries.has(metadata.instrumental)) {
      const instrumentalExt = (metadata.instrumental.split(".").pop() || "mp3").toLowerCase();
      instrumentalMimeType = guessMimeFromExtension(instrumentalExt);
      instrumentalBlob = new Blob([entries.get(metadata.instrumental)], { type: instrumentalMimeType });
    }

    const existing = await Songs.get(metadata.id);
    const finalId = existing ? generateId("song") : metadata.id;
    idMap.set(metadata.id, finalId);

    await Songs.add({
      id: finalId,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album || "",
      genre: metadata.genre || "",
      duration: Number(metadata.duration) || 0,
      cover,
      audioBlob,
      mimeType,
      ...(instrumentalBlob ? { instrumentalBlob, instrumentalMimeType } : {}),
      favorite: false,
      playCount: 0,
      dateAdded: Date.now(),
    });

    if (hasLyrics && metadata.lyrics && entries.has(metadata.lyrics)) {
      try {
        const lyricsJson = JSON.parse(new TextDecoder().decode(entries.get(metadata.lyrics)));
        const languages = lyricsJson.languages || {};
        await Lyrics.save(finalId, {
          en: lyricsLinesToText(languages.en || []),
          fa: lyricsLinesToText(languages.fa || []),
        });
      } catch {
        validated.warnings.push(`"${metadata.title}": lyrics file was invalid JSON and was skipped.`);
      }
    }

    imported++;
  }

  let playlistsImported = 0;
  for (const pl of validated.playlists) {
    const songIds = pl.songs.map((id) => idMap.get(id)).filter(Boolean);
    if (!songIds.length) {
      validated.warnings.push(`Playlist "${pl.name}" had no importable songs and was skipped.`);
      continue;
    }
    await Playlists.add({
      id: generateId("pl"),
      name: pl.name,
      songIds,
      dateCreated: Date.now(),
    });
    playlistsImported++;
  }

  // Play history is additive and low-risk (unlike settings.json, which
  // is exported for portability but deliberately never auto-applied
  // here — silently overwriting the importer's own theme/language
  // preferences would be surprising).
  if (entries.has("playHistory.json")) {
    try {
      const history = JSON.parse(new TextDecoder().decode(entries.get("playHistory.json")));
      if (Array.isArray(history)) {
        for (const entry of history) {
          const mappedId = idMap.get(entry.songId);
          if (mappedId) await Recents.record(mappedId);
        }
      }
    } catch {
      validated.warnings.push("Play history in this package was invalid and was skipped.");
    }
  }

  return {
    songCount: imported,
    playlistCount: playlistsImported,
    warnings: validated.warnings,
    packageName: validated.manifest.packageName || file.name,
  };
}

/* ------------------------------------------------------------------
   export
------------------------------------------------------------------ */

/**
 * Resolves which songs/playlists an export should include from the
 * wizard's selection options. `songIds`/`playlistIds` left as `null`
 * means "everything" (this is the pre-wizard default behavior, kept
 * for backwards compatibility with the simple export path).
 */
function resolveExportSelection(raw, { songIds = null, playlistIds = null } = {}) {
  if (songIds === null && playlistIds === null) {
    return { songs: raw.songs, playlists: raw.playlists, explicitPlaylists: false };
  }

  const idSet = new Set(Array.isArray(songIds) ? songIds : []);
  const selectedPlaylists = Array.isArray(playlistIds)
    ? raw.playlists.filter((pl) => playlistIds.includes(pl.id))
    : [];
  selectedPlaylists.forEach((pl) => pl.songIds.forEach((id) => idSet.add(id)));

  return {
    songs: raw.songs.filter((s) => idSet.has(s.id)),
    playlists: selectedPlaylists,
    explicitPlaylists: true,
  };
}

/**
 * Cheap, synchronous-ish size estimate (no file re-encoding) so the
 * wizard can show "≈ 42.3 MB" before the user commits to exporting.
 * Audio dominates the total, and Blob.size is free to read.
 */
export async function estimatePackageSize(options = {}) {
  const raw = await exportAllRaw();
  const { songs } = resolveExportSelection(raw, options);

  let bytes = 0;
  for (const song of songs) {
    bytes += song.audioBlob?.size || 0;
    if (options.includeCovers !== false && song.cover) {
      bytes += Math.ceil((song.cover.length * 3) / 4); // base64 -> raw bytes
    }
    bytes += 400; // rough JSON metadata overhead per song
    if (options.includeLyrics !== false) bytes += 200;
  }
  return { bytes, songCount: songs.length };
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Builds a .lmp package and triggers a download.
 *
 * `options`:
 *   packageName, author, description   — manifest fields
 *   songIds, playlistIds                — selection (null = everything)
 *   includeCovers, includeLyrics        — default true
 *   includeFavorites, includePlayCount   — write those as extra,
 *                                           back-compatible metadata fields
 *   includePlayHistory                   — writes root-level playHistory.json
 *   includeSettings                      — writes root-level settings.json
 *                                           (a portable snapshot; importing
 *                                           it does NOT overwrite the
 *                                           importer's own preferences)
 *   includeMoodTags                       — reserves a `moodTags` field per
 *                                           song for the not-yet-built Mood
 *                                           Engine (see docs/MOOD_ENGINE_ARCHITECTURE.md)
 *   customMetadata                        — arbitrary object merged into
 *                                           manifest.customMetadata
 *   cancelToken                           — { cancelled: boolean }; set
 *                                           `cancelled = true` from the UI
 *                                           to abort mid-export
 *
 * `onProgress(current, total)` is called once per song as it's packed.
 */
export async function exportPackage(options = {}, onProgress) {
  const {
    packageName = "My Lumen Library",
    author = "",
    description = "",
    includeCovers = true,
    includeLyrics = true,
    includeFavorites = false,
    includePlayCount = false,
    includePlayHistory = false,
    includeSettings = false,
    includeMoodTags = false,
    customMetadata = null,
    cancelToken = null,
  } = options;

  const raw = await exportAllRaw();
  const { songs: allSongs, playlists: candidatePlaylists, explicitPlaylists } = resolveExportSelection(raw, options);

  if (!allSongs.length) {
    throw new LmpValidationError("There's nothing to export yet.", ["No songs match your selection."]);
  }

  const zipEntries = [];
  const manifest = {
    packageName,
    version: "1.0.0",
    author,
    description,
    createdAt: new Date().toISOString(),
    packageFormatVersion: PACKAGE_FORMAT_VERSION,
    ...(customMetadata && typeof customMetadata === "object" ? { customMetadata } : {}),
  };
  zipEntries.push({ name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });

  const lyricsAll = includeLyrics ? await Promise.all(allSongs.map((s) => Lyrics.get(s.id))) : [];

  for (let i = 0; i < allSongs.length; i++) {
    if (cancelToken?.cancelled) throw new ExportCancelledError();

    const song = allSongs[i];
    onProgress?.(i + 1, allSongs.length);

    const audioExt = extensionFromMime(song.mimeType, "audio");
    const audioBytes = new Uint8Array(await song.audioBlob.arrayBuffer());
    zipEntries.push({ name: `songs/${song.id}.${audioExt}`, data: audioBytes });

    let coverPath = null;
    if (includeCovers && song.cover) {
      const coverMimeMatch = song.cover.match(/^data:([^;]+);/);
      const coverMime = coverMimeMatch ? coverMimeMatch[1] : "image/png";
      const coverExt = extensionFromMime(coverMime, "image");
      const coverBytes = await dataUrlToBytes(song.cover);
      coverPath = `covers/${song.id}.${coverExt}`;
      zipEntries.push({ name: coverPath, data: coverBytes });
    }

    let lyricsPath = null;
    if (includeLyrics) {
      const lyricsRecord = lyricsAll[i];
      if (lyricsRecord && (lyricsRecord.en?.trim() || lyricsRecord.fa?.trim())) {
        lyricsPath = `lyrics/${song.id}.json`;
        const lyricsJson = {
          id: song.id,
          languages: {
            en: lyricsTextToLines(lyricsRecord.en || ""),
            fa: lyricsTextToLines(lyricsRecord.fa || ""),
          },
        };
        zipEntries.push({ name: lyricsPath, data: new TextEncoder().encode(JSON.stringify(lyricsJson, null, 2)) });
      }
    }

    let instrumentalPath = null;
    if (song.instrumentalBlob) {
      const instrumentalExt = extensionFromMime(song.instrumentalMimeType, "audio");
      const instrumentalBytes = new Uint8Array(await song.instrumentalBlob.arrayBuffer());
      instrumentalPath = `songs/${song.id}-instrumental.${instrumentalExt}`;
      zipEntries.push({ name: instrumentalPath, data: instrumentalBytes });
    }

    const metadata = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      duration: song.duration || 0,
      genre: song.genre || "",
      song: `songs/${song.id}.${audioExt}`,
      cover: coverPath,
      lyrics: lyricsPath,
      instrumental: instrumentalPath,
      ...(includeFavorites ? { favorite: !!song.favorite } : {}),
      ...(includePlayCount ? { playCount: song.playCount || 0 } : {}),
      ...(includeMoodTags ? { moodTags: song.moodTags || [] } : {}),
    };
    zipEntries.push({ name: `metadata/${song.id}.json`, data: new TextEncoder().encode(JSON.stringify(metadata, null, 2)) });
  }

  const exportedIds = new Set(allSongs.map((s) => s.id));
  const relevantPlaylists = explicitPlaylists
    ? candidatePlaylists
    : raw.playlists.filter((pl) => pl.songIds.some((id) => exportedIds.has(id)));

  for (const pl of relevantPlaylists) {
    const playlistJson = {
      name: pl.name,
      description: "",
      songs: pl.songIds.filter((id) => exportedIds.has(id)),
    };
    const safeName = pl.name.replace(/[^a-zA-Z0-9_-]+/g, "_") || generateId("playlist");
    zipEntries.push({ name: `playlists/${safeName}.json`, data: new TextEncoder().encode(JSON.stringify(playlistJson, null, 2)) });
  }

  if (includePlayHistory) {
    const recents = (await Recents.all()).filter((r) => exportedIds.has(r.id));
    zipEntries.push({
      name: "playHistory.json",
      data: new TextEncoder().encode(JSON.stringify(recents.map((r) => ({ songId: r.id, playedAt: r.playedAt })), null, 2)),
    });
  }

  if (includeSettings) {
    const settingsMap = {};
    raw.settings.forEach((row) => {
      if (row.key === "updateCheck") return; // internal cache, not meaningful to share
      settingsMap[row.key] = row.value;
    });
    zipEntries.push({ name: "settings.json", data: new TextEncoder().encode(JSON.stringify(settingsMap, null, 2)) });
  }

  if (cancelToken?.cancelled) throw new ExportCancelledError();

  const blob = createZip(zipEntries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safePackageName = packageName.replace(/[^a-zA-Z0-9_-]+/g, "_") || "lumen-package";
  a.href = url;
  a.download = `${safePackageName}.lmp`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { songCount: allSongs.length, playlistCount: relevantPlaylists.length };
}
