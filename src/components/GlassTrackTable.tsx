import { useState } from 'react';
import { Heart, ListPlus, Loader2, Pause, Play, Sparkles, Trash2 } from 'lucide-react';
import type { DensityMode, Playlist, Track } from '../types/music';
import { formatTimecode } from '../utils/stats';
import { CoverArt } from './CoverArt';

interface GlassTrackTableProps {
  title: string;
  tracks: Track[];
  playlists: Playlist[];
  currentTrackId: string | null;
  isPlaying: boolean;
  density: DensityMode;
  showCoversInTable: boolean;
  emptyMessage: string;
  enrichingTrackIds?: Record<string, boolean>;
  onPlayTrack: (trackId: string, queueIds?: string[]) => void;
  onToggleLike: (trackId: string) => void;
  onAddToQueue: (trackId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onDeleteLocalTrack?: (trackId: string) => void;
  onClearAllTracks?: () => void;
  onLookupMetadata?: (track: Track) => void;
}

export function GlassTrackTable({
  title,
  tracks,
  playlists,
  currentTrackId,
  isPlaying,
  density,
  showCoversInTable,
  emptyMessage,
  enrichingTrackIds,
  onPlayTrack,
  onToggleLike,
  onAddToQueue,
  onAddTrackToPlaylist,
  onDeleteLocalTrack,
  onClearAllTracks,
  onLookupMetadata,
}: GlassTrackTableProps) {
  const [playlistMenuTrackId, setPlaylistMenuTrackId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const rowPad =
    density === 'compact' ? 'py-2' : density === 'spacious' ? 'py-3.5' : 'py-2.5';

  return (
    <section
      className="p-4 sm:p-5 glass-table space-y-3"
      style={{ borderRadius: 'var(--sona-radius)' }}
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-white">
            {title}
          </h2>
          <span className="text-xs font-mono-tabular text-zinc-600 dark:text-zinc-400">
            {tracks.length}
          </span>
        </div>

        {onClearAllTracks && tracks.length > 0 && (
          <div className="flex items-center gap-1.5">
            {confirmClearAll ? (
              <>
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400 hidden sm:inline">
                  Удалить все треки?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllTracks();
                    setConfirmClearAll(false);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  Удалить все
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-1 text-[11px] font-medium glass-plaque text-zinc-700 dark:text-zinc-300"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  Отмена
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                aria-label="Удалить все треки"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium glass-plaque text-zinc-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <Trash2 className="w-3 h-3" />
                Очистить
              </button>
            )}
          </div>
        )}
      </div>

      {tracks.length === 0 ? (
        <p className="py-12 text-center text-xs text-zinc-600 dark:text-zinc-400">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-1.5">
          {/* Floating table header strip */}
          <div
            className="hidden md:grid grid-cols-12 gap-3 px-3.5 py-2 glass-table-head text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
            style={{ borderRadius: 'calc(var(--sona-radius-sm) - 2px)' }}
          >
            <div className="col-span-6">Трек</div>
            <div className="col-span-4">Альбом</div>
            <div className="col-span-2 text-right">Время</div>
          </div>

          {/* Track Rows */}
          {tracks.map((track, idx) => {
            const isCurrent = track.id === currentTrackId;
            const isRowPlaying = isCurrent && isPlaying;
            return (
              <div
                key={track.id}
                className={`group grid grid-cols-12 items-center gap-3 px-3.5 ${rowPad} ${
                  isCurrent ? 'glass-table-row-active' : 'glass-table-row'
                }`}
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <div className="col-span-9 md:col-span-6 flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      onPlayTrack(
                        track.id,
                        tracks.map((t) => t.id)
                      )
                    }
                    aria-label={`${isRowPlaying ? 'Пауза' : 'Воспроизвести'} ${track.title}`}
                    className="w-6 h-6 flex items-center justify-center text-xs font-mono-tabular text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white shrink-0"
                  >
                    {isRowPlaying ? (
                      <Pause
                        className="w-3.5 h-3.5 fill-current"
                        style={{ color: 'var(--sona-accent)' }}
                      />
                    ) : (
                      <>
                        <span className="group-hover:hidden">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <Play className="w-3.5 h-3.5 fill-current hidden group-hover:block" />
                      </>
                    )}
                  </button>

                  {showCoversInTable && (
                    <CoverArt
                      src={track.coverUrl}
                      alt={track.title}
                      className="w-10 h-10 shrink-0"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        onPlayTrack(
                          track.id,
                          tracks.map((t) => t.id)
                        )
                      }
                      className="text-left block w-full"
                    >
                      <p
                        className="text-sm font-semibold truncate text-zinc-950 dark:text-white"
                        style={isCurrent ? { color: 'var(--sona-accent-text)' } : undefined}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate flex items-center gap-1.5">
                        <span className="truncate">{track.artist}</span>
                        {enrichingTrackIds?.[track.id] && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            оригинал…
                          </span>
                        )}
                      </p>
                    </button>
                  </div>
                </div>

                <div className="hidden md:block col-span-4 text-xs text-zinc-700 dark:text-zinc-300 truncate">
                  {track.album}
                </div>

                <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-0.5 sm:gap-1 relative">
                  <button
                    type="button"
                    onClick={() => onToggleLike(track.id)}
                    aria-label={`Избранное: ${track.title}`}
                    className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors"
                  >
                    <Heart
                      className="w-3.5 h-3.5"
                      style={
                        track.liked
                          ? { color: 'var(--sona-accent)', fill: 'var(--sona-accent)' }
                          : undefined
                      }
                    />
                  </button>

                  {onDeleteLocalTrack && (
                    <button
                      type="button"
                      onClick={() => onDeleteLocalTrack(track.id)}
                      aria-label={`Удалить ${track.title}`}
                      title="Удалить трек"
                      className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setPlaylistMenuTrackId((prev) => (prev === track.id ? null : track.id))
                    }
                    aria-label={`Добавить ${track.title} в очередь или плейлист`}
                    className="hidden sm:inline-flex p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-xs font-mono-tabular text-zinc-600 dark:text-zinc-400 w-9 sm:w-10 text-right shrink-0">
                    {formatTimecode(track.durationSec)}
                  </span>

                  {playlistMenuTrackId === track.id && (
                    <div
                      className="absolute right-0 top-9 z-40 w-52 glass-popover p-1.5 text-left"
                      style={{ borderRadius: 'var(--sona-radius-sm)' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onAddToQueue(track.id);
                          setPlaylistMenuTrackId(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-950 dark:text-white hover:bg-white/50 dark:hover:bg-white/12 rounded-md"
                      >
                        В очередь
                      </button>
                      {onLookupMetadata && (
                        <button
                          type="button"
                          onClick={() => {
                            onLookupMetadata(track);
                            setPlaylistMenuTrackId(null);
                          }}
                          className="w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 text-xs text-zinc-950 dark:text-white hover:bg-white/50 dark:hover:bg-white/12 rounded-md"
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          Найти оригинал
                        </button>
                      )}
                      <div className="my-1 border-t border-zinc-400/25 dark:border-white/15" />
                      {playlists.map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => {
                            onAddTrackToPlaylist(pl.id, track.id);
                            setPlaylistMenuTrackId(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 hover:bg-white/50 dark:hover:bg-white/12 rounded-md truncate"
                        >
                          + {pl.name}
                        </button>
                      ))}
                      {track.source === 'local' && onDeleteLocalTrack && (
                        <>
                          <div className="my-1 border-t border-zinc-400/25 dark:border-white/15" />
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteLocalTrack(track.id);
                              setPlaylistMenuTrackId(null);
                            }}
                            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Удалить файл
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
