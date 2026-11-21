import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TRACKS_PLAYLIST_ID,
  buildAllUploadedPlaylist,
  buildLikedPlaylist,
  LIKED_PLAYLIST_ID,
  toggleTrackLikeInList,
} from './likedPlaylist';
import type { Track } from '../types/music';

const makeTrack = (id: string, liked: boolean): Track => ({
  id,
  title: `Track ${id}`,
  artist: 'Artist',
  album: 'Album',
  genre: 'Эмбиент',
  year: 2025,
  durationSec: 200,
  bpm: 90,
  codec: 'FLAC',
  coverUrl: `/cover-${id}.jpg`,
  source: 'local',
  liked,
  offlineAvailable: true,
  offlineSizeMb: 20,
  lyrics: [],
  synth: {
    rootMidi: 57,
    chords: [[0, 3, 7]],
    bpm: 90,
    wave: 'sine',
    padWave: 'triangle',
    brightness: 1200,
    arpPattern: [0],
    pulseStyle: 'ambient',
  },
});

test('automatically updates liked playlist when tracks are liked or unliked', () => {
  const initial = [makeTrack('t1', true), makeTrack('t2', false), makeTrack('t3', false)];

  const pl1 = buildLikedPlaylist(initial, '/fallback.jpg');
  assert.equal(pl1.id, LIKED_PLAYLIST_ID);
  assert.equal(pl1.isAutoLiked, true);
  assert.deepEqual(pl1.trackIds, ['t1']);
  assert.equal(pl1.coverUrl, '/cover-t1.jpg');

  const afterLike = toggleTrackLikeInList(initial, 't2');
  const pl2 = buildLikedPlaylist(afterLike, '/fallback.jpg');
  assert.deepEqual(pl2.trackIds, ['t1', 't2']);

  const afterUnlikeAll = toggleTrackLikeInList(toggleTrackLikeInList(afterLike, 't1'), 't2');
  const pl3 = buildLikedPlaylist(afterUnlikeAll, '/fallback.jpg');
  assert.deepEqual(pl3.trackIds, []);
  assert.equal(pl3.coverUrl, '/fallback.jpg');

  const plWithCustom = buildLikedPlaylist(afterUnlikeAll, '/fallback.jpg', 'data:image/jpeg;base64,abc');
  assert.equal(plWithCustom.coverUrl, 'data:image/jpeg;base64,abc');
});

test('automatically mirrors all uploaded tracks in buildAllUploadedPlaylist', () => {
  const tracks = [makeTrack('t1', false), makeTrack('t2', true)];
  const allPl = buildAllUploadedPlaylist(tracks, '/fallback.jpg');

  assert.equal(allPl.id, ALL_TRACKS_PLAYLIST_ID);
  assert.equal(allPl.isAutoAll, true);
  assert.deepEqual(allPl.trackIds, ['t1', 't2']);
  assert.equal(allPl.coverUrl, '/cover-t1.jpg');

  const customAllPl = buildAllUploadedPlaylist(tracks, '/fallback.jpg', 'data:image/jpeg;base64,xyz');
  assert.equal(customAllPl.coverUrl, 'data:image/jpeg;base64,xyz');

  const emptyAllPl = buildAllUploadedPlaylist([], '/fallback.jpg');
  assert.deepEqual(emptyAllPl.trackIds, []);
  assert.equal(emptyAllPl.coverUrl, '/fallback.jpg');
});
