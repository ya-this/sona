import type {
  AudioPlugin,
  CrossfadeSettings,
  HeadphonePreset,
  ListeningEvent,
  PlaybackDevice,
  Playlist,
  Track,
  UiCustomization,
} from '../types/music';

export const COVER_ART = {
  northernStatic: '/src/assets/images/album_northern_static_1795104109379.jpg',
  amberNocturne: '/src/assets/images/album_amber_nocturne_1795104110215.jpg',
  velvetHorizon: '/src/assets/images/album_velvet_horizon_1795104110640.jpg',
  ceramicEcho: '/src/assets/images/album_ceramic_echo_1795104110283.jpg',
  solsticeTape: '/src/assets/images/album_solstice_tape_1795104111837.jpg',
} as const;

export const SEED_TRACKS: Track[] = [];

export const SEED_PLAYLISTS: Playlist[] = [];

export const HEADPHONE_PRESETS: HeadphonePreset[] = [
  {
    id: 'flat',
    name: 'Студийные мониторы (Flat)',
    category: 'Эталон',
    description: 'Линейная АЧХ без окрашивания для студийного мониторинга.',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 'sony-xm5',
    name: 'Sony WH-1000XM5',
    category: 'Полноразмерные ANC',
    description: 'Убирает гул мид-баса 125–250 Гц и раскрывает ясность вокала.',
    bands: [-1.5, -2.5, -3.0, -1.5, 0.5, 1.5, 2.0, 2.5, 1.5, 1.0],
  },
  {
    id: 'airpods-pro2',
    name: 'Apple AirPods Pro 2',
    category: 'TWS Внутриканальные',
    description: 'Мягкая компенсация суббаса и расширение воздушных верхних частот.',
    bands: [1.5, 1.0, 0, -0.5, 0.5, 1.0, 1.5, 0.5, 2.0, 2.5],
  },
  {
    id: 'sennheiser-hd650',
    name: 'Sennheiser HD 650',
    category: 'Открытые аудиофильские',
    description: 'Подъём глубокого суббаса 32–64 Гц и деликатный воздух выше 8 кГц.',
    bands: [4.5, 3.0, 1.0, -0.5, 0, 0, 0.5, 1.5, 2.5, 3.0],
  },
  {
    id: 'beyerdynamic-dt990',
    name: 'Beyerdynamic DT 990 Pro',
    category: 'Студийные открытые',
    description: 'Смягчает характерный пик сибилянтов в районе 8 кГц.',
    bands: [2.0, 1.5, 0, -0.5, 0.5, 1.0, 0.5, -1.5, -4.0, -1.5],
  },
  {
    id: 'iem-smooth',
    name: 'Арматурные IEM (Мягкий верх)',
    category: 'IEM',
    description: 'Тёплая середина и комфортное длительное прослушивание без усталости.',
    bands: [2.0, 1.5, 1.0, 0.5, 0, -0.5, -1.0, -1.5, -1.0, 0.5],
  },
  {
    id: 'bass-deep',
    name: 'Глубокий бас (Клубный)',
    category: 'Усиление НЧ',
    description: 'Плотный суббас без перекрытия вокального диапазона.',
    bands: [5.5, 4.5, 2.5, 0.5, -0.5, 0, 0.5, 1.5, 2.0, 1.5],
  },
];

export const INITIAL_PLUGINS: AudioPlugin[] = [
  {
    id: 'spatial-stage',
    name: 'Пространственная сцена',
    author: 'Sona Acoustics',
    category: 'Пространство',
    description: 'Расширяет стереобазу и выносит инструменты за пределы чаш наушников.',
    enabled: true,
    installed: true,
    intensity: 38,
    version: '1.4.0',
  },
  {
    id: 'tube-warmth',
    name: 'Аналоговая теплота',
    author: 'Klang DSP',
    category: 'Окрас',
    description: 'Деликатное ламповое насыщение чётными гармониками для мягкой атаки.',
    enabled: false,
    installed: true,
    intensity: 45,
    version: '2.1.3',
  },
  {
    id: 'dynamic-norm',
    name: 'Динамический нормализатор',
    author: 'Sona Core',
    category: 'Динамика',
    description: 'Выравнивает громкость между треками разных эпох без потери микродинамики.',
    enabled: true,
    installed: true,
    intensity: 52,
    version: '1.8.2',
  },
  {
    id: 'crystal-exciter',
    name: 'Кристальный эксайтер',
    author: 'Nordic Audio Lab',
    category: 'Детализация',
    description: 'Возвращает высокочастотные обертоны сжатым MP3 и потоковым файлам.',
    enabled: false,
    installed: true,
    intensity: 40,
    version: '1.2.1',
  },
  {
    id: 'acoustic-reverb',
    name: 'Акустическая комната',
    author: 'Studio Impulse',
    category: 'Реверберация',
    description: 'Естественное отражение деревянной комнаты прослушивания с импульсным откликом.',
    enabled: false,
    installed: true,
    intensity: 28,
    version: '1.0.8',
  },
  {
    id: 'vinyl-master',
    name: 'Мастеринг-лимитер TruePeak',
    author: 'OpenAudio Community',
    category: 'Динамика',
    description: 'Защищает от цифрового клиппинга при экстремальных настройках эквалайзера.',
    enabled: false,
    installed: false,
    intensity: 60,
    version: '0.9.4',
  },
];

export const INITIAL_CROSSFADE: CrossfadeSettings = {
  gapless: true,
  enabled: true,
  durationSec: 4,
  curve: 'equal-power',
  bpmSync: true,
};

export const SEED_LISTENING_EVENTS: ListeningEvent[] = [];

export const INITIAL_UI_CUSTOMIZATION: UiCustomization = {
  theme: 'dark',
  accent: 'blue',
  density: 'balanced',
  radius: 'organic',
  compactSidebar: false,
  showVisualizer: true,
  showCoversInTable: true,
  showAudioBadge: true,
};

export const INITIAL_DEVICES: PlaybackDevice[] = [
  {
    id: 'dev-system',
    name: 'Системный аудиовыход',
    platform: 'Web',
    outputDriver: 'Web Audio API · 32-bit Float',
    active: true,
  },
  {
    id: 'dev-dac',
    name: 'Наушники / USB DAC',
    platform: 'Windows 11',
    outputDriver: 'Direct Output · 96 кГц',
    active: false,
  },
  {
    id: 'dev-monitors',
    name: 'Студийные мониторы',
    platform: 'macOS',
    outputDriver: 'Line Out · 48 кГц',
    active: false,
  },
];
