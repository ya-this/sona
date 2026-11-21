import { ArrowDown, ArrowUp, Play, Trash2, X } from 'lucide-react';
import type { Track } from '../types/music';
import { formatTimecode, pluralRu } from '../utils/stats';
import { CoverArt } from './CoverArt';

interface QueueDrawerProps {
  open: boolean;
  queueTracks: Track[];
  currentTrackId: string | null;
  onClose: () => void;
  onPlayTrack: (trackId: string) => void;
  onRemoveFromQueue: (trackId: string) => void;
  onMoveQueueItem: (index: number, direction: 'up' | 'down') => void;
}

export function QueueDrawer({
  open,
  queueTracks,
  currentTrackId,
  onClose,
  onPlayTrack,
  onRemoveFromQueue,
  onMoveQueueItem,
}: QueueDrawerProps) {
  if (!open) return null;

  return (
    <aside
      aria-label="Очередь воспроизведения"
      className="fixed top-20 bottom-24 right-4 sm:right-6 z-40 w-[330px] max-w-[calc(100vw-2rem)] glass-elevated flex flex-col overflow-hidden"
      style={{ borderRadius: 'var(--sona-radius)' }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-300/40 dark:border-white/10">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Очередь</h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {pluralRu(queueTracks.length, 'трек', 'трека', 'треков')}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть очередь"
          className="p-1 text-zinc-500 hover:text-zinc-950 dark:hover:text-white rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
        {queueTracks.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-10">Очередь пуста</p>
        ) : (
          queueTracks.map((track, idx) => {
            const isCurrent = track.id === currentTrackId;
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`group flex items-center gap-2.5 px-2.5 py-2 transition-colors ${
                  isCurrent
                    ? 'bg-zinc-900/10 dark:bg-white/12'
                    : 'hover:bg-zinc-900/5 dark:hover:bg-white/6'
                }`}
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <CoverArt src={track.coverUrl} alt={track.title} className="w-9 h-9" />
                <button
                  type="button"
                  onClick={() => onPlayTrack(track.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p
                    className="text-xs font-medium truncate text-zinc-950 dark:text-zinc-100"
                    style={isCurrent ? { color: 'var(--sona-accent)' } : undefined}
                  >
                    {track.title}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {track.artist} · {formatTimecode(track.durationSec)}
                  </p>
                </button>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onPlayTrack(track.id)}
                    aria-label={`Воспроизвести ${track.title}`}
                    className="p-1 text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveQueueItem(idx, 'up')}
                    disabled={idx === 0}
                    aria-label={`Поднять ${track.title}`}
                    className="p-1 text-zinc-500 hover:text-zinc-950 dark:hover:text-white disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveQueueItem(idx, 'down')}
                    disabled={idx === queueTracks.length - 1}
                    aria-label={`Опустить ${track.title}`}
                    className="p-1 text-zinc-500 hover:text-zinc-950 dark:hover:text-white disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveFromQueue(track.id)}
                    aria-label={`Убрать ${track.title} из очереди`}
                    className="p-1 text-zinc-500 hover:text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
