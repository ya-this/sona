import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import type {
  AudioPlugin,
  CrossfadeSettings,
  ListeningEvent,
  LyricLine,
  NavTab,
  PlaybackDevice,
  Playlist,
  RepeatMode,
  Track,
  UiCustomization,
} from './types/music';
import {
  COVER_ART,
  HEADPHONE_PRESETS,
  INITIAL_CROSSFADE,
  INITIAL_DEVICES,
  INITIAL_PLUGINS,
  INITIAL_UI_CUSTOMIZATION,
  SEED_LISTENING_EVENTS,
  SEED_PLAYLISTS,
  SEED_TRACKS,
} from './data/seedCatalog';
import { computeListeningSummary } from './utils/stats';
import { clampEqDb, computeTransitionPlan, resolveNextTrackIndex } from './utils/audioLogic';
import {
  ALL_TRACKS_PLAYLIST_ID,
  buildAllUploadedPlaylist,
  buildLikedPlaylist,
  LIKED_PLAYLIST_ID,
  toggleTrackLikeInList,
} from './utils/likedPlaylist';
import {
  buildLocalTrackFromFile,
  DEFAULT_FALLBACK_SYNTH,
  exportPlaylistToM3u8,
  isSupportedAudioFile,
} from './utils/localAudioFiles';
import { readMp3Id3Tags } from './utils/id3Parser';
import { resizeImageFileToCoverDataUrl } from './utils/imageResize';
import {
  sanitizeStoredCrossfade,
  sanitizeStoredEqBands,
  sanitizeStoredEvents,
  sanitizeStoredPlaylists,
  sanitizeStoredPlugins,
  sanitizeStoredTracks,
  sanitizeStoredUi,
} from './utils/storageSanitizers';
import { parseExternalPlaylist } from './utils/playlistParser';
import {
  deleteLocalAudioFile,
  getOfflineStorageStats,
  saveLocalAudioFile,
} from './storage/offlineDb';
import { sonaAudioEngine } from './audio/engine';
import { TopGlassNav } from './components/TopGlassNav';
import { PlayerBar } from './components/PlayerBar';
import { QueueDrawer } from './components/QueueDrawer';
import { HomeView } from './components/HomeView';
import { PlaylistsView } from './components/PlaylistsView';
import { SoundLabView } from './components/SoundLabView';
import { KaraokeView } from './components/KaraokeView';
import { StatsView } from './components/StatsView';
import { LocalUploadModal, type StagedUploadPayload } from './components/LocalUploadModal';
import { MetadataLookupModal } from './components/MetadataLookupModal';
import { TerrainContourSurface } from './components/ui/terrain-contour';
import { lookupOriginalMetadataForTrack } from './utils/metadataClient';

