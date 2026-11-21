import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  FileUp,
  Heart,
  ImagePlus,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { DensityMode, Playlist, Track } from '../types/music';
import { pluralRu } from '../utils/stats';
import { resizeImageFileToCoverDataUrl } from '../utils/imageResize';
import { CoverArt } from './CoverArt';
import { GlassTrackTable } from './GlassTrackTable';

interface PlaylistsViewProps {
  tracks: Track[];
  playlists: Playlist[];
  allTracksPlaylist: Playlist;
  likedPlaylist: Playlist;
  autoPlaylistCovers: Record<string, string>;
  selectedPlaylist: Playlist | null;
  currentTrackId: string | null;
  isPlaying: boolean;
  density: DensityMode;
  showCoversInTable: boolean;
  onSelectPlaylist: (playlistId: string | null) => void;
  onCreatePlaylist: () => void;
  onImportPlaylist: () => void;
  onExportPlaylist: (playlist: Playlist) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onUpdatePlaylistCover: (playlistId: string, coverUrl: string | null) => void;
  onPlayTrack: (trackId: string, queueIds?: string[]) => void;
  onToggleLike: (trackId: string) => void;
  onAddToQueue: (trackId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onDeleteLocalTrack: (trackId: string) => void;
  onLookupMetadata?: (track: Track) => void;
  enrichingTrackIds?: Record<string, boolean>;
}

export function PlaylistsView({
  tracks,
  playlists,
  allTracksPlaylist,
  likedPlaylist,
  autoPlaylistCovers,
  selectedPlaylist,
  currentTrackId,
  isPlaying,
  density,
  showCoversInTable,
  onSelectPlaylist,
  onCreatePlaylist,
  onImportPlaylist,
  onExportPlaylist,
  onDeletePlaylist,
  onUpdatePlaylistCover,
  onPlayTrack,
  onToggleLike,
  onAddToQueue,
  onAddTrackToPlaylist,
  onDeleteLocalTrack,
  onLookupMetadata,
  enrichingTrackIds,
}: PlaylistsViewProps) {
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  const selectedTracks = useMemo(() => {
    if (!selectedPlaylist) return [];
    return selectedPlaylist.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is Track => Boolean(t));
  }, [selectedPlaylist, tracks]);

  const displayedPlaylists = useMemo(
    () => [allTracksPlaylist, likedPlaylist, ...playlists],
    [allTracksPlaylist, likedPlaylist, playlists]
  );

  const handleCoverFilePicked = async (playlistId: string, file: File) => {
    setCoverError(null);
    try {
      const dataUrl = await resizeImageFileToCoverDataUrl(file, 512);
      onUpdatePlaylistCover(playlistId, dataUrl);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    }
  };

