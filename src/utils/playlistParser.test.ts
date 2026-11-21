import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExternalPlaylist } from './playlistParser';

test('parses M3U8 playlists preserving playlist name, artist, title, album, genre, and duration', () => {
  const m3u = [
    '#EXTM3U',
    '#PLAYLIST:Ночной Берлин',
    '#EXTINF:245,Nils Frahm — Says',
    '#EXTALB:Spaces',
    '#EXTGENRE:Неоклассика',
    '/music/nils_frahm_says.flac',
    '#EXTINF:198,Rival Consoles - Recovery',
    '/music/recovery.mp3',
  ].join('\n');

  const result = parseExternalPlaylist(m3u, 'fallback.m3u8');
  assert.equal(result.format, 'm3u');
  assert.equal(result.playlistName, 'Ночной Берлин');
  assert.equal(result.tracks.length, 2);
  assert.equal(result.tracks[0].artist, 'Nils Frahm');
  assert.equal(result.tracks[0].title, 'Says');
  assert.equal(result.tracks[0].album, 'Spaces');
  assert.equal(result.tracks[0].genre, 'Неоклассика');
  assert.equal(result.tracks[0].durationSec, 245);
  assert.equal(result.tracks[1].artist, 'Rival Consoles');
  assert.equal(result.tracks[1].durationSec, 198);
});

test('parses JSON playlists preserving metadata fields', () => {
  const json = JSON.stringify({
    name: 'Утренний джаз',
    tracks: [
      {
        title: 'Blue in Green',
        artist: 'Bill Evans',
        album: 'Portrait in Jazz',
        genre: 'Джаз',
        duration: '5:26',
        year: 1960,
        bpm: 78,
      },
    ],
  });

  const result = parseExternalPlaylist(json);
  assert.equal(result.format, 'json');
  assert.equal(result.playlistName, 'Утренний джаз');
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].durationSec, 326);
  assert.equal(result.tracks[0].year, 1960);
  assert.equal(result.tracks[0].bpm, 78);
});

test('parses CSV playlists with quoted commas and duration strings', () => {
  const csv = [
    'Title,Artist,Album,Genre,Duration,Year',
    '"Echoes, Part I",Kiasmos,Blurred,Электроника,4:12,2017',
    'Solitude,M83,Junk,Синтвейв,6:03,2016',
  ].join('\n');

  const result = parseExternalPlaylist(csv, 'favorites.csv');
  assert.equal(result.format, 'csv');
  assert.equal(result.tracks.length, 2);
  assert.equal(result.tracks[0].title, 'Echoes, Part I');
  assert.equal(result.tracks[0].durationSec, 252);
  assert.equal(result.tracks[1].artist, 'M83');
  assert.equal(result.tracks[1].durationSec, 363);
});

test('parses plain text tracklists with numbered entries and durations', () => {
  const txt = [
    '1. Bonobo — Kerala [3:58]',
    '2. Olafur Arnalds - Saman (2:15)',
  ].join('\n');

  const result = parseExternalPlaylist(txt, 'Roadtrip.txt');
  assert.equal(result.format, 'text');
  assert.equal(result.playlistName, 'Roadtrip');
  assert.equal(result.tracks.length, 2);
  assert.equal(result.tracks[0].artist, 'Bonobo');
  assert.equal(result.tracks[0].title, 'Kerala');
  assert.equal(result.tracks[0].durationSec, 238);
  assert.equal(result.tracks[1].durationSec, 135);
});
