import assert from 'node:assert/strict';
import test from 'node:test';
import { parseId3TagsFromBuffer } from './id3Parser';

function encodeSyncSafe(value: number): [number, number, number, number] {
  return [
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ];
}

function makeTextFrame(id: string, text: string, encoding: 0 | 3 = 3): Uint8Array {
  const textBytes = Buffer.from(text, encoding === 3 ? 'utf8' : 'latin1');
  const payloadLen = 1 + textBytes.length;
  const out = new Uint8Array(10 + payloadLen);
  out.set(Buffer.from(id, 'ascii'), 0);
  out[4] = (payloadLen >>> 24) & 0xff;
  out[5] = (payloadLen >>> 16) & 0xff;
  out[6] = (payloadLen >>> 8) & 0xff;
  out[7] = payloadLen & 0xff;
  out[10] = encoding;
  out.set(textBytes, 11);
  return out;
}

test('parseId3TagsFromBuffer reads ID3v2.3 UTF-8 and Latin-1 frames accurately', () => {
  const frames = [
    makeTextFrame('TIT2', 'Instant Crush', 3),
    makeTextFrame('TPE1', 'Daft Punk', 3),
    makeTextFrame('TALB', 'Random Access Memories', 3),
    makeTextFrame('TYER', '2013', 0),
    makeTextFrame('TCON', '(18) Electronic', 0),
  ];
  const totalFramesLen = frames.reduce((sum, f) => sum + f.length, 0);
  const tag = new Uint8Array(10 + totalFramesLen);
  tag[0] = 0x49;
  tag[1] = 0x44;
  tag[2] = 0x33;
  tag[3] = 3; // v2.3
  tag[4] = 0;
  tag[5] = 0;
  tag.set(encodeSyncSafe(totalFramesLen), 6);

  let cursor = 10;
  for (const frame of frames) {
    tag.set(frame, cursor);
    cursor += frame.length;
  }

  const parsed = parseId3TagsFromBuffer(tag.buffer);
  assert.deepEqual(parsed, {
    title: 'Instant Crush',
    artist: 'Daft Punk',
    album: 'Random Access Memories',
    year: 2013,
    genre: 'Electronic',
  });
});

test('parseId3TagsFromBuffer falls back to ID3v1 TAG footer when ID3v2 is absent', () => {
  const tail = new Uint8Array(128);
  tail.set(Buffer.from('TAG', 'ascii'), 0);
  tail.set(Buffer.from('Группа крови', 'latin1'), 3);
  tail.set(Buffer.from('Kino', 'latin1'), 33);
  tail.set(Buffer.from('Gruppa Krovi', 'latin1'), 63);
  tail.set(Buffer.from('1988', 'ascii'), 93);

  const head = new Uint8Array(64);
  const parsed = parseId3TagsFromBuffer(head.buffer, tail.buffer);
  assert.equal(parsed.artist, 'Kino');
  assert.equal(parsed.album, 'Gruppa Krovi');
  assert.equal(parsed.year, 1988);
});