function loadStored<T>(
  key: string,
  fallback: T,
  sanitize?: (raw: unknown, fb: T) => T
): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return sanitize ? sanitize(parsed, fallback) : (parsed as T);
  } catch {
    return fallback;
  }
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      URL.revokeObjectURL(url);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 1 ? audio.duration : 180;
      cleanup();
      resolve(dur);
    };
    audio.onerror = () => {
      cleanup();
      resolve(180);
    };
    audio.src = url;
  });
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>(() =>
    loadStored('sona_local_tracks_v1', SEED_TRACKS, sanitizeStoredTracks)
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    loadStored('sona_local_playlists_v1', SEED_PLAYLISTS, sanitizeStoredPlaylists)
  );
  const [listeningEvents, setListeningEvents] = useState<ListeningEvent[]>(() =>
    loadStored('sona_events_v4', SEED_LISTENING_EVENTS, sanitizeStoredEvents)
  );
  const [ui, setUi] = useState<UiCustomization>(() =>
    loadStored('sona_ui_v4', INITIAL_UI_CUSTOMIZATION, sanitizeStoredUi)
  );

  // Audio DSP state
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() =>
    loadStored('sona_eq_preset_v4', 'flat', (raw, fb) =>
      typeof raw === 'string' && raw.trim() ? raw : fb
    )
  );
  const [eqBands, setEqBands] = useState<number[]>(() =>
    loadStored('sona_eq_bands_v4', Array(10).fill(0), (raw) => sanitizeStoredEqBands(raw))
  );
  const [preampDb, setPreampDb] = useState<number>(() =>
    loadStored('sona_preamp_v4', 0, (raw, fb) =>
      typeof raw === 'number' && Number.isFinite(raw) ? clampEqDb(raw) : fb
    )
  );
  const [plugins, setPlugins] = useState<AudioPlugin[]>(() =>
    loadStored('sona_plugins_v4', INITIAL_PLUGINS, sanitizeStoredPlugins)
  );
  const [crossfade, setCrossfade] = useState<CrossfadeSettings>(() =>
    loadStored('sona_crossfade_v4', INITIAL_CROSSFADE, sanitizeStoredCrossfade)
  );
  const [karaokeMinus, setKaraokeMinus] = useState(false);

  // Local output devices & offline storage stats
  const [devices, setDevices] = useState<PlaybackDevice[]>(INITIAL_DEVICES);
  const [offlineStorage, setOfflineStorage] = useState<{ files: number; totalMb: number }>({
    files: 0,
    totalMb: 0,
  });
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Navigation & UI overlays
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueOpen, setQueueOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [metadataModalTrack, setMetadataModalTrack] = useState<Track | null>(null);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [newPlCoverUrl, setNewPlCoverUrl] = useState('');
  const [newPlCoverError, setNewPlCoverError] = useState<string | null>(null);
  const [autoPlaylistCovers, setAutoPlaylistCovers] = useState<Record<string, string>>(() =>
    loadStored('sona_auto_playlist_covers_v1', {}, (raw, fb) => {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fb;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) out[k] = v;
      }
      return out;
    })
  );

  // Playback state
  const [queueIds, setQueueIds] = useState<string[]>(() => tracks.map((t) => t.id));
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(tracks[0]?.id ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.78);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('all');

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const playlistInputRef = useRef<HTMLInputElement | null>(null);
  const newPlCoverInputRef = useRef<HTMLInputElement | null>(null);
  const listenedAccumRef = useRef(0);
  const importTimerRef = useRef<number | null>(null);
  const autoSteppedTrackKeyRef = useRef<string | null>(null);
  const attemptedAutoLookupRef = useRef<Set<string>>(new Set());
  const [enrichingTrackIds, setEnrichingTrackIds] = useState<Record<string, boolean>>({});

  const showImportNotice = useCallback((message: string) => {
    setImportMessage(message);
    if (importTimerRef.current !== null) {
      window.clearTimeout(importTimerRef.current);
    }
    importTimerRef.current = window.setTimeout(() => {
      setImportMessage(null);
      importTimerRef.current = null;
    }, 3600);
  }, []);

  const refreshOfflineStats = useCallback(async () => {
    const next = await getOfflineStorageStats();
    setOfflineStorage(next);
  }, []);

  useEffect(() => {
    void refreshOfflineStats();
  }, [refreshOfflineStats]);

  const tracksById = useMemo(() => {
    const map: Record<string, Track> = {};
    for (const t of tracks) map[t.id] = t;
    return map;
  }, [tracks]);

  // Automatic All Uploaded Tracks Playlist synced dynamically with uploaded tracks
  const allTracksPlaylist = useMemo(
    () =>
      buildAllUploadedPlaylist(
        tracks,
        COVER_ART.northernStatic,
        autoPlaylistCovers[ALL_TRACKS_PLAYLIST_ID]
      ),
    [tracks, autoPlaylistCovers]
  );

  // Automatic Liked Songs Playlist synced dynamically with track likes
  const likedPlaylist = useMemo(
    () =>
      buildLikedPlaylist(
        tracks,
        COVER_ART.northernStatic,
        autoPlaylistCovers[LIKED_PLAYLIST_ID]
      ),
    [tracks, autoPlaylistCovers]
  );

  const currentTrack = currentTrackId ? tracksById[currentTrackId] ?? null : null;
  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    if (selectedPlaylistId === ALL_TRACKS_PLAYLIST_ID) return allTracksPlaylist;
    if (selectedPlaylistId === LIKED_PLAYLIST_ID) return likedPlaylist;
    return playlists.find((p) => p.id === selectedPlaylistId) ?? null;
  }, [selectedPlaylistId, allTracksPlaylist, likedPlaylist, playlists]);

  const queueTracks = useMemo(
    () => queueIds.map((id) => tracksById[id]).filter((t): t is Track => Boolean(t)),
    [queueIds, tracksById]
  );

  const listeningStats = useMemo(
    () => computeListeningSummary(listeningEvents, tracksById),
    [listeningEvents, tracksById]
  );

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab, selectedPlaylistId]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', ui.theme === 'dark');
  }, [ui.theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('sona_local_tracks_v1', JSON.stringify(tracks));
      window.localStorage.setItem('sona_local_playlists_v1', JSON.stringify(playlists));
      window.localStorage.setItem(
        'sona_auto_playlist_covers_v1',
        JSON.stringify(autoPlaylistCovers)
      );
      window.localStorage.setItem('sona_events_v4', JSON.stringify(listeningEvents));
      window.localStorage.setItem('sona_ui_v4', JSON.stringify(ui));
      window.localStorage.setItem('sona_eq_preset_v4', JSON.stringify(selectedPresetId));
      window.localStorage.setItem('sona_eq_bands_v4', JSON.stringify(eqBands));
      window.localStorage.setItem('sona_preamp_v4', JSON.stringify(preampDb));
      window.localStorage.setItem('sona_plugins_v4', JSON.stringify(plugins));
      window.localStorage.setItem('sona_crossfade_v4', JSON.stringify(crossfade));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    tracks,
    playlists,
    autoPlaylistCovers,
    listeningEvents,
    ui,
    selectedPresetId,
    eqBands,
    preampDb,
    plugins,
    crossfade,
  ]);

  useEffect(() => {
    sonaAudioEngine.setVolume(volume, muted);
  }, [volume, muted]);

  useEffect(() => {
    sonaAudioEngine.setEqualizer(eqBands, preampDb);
  }, [eqBands, preampDb]);

  useEffect(() => {
    sonaAudioEngine.setPlugins(plugins);
  }, [plugins]);

  useEffect(() => {
    sonaAudioEngine.setKaraokeMinus(karaokeMinus);
  }, [karaokeMinus]);

  const recordListeningEvent = useCallback((track: Track, seconds: number) => {
    if (seconds <= 0) return;
    const now = new Date();
    const weekday = (now.getDay() + 6) % 7;
    const event: ListeningEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trackId: track.id,
      artist: track.artist,
      genre: track.genre,
      listenedSec: seconds,
      timestamp: now.toISOString(),
      weekday,
    };
    setListeningEvents((prev) => [...prev, event]);
  }, []);

  const startTrack = useCallback(
    (trackId: string, newQueue?: string[]) => {
      const target = tracksById[trackId];
      if (!target) return;
      if (newQueue && newQueue.length > 0) {
        setQueueIds(newQueue);
      } else if (!queueIds.includes(trackId)) {
        setQueueIds((prev) => [...prev, trackId]);
      }

      if (currentTrackId === trackId && isPlaying) {
        sonaAudioEngine.pause();
        setIsPlaying(false);
        return;
      }

      const outgoingTrack = currentTrack;
      autoSteppedTrackKeyRef.current = null;
      setCurrentTrackId(trackId);
      setCurrentTime(0);
      listenedAccumRef.current = 0;
      setIsPlaying(true);
      void sonaAudioEngine.playTrack(target, crossfade, {
        reason: 'manual',
        outgoingTrack,
      });
      recordListeningEvent(target, Math.min(30, target.durationSec));
    },
    [
      tracksById,
      queueIds,
      currentTrackId,
      currentTrack,
      isPlaying,
      crossfade,
      recordListeningEvent,
    ]
  );

  const handleStepTrack = useCallback(
    (direction: 'next' | 'prev', reason: 'manual' | 'auto' = 'manual') => {
      if (queueIds.length === 0) return;
      const curIdx = currentTrackId ? queueIds.indexOf(currentTrackId) : -1;
      const nextIdx = resolveNextTrackIndex({
        currentIndex: curIdx < 0 ? 0 : curIdx,
        totalTracks: queueIds.length,
        repeat,
        shuffle,
        direction,
      });
      if (nextIdx === null) {
        sonaAudioEngine.pause();
        setIsPlaying(false);
        return;
      }
      const nextId = queueIds[nextIdx];
      const nextTrack = tracksById[nextId];
      if (!nextTrack) return;

      const outgoingTrack = currentTrack;
      autoSteppedTrackKeyRef.current = null;
      setCurrentTrackId(nextId);
      setCurrentTime(0);
      listenedAccumRef.current = 0;
      setIsPlaying(true);
      void sonaAudioEngine.playTrack(nextTrack, crossfade, {
        reason,
        outgoingTrack,
      });
      recordListeningEvent(nextTrack, Math.min(30, nextTrack.durationSec));
    },
    [
      queueIds,
      currentTrackId,
      currentTrack,
      repeat,
      shuffle,
      tracksById,
      crossfade,
      recordListeningEvent,
    ]
  );

  const handleTogglePlay = useCallback(() => {
    if (!currentTrack) {
      if (tracks[0]) startTrack(tracks[0].id);
      return;
    }
    if (isPlaying) {
      sonaAudioEngine.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      if (currentTime === 0) {
        autoSteppedTrackKeyRef.current = null;
        void sonaAudioEngine.playTrack(currentTrack, crossfade, {
          reason: 'manual',
          outgoingTrack: null,
        });
      } else {
        sonaAudioEngine.resume();
      }
    }
  }, [currentTrack, tracks, startTrack, isPlaying, currentTime, crossfade]);

  useEffect(() => {
    if (!isPlaying || !currentTrack) return;
    const curIdx = queueIds.indexOf(currentTrack.id);
    const hasNextTrack =
      resolveNextTrackIndex({
        currentIndex: curIdx < 0 ? 0 : curIdx,
        totalTracks: queueIds.length,
        repeat,
        shuffle,
        direction: 'next',
      }) !== null;

    const timer = window.setInterval(() => {
      listenedAccumRef.current += 0.25;
      if (listenedAccumRef.current >= 15) {
        listenedAccumRef.current = 0;
        recordListeningEvent(currentTrack, 15);
      }

      if (currentTrack.localFileKey) {
        const localState = sonaAudioEngine.getLocalAudioState();
        if (localState.active) {
          const effectiveDuration =
            localState.duration > 0.5 ? localState.duration : currentTrack.durationSec;
          const plan = computeTransitionPlan({
            crossfade,
            outgoingBpm: currentTrack.bpm,
            trackDurationSec: effectiveDuration,
            reason: 'auto',
          });
          const earlySec = hasNextTrack && plan.triggerEarlySec > 0 ? plan.triggerEarlySec : 0;
          const stepKey = `${currentTrack.id}@${Math.round(effectiveDuration)}`;
          const reachedEarlyPoint =
            earlySec > 0 &&
            effectiveDuration > 0.5 &&
            localState.currentTime >= Math.max(0.25, effectiveDuration - earlySec);

          if ((localState.ended || reachedEarlyPoint) && autoSteppedTrackKeyRef.current !== stepKey) {
            autoSteppedTrackKeyRef.current = stepKey;
            window.setTimeout(() => handleStepTrack('next', 'auto'), 0);
            setCurrentTime(0);
          } else {
            setCurrentTime(localState.currentTime);
          }
          return;
        }
      }

      setCurrentTime((prev) => {
        const next = prev + 0.25;
        const plan = computeTransitionPlan({
          crossfade,
          outgoingBpm: currentTrack.bpm,
          trackDurationSec: currentTrack.durationSec,
          reason: 'auto',
        });
        const earlySec = hasNextTrack && plan.triggerEarlySec > 0 ? plan.triggerEarlySec : 0;
        const stepKey = `${currentTrack.id}@synth`;
        if (
          next >= Math.max(0.25, currentTrack.durationSec - earlySec) &&
          autoSteppedTrackKeyRef.current !== stepKey
        ) {
          autoSteppedTrackKeyRef.current = stepKey;
          window.setTimeout(() => handleStepTrack('next', 'auto'), 0);
          return 0;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    currentTrack,
    queueIds,
    repeat,
    shuffle,
    crossfade,
    handleStepTrack,
    recordListeningEvent,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay]);

  useEffect(() => () => sonaAudioEngine.dispose(), []);

  const handleSeek = (sec: number) => {
    autoSteppedTrackKeyRef.current = null;
    setCurrentTime(sec);
    sonaAudioEngine.seekLocalAudio(sec);
  };

  const handleToggleLike = (trackId: string) => {
    setTracks((prev) => toggleTrackLikeInList(prev, trackId));
  };

  const handleApplyTrackMetadata = useCallback(
    (
      trackId: string,
      patch: {
        title: string;
        artist: string;
        album: string;
        year: number;
        genre: string;
        coverUrl: string;
        bpm?: number;
        lyrics?: LyricLine[];
      }
    ) => {
      setTracks((prev) =>
        prev.map((tr) =>
          tr.id === trackId
            ? {
                ...tr,
                title: patch.title || tr.title,
                artist: patch.artist || tr.artist,
                album: patch.album || tr.album,
                year: patch.year || tr.year,
                genre: patch.genre || tr.genre,
                coverUrl: patch.coverUrl || tr.coverUrl,
                bpm: patch.bpm && patch.bpm > 20 ? patch.bpm : tr.bpm,
                lyrics: patch.lyrics && patch.lyrics.length > 0 ? patch.lyrics : tr.lyrics,
                metadataMatched: true,
              }
            : tr
        )
      );
      showImportNotice(`Применены оригинальные метаданные: ${patch.artist} — ${patch.title}`);
    },
    [showImportNotice]
  );

  const handleImportLocalAudioFiles = useCallback(
    async (
      inputList: FileList | Array<File | StagedUploadPayload>,
      targetPlaylistId?: string | null
    ) => {
      const normalizedItems: StagedUploadPayload[] = Array.from(inputList).map((entry) =>
        entry instanceof File ? { file: entry } : entry
      );
      const validItems = normalizedItems.filter((item) =>
        isSupportedAudioFile(item.file.name, item.file.type)
      );
      if (validItems.length === 0) {
        showImportNotice('Выберите аудиофайлы форматов MP3, FLAC, WAV, OGG или M4A');
        return;
      }

      const covers = Object.values(COVER_ART);
      const createdTracks: Track[] = [];
      const pendingLookup: Array<{ trackId: string; fileName: string; durationSec: number }> = [];

      for (let i = 0; i < validItems.length; i++) {
        const { file, metadata, id3: preParsedId3, autoLookup } = validItems[i];
        const stamp = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const key = `local-audio-${stamp}`;
        try {
          const [{ sizeMb }, durationSec, parsedId3] = await Promise.all([
            saveLocalAudioFile(key, file),
            readAudioDuration(file),
            preParsedId3 ? Promise.resolve(preParsedId3) : readMp3Id3Tags(file),
          ]);
          const track = buildLocalTrackFromFile({
            id: `tr-local-${stamp}`,
            fileName: file.name,
            mimeType: file.type,
            durationSec,
            sizeMb,
            coverUrl:
              metadata?.coverUrl ||
              parsedId3?.coverDataUrl ||
              covers[(tracks.length + i) % covers.length],
            localFileKey: key,
            title: metadata?.title || parsedId3?.title,
            artist: metadata?.artist || parsedId3?.artist,
            album: metadata?.album || parsedId3?.album,
            genre: metadata?.genre || parsedId3?.genre,
            year: metadata?.year || parsedId3?.year,
            bpm: metadata?.bpm,
            lyrics: metadata?.lyrics,
            metadataMatched: Boolean(metadata?.metadataMatched),
          });
          createdTracks.push(track);
          if (metadata?.metadataMatched || autoLookup === false) {
            attemptedAutoLookupRef.current.add(track.id);
          }
        } catch {
          // Skip unreadable file
        }
      }

      if (createdTracks.length === 0) {
        showImportNotice('Не удалось сохранить выбранные аудиофайлы');
        return;
      }

      const newIds = createdTracks.map((t) => t.id);
      setTracks((prev) => [...createdTracks, ...prev]);
      setQueueIds((prev) => [...newIds, ...prev]);
      setCurrentTrackId((prev) => prev ?? createdTracks[0].id);
      if (targetPlaylistId) {
        setPlaylists((prev) =>
          prev.map((pl) =>
            pl.id === targetPlaylistId
              ? { ...pl, trackIds: [...newIds, ...pl.trackIds] }
              : pl
          )
        );
      }
      void refreshOfflineStats();
      const matchedInBatch = createdTracks.filter((t) => t.metadataMatched).length;
      showImportNotice(
        matchedInBatch > 0
          ? `Добавлено треков: ${createdTracks.length} (оригиналы найдены: ${matchedInBatch})`
          : `Добавлено локальных файлов: ${createdTracks.length}`
      );
    },
    [tracks.length, refreshOfflineStats, showImportNotice]
  );

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Automatically search and apply original metadata for any unmatched track
  useEffect(() => {
    const candidatesToEnrich = tracks.filter(
      (t) => t.source === 'local' && !t.metadataMatched && !attemptedAutoLookupRef.current.has(t.id)
    );
    if (candidatesToEnrich.length === 0) return;

    for (const tr of candidatesToEnrich) {
      attemptedAutoLookupRef.current.add(tr.id);
    }

    setEnrichingTrackIds((prev) => {
      const next = { ...prev };
      for (const tr of candidatesToEnrich) {
        next[tr.id] = true;
      }
      return next;
    });

    void (async () => {
      let enrichedCount = 0;
      for (const tr of candidatesToEnrich) {
        if (!isMountedRef.current) break;
        try {
          const hasUsefulTagTitle =
            Boolean(tr.title?.trim()) &&
            tr.title.trim() !== 'Без названия' &&
            Boolean(tr.artist?.trim()) &&
            tr.artist.trim() !== 'Локальный файл';
          const rawSource = hasUsefulTagTitle
            ? `${tr.artist} - ${tr.title}`
            : tr.originalFileName ||
              `${tr.artist && tr.artist !== 'Локальный файл' ? `${tr.artist} - ` : ''}${tr.title}`;
          const res = await lookupOriginalMetadataForTrack({
            rawTitleOrFileName: rawSource,
            artistHint: tr.artist,
            durationSec: tr.durationSec,
            withLyrics: true,
          });
          if (isMountedRef.current && res.matched) {
            enrichedCount++;
            const m = res.matched;
            setTracks((prev) =>
              prev.map((item) =>
                item.id === tr.id
                  ? {
                      ...item,
                      title: m.title || item.title,
                      artist: m.artist || item.artist,
                      album: m.album || item.album,
                      year: m.year > 1900 ? m.year : item.year,
                      genre: m.genre || item.genre,
                      coverUrl: m.coverUrl || item.coverUrl,
                      bpm: m.bpm && m.bpm > 20 ? m.bpm : item.bpm,
                      lyrics: res.lyrics.length > 0 ? res.lyrics : item.lyrics,
                      metadataMatched: true,
                    }
                  : item
              )
            );
          }
        } catch {
          // Keep existing fallback metadata
        } finally {
          if (isMountedRef.current) {
            setEnrichingTrackIds((prev) => {
              if (!prev[tr.id]) return prev;
              const copy = { ...prev };
              delete copy[tr.id];
              return copy;
            });
          }
        }
      }
      if (isMountedRef.current && enrichedCount > 0) {
        showImportNotice(`Найдены оригинальные метаданные для треков: ${enrichedCount}`);
      }
    })();
  }, [tracks, showImportNotice]);

  const handleRetryUnmatchedMetadata = useCallback(() => {
    const unmatched = tracks.filter((t) => t.source === 'local' && !t.metadataMatched);
    if (unmatched.length === 0) return;
    for (const tr of unmatched) {
      attemptedAutoLookupRef.current.delete(tr.id);
    }
    setTracks((prev) => [...prev]);
  }, [tracks]);

  const handleDeleteLocalTrack = useCallback(
    (trackId: string) => {
      const target = tracksById[trackId];
      if (!target) return;

      const remaining = tracks.filter((t) => t.id !== trackId);

      if (currentTrackId === trackId) {
        sonaAudioEngine.pause();
        setIsPlaying(false);
        setCurrentTime(0);
        setCurrentTrackId(remaining[0]?.id ?? null);
      }

      if (target.localFileKey) {
        void deleteLocalAudioFile(target.localFileKey).then(() => refreshOfflineStats());
      }

      setTracks(remaining);
      setQueueIds((prev) => prev.filter((id) => id !== trackId));
      setPlaylists((prev) =>
        prev.map((pl) => ({ ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId) }))
      );
      if (metadataModalTrack?.id === trackId) {
        setMetadataModalTrack(null);
      }
      showImportNotice(`Удалён трек «${target.title}»`);
    },
    [tracks, tracksById, currentTrackId, metadataModalTrack, refreshOfflineStats, showImportNotice]
  );

  const handleClearAllTracks = useCallback(() => {
    if (tracks.length === 0) return;
    sonaAudioEngine.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setCurrentTrackId(null);

    const fileKeys = tracks
      .map((t) => t.localFileKey)
      .filter((k): k is string => Boolean(k));
    if (fileKeys.length > 0) {
      void Promise.all(fileKeys.map((k) => deleteLocalAudioFile(k))).then(() =>
        refreshOfflineStats()
      );
    }

    setTracks([]);
    setQueueIds([]);
    setPlaylists((prev) => prev.map((pl) => ({ ...pl, trackIds: [] })));
    setMetadataModalTrack(null);
    showImportNotice('Все треки удалены из медиатеки');
  }, [tracks, refreshOfflineStats, showImportNotice]);

  const handleImportPlaylistFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = parseExternalPlaylist(text, file.name);
      if (parsed.tracks.length === 0) {
        showImportNotice('В файле плейлиста не найдено треков');
        return;
      }

      const covers = Object.values(COVER_ART);
      const importedTracks: Track[] = parsed.tracks.map((item, idx) => ({
        id: `tr-imp-${Date.now()}-${idx}`,
        title: item.title,
        artist: item.artist,
        album: item.album,
        genre: item.genre,
        year: item.year,
        durationSec: item.durationSec,
        bpm: item.bpm,
        codec: 'Локальный список',
        coverUrl: covers[(tracks.length + idx) % covers.length],
        source: 'local',
        liked: false,
        offlineAvailable: true,
        offlineSizeMb: 0.1,
        lyrics: [],
        synth: DEFAULT_FALLBACK_SYNTH,
      }));

      const newPl: Playlist = {
        id: `pl-${Date.now()}`,
        name: parsed.playlistName,
        description: `Локальный импорт (${parsed.format.toUpperCase()})`,
        coverUrl: importedTracks[0]?.coverUrl ?? COVER_ART.northernStatic,
        trackIds: importedTracks.map((t) => t.id),
        createdAt: new Date().toISOString().slice(0, 10),
      };

      setTracks((prev) => [...importedTracks, ...prev]);
      setCurrentTrackId((prev) => prev ?? importedTracks[0]?.id ?? null);
      setPlaylists((prev) => [newPl, ...prev]);
      setActiveTab('playlists');
      setSelectedPlaylistId(newPl.id);
      showImportNotice(`Импортирован плейлист «${newPl.name}» (${importedTracks.length})`);
    },
    [tracks.length, showImportNotice]
  );

  const handleExportPlaylist = useCallback(
    (playlist: Playlist) => {
      const plTracks = playlist.trackIds
        .map((id) => tracksById[id])
        .filter((t): t is Track => Boolean(t));
      const content = exportPlaylistToM3u8(playlist.name, plTracks);
      const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${playlist.name.replace(/[\\/:*?"<>|]/g, '_') || 'playlist'}.m3u8`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [tracksById]
  );

  const handleCreatePlaylist = (name: string, coverUrl?: string) => {
    const covers = Object.values(COVER_ART);
    const pl: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      description: 'Локальный плейлист',
      coverUrl: coverUrl || covers[playlists.length % covers.length],
      trackIds: [],
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setPlaylists((prev) => [pl, ...prev]);
    return pl.id;
  };

  const handleUpdatePlaylistCover = useCallback(
    (playlistId: string, coverUrl: string | null) => {
      if (playlistId === ALL_TRACKS_PLAYLIST_ID || playlistId === LIKED_PLAYLIST_ID) {
        setAutoPlaylistCovers((prev) => {
          const next = { ...prev };
          if (coverUrl) {
            next[playlistId] = coverUrl;
          } else {
            delete next[playlistId];
          }
          return next;
        });
      } else {
        const covers = Object.values(COVER_ART);
        setPlaylists((prev) =>
          prev.map((pl, idx) =>
            pl.id === playlistId
              ? { ...pl, coverUrl: coverUrl || covers[idx % covers.length] }
              : pl
          )
        );
      }
      showImportNotice(coverUrl ? 'Фото плейлиста обновлено' : 'Восстановлена стандартная обложка');
    },
    [showImportNotice]
  );

  const handleDeletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null);
    }
  };

  const handleAddTrackToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId || pl.trackIds.includes(trackId)) return pl;
        return { ...pl, trackIds: [...pl.trackIds, trackId] };
      })
    );
  };

  const handleSelectHeadphonePreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = HEADPHONE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setEqBands([...preset.bands]);
    }
  };

  const handleChangeEqBand = (index: number, db: number) => {
    setSelectedPresetId('custom');
    setEqBands((prev) => prev.map((v, idx) => (idx === index ? clampEqDb(db) : v)));
  };

  const handleMoveQueueItem = (index: number, direction: 'up' | 'down') => {
    setQueueIds((prev) => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const viewKey =
    activeTab === 'playlists' && selectedPlaylist
      ? `playlists-${selectedPlaylist.id}`
      : activeTab;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col relative bg-[#F3F1EC] dark:bg-black text-[#191E12] dark:text-white">
      {/* Hidden local file input for playlist import */}
      <input
        ref={playlistInputRef}
        type="file"
        accept=".m3u8,.m3u,.json,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void handleImportPlaylistFile(file);
          }
          e.target.value = '';
        }}
      />

      {/* Real-time Topographic Halftone Contour Surface (Audio-Reactive & Cursor-Interactive) */}
      <TerrainContourSurface theme={ui.theme} isPlaying={isPlaying} />

      {/* Top Navigation */}
      <TopGlassNav
        activeTab={activeTab}
        searchQuery={searchQuery}
        theme={ui.theme}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setSelectedPlaylistId(null);
        }}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (activeTab !== 'home') {
            setActiveTab('home');
            setSelectedPlaylistId(null);
          }
        }}
        onToggleTheme={() =>
          setUi((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))
        }
        onOpenLocalFiles={() => setUploadModalOpen(true)}
      />

      {/* Open Spatial Scroll Viewport */}
      <main
        ref={mainScrollRef}
        className="flex-1 overflow-y-auto px-3 sm:px-6 pt-4 pb-2 relative z-10"
      >
        <div className="max-w-[1260px] mx-auto">
          <motion.div
            key={viewKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'home' && (
              <HomeView
                tracks={tracks}
                playlists={playlists}
                allTracksPlaylist={allTracksPlaylist}
                likedPlaylist={likedPlaylist}
                likedCount={likedPlaylist.trackIds.length}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                searchQuery={searchQuery}
                density={ui.density}
                showCoversInTable={ui.showCoversInTable}
                stats={listeningStats}
                offlineStorage={offlineStorage}
                importMessage={importMessage}
                enrichingTrackIds={enrichingTrackIds}
                onPlayTrack={startTrack}
                onToggleLike={handleToggleLike}
                onAddToQueue={(id) =>
                  setQueueIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                }
                onAddTrackToPlaylist={handleAddTrackToPlaylist}
                onDeleteLocalTrack={handleDeleteLocalTrack}
                onClearAllTracks={handleClearAllTracks}
                onRetryUnmatchedMetadata={handleRetryUnmatchedMetadata}
                onOpenLikedPlaylist={() => {
                  setActiveTab('playlists');
                  setSelectedPlaylistId(LIKED_PLAYLIST_ID);
                }}
                onOpenPlaylist={(plId) => {
                  setActiveTab('playlists');
                  setSelectedPlaylistId(plId);
                }}
                onOpenLocalFiles={() => setUploadModalOpen(true)}
                onOpenPlaylistImport={() => playlistInputRef.current?.click()}
                onDropFiles={(files) => {
                  void handleImportLocalAudioFiles(files);
                }}
                onLookupMetadata={(track) => setMetadataModalTrack(track)}
              />
            )}

            {activeTab === 'playlists' && (
              <PlaylistsView
                tracks={tracks}
                playlists={playlists}
                allTracksPlaylist={allTracksPlaylist}
                likedPlaylist={likedPlaylist}
                autoPlaylistCovers={autoPlaylistCovers}
                selectedPlaylist={selectedPlaylist}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                density={ui.density}
                showCoversInTable={ui.showCoversInTable}
                enrichingTrackIds={enrichingTrackIds}
                onSelectPlaylist={(id) => setSelectedPlaylistId(id)}
                onCreatePlaylist={() => setCreatePlaylistOpen(true)}
                onImportPlaylist={() => playlistInputRef.current?.click()}
                onExportPlaylist={handleExportPlaylist}
                onDeletePlaylist={handleDeletePlaylist}
                onUpdatePlaylistCover={handleUpdatePlaylistCover}
                onPlayTrack={startTrack}
                onToggleLike={handleToggleLike}
                onAddToQueue={(id) =>
                  setQueueIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                }
                onAddTrackToPlaylist={handleAddTrackToPlaylist}
                onDeleteLocalTrack={handleDeleteLocalTrack}
                onLookupMetadata={(track) => setMetadataModalTrack(track)}
              />
            )}

            {activeTab === 'sound' && (
              <SoundLabView
                eqBands={eqBands}
                preampDb={preampDb}
                selectedPresetId={selectedPresetId}
                headphonePresets={HEADPHONE_PRESETS}
                plugins={plugins}
                crossfade={crossfade}
                onSelectPreset={handleSelectHeadphonePreset}
                onChangeBand={handleChangeEqBand}
                onChangePreamp={(db) => setPreampDb(clampEqDb(db))}
                onResetEq={() => {
                  setSelectedPresetId('flat');
                  setEqBands(Array(10).fill(0));
                  setPreampDb(0);
                }}
                onTogglePlugin={(id) =>
                  setPlugins((prev) =>
                    prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
                  )
                }
                onChangePluginIntensity={(id, intensity) =>
                  setPlugins((prev) =>
                    prev.map((p) => (p.id === id ? { ...p, intensity } : p))
                  )
                }
                onInstallPlugin={(id) =>
                  setPlugins((prev) =>
                    prev.map((p) => (p.id === id ? { ...p, installed: true, enabled: true } : p))
                  )
                }
                onChangeCrossfade={(patch) =>
                  setCrossfade((prev) => {
                    const next = { ...prev, ...patch };
                    if (patch.enabled === true && next.durationSec <= 0) {
                      next.durationSec = 4;
                    }
                    if (patch.durationSec === 0) {
                      next.enabled = false;
                    } else if (typeof patch.durationSec === 'number' && patch.durationSec > 0 && patch.enabled === undefined) {
                      next.enabled = true;
                    }
                    return next;
                  })
                }
              />
            )}

            {activeTab === 'karaoke' && (
              <KaraokeView
                track={currentTrack}
                currentTime={currentTime}
                karaokeMinus={karaokeMinus}
                onToggleKaraokeMinus={() => setKaraokeMinus((v) => !v)}
                onSeek={handleSeek}
              />
            )}

            {activeTab === 'stats' && (
              <StatsView stats={listeningStats} onPlayTrack={(id) => startTrack(id)} />
            )}
          </motion.div>
        </div>
      </main>

      {/* Queue Panel */}
      <QueueDrawer
        open={queueOpen}
        queueTracks={queueTracks}
        currentTrackId={currentTrackId}
        onClose={() => setQueueOpen(false)}
        onPlayTrack={(id) => startTrack(id)}
        onRemoveFromQueue={(id) => setQueueIds((prev) => prev.filter((item) => item !== id))}
        onMoveQueueItem={handleMoveQueueItem}
      />

      {/* Player Dock */}
      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={currentTrack?.durationSec ?? 0}
        volume={volume}
        muted={muted}
        shuffle={shuffle}
        repeat={repeat}
        showVisualizer={ui.showVisualizer}
        showAudioBadge={ui.showAudioBadge}
        devices={devices}
        onTogglePlay={handleTogglePlay}
        onNext={() => handleStepTrack('next')}
        onPrev={() => handleStepTrack('prev')}
        onSeek={handleSeek}
        onVolumeChange={(v) => {
          setVolume(v);
          if (muted && v > 0) setMuted(false);
        }}
        onToggleMute={() => setMuted((m) => !m)}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onCycleRepeat={() =>
          setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
        }
        onToggleLike={handleToggleLike}
        onSelectDevice={(devId) =>
          setDevices((prev) => prev.map((d) => ({ ...d, active: d.id === devId })))
        }
      />

      {/* Local Track Upload Modal */}
      <LocalUploadModal
        open={uploadModalOpen}
        playlists={playlists}
        onClose={() => setUploadModalOpen(false)}
        onConfirmUpload={handleImportLocalAudioFiles}
      />

      {/* Original Metadata Search & Apply Modal */}
      <MetadataLookupModal
        track={metadataModalTrack}
        onClose={() => setMetadataModalTrack(null)}
        onApplyMetadata={handleApplyTrackMetadata}
      />

      {/* Create Local Playlist Modal */}
      {createPlaylistOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-playlist-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-md dark:bg-black/75 dark:backdrop-blur-none"
        >
          <div
            className="w-full max-w-sm glass-elevated p-5 space-y-4"
            style={{ borderRadius: 'var(--sona-radius)' }}
          >
            <div className="flex items-center justify-between">
              <h2
                id="create-playlist-title"
                className="font-display text-sm font-semibold text-zinc-950 dark:text-white"
              >
                Новый плейлист
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCreatePlaylistOpen(false);
                  setNewPlCoverUrl('');
                  setNewPlCoverError(null);
                }}
                aria-label="Закрыть окно"
                className="p-1 text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPlName.trim()) return;
                const id = handleCreatePlaylist(newPlName.trim(), newPlCoverUrl || undefined);
                setNewPlName('');
                setNewPlCoverUrl('');
                setNewPlCoverError(null);
                setCreatePlaylistOpen(false);
                setActiveTab('playlists');
                setSelectedPlaylistId(id);
              }}
              className="space-y-3.5"
            >
              <input
                ref={newPlCoverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setNewPlCoverError(null);
                  try {
                    const dataUrl = await resizeImageFileToCoverDataUrl(file, 512);
                    setNewPlCoverUrl(dataUrl);
                  } catch (err) {
                    setNewPlCoverError(
                      err instanceof Error ? err.message : 'Не удалось обработать фото'
                    );
                  }
                }}
              />

              {/* Playlist Cover Picker */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => newPlCoverInputRef.current?.click()}
                  aria-label="Выбрать фото для нового плейлиста"
                  className="w-16 h-16 glass-plaque flex items-center justify-center overflow-hidden shrink-0 hover:opacity-90 transition-opacity"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  {newPlCoverUrl ? (
                    <img
                      src={newPlCoverUrl}
                      alt="Обложка нового плейлиста"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImagePlus className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => newPlCoverInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15"
                      style={{ borderRadius: 'var(--sona-radius-sm)' }}
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      {newPlCoverUrl ? 'Сменить фото' : 'Добавить фото'}
                    </button>
                    {newPlCoverUrl && (
                      <button
                        type="button"
                        onClick={() => setNewPlCoverUrl('')}
                        aria-label="Убрать фото"
                        className="p-1.5 text-zinc-500 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    JPG, PNG или WebP · по желанию
                  </p>
                </div>
              </div>

              {newPlCoverError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{newPlCoverError}</p>
              )}

              <input
                id="new-playlist-name"
                type="text"
                required
                autoFocus
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                placeholder="Название плейлиста..."
                aria-label="Название плейлиста"
                className="w-full px-3.5 py-2 text-sm glass-plaque text-zinc-950 dark:text-white focus:outline-none focus:border-[var(--sona-accent)]"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCreatePlaylistOpen(false);
                    setNewPlCoverUrl('');
                    setNewPlCoverError(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--sona-accent)',
                    color: 'var(--sona-accent-fg)',
                    borderRadius: 'var(--sona-radius-sm)',
                  }}
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
