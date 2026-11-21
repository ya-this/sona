import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INITIAL_CROSSFADE,
  INITIAL_PLUGINS,
  INITIAL_UI_CUSTOMIZATION,
  SEED_LISTENING_EVENTS,
  SEED_PLAYLISTS,
  SEED_TRACKS,
} from '../data/seedCatalog.ts';
import {
  sanitizeStoredCrossfade,
  sanitizeStoredEqBands,
  sanitizeStoredEvents,
  sanitizeStoredPlaylists,
  sanitizeStoredPlugins,
  sanitizeStoredTracks,
  sanitizeStoredUi,
} from './storageSanitizers.ts';

test('sanitizeStoredTracks strips legacy builtin tracks and keeps only user-uploaded local tracks', () => {
  assert.deepEqual(sanitizeStoredTracks(null, SEED_TRACKS), []);
  assert.deepEqual(sanitizeStoredTracks({ broken: true }, SEED_TRACKS), []);

  const mixed = sanitizeStoredTracks(
    [
      { id: 'tr-1', source: 'builtin', title: 'Old Demo' },
      { id: 'tr-local-1', source: 'local', title: 'My Track' },
      { id: 'tr-local-partial', source: 'local' },
      { nope: true },
    ],
    SEED_TRACKS
  );
  assert.equal(mixed.length, 2);
  assert.equal(mixed[0].id, 'tr-local-1');
  assert.equal(mixed[1].title, 'Без названия');
  assert.equal(mixed[1].artist, 'Локальный файл');
  assert.equal(mixed[1].codec, 'AUDIO');
  assert.ok(Array.isArray(mixed[1].lyrics));
  assert.ok(Array.isArray(mixed[1].synth.chords));
});

test('sanitizeStoredPlaylists strips legacy seed playlists and builtin track IDs', () => {
  assert.deepEqual(sanitizeStoredPlaylists(null, SEED_PLAYLISTS), []);
  const res = sanitizeStoredPlaylists(
    [
      { id: 'pl-focus', name: 'Глубокий фокус', trackIds: ['tr-1', 'tr-4'] },
      { id: 'pl-1', name: 'Мой', trackIds: ['tr-1', 'tr-local-9'] },
      { id: 'pl-2', name: 'Пустой' },
    ],
    SEED_PLAYLISTS
  );
  assert.equal(res.length, 2);
  assert.equal(res[0].id, 'pl-1');
  assert.deepEqual(res[0].trackIds, ['tr-local-9']);
  assert.deepEqual(res[1].trackIds, []);
});

test('sanitizeStoredUi, eqBands, crossfade, plugins, events handle corrupted payloads and strip legacy seed events', () => {
  assert.deepEqual(sanitizeStoredUi(null, INITIAL_UI_CUSTOMIZATION), INITIAL_UI_CUSTOMIZATION);
  assert.equal(
    sanitizeStoredUi({ theme: 'sepia' }, INITIAL_UI_CUSTOMIZATION).theme,
    INITIAL_UI_CUSTOMIZATION.theme
  );

  assert.equal(sanitizeStoredEqBands(null).length, 10);
  assert.equal(sanitizeStoredEqBands([99, 'bad'])[0], 12);
  assert.equal(sanitizeStoredEqBands([99, 'bad'])[1], 0);

  assert.deepEqual(sanitizeStoredCrossfade(null, INITIAL_CROSSFADE), INITIAL_CROSSFADE);
  assert.deepEqual(sanitizeStoredPlugins(null, INITIAL_PLUGINS), INITIAL_PLUGINS);
  assert.deepEqual(sanitizeStoredEvents(null, SEED_LISTENING_EVENTS), []);

  const events = sanitizeStoredEvents(
    [
      { id: 'le-1', trackId: 'tr-1', listenedSec: 200 },
      { id: 'ev-user-1', trackId: 'tr-local-1', listenedSec: 120 },
    ],
    SEED_LISTENING_EVENTS
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'ev-user-1');
});