  if (selectedPlaylist) {
    const isAuto = Boolean(selectedPlaylist.isAutoLiked || selectedPlaylist.isAutoAll);
    const hasCustomAutoCover = Boolean(autoPlaylistCovers[selectedPlaylist.id]);
    const showCoverPhoto =
      hasCustomAutoCover ||
      (!selectedPlaylist.isAutoLiked &&
        (!selectedPlaylist.isAutoAll || selectedTracks.length > 0));

    return (
      <div className="space-y-5 pb-4">
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleCoverFilePicked(selectedPlaylist.id, file);
            }
            e.target.value = '';
          }}
        />

        {/* Local Playlist Detail Hero */}
        <section
          className="p-5 sm:p-6 glass-surface flex flex-col sm:flex-row items-start sm:items-center gap-6"
          style={{ borderRadius: 'var(--sona-radius)' }}
        >
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            aria-label={`Изменить фото плейлиста ${selectedPlaylist.name}`}
            className="group relative shrink-0 text-left focus:outline-none"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            {showCoverPhoto ? (
              <CoverArt
                src={selectedPlaylist.coverUrl}
                alt={selectedPlaylist.name}
                className="w-36 h-36 sm:w-40 sm:h-40 shadow-2xl"
              />
            ) : selectedPlaylist.isAutoLiked ? (
              <div
                className="w-36 h-36 sm:w-40 sm:h-40 glass-elevated flex items-center justify-center shrink-0 shadow-2xl"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <Heart
                  className="w-14 h-14"
                  style={{ color: 'var(--sona-accent)', fill: 'var(--sona-accent)' }}
                />
              </div>
            ) : (
              <div
                className="w-36 h-36 sm:w-40 sm:h-40 glass-elevated flex items-center justify-center shrink-0 shadow-2xl"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <Layers className="w-14 h-14 text-zinc-700 dark:text-zinc-200" />
              </div>
            )}

            <span
              className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-[11px] font-semibold"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <ImagePlus className="w-5 h-5" />
              <span>{showCoverPhoto ? 'Сменить фото' : 'Добавить фото'}</span>
            </span>
          </button>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <button
                type="button"
                onClick={() => onSelectPlaylist(null)}
                className="inline-flex items-center gap-1 hover:text-zinc-950 dark:hover:text-white font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Все плейлисты
              </button>
              <span aria-hidden="true">/</span>
              <span>
                {selectedPlaylist.isAutoAll
                  ? 'Автоплейлист · все треки'
                  : selectedPlaylist.isAutoLiked
                    ? 'Автоплейлист'
                    : 'Локальный'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {pluralRu(selectedTracks.length, 'трек', 'трека', 'треков')}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white [text-wrap:balance]">
              {selectedPlaylist.name}
            </h1>

            {selectedPlaylist.description && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {selectedPlaylist.description}
              </p>
            )}

            {coverError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{coverError}</p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (selectedTracks[0]) {
                    onPlayTrack(
                      selectedTracks[0].id,
                      selectedTracks.map((t) => t.id)
                    );
                  }
                }}
                disabled={selectedTracks.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-90 disabled:opacity-40 shadow-lg"
                style={{
                  backgroundColor: 'var(--sona-accent)',
                  color: 'var(--sona-accent-fg)',
                  borderRadius: 'var(--sona-radius-sm)',
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                Слушать
              </button>

              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <ImagePlus className="w-3.5 h-3.5" />
                {hasCustomAutoCover || !isAuto ? 'Сменить фото' : 'Добавить фото'}
              </button>

              {isAuto && hasCustomAutoCover && (
                <button
                  type="button"
                  onClick={() => onUpdatePlaylistCover(selectedPlaylist.id, null)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium glass-plaque text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сбросить фото
                </button>
              )}

              <button
                type="button"
                onClick={() => onExportPlaylist(selectedPlaylist)}
                disabled={selectedTracks.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap disabled:opacity-40"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <Download className="w-3.5 h-3.5" />
                Экспорт .m3u8
              </button>

              {!isAuto && (
                <button
                  type="button"
                  onClick={() => onDeletePlaylist(selectedPlaylist.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium glass-plaque text-zinc-700 dark:text-zinc-300 hover:text-rose-500 transition-colors whitespace-nowrap"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Удалить
                </button>
              )}
            </div>
          </div>
        </section>

        <GlassTrackTable
          title="Треки плейлиста"
          tracks={selectedTracks}
          playlists={playlists}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          density={density}
          showCoversInTable={showCoversInTable}
          enrichingTrackIds={enrichingTrackIds}
          emptyMessage={
            selectedPlaylist.isAutoAll
              ? 'Загрузите любые аудиофайлы — они автоматически соберутся в этом плейлисте'
              : selectedPlaylist.isAutoLiked
                ? 'Поставьте лайк любому треку — он автоматически появится здесь'
                : 'В этом плейлисте пока нет треков'
          }
          onPlayTrack={onPlayTrack}
          onToggleLike={onToggleLike}
          onAddToQueue={onAddToQueue}
          onAddTrackToPlaylist={onAddTrackToPlaylist}
          onDeleteLocalTrack={onDeleteLocalTrack}
          onLookupMetadata={onLookupMetadata}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Плейлисты
          </h1>
          <span className="text-xs font-mono-tabular text-zinc-600 dark:text-zinc-400">
            {displayedPlaylists.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onImportPlaylist}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap shrink-0"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            <FileUp className="w-3.5 h-3.5" />
            Импорт файла
          </button>

          <button
            type="button"
            onClick={onCreatePlaylist}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold shadow-md whitespace-nowrap shrink-0"
            style={{
              backgroundColor: 'var(--sona-accent)',
              color: 'var(--sona-accent-fg)',
              borderRadius: 'var(--sona-radius-sm)',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Создать плейлист
          </button>
        </div>
      </div>

      {/* Local Playlist Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayedPlaylists.map((pl) => {
          const plTracks = pl.trackIds
            .map((id) => tracks.find((t) => t.id === id))
            .filter((t): t is Track => Boolean(t));
          const isAuto = Boolean(pl.isAutoAll || pl.isAutoLiked);
          const hasCustomAutoCover = Boolean(autoPlaylistCovers[pl.id]);
          const showCoverArt =
            hasCustomAutoCover ||
            (!pl.isAutoLiked && (!pl.isAutoAll || plTracks.length > 0));

          return (
            <div
              key={pl.id}
              className="group p-4 glass-table flex flex-col justify-between gap-4 transition-transform duration-200 hover:-translate-y-0.5"
              style={{ borderRadius: 'var(--sona-radius)' }}
            >
              <button
                type="button"
                onClick={() => onSelectPlaylist(pl.id)}
                className="text-left space-y-3.5 block w-full"
              >
                <div className="relative">
                  {showCoverArt ? (
                    <CoverArt
                      src={pl.coverUrl}
                      alt={pl.name}
                      className="w-full aspect-square shadow-lg"
                    />
                  ) : pl.isAutoLiked ? (
                    <div
                      className="w-full aspect-square glass-plaque flex flex-col items-center justify-center gap-2"
                      style={{ borderRadius: 'var(--sona-radius-sm)' }}
                    >
                      <Heart
                        className="w-12 h-12"
                        style={{ color: 'var(--sona-accent)', fill: 'var(--sona-accent)' }}
                      />
                      <span className="text-[11px] font-mono-tabular text-zinc-600 dark:text-zinc-300">
                        Автосборка
                      </span>
                    </div>
                  ) : (
                    <div
                      className="w-full aspect-square glass-plaque flex flex-col items-center justify-center gap-2"
                      style={{ borderRadius: 'var(--sona-radius-sm)' }}
                    >
                      <Layers className="w-12 h-12 text-zinc-700 dark:text-zinc-200" />
                      <span className="text-[11px] font-mono-tabular text-zinc-600 dark:text-zinc-300">
                        Автоплейлист
                      </span>
                    </div>
                  )}

                  {isAuto && showCoverArt && (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] glass-plaque text-zinc-900 dark:text-white">
                      Авто
                    </span>
                  )}
                </div>

                <div className="space-y-1 min-w-0">
                  <h2 className="font-display text-sm font-semibold text-zinc-950 dark:text-white truncate">
                    {pl.name}
                  </h2>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 tabular-nums truncate">
                    {pluralRu(plTracks.length, 'трек', 'трека', 'треков')}
                    {isAuto ? ' · Авто' : ''}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (plTracks[0]) {
                      onPlayTrack(
                        plTracks[0].id,
                        plTracks.map((t) => t.id)
                      );
                    }
                  }}
                  disabled={plTracks.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{
                    backgroundColor: 'var(--sona-accent)',
                    color: 'var(--sona-accent-fg)',
                    borderRadius: 'var(--sona-radius-sm)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Слушать
                </button>
                <button
                  type="button"
                  onClick={() => onSelectPlaylist(pl.id)}
                  className="px-3 py-2 text-xs font-medium glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/14 whitespace-nowrap"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  Открыть
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
