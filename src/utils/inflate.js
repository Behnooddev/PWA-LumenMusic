/**
 * utils/inflate.js
 * ---------------------------------------------------------------
 * A small, dependency-free RFC 1951 ("raw DEFLATE") decompressor.
 *
 * Why this exists: a .lmp file is just a ZIP archive, and the docs
 * tell users to create one with their OS's normal "Compress" /
 * "Send to > Zip" tool. Those tools compress with DEFLATE, not
 * STORE — so to actually open real-world .lmp files (not just ones
 * this app created itself), we need a real inflate implementation.
 *
 * The Huffman decoder uses the classic canonical-code table walk
 * (as in Mark Adler's public-domain `puff.c`): integer comparisons
 * against per-length code ranges, no string keys or maps, so it's
 * fast enough for multi-megabyte audio files.
 * ---------------------------------------------------------------
 */

const FIXED_LIT_LENGTHS = new Uint8Array(288);
for (let i = 0; i < 144; i++) FIXED_LIT_LENGTHS[i] = 8;
for (let i = 144; i < 256; i++) FIXED_LIT_LENGTHS[i] = 9;
for (let i = 256; i < 280; i++) FIXED_LIT_LENGTHS[i] = 7;
for (let i = 280; i < 288; i++) FIXED_LIT_LENGTHS[i] = 8;
const FIXED_DIST_LENGTHS = new Uint8Array(30).fill(5);

const LENGTH_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LENGTH_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CODE_LENGTH_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
const MAX_BITS = 15;

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bytePos = 0;
    this.bitBuf = 0;
    this.bitCount = 0;
  }
  readBit() {
    if (this.bitCount === 0) {
      this.bitBuf = this.bytes[this.bytePos++];
      this.bitCount = 8;
    }
    const bit = this.bitBuf & 1;
    this.bitBuf >>= 1;
    this.bitCount--;
    return bit;
  }
  readBits(n) {
    let value = 0;
    for (let i = 0; i < n; i++) value |= this.readBit() << i;
    return value;
  }
  alignToByte() {
    this.bitBuf = 0;
    this.bitCount = 0;
  }
}

function buildHuffman(codeLengths) {
  const count = new Array(MAX_BITS + 1).fill(0);
  for (const len of codeLengths) count[len]++;
  count[0] = 0;

  const offsets = new Array(MAX_BITS + 2).fill(0);
  for (let len = 1; len <= MAX_BITS; len++) offsets[len + 1] = offsets[len] + count[len];

  const symbol = new Array(codeLengths.length).fill(0);
  for (let sym = 0; sym < codeLengths.length; sym++) {
    const len = codeLengths[sym];
    if (len > 0) symbol[offsets[len]++] = sym;
  }

  return { count, symbol };
}

function decodeSymbol(reader, huffman) {
  let code = 0, first = 0, index = 0;
  for (let len = 1; len <= MAX_BITS; len++) {
    code |= reader.readBit();
    const countLen = huffman.count[len];
    if (code - first < countLen) return huffman.symbol[index + (code - first)];
    index += countLen;
    first += countLen;
    first <<= 1;
    code <<= 1;
  }
  throw new Error("Invalid Huffman code in DEFLATE stream");
}

/**
 * Inflates a raw DEFLATE stream (no zlib/gzip wrapper — this is what
 * ZIP local file entries store) into a Uint8Array. `expectedSize`
 * (from the ZIP entry's uncompressed-size field) pre-sizes the output
 * buffer for speed.
 */
export function inflateRaw(input, expectedSize = 0) {
  const reader = new BitReader(input);
  let out = new Uint8Array(expectedSize || Math.max(1024, input.length * 3));
  let outLen = 0;

  function ensureCapacity(extra) {
    if (outLen + extra <= out.length) return;
    let newSize = out.length * 2;
    while (newSize < outLen + extra) newSize *= 2;
    const grown = new Uint8Array(newSize);
    grown.set(out.subarray(0, outLen));
    out = grown;
  }

  for (;;) {
    const isFinal = reader.readBit();
    const type = reader.readBits(2);

    if (type === 0) {
      reader.alignToByte();
      const len = input[reader.bytePos] | (input[reader.bytePos + 1] << 8);
      reader.bytePos += 4; // skip LEN + ~LEN
      ensureCapacity(len);
      out.set(input.subarray(reader.bytePos, reader.bytePos + len), outLen);
      outLen += len;
      reader.bytePos += len;
    } else if (type === 1 || type === 2) {
      let litTree, distTree;
      if (type === 1) {
        litTree = buildHuffman(FIXED_LIT_LENGTHS);
        distTree = buildHuffman(FIXED_DIST_LENGTHS);
      } else {
        const hlit = reader.readBits(5) + 257;
        const hdist = reader.readBits(5) + 1;
        const hclen = reader.readBits(4) + 4;

        const clLengths = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) clLengths[CODE_LENGTH_ORDER[i]] = reader.readBits(3);
        const clTree = buildHuffman(clLengths);

        const allLengths = [];
        while (allLengths.length < hlit + hdist) {
          const sym = decodeSymbol(reader, clTree);
          if (sym < 16) {
            allLengths.push(sym);
          } else if (sym === 16) {
            const repeat = reader.readBits(2) + 3;
            const prev = allLengths[allLengths.length - 1] || 0;
            for (let i = 0; i < repeat; i++) allLengths.push(prev);
          } else if (sym === 17) {
            const repeat = reader.readBits(3) + 3;
            for (let i = 0; i < repeat; i++) allLengths.push(0);
          } else {
            const repeat = reader.readBits(7) + 11;
            for (let i = 0; i < repeat; i++) allLengths.push(0);
          }
        }
        litTree = buildHuffman(allLengths.slice(0, hlit));
        distTree = buildHuffman(allLengths.slice(hlit, hlit + hdist));
      }

      for (;;) {
        const sym = decodeSymbol(reader, litTree);
        if (sym < 256) {
          ensureCapacity(1);
          out[outLen++] = sym;
        } else if (sym === 256) {
          break;
        } else {
          const lenIdx = sym - 257;
          const length = LENGTH_BASE[lenIdx] + reader.readBits(LENGTH_EXTRA[lenIdx]);
          const distSym = decodeSymbol(reader, distTree);
          const distance = DIST_BASE[distSym] + reader.readBits(DIST_EXTRA[distSym]);
          ensureCapacity(length);
          let src = outLen - distance;
          for (let i = 0; i < length; i++) out[outLen++] = out[src++];
        }
      }
    } else {
      throw new Error("Unsupported DEFLATE block type (reserved)");
    }

    if (isFinal) break;
    if (reader.bytePos >= input.length && reader.bitCount === 0) break;
  }

  return out.subarray(0, expectedSize || outLen);
}
