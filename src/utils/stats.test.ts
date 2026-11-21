import test from 'node:test';
import assert from 'node:assert/strict';
import { computeListeningSummary, formatDurationTotal, formatTimecode, pluralRu } from './stats';
import type { ListeningEvent, Track } from '../types/music';

test('formats total durations, timecodes, and Russian plural forms accurately', () => {
  assert.equal(formatDurationTotal(4500).label, '1 ч 15 мин');
  assert.equal(formatDurationTotal(1800).label, '30 мин');
  assert.equal(formatTimecode(65), '1:05');
  assert.equal(formatTimecode(0), '0:00');
  assert.equal(pluralRu(1, 'трек', 'трека', 'треков'), '1 трек');
  assert.equal(pluralRu(3, 'коллекция', 'коллекции', 'коллекций'), '3 коллекции');
  assert.equal(pluralRu(4, 'трек', 'трека', 'треков'), '4 трека');
  assert.equal(pluralRu(11, 'трек', 'трека', 'треков'), '11 треков');
});

test('aggregates listening summary with genre percentages, top artists, and weekdays', () => {
  const events: ListeningEvent[] = [
    {
      id: 'e1',
      trackId: 't1',
      artist: 'Kiasmos',
      genre: 'Эмбиент',
      listenedSec: 300,
      timestamp: '2026-11-16T10:00:00Z',
      weekday: 0,
    },
    {
      id: 'e2',
      trackId: 't1',
      artist: 'Kiasmos',
      genre: 'Эмбиент',
      listenedSec: 300,
      timestamp: '2026-11-17T10:00:00Z',
      weekday: 1,
    },
    {
      id: 'e3',
      trackId: 't2',
      artist: 'GoGo Penguin',
      genre: 'Джаз',
      listenedSec: 200,
      timestamp: '2026-11-17T14:00:00Z',
      weekday: 1,
    },
  ];

  const tracksById = {
    t1: { id: 't1', title: 'Looped', artist: 'Kiasmos' } as Track,
    t2: { id: 't2', title: 'Hopopono', artist: 'GoGo Penguin' } as Track,
  };

  const summary = computeListeningSummary(events, tracksById);
  assert.equal(summary.totalSeconds, 800);
  assert.equal(summary.totalPlays, 3);
  assert.equal(summary.uniqueArtists, 2);
  assert.equal(summary.streakDays, 2);
  assert.equal(summary.topGenres[0].genre, 'Эмбиент');
  assert.equal(summary.topGenres[0].percentage, 75);
  assert.equal(summary.topTracks[0].trackId, 't1');
  assert.equal(summary.topTracks[0].plays, 2);
  assert.equal(summary.weekdayActivity[1].plays, 2);
});
