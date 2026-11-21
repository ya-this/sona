export type NavTab = 'home' | 'playlists' | 'sound' | 'karaoke' | 'stats';

export type RepeatMode = 'off' | 'all' | 'one';

export type TrackSource = 'builtin' | 'local';

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface SynthRecipe {
  rootMidi: number;
  chords: number[][]; // semitone offsets per bar
  bpm: number;
  wave: OscillatorType;
  padWave: OscillatorType;
  brightness: number; // filter cutoff Hz
  arpPattern: number[];
  pulseStyle: 'ambient' | 'lofi' | 'electronic' | 'piano' | 'minimal';
}

export interface MetadataCandidate {
  id: string;
  source: 'itunes' | 'deezer' | 'musicbrainz';
  title: string;
  artist: string;
  album: string;
  year: number; // 0 if unknown
  genre: string;
  coverUrl: string;
  durationSec?: number;
  bpm?: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  durationSec: number;
  bpm: number;
  codec: string;
  coverUrl: string;
  source: TrackSource;
  liked: boolean;
  offlineAvailable: boolean;
  offlineSizeMb: number;
  localFileKey?: string; // IndexedDB key for user-uploaded real audio
  originalFileName?: string;
  metadataMatched?: boolean;
  lyrics: LyricLine[];
  synth: SynthRecipe;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  trackIds: string[];
  createdAt: string;
  isAutoLiked?: boolean;
  isAutoAll?: boolean;
}

export interface HeadphonePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  bands: number[]; // 10 bands in dB (-12 to +12)
}

export interface AudioPlugin {
  id: string;
  name: string;
  author: string;
  category: 'Пространство' | 'Окрас' | 'Динамика' | 'Детализация' | 'Реверберация';
  description: string;
  enabled: boolean;
  installed: boolean;
  intensity: number; // 0 to 100
  version: string;
}

export interface CrossfadeSettings {
  gapless: boolean;
  enabled: boolean;
  durationSec: number; // 0 to 12
  curve: 'equal-power' | 'linear';
  bpmSync: boolean;
}

export interface ListeningEvent {
  id: string;
  trackId: string;
  artist: string;
  genre: string;
  listenedSec: number;
  timestamp: string; // ISO date
  weekday: number; // 0 (Mon) - 6 (Sun)
}

export type AccentTheme = 'blue' | 'emerald' | 'amber' | 'rose' | 'mono';
export type DensityMode = 'compact' | 'balanced' | 'spacious';
export type RadiusStyle = 'sharp' | 'soft' | 'organic';

export interface UiCustomization {
  theme: 'dark' | 'light';
  accent: AccentTheme;
  density: DensityMode;
  radius: RadiusStyle;
  compactSidebar: boolean;
  showVisualizer: boolean;
  showCoversInTable: boolean;
  showAudioBadge: boolean;
}

export interface PlaybackDevice {
  id: string;
  name: string;
  platform: 'Windows 11' | 'macOS' | 'iOS' | 'Android' | 'Web';
  outputDriver: string;
  active: boolean;
}
