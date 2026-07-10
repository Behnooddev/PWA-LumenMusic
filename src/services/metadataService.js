/**
 * services/metadataService.js
 * ---------------------------------------------------------------
 * Reads title / artist / album / cover art from an audio File.
 * Uses a small hand-written ID3v2.3 / ID3v2.4 parser for MP3 files
 * (no external dependency, works fully offline). For formats where
 * ID3 isn't applicable (wav/ogg/m4a without tags), it falls back to
 * the filename and lets coverService generate a placeholder.
 * ---------------------------------------------------------------
 */

const TEXT_DECODERS = {
  0x00: (bytes) => decodeWith("iso-8859-1", bytes),
  0x01: (bytes) => decodeUtf16(bytes, true),
  0x02: (bytes) => decodeUtf16(bytes, false),
  0x03: (bytes) => decodeWith("utf-8", bytes),
};

function decodeWith(encoding, bytes) {
  try {
    return new TextDecoder(encoding).decode(bytes).replace(/\0+$/, "");
  } catch {
    return Array.from(bytes).map((b) => String.fromCharCode(b)).join("").replace(/\0+$/, "");
  }
}

function decodeUtf16(bytes, hasBom) {
  try {
    let bom = "utf-16le";
    let offset = 0;
    if (hasBom && bytes.length >= 2) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) { bom = "utf-16le"; offset = 2; }
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) { bom = "utf-16be"; offset = 2; }
    }
    return new TextDecoder(bom).decode(bytes.slice(offset)).replace(/\0+$/, "");
  } catch {
    return "";
  }
}

function readSyncSafeInt(bytes) {
  return (bytes[0] << 21) | (bytes[1] << 14) | (bytes[2] << 7) | bytes[3];
}

function readNormalInt(bytes) {
  return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
}

/**
 * Parses ID3v2 header + frames from an ArrayBuffer.
 * Returns { title, artist, album, cover } — any of which may be undefined.
 */
function parseId3v2(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return null; // no "ID3" magic — not an ID3v2 tag
  }

  const majorVersion = bytes[3];
  const flags = bytes[5];
  const tagSize = readSyncSafeInt(bytes.slice(6, 10));
  const hasExtendedHeader = !!(flags & 0x40);

  let offset = 10;
  if (hasExtendedHeader) {
    const extSize = majorVersion >= 4
      ? readSyncSafeInt(bytes.slice(offset, offset + 4))
      : readNormalInt(bytes.slice(offset, offset + 4));
    offset += extSize;
  }

  const result = {};
  const end = Math.min(10 + tagSize, bytes.length);

  while (offset + 10 <= end) {
    const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break; // padding reached

    const sizeBytes = bytes.slice(offset + 4, offset + 8);
    const frameSize = majorVersion >= 4 ? readSyncSafeInt(sizeBytes) : readNormalInt(sizeBytes);
    if (frameSize <= 0 || offset + 10 + frameSize > bytes.length) break;

    const frameStart = offset + 10;
    const frameBody = bytes.slice(frameStart, frameStart + frameSize);

    if (frameId === "TIT2") result.title = decodeTextFrame(frameBody);
    else if (frameId === "TPE1") result.artist = decodeTextFrame(frameBody);
    else if (frameId === "TALB") result.album = decodeTextFrame(frameBody);
    else if (frameId === "TCON") result.genre = decodeTextFrame(frameBody);
    else if (frameId === "APIC") result.cover = decodePictureFrame(frameBody);

    offset = frameStart + frameSize;
  }

  return result;
}

function decodeTextFrame(body) {
  if (!body.length) return "";
  const encByte = body[0];
  const decoder = TEXT_DECODERS[encByte] || TEXT_DECODERS[0x00];
  return decoder(body.slice(1)).trim();
}

function decodePictureFrame(body) {
  try {
    const encByte = body[0];
    let i = 1;
    // MIME type, null-terminated ASCII
    let mimeEnd = i;
    while (mimeEnd < body.length && body[mimeEnd] !== 0) mimeEnd++;
    const mime = decodeWith("iso-8859-1", body.slice(i, mimeEnd)) || "image/jpeg";
    i = mimeEnd + 1;
    i += 1; // picture type byte

    // description, terminated according to encoding (1 or 2 null bytes)
    const isWide = encByte === 0x01 || encByte === 0x02;
    if (isWide) {
      while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2;
      i += 2;
    } else {
      while (i < body.length && body[i] !== 0) i++;
      i += 1;
    }

    const imageBytes = body.slice(i);
    if (!imageBytes.length) return null;
    const blob = new Blob([imageBytes], { type: mime });
    return blob;
  } catch {
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function readAudioDuration(file, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
      URL.revokeObjectURL(url);
    };
    // Some iOS files (particularly iCloud-hosted files that stall
    // mid-download, or unusual codecs Safari can't probe) never fire
    // loadedmetadata or error at all. Without this timeout, one such
    // file would hang the entire sequential import queue forever.
    const timeoutId = setTimeout(() => finish(0), timeoutMs);
    audio.addEventListener("loadedmetadata", () => {
      finish(isFinite(audio.duration) ? audio.duration : 0);
    });
    audio.addEventListener("error", () => finish(0));
    audio.src = url;
  });
}

function titleFromFilename(filename) {
  return filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
}

/**
 * Main entry point: extracts everything we can from a user-selected file.
 * Never throws — always resolves with best-effort metadata.
 */
export async function extractMetadata(file) {
  const base = {
    title: titleFromFilename(file.name),
    artist: "Unknown Artist",
    album: "",
    genre: "",
    cover: null, // Blob | null
    duration: 0,
  };

  base.duration = await readAudioDuration(file);

  const looksLikeMp3 = file.type.includes("mpeg") || file.type.includes("mp3") || /\.mp3$/i.test(file.name);
  if (!looksLikeMp3) return base;

  try {
    // ID3 tags live at the start of the file — reading the first 1MB is
    // enough for typical tag sizes (covers included) without loading
    // the whole file into memory.
    const headSlice = file.slice(0, Math.min(file.size, 1024 * 1024));
    const buffer = await headSlice.arrayBuffer();
    const tags = parseId3v2(buffer);
    if (tags) {
      if (tags.title) base.title = tags.title;
      if (tags.artist) base.artist = tags.artist;
      if (tags.album) base.album = tags.album;
      if (tags.genre) base.genre = tags.genre;
      if (tags.cover) base.cover = tags.cover;
    }
  } catch {
    // Fall back silently to filename-based metadata.
  }

  return base;
}

export { blobToDataUrl };
