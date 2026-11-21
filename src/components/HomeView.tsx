import { useMemo, useState, type DragEvent } from 'react';
import { FileUp, FolderPlus, HardDrive, Sparkles } from 'lucide-react';
import type { DensityMode, Playlist, Track } from '../types/music';
import { formatDurationTotal, pluralRu, type ListeningSummary } from '../utils/stats';
import { CurvedTrackShelf } from './CurvedTrackShelf';
import { GlassTrackTable } from './GlassTrackTable';

interface HomeViewProps {
  tracks: Track[];
  playlists: Playlist[];
  allTracksPlaylist: Playlist;
  likedPlaylist: Playlist;
  likedCount: number;
  currentTrackId: string | null;
  isPlaying: boolean;
  searchQuery: string;
  density: DensityMode;
  showCoversInTable: boolean;
  stats: ListeningSummary;
  offlineStorage: { files: number; totalMb: number };
  importMessage: string | null;
  enrichingTrackIds?: Record<string, boolean>;
  onPlayTrack: (trackId: string, queueIds?: string[]) => void;
  onToggleLike: (trackId: string) => void;
  onAddToQueue: (trackId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onDeleteLocalTrack: (trackId: string) => void;
  onClearAllTracks: () => void;
  onRetryUnmatchedMetadata?: () => void;
  onOpenLikedPlaylist: () => void;
  onOpenPlaylist: (playlistId: string) => void;
  onOpenLocalFiles: () => void;
  onOpenPlaylistImport: () => void;
  onDropFiles: (files: FileList) => void;
  onLookupMetadata: (track: Track) => void;
}

export function HomeView({
  tracks,
  playlists,
  allTracksPlaylist,
  likedPlaylist,
  likedCount,
  currentTrackId,
  isPlaying,
  searchQuery,
  density,
  showCoversInTable,
  stats,
  offlineStorage,
  importMessage,
  enrichingTrackIds,
  onPlayTrack,
  onToggleLike,
  onAddToQueue,
  onAddTrackToPlaylist,
  onDeleteLocalTrack,
  onClearAllTracks,
  onRetryUnmatchedMetadata,
  onOpenLikedPlaylist,
  onOpenPlaylist,
  onOpenLocalFiles,
  onOpenPlaylistImport,
  onDropFiles,
  onLookupMetadata,
}: HomeViewProps) {
  const [dragActive, setDragActive] = useState(false);

  const visibleTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="space-y-5 pb-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Interactive 3D Curved Spine-to-Cover Track Shelf or Empty Upload Card */}
      {visibleTracks.length > 0 ? (
        <CurvedTrackShelf
          tracks={visibleTracks}
          allTracks={tracks}
          playlists={playlists}
          allTracksPlaylist={allTracksPlaylist}
          likedPlaylist={likedPlaylist}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          enrichingTrackIds={enrichingTrackIds}
          onPlayTrack={onPlayTrack}
          onToggleLike={onToggleLike}
          onAddToQueue={onAddToQueue}
          onAddTrackToPlaylist={onAddTrackToPlaylist}
          onOpenPlaylistTab={onOpenPlaylist}
          onLookupMetadata={onLookupMetadata}
          onDeleteTrack={onDeleteLocalTrack}
        />
      ) : (
        tracks.length === 0 && (
          <section
            aria-label="Пустая медиатека"
            className="px-6 py-12 sm:py-16 glass-surface flex flex-col items-center justify-center text-center space-y-4"
            style={{ borderRadius: 'var(--sona-radius)' }}
          >
            <div
              className="w-14 h-14 glass-plaque flex items-center justify-center text-zinc-900 dark:text-white"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <FolderPlus className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <p className="sona-lbl text-[10px] text-zinc-500 dark:text-zinc-400">
                Ваша коллекция
              </p>
              <h1 className="font-editorial text-2xl sm:text-4xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                Загрузите свои треки
              </h1>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                В плеере отображаются только добавленные вами аудиофайлы. Перетащите их сюда или выберите с устройства.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onOpenLocalFiles}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: 'var(--sona-accent)',
                  color: 'var(--sona-accent-fg)',
                  borderRadius: 'var(--sona-radius-sm)',
                }}
              >
                <FolderPlus className="w-4 h-4" />
                Загрузить треки
              </button>
              <button
                type="button"
                onClick={onOpenPlaylistImport}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <FileUp className="w-3.5 h-3.5" />
                Импорт M3U
              </button>
            </div>
          </section>
        )
      )}

      {/* Local Media Library & Drag-and-Drop Strip */}
      <section
        className={`p-4 sm:p-5 glass-surface relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
          dragActive ? 'ring-2 ring-[var(--sona-accent)]' : ''
        }`}
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-11 h-11 glass-plaque flex items-center justify-center shrink-0 text-zinc-900 dark:text-white"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold tracking-tight text-zinc-950 dark:text-white truncate">
              Локальная медиатека
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate mt-0.5">
              {dragActive
                ? 'Отпустите аудиофайлы, чтобы добавить их в библиотеку'
                : importMessage
                  ? importMessage
                  : 'Полностью оффлайн · перетащите MP3, FLAC, WAV, OGG, M4A сюда'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
            <div
              className="min-w-0 px-2.5 sm:px-3 py-2 glass-plaque"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <p className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate">В эфире</p>
              <p className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white font-mono-tabular truncate">
                {formatDurationTotal(stats.totalSeconds).label}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenLikedPlaylist}
              className="min-w-0 px-2.5 sm:px-3 py-2 glass-plaque text-left hover:bg-white/55 dark:hover:bg-white/14 transition-colors"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <p className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate">Понравилось</p>
              <p className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white font-mono-tabular truncate">
                {likedCount}
              </p>
            </button>
            <div
              className="min-w-0 px-2.5 sm:px-3 py-2 glass-plaque"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <p className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate">На диске</p>
              <p className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white font-mono-tabular truncate">
                {offlineStorage.files > 0
                  ? `${offlineStorage.files} · ${offlineStorage.totalMb} МБ`
                  : pluralRu(tracks.length, 'трек', 'трека', 'треков')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={onOpenLocalFiles}
              className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--sona-accent)',
                color: 'var(--sona-accent-fg)',
                borderRadius: 'var(--sona-radius-sm)',
              }}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Добавить аудио
            </button>
            {onRetryUnmatchedMetadata &&
              tracks.some((t) => t.source === 'local' && !t.metadataMatched) && (
                <button
                  type="button"
                  onClick={onRetryUnmatchedMetadata}
                  disabled={Object.keys(enrichingTrackIds ?? {}).length > 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Найти метаданные</span>
                </button>
              )}
            <button
              type="button"
              onClick={onOpenPlaylistImport}
              aria-label="Импортировать локальный плейлист"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap shrink-0"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>Импорт M3U</span>
            </button>
          </div>
        </div>
      </section>

      {/* Local Tracklist Table */}
      <GlassTrackTable
        title="Треки"
        tracks={visibleTracks}
        playlists={playlists}
        currentTrackId={currentTrackId}
        isPlaying={isPlaying}
        density={density}
        showCoversInTable={showCoversInTable}
        enrichingTrackIds={enrichingTrackIds}
        emptyMessage={
          searchQuery.trim()
            ? 'По запросу ничего не найдено'
            : 'Пока нет загруженных треков — нажмите «Загрузить треки» или «Добавить аудио»'
        }
        onPlayTrack={onPlayTrack}
        onToggleLike={onToggleLike}
        onAddToQueue={onAddToQueue}
        onAddTrackToPlaylist={onAddTrackToPlaylist}
        onDeleteLocalTrack={onDeleteLocalTrack}
        onClearAllTracks={onClearAllTracks}
        onLookupMetadata={onLookupMetadata}
      />
    </div>
  );
}
