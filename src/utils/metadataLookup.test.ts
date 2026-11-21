import assert from 'node:assert/strict';
import test from 'node:test';
import type { MetadataCandidate } from '../types/music';
import {
  buildFallbackSearchQueries,
  buildProxiedCoverUrl,
  cleanTrackSearchQuery,
  formatItunesCoverUrl,
  isAllowedCoverHost,
  parseLrcLyrics,
  rankAndDedupeCandidates,
} from './metadataLookup';

test('cleanTrackSearchQuery extracts clean artist and title from noisy MP3 filenames', () => {
  assert.deepEqual(
    cleanTrackSearchQuery('01. M83 - Midnight City (Official Audio) [320kbps].mp3'),
    {
      query: 'M83 Midnight City',
      artistHint: 'M83',
      titleHint: 'Midnight City',
      hasCyrillic: false,
    }
  );

  assert.deepEqual(
    cleanTrackSearchQuery('04 - Король и Шут — Лесник (zaycev.net).mp3'),
    {
      query: 'Король и Шут Лесник',
      artistHint: 'Король и Шут',
      titleHint: 'Лесник',
      hasCyrillic: true,
    }
  );

  assert.deepEqual(
    cleanTrackSearchQuery('Daft_Punk_-_Get_Lucky_(feat._Pharrell_Williams).mp3'),
    {
      query: 'Daft Punk Get Lucky',
      artistHint: 'Daft Punk',
      titleHint: 'Get Lucky',
      hasCyrillic: false,
    }
  );

  assert.deepEqual(cleanTrackSearchQuery('M83 - Midnight City (1).mp3'), {
    query: 'M83 Midnight City',
    artistHint: 'M83',
    titleHint: 'Midnight City',
    hasCyrillic: false,
  });

  assert.deepEqual(
    cleanTrackSearchQuery('🎵 Miyagi & Andy Panda - Kosandra (slowed + reverb) [muzmo.ru].mp3'),
    {
      query: 'Miyagi & Andy Panda Kosandra',
      artistHint: 'Miyagi & Andy Panda',
      titleHint: 'Kosandra',
      hasCyrillic: false,
    }
  );
});

test('buildFallbackSearchQueries generates primary-artist and title-only relaxed queries', () => {
  const variants = buildFallbackSearchQueries({
    query: 'Miyagi & Andy Panda Kosandra (Extended)',
    artistHint: 'Miyagi & Andy Panda',
    titleHint: 'Kosandra (Extended)',
  });

  assert.deepEqual(variants, [
    { query: 'Miyagi Kosandra', artistHint: 'Miyagi', titleHint: 'Kosandra' },
    {
      query: 'Miyagi & Andy Panda Kosandra',
      artistHint: 'Miyagi & Andy Panda',
      titleHint: 'Kosandra',
    },
    { query: 'Kosandra', artistHint: '', titleHint: 'Kosandra' },
  ]);
});

test('rankAndDedupeCandidates prioritizes original release over karaoke/tribute versions', () => {
  const candidates: MetadataCandidate[] = [
    {
      id: 'it-1',
      source: 'itunes',
      title: 'Midnight City (8-Bit Tribute to M83)',
      artist: '8-Bit Arcade',
      album: 'Arcade Hits',
      year: 2015,
      genre: 'Electronic',
      coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg',
      durationSec: 244,
    },
    {
      id: 'it-remix',
      source: 'itunes',
      title: 'Midnight City (Trentemøller Remix) [Mixed]',
      artist: 'M83',
      album: 'Mix Collection',
      year: 2012,
      genre: 'Electronic',
      coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/r/600x600bb.jpg',
      durationSec: 180,
    },
    {
      id: 'it-ep',
      source: 'itunes',
      title: 'Midnight City',
      artist: 'M83',
      album: 'Midnight City (Remix EP) - EP',
      year: 2011,
      genre: 'Rock',
      coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/e/600x600bb.jpg',
      durationSec: 244,
    },
    {
      id: 'it-2',
      source: 'itunes',
      title: 'Midnight City',
      artist: 'M83',
      album: "Hurry up, We're Dreaming",
      year: 2011,
      genre: 'Alternative',
      coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/b/600x600bb.jpg',
      durationSec: 244,
    },
    {
      id: 'dz-1',
      source: 'deezer',
      title: 'Midnight City',
      artist: 'M83',
      album: "Hurry up, We're Dreaming",
      year: 0,
      genre: 'Electronic',
      coverUrl: 'https://cdn-images.dzcdn.net/images/cover/abc/500x500.jpg',
      durationSec: 244,
    },
  ];

  const ranked = rankAndDedupeCandidates(candidates, {
    query: 'M83 Midnight City',
    artistHint: 'M83',
    titleHint: 'Midnight City',
    durationSec: 180,
  });

  assert.equal(ranked[0].artist, 'M83');
  assert.equal(ranked[0].title, 'Midnight City');
  assert.equal(ranked[0].album, "Hurry up, We're Dreaming");
  assert.equal(ranked[0].source, 'itunes');
});

test('formatItunesCoverUrl, isAllowedCoverHost, and buildProxiedCoverUrl enforce trusted hosts', () => {
  assert.equal(
    formatItunesCoverUrl('http://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg', 600),
    'https://is1-ssl.mzstatic.com/image/thumb/600x600bb.jpg'
  );
  assert.equal(isAllowedCoverHost('is5-ssl.mzstatic.com'), true);
  assert.equal(isAllowedCoverHost('cdn-images.dzcdn.net'), true);
  assert.equal(isAllowedCoverHost('evil.example.com'), false);
  assert.ok(
    buildProxiedCoverUrl('https://is5-ssl.mzstatic.com/image/thumb/cover.jpg').startsWith(
      '/api/metadata/cover?url='
    )
  );
  assert.equal(buildProxiedCoverUrl('https://evil.example.com/cover.jpg'), '');
});

test('parseLrcLyrics parses synced LRC timestamps and falls back to plain lyrics', () => {
  const synced = parseLrcLyrics('[00:12.50] Waiting in a car\n[00:18.00] Waiting for a ride');
  assert.deepEqual(synced, [
    { time: 12.5, text: 'Waiting in a car' },
    { time: 18, text: 'Waiting for a ride' },
  ]);

  const plain = parseLrcLyrics(null, 'Line one\nLine two', 60);
  assert.equal(plain.length, 2);
  assert.equal(plain[0].text, 'Line one');
  assert.equal(plain[1].text, 'Line two');
});
