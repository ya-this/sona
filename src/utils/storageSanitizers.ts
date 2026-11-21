import type {
  AudioPlugin,
  CrossfadeSettings,
  ListeningEvent,
  Playlist,
  Track,
  UiCustomization,
} from '../types/music';
import { clampEqDb } from './audioLogic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LEGACY_BUILTIN_TRACK_IDS = new Set([
  'tr-1',
  'tr-2',
  'tr-3',
  'tr-4',
  'tr-5',
  'tr-6',
  'tr-7',
  'tr-8',
  'tr-9',
  'tr-10',
]);
const LEGACY_SEED_PLAYLIST_IDS = new Set(['pl-focus', 'pl-night', 'pl-road']);
const LEGACY_SEED_EVENT_PATTERN = /^le-(?:[1-9]|1[0-7])$/;

export function sanitizeStoredTracks(raw: unknown, fallback: Track[]): Track[] {
  if (!Array.isArray(raw)) return fallback;
  const fallbackSynth = fallback[0]?.synth ?? {
    rootMidi: 57,
    chords: [[0, 3, 7]],
    bpm: 90,
    wave: 'sine' as const,
    padWave: 'triangle' as const,
    brightness: 1400,
    arpPattern: [0, -1, 1, 2],
    pulseStyle: 'ambient' as const,
  };

  const valid: Track[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) continue;
    // Only keep user-uploaded/imported local tracks; strip any legacy built-in demo tracks
    if (item.source !== 'local' || LEGACY_BUILTIN_TRACK_IDS.has(item.id)) continue;

    const synthRaw = isRecord(item.synth) ? item.synth : null;
    const synth =
      synthRaw &&
      typeof synthRaw.rootMidi === 'number' &&
      Array.isArray(synthRaw.chords) &&
      typeof synthRaw.bpm === 'number' &&
      Array.isArray(synthRaw.arpPattern)
        ? (synthRaw as unknown as Track['synth'])
        : fallbackSynth;

    valid.push({
      id: item.id,
      title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Без названия',
      artist:
        typeof item.artist === 'string' && item.artist.trim() ? item.artist : 'Локальный файл',
      album: typeof item.album === 'string' && item.album.trim() ? item.album : 'Локальная коллекция',
      genre: typeof item.genre === 'string' && item.genre.trim() ? item.genre : 'Локальное аудио',
      year:
        typeof item.year === 'number' && Number.isFinite(item.year)
          ? item.year
          : new Date().getFullYear(),
      durationSec:
        typeof item.durationSec === 'number' && Number.isFinite(item.durationSec) && item.durationSec > 0
          ? item.durationSec
          : 180,
      bpm:
        typeof item.bpm === 'number' && Number.isFinite(item.bpm) && item.bpm > 0
          ? item.bpm
          : 100,
      codec: typeof item.codec === 'string' && item.codec.trim() ? item.codec : 'AUDIO',
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : '',
      source: 'local',
      liked: Boolean(item.liked),
      offlineAvailable: item.offlineAvailable !== false,
      offlineSizeMb:
        typeof item.offlineSizeMb === 'number' && Number.isFinite(item.offlineSizeMb)
          ? item.offlineSizeMb
          : 0,
      localFileKey: typeof item.localFileKey === 'string' ? item.localFileKey : undefined,
      originalFileName:
        typeof item.originalFileName === 'string' ? item.originalFileName : undefined,
      metadataMatched:
        typeof item.metadataMatched === 'boolean' ? item.metadataMatched : undefined,
      lyrics: Array.isArray(item.lyrics)
        ? item.lyrics.filter(
            (l): l is { time: number; text: string } =>
              isRecord(l) && typeof l.time === 'number' && typeof l.text === 'string'
          )
        : [],
      synth,
    });
  }

  return valid;
}

export function sanitizeStoredPlaylists(raw: unknown, fallback: Playlist[]): Playlist[] {
  if (!Array.isArray(raw)) return fallback;
  const valid: Playlist[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) continue;
    const filteredIds = Array.isArray(item.trackIds)
      ? item.trackIds.filter(
          (id): id is string => typeof id === 'string' && !LEGACY_BUILTIN_TRACK_IDS.has(id)
        )
      : [];
    if (LEGACY_SEED_PLAYLIST_IDS.has(item.id) && filteredIds.length === 0) continue;

    valid.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Плейлист',
      description: typeof item.description === 'string' ? item.description : '',
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl : fallback[0]?.coverUrl ?? '',
      trackIds: filteredIds,
      createdAt:
        typeof item.createdAt === 'string'
          ? item.createdAt
          : new Date().toISOString().slice(0, 10),
      isAutoLiked: typeof item.isAutoLiked === 'boolean' ? item.isAutoLiked : undefined,
    });
  }
  return valid;
}

