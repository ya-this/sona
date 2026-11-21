import type { SynthRecipe, Track } from '../types/music';

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'mp3',
  'flac',
  'wav',
  'ogg',
  'oga',
  'm4a',
  'aac',
  'opus',
  'webm',
  'alac',
  'aiff',
  'aif',
]);

export function getFileExtension(fileName: string): string {
  const clean = fileName.trim();
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

export function isSupportedAudioFile(fileName: string, mimeType = ''): boolean {
  const ext = getFileExtension(fileName);
  if (SUPPORTED_AUDIO_EXTENSIONS.has(ext)) return true;
  return mimeType.toLowerCase().startsWith('audio/');
}

export function detectAudioCodec(fileName: string, mimeType = ''): string {
  const ext = getFileExtension(fileName);
  const mime = mimeType.toLowerCase();

  if (ext === 'flac' || mime.includes('flac')) return 'FLAC · Локальный';
  if (ext === 'wav' || mime.includes('wav')) return 'WAV · Локальный';
  if (ext === 'alac' || ext === 'aiff' || ext === 'aif') return `${ext.toUpperCase()} · Локальный`;
  if (ext === 'mp3' || mime.includes('mpeg')) return 'MP3 · Локальный';
  if (ext === 'm4a' || ext === 'aac' || mime.includes('mp4') || mime.includes('aac')) {
    return 'AAC / M4A · Локальный';
  }
  if (ext === 'opus' || mime.includes('opus')) return 'OPUS · Локальный';
  if (ext === 'ogg' || ext === 'oga' || mime.includes('ogg')) return 'OGG · Локальный';
  if (ext === 'webm' || mime.includes('webm')) return 'WEBM · Локальный';
  return 'Аудио · Локальный';
}

export function parseAudioFileName(fileName: string): { artist: string; title: string } {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '').trim();
  const normalized = withoutExt
    .replace(/_/g, ' ')
    .replace(/^\d{1,3}\s*[-.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return { artist: 'Локальный файл', title: 'Без названия' };
  }

  const separators = [' — ', ' – ', ' - '];
  for (const sep of separators) {
    const idx = normalized.indexOf(sep);
    if (idx > 0 && idx < normalized.length - sep.length) {
      const artist = normalized.slice(0, idx).trim();
      const title = normalized.slice(idx + sep.length).trim();
      if (artist && title) {
        return { artist, title };
      }
    }
  }

  return { artist: 'Локальный файл', title: normalized };
}

export const DEFAULT_FALLBACK_SYNTH: SynthRecipe = {
  rootMidi: 57,
  chords: [
    [0, 3, 7],
    [-2, 2, 5],
  ],
  bpm: 100,
  wave: 'sine',
  padWave: 'triangle',
  brightness: 1300,
  arpPattern: [0, 1, 2, 1],
  pulseStyle: 'minimal',
};

export interface BuildLocalTrackInput {
  id: string;
  fileName: string;
  mimeType?: string;
  durationSec: number;
  sizeMb: number;
  coverUrl: string;
  localFileKey: string;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  bpm?: number;
  lyrics?: Track['lyrics'];
  metadataMatched?: boolean;
}

export function buildLocalTrackFromFile(input: BuildLocalTrackInput): Track {
  const parsed = parseAudioFileName(input.fileName);
  const safeDuration = Number.isFinite(input.durationSec) && input.durationSec > 1
    ? Math.round(input.durationSec)
    : 180;

  return {
    id: input.id,
    title: input.title?.trim() || parsed.title,
    artist: input.artist?.trim() || parsed.artist,
    album: input.album?.trim() || 'Локальные файлы',
    genre: input.genre?.trim() || 'Локальный файл',
    year:
      typeof input.year === 'number' && Number.isFinite(input.year) && input.year > 1900
        ? Math.round(input.year)
        : new Date().getFullYear(),
    durationSec: safeDuration,
    bpm:
      typeof input.bpm === 'number' && Number.isFinite(input.bpm) && input.bpm > 20
        ? Math.round(input.bpm)
        : 100,
    codec: detectAudioCodec(input.fileName, input.mimeType),
    coverUrl: input.coverUrl,
    source: 'local',
    liked: false,
    offlineAvailable: true,
    offlineSizeMb: Math.max(0.01, Number(input.sizeMb.toFixed(2))),
    localFileKey: input.localFileKey,
    originalFileName: input.fileName,
    metadataMatched: Boolean(input.metadataMatched),
    lyrics: Array.isArray(input.lyrics) ? input.lyrics : [],
    synth: DEFAULT_FALLBACK_SYNTH,
  };
}

export function exportPlaylistToM3u8(playlistName: string, tracks: Track[]): string {
  const safeName = playlistName.trim() || 'Плейлист Sona';
  const lines: string[] = ['#EXTM3U', `#PLAYLIST:${safeName}`];

  for (const track of tracks) {
    const dur = Math.max(1, Math.round(track.durationSec));
    lines.push(`#EXTINF:${dur},${track.artist} - ${track.title}`);
    if (track.album) {
      lines.push(`#EXTALB:${track.album}`);
    }
    const safeSlug = `${track.artist} - ${track.title}`.replace(/[\\/:*?"<>|]/g, '_');
    lines.push(`${safeSlug}.flac`);
  }

  return `${lines.join('\n')}\n`;
}
