import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalTrackFromFile,
  detectAudioCodec,
  exportPlaylistToM3u8,
  isSupportedAudioFile,
  parseAudioFileName,
} from './localAudioFiles';

test('parses local audio filenames with artist/title separators and track numbers', () => {
  assert.deepEqual(parseAudioFileName('01 - Nordic Static - Morning Arches.flac'), {
    artist: 'Nordic Static',
    title: 'Morning Arches',
  });
  assert.deepEqual(parseAudioFileName('04. Klara_Vane — Amber_Nocturne.mp3'), {
    artist: 'Klara Vane',
    title: 'Amber Nocturne',
  });
  assert.deepEqual(parseAudioFileName('02) Solo Piano Sketch.wav'), {
    artist: 'Локальный файл',
    title: 'Solo Piano Sketch',
  });
});

test('validates supported audio formats and detects readable codec labels', () => {
  assert.equal(isSupportedAudioFile('track.flac', ''), true);
  assert.equal(isSupportedAudioFile('voice.opus', ''), true);
  assert.equal(isSupportedAudioFile('recording.bin', 'audio/mpeg'), true);
  assert.equal(isSupportedAudioFile('notes.txt', 'text/plain'), false);

  assert.equal(detectAudioCodec('master.flac'), 'FLAC · Локальный');
  assert.equal(detectAudioCodec('demo.mp3'), 'MP3 · Локальный');
  assert.equal(detectAudioCodec('session.wav'), 'WAV · Локальный');
  assert.equal(detectAudioCodec('mix.m4a'), 'AAC / M4A · Локальный');
});

test('builds local track objects and exports valid M3U8 playlists', () => {
  const track = buildLocalTrackFromFile({
    id: 'local-1',
    fileName: '03. Maren Sol - Tide Line.flac',
    mimeType: 'audio/flac',
    durationSec: 245.6,
    sizeMb: 31.456,
    coverUrl: '/cover.jpg',
    localFileKey: 'key-1',
  });

  assert.equal(track.source, 'local');
  assert.equal(track.artist, 'Maren Sol');
  assert.equal(track.title, 'Tide Line');
  assert.equal(track.durationSec, 246);
  assert.equal(track.offlineSizeMb, 31.46);
  assert.equal(track.localFileKey, 'key-1');

  const m3u = exportPlaylistToM3u8('Ночная подборка', [track]);
  assert.ok(m3u.startsWith('#EXTM3U\n#PLAYLIST:Ночная подборка\n'));
  assert.ok(m3u.includes('#EXTINF:246,Maren Sol - Tide Line'));
  assert.ok(m3u.includes('#EXTALB:Локальные файлы'));
});
