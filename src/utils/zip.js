/**
 * utils/zip.js
 * ---------------------------------------------------------------
 * A minimal, dependency-free ZIP reader and writer.
 *
 * Writing uses the STORE method (no compression). That's a
 * deliberate simplicity/reliability trade-off: everything a .lmp
 * package holds — audio, images, JSON — is either already
 * compressed or small, so the space saved by compressing on export
 * is minimal. The result is still a fully standard ZIP file any
 * tool can open (rename .lmp -> .zip).
 *
 * Reading supports both STORE (method 0) and DEFLATE (method 8),
 * because the docs tell users they can build a .lmp by zipping a
 * folder with their OS's normal tools, which default to DEFLATE.
 * ---------------------------------------------------------------
 */

import { inflateRaw } from "./inflate.js";

const LOCAL_FILE_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

/* ----------------------------- CRC32 ----------------------------- */

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ----------------------------- writer ----------------------------- */

class ByteWriter {
  constructor() { this.chunks = []; this.length = 0; }
  pushUint8(v) { this.chunks.push(Uint8Array.of(v & 0xff)); this.length += 1; }
  pushUint16(v) { this.chunks.push(Uint8Array.of(v & 0xff, (v >>> 8) & 0xff)); this.length += 2; }
  pushUint32(v) {
    this.chunks.push(Uint8Array.of(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff));
    this.length += 4;
  }
  pushBytes(bytes) { this.chunks.push(bytes); this.length += bytes.length; }
  toBlob(type) { return new Blob(this.chunks, { type }); }
}

const textEncoder = new TextEncoder();

/** DOS date/time packing (ZIP requires this even though nothing reads it here). */
function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Builds a ZIP Blob from entries: [{ name: string, data: Uint8Array | ArrayBuffer }]
 */
export function createZip(entries) {
  const writer = new ByteWriter();
  const { time, day } = dosDateTime();
  const central = [];

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = crc32(data);
    const offset = writer.length;

    writer.pushUint32(LOCAL_FILE_SIG);
    writer.pushUint16(20);       // version needed
    writer.pushUint16(0);        // flags
    writer.pushUint16(0);        // method: 0 = store
    writer.pushUint16(time);
    writer.pushUint16(day);
    writer.pushUint32(crc);
    writer.pushUint32(data.length); // compressed size == uncompressed for store
    writer.pushUint32(data.length);
    writer.pushUint16(nameBytes.length);
    writer.pushUint16(0);        // extra field length
    writer.pushBytes(nameBytes);
    writer.pushBytes(data);

    central.push({ nameBytes, crc, size: data.length, offset, time, day });
  }

  const centralStart = writer.length;
  for (const c of central) {
    writer.pushUint32(CENTRAL_DIR_SIG);
    writer.pushUint16(20);       // version made by
    writer.pushUint16(20);       // version needed
    writer.pushUint16(0);        // flags
    writer.pushUint16(0);        // method: store
    writer.pushUint16(c.time);
    writer.pushUint16(c.day);
    writer.pushUint32(c.crc);
    writer.pushUint32(c.size);
    writer.pushUint32(c.size);
    writer.pushUint16(c.nameBytes.length);
    writer.pushUint16(0);        // extra length
    writer.pushUint16(0);        // comment length
    writer.pushUint16(0);        // disk number start
    writer.pushUint16(0);        // internal attrs
    writer.pushUint32(0);        // external attrs
    writer.pushUint32(c.offset);
    writer.pushBytes(c.nameBytes);
  }
  const centralSize = writer.length - centralStart;

  writer.pushUint32(EOCD_SIG);
  writer.pushUint16(0);          // disk number
  writer.pushUint16(0);          // disk with central dir
  writer.pushUint16(central.length); // entries on this disk
  writer.pushUint16(central.length); // total entries
  writer.pushUint32(centralSize);
  writer.pushUint32(centralStart);
  writer.pushUint16(0);          // comment length

  return writer.toBlob("application/zip");
}

/* ----------------------------- reader ----------------------------- */

class ByteReader {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
  }
  u16(off) { return this.view.getUint16(off, true); }
  u32(off) { return this.view.getUint32(off, true); }
}

function findEndOfCentralDirectory(reader) {
  const bytes = reader.bytes;
  // EOCD is at the end, followed only by an optional comment (max 65535 bytes)
  const minPos = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (reader.u32(i) === EOCD_SIG) return i;
  }
  return -1;
}

const textDecoder = new TextDecoder("utf-8");

/**
 * Reads a ZIP archive (ArrayBuffer) into a Map<filename, Uint8Array>.
 * Throws a descriptive Error for anything malformed or unsupported, so
 * callers can surface a friendly validation message.
 */
export function readZip(arrayBuffer) {
  const reader = new ByteReader(arrayBuffer);
  const eocdPos = findEndOfCentralDirectory(reader);
  if (eocdPos === -1) {
    throw new Error("This doesn't look like a valid ZIP/.lmp file (no end-of-archive marker found).");
  }

  const totalEntries = reader.u16(eocdPos + 10);
  const centralDirOffset = reader.u32(eocdPos + 16);

  const result = new Map();
  let pos = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (reader.u32(pos) !== CENTRAL_DIR_SIG) {
      throw new Error("This .lmp file's internal structure is corrupted (bad central directory entry).");
    }
    const method = reader.u16(pos + 10);
    const compSize = reader.u32(pos + 20);
    const uncompSize = reader.u32(pos + 24);
    const nameLen = reader.u16(pos + 28);
    const extraLen = reader.u16(pos + 30);
    const commentLen = reader.u16(pos + 32);
    const localOffset = reader.u32(pos + 42);
    const nameBytes = reader.bytes.subarray(pos + 46, pos + 46 + nameLen);
    const name = textDecoder.decode(nameBytes);

    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory entry, no data

    // Re-read the local header: its extra-field length can differ from
    // the central directory's, so we can't reuse extraLen from above.
    if (reader.u32(localOffset) !== LOCAL_FILE_SIG) {
      throw new Error(`This .lmp file's internal structure is corrupted (bad entry for "${name}").`);
    }
    const localNameLen = reader.u16(localOffset + 26);
    const localExtraLen = reader.u16(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressedData = reader.bytes.subarray(dataStart, dataStart + compSize);

    let fileData;
    if (method === 0) {
      fileData = compressedData;
    } else if (method === 8) {
      fileData = inflateRaw(compressedData, uncompSize);
    } else {
      throw new Error(`"${name}" uses an unsupported ZIP compression method (${method}). Try re-creating the package with standard Zip compression.`);
    }

    result.set(name, fileData);
  }

  return result;
}
