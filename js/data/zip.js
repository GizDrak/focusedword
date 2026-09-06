window.ZipReader = (() => {
  const U16 = (dv, o) => dv.getUint16(o, true);
  const U32 = (dv, o) => dv.getUint32(o, true);

  function findEocd(dv, len) {
    const min = Math.max(0, len - 22 - 65535);
    for (let o = len - 22; o >= min; o--) {
      if (U32(dv, o) === 0x06054b50) return o;
    }
    return -1;
  }

  function readEntries(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const eocd = findEocd(dv, u8.byteLength);
    if (eocd < 0) throw new Error('zip: end of central directory not found');
    const count = U16(dv, eocd + 10);
    let off = U32(dv, eocd + 16);
    const entries = [];
    for (let i = 0; i < count; i++) {
      if (off + 46 > u8.byteLength || U32(dv, off) !== 0x02014b50) {
        throw new Error('zip: bad central directory entry');
      }
      const flags = U16(dv, off + 8);
      const method = U16(dv, off + 10);
      const compressedSize = U32(dv, off + 20);
      const uncompressedSize = U32(dv, off + 24);
      const nameLen = U16(dv, off + 28);
      const extraLen = U16(dv, off + 30);
      const commentLen = U16(dv, off + 32);
      const localOff = U32(dv, off + 42);
      const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
      entries.push({ name, method, flags, compressedSize, uncompressedSize, localOff });
      off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  function sliceData(u8, entry) {
    if (entry.flags & 0x1) throw new Error('zip: encrypted entries not supported');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const lho = entry.localOff;
    if (lho + 30 > u8.byteLength || U32(dv, lho) !== 0x04034b50) {
      throw new Error('zip: bad local file header');
    }
    const nameLen = U16(dv, lho + 26);
    const extraLen = U16(dv, lho + 28);
    const start = lho + 30 + nameLen + extraLen;
    if (start + entry.compressedSize > u8.byteLength) {
      throw new Error('zip: truncated entry data');
    }
    return u8.subarray(start, start + entry.compressedSize);
  }

  async function inflateRaw(compressed, uncompressedSize) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('zip: DecompressionStream unavailable');
    }
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(compressed);
        controller.close();
      },
    });
    const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (uncompressedSize != null && out.byteLength !== uncompressedSize) {
      throw new Error(`zip: inflated size mismatch (got ${out.byteLength}, want ${uncompressedSize})`);
    }
    return out;
  }

  function pickEntry(entries, expectedName) {
    if (!entries.length) throw new Error('zip: archive is empty');
    if (expectedName) {
      const match = entries.find(e => e.name === expectedName);
      if (!match) throw new Error(`zip: entry not found: ${expectedName}`);
      return match;
    }
    if (entries.length === 1) return entries[0];
    const sqlite = entries.find(e => /\.sqlite$/i.test(e.name));
    if (sqlite) return sqlite;
    throw new Error('zip: multiple entries and no expected name given');
  }

  async function extract(bytes, opts = {}) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const entry = pickEntry(readEntries(u8), opts.expectedName);
    if (entry.method === 0) {
      const data = sliceData(u8, entry);
      if (entry.uncompressedSize != null && data.length !== entry.uncompressedSize) {
        throw new Error(`zip: stored size mismatch (got ${data.length}, want ${entry.uncompressedSize})`);
      }
      return data.slice();
    }
    if (entry.method !== 8) {
      throw new Error(`zip: unsupported compression method ${entry.method}`);
    }
    return inflateRaw(sliceData(u8, entry), entry.uncompressedSize);
  }

  return { extract };
})();