export function sanitizeStoredEvents(raw: unknown, fallback: ListeningEvent[]): ListeningEvent[] {
  if (!Array.isArray(raw)) return fallback;
  const valid: ListeningEvent[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    if (
      LEGACY_SEED_EVENT_PATTERN.test(item.id) ||
      (typeof item.trackId === 'string' && LEGACY_BUILTIN_TRACK_IDS.has(item.trackId))
    ) {
      continue;
    }
    valid.push({
      id: item.id,
      trackId: typeof item.trackId === 'string' ? item.trackId : '',
      artist: typeof item.artist === 'string' ? item.artist : 'Исполнитель',
      genre: typeof item.genre === 'string' ? item.genre : 'Аудио',
      listenedSec:
        typeof item.listenedSec === 'number' && Number.isFinite(item.listenedSec)
          ? Math.max(0, item.listenedSec)
          : 0,
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
      weekday:
        typeof item.weekday === 'number' && Number.isFinite(item.weekday)
          ? Math.trunc(item.weekday)
          : 0,
    });
  }
  return valid;
}

export function sanitizeStoredUi(raw: unknown, fallback: UiCustomization): UiCustomization {
  if (!isRecord(raw)) return fallback;
  return {
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : fallback.theme,
    accent:
      raw.accent === 'blue' ||
      raw.accent === 'emerald' ||
      raw.accent === 'amber' ||
      raw.accent === 'rose' ||
      raw.accent === 'mono'
        ? raw.accent
        : fallback.accent,
    density:
      raw.density === 'compact' || raw.density === 'balanced' || raw.density === 'spacious'
        ? raw.density
        : fallback.density,
    radius:
      raw.radius === 'sharp' || raw.radius === 'soft' || raw.radius === 'organic'
        ? raw.radius
        : fallback.radius,
    compactSidebar:
      typeof raw.compactSidebar === 'boolean' ? raw.compactSidebar : fallback.compactSidebar,
    showVisualizer:
      typeof raw.showVisualizer === 'boolean' ? raw.showVisualizer : fallback.showVisualizer,
    showCoversInTable:
      typeof raw.showCoversInTable === 'boolean'
        ? raw.showCoversInTable
        : fallback.showCoversInTable,
    showAudioBadge:
      typeof raw.showAudioBadge === 'boolean' ? raw.showAudioBadge : fallback.showAudioBadge,
  };
}

export function sanitizeStoredEqBands(raw: unknown): number[] {
  if (!Array.isArray(raw)) return Array(10).fill(0);
  return Array.from({ length: 10 }, (_, idx) => {
    const val = raw[idx];
    return typeof val === 'number' && Number.isFinite(val) ? clampEqDb(val) : 0;
  });
}

export function sanitizeStoredPlugins(raw: unknown, fallback: AudioPlugin[]): AudioPlugin[] {
  if (!Array.isArray(raw)) return fallback;
  const fallbackMap = new Map(fallback.map((p) => [p.id, p]));
  const valid: AudioPlugin[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    const base = fallbackMap.get(item.id);
    if (!base) continue;
    valid.push({
      ...base,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : base.enabled,
      installed: typeof item.installed === 'boolean' ? item.installed : base.installed,
      intensity:
        typeof item.intensity === 'number' && Number.isFinite(item.intensity)
          ? Math.max(0, Math.min(100, item.intensity))
          : base.intensity,
    });
  }
  return valid.length > 0 ? valid : fallback;
}

export function sanitizeStoredCrossfade(
  raw: unknown,
  fallback: CrossfadeSettings
): CrossfadeSettings {
  if (!isRecord(raw)) return fallback;
  return {
    gapless: typeof raw.gapless === 'boolean' ? raw.gapless : fallback.gapless,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    durationSec:
      typeof raw.durationSec === 'number' && Number.isFinite(raw.durationSec)
        ? Math.max(0, Math.min(12, raw.durationSec))
        : fallback.durationSec,
    curve:
      raw.curve === 'equal-power' || raw.curve === 'linear' ? raw.curve : fallback.curve,
    bpmSync: typeof raw.bpmSync === 'boolean' ? raw.bpmSync : fallback.bpmSync,
  };
}
