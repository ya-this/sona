export interface ParsedId3Tags {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  coverDataUrl?: string;
}

function readSyncSafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function decodeLatin1(slice: Uint8Array): string {
  let out = '';
  for (let i = 0; i < slice.length; i++) {
    const code = slice[i];
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function decodeTextBytes(slice: Uint8Array, encoding: number): string {
  if (slice.length === 0) return '';
  try {
    if (encoding === 0) {
      return decodeLatin1(slice);
    }
    if (encoding === 1) {
      // UTF-16 with BOM
      if (slice.length >= 2) {
        if (slice[0] === 0xfe && slice[1] === 0xff) {
          return new TextDecoder('utf-16be')
            .decode(slice.subarray(2))
            .replace(/\0+$/g, '')
            .trim();
        }
        if (slice[0] === 0xff && slice[1] === 0xfe) {
          return new TextDecoder('utf-16le')
            .decode(slice.subarray(2))
            .replace(/\0+$/g, '')
            .trim();
        }
      }
      return new TextDecoder('utf-16le').decode(slice).replace(/\0+$/g, '').trim();
    }
    if (encoding === 2) {
      return new TextDecoder('utf-16be').decode(slice).replace(/\0+$/g, '').trim();
    }
    if (encoding === 3) {
      return new TextDecoder('utf-8').decode(slice).replace(/\0+$/g, '').trim();
    }
  } catch {
    // Fall back to Latin-1 if decoder unavailable
  }
  return decodeLatin1(slice);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function parseApicFrame(payload: Uint8Array): string | undefined {
  if (payload.length < 16) return undefined;
  const encoding = payload[0];
  let cursor = 1;

  // Read null-terminated MIME type (ASCII)
  let mime = '';
  while (cursor < payload.length && payload[cursor] !== 0) {
    mime += String.fromCharCode(payload[cursor]);
    cursor++;
  }
  cursor++; // skip null byte
  if (cursor >= payload.length) return undefined;

  // Picture type byte
  cursor += 1;

  // Skip null-terminated description
  if (encoding === 1 || encoding === 2) {
    while (cursor + 1 < payload.length) {
      if (payload[cursor] === 0 && payload[cursor + 1] === 0) {
        cursor += 2;
        break;
      }
      cursor += 2;
    }
  } else {
    while (cursor < payload.length && payload[cursor] !== 0) {
      cursor++;
    }
    cursor++;
  }

  if (cursor >= payload.length) return undefined;
  const imgBytes = payload.subarray(cursor);
  if (imgBytes.length < 32 || imgBytes.length > 420_000) return undefined;

  let resolvedMime = mime.toLowerCase().trim();
  if (!resolvedMime.startsWith('image/')) {
    if (imgBytes[0] === 0x89 && imgBytes[1] === 0x50) {
      resolvedMime = 'image/png';
    } else if (imgBytes[0] === 0xff && imgBytes[1] === 0xd8) {
      resolvedMime = 'image/jpeg';
    } else {
      return undefined;
    }
  }
  if (resolvedMime === 'image/jpg') resolvedMime = 'image/jpeg';

  return `data:${resolvedMime};base64,${bytesToBase64(imgBytes)}`;
}

function parseYearFromTag(raw: string): number | undefined {
  const match = raw.match(/(19\d{2}|20\d{2})/);
  if (!match) return undefined;
  const yr = Number(match[1]);
  return yr >= 1900 && yr <= 2100 ? yr : undefined;
}

function cleanGenreTag(raw: string): string | undefined {
  const trimmed = raw.replace(/^\(\d{1,3}\)\s*/, '').trim();
  return trimmed || undefined;
}

export function parseId3TagsFromBuffer(
  headBuffer: ArrayBuffer,
  tailBuffer?: ArrayBuffer
): ParsedId3Tags {
  const result: ParsedId3Tags = {};
  const head = new Uint8Array(headBuffer);

  // Parse ID3v2.3 / ID3v2.4 header if present
  if (
    head.length >= 10 &&
    head[0] === 0x49 && // I
    head[1] === 0x44 && // D
    head[2] === 0x33 // 3
  ) {
    const version = head[3];
    const flags = head[5];
    const tagSize = readSyncSafeInt(head, 6);
    const maxOffset = Math.min(head.length, 10 + tagSize);
    let offset = 10;

    // Skip extended header if bit 6 is set
    if ((flags & 0x40) !== 0 && offset + 4 <= maxOffset) {
      const extSize =
        version === 4 ? readSyncSafeInt(head, offset) : readUint32BE(head, offset);
      offset += version === 4 ? extSize : extSize + 4;
    }

    while (version >= 3 && offset + 10 <= maxOffset) {
      const frameId = String.fromCharCode(
        head[offset],
        head[offset + 1],
        head[offset + 2],
        head[offset + 3]
      );
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        version === 4
          ? readSyncSafeInt(head, offset + 4)
          : readUint32BE(head, offset + 4);
      if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break;

      const payload = head.subarray(offset + 10, offset + 10 + frameSize);
      offset += 10 + frameSize;

      if (payload.length === 0) continue;

      if (frameId === 'TIT2') {
        const text = decodeTextBytes(payload.subarray(1), payload[0]);
        if (text) result.title = text;
      } else if (frameId === 'TPE1') {
        const text = decodeTextBytes(payload.subarray(1), payload[0]);
        if (text) result.artist = text;
      } else if (frameId === 'TALB') {
        const text = decodeTextBytes(payload.subarray(1), payload[0]);
        if (text) result.album = text;
      } else if (frameId === 'TYER' || frameId === 'TDRC' || frameId === 'TDOR') {
        const text = decodeTextBytes(payload.subarray(1), payload[0]);
        const yr = parseYearFromTag(text);
        if (yr && !result.year) result.year = yr;
      } else if (frameId === 'TCON') {
        const text = decodeTextBytes(payload.subarray(1), payload[0]);
        const genre = cleanGenreTag(text);
        if (genre) result.genre = genre;
      } else if (frameId === 'APIC' && !result.coverDataUrl) {
        const dataUrl = parseApicFrame(payload);
        if (dataUrl) result.coverDataUrl = dataUrl;
      }
    }
  }

  // Fallback to ID3v1 (last 128 bytes) if fields are missing
  const tail = tailBuffer ? new Uint8Array(tailBuffer) : head;
  if (tail.length >= 128) {
    const start = tail.length - 128;
    if (
      tail[start] === 0x54 && // T
      tail[start + 1] === 0x41 && // A
      tail[start + 2] === 0x47 // G
    ) {
      if (!result.title) {
        const title = decodeLatin1(tail.subarray(start + 3, start + 33));
        if (title) result.title = title;
      }
      if (!result.artist) {
        const artist = decodeLatin1(tail.subarray(start + 33, start + 63));
        if (artist) result.artist = artist;
      }
      if (!result.album) {
        const album = decodeLatin1(tail.subarray(start + 63, start + 93));
        if (album) result.album = album;
      }
      if (!result.year) {
        const yrStr = decodeLatin1(tail.subarray(start + 93, start + 97));
        const yr = parseYearFromTag(yrStr);
        if (yr) result.year = yr;
      }
    }
  }

  return result;
}

export async function readMp3Id3Tags(file: File): Promise<ParsedId3Tags> {
  try {
    const headSlice = file.slice(0, Math.min(file.size, 327_680));
    const tailStart = Math.max(0, file.size - 128);
    const tailSlice = file.size >= 128 ? file.slice(tailStart, file.size) : null;
    const [headBuf, tailBuf] = await Promise.all([
      headSlice.arrayBuffer(),
      tailSlice ? tailSlice.arrayBuffer() : Promise.resolve(undefined),
    ]);
    return parseId3TagsFromBuffer(headBuf, tailBuf);
  } catch {
    return {};
  }
}
