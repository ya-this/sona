import { Play } from 'lucide-react';
import type { ListeningSummary } from '../utils/stats';
import { formatDurationTotal, pluralRu } from '../utils/stats';

interface StatsViewProps {
  stats: ListeningSummary;
  onPlayTrack: (trackId: string) => void;
}

export function StatsView({ stats, onPlayTrack }: StatsViewProps) {
  const totalFormatted = formatDurationTotal(stats.totalSeconds);
  const maxWeekdayMin = Math.max(1, ...stats.weekdayActivity.map((d) => d.minutes));
  const bestDay = stats.weekdayActivity.reduce(
    (best, cur) => (cur.minutes > best.minutes ? cur : best),
    stats.weekdayActivity[0] ?? { label: '—', minutes: 0 }
  );

  return (
    <div className="space-y-6 pb-4">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
        Статистика
      </h1>

      {/* 4-column Semi-Transparent Glass KPI Plaques */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 glass-plaque space-y-1" style={{ borderRadius: 'var(--sona-radius)' }}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Время</p>
          <p className="text-2xl font-bold font-mono-tabular text-zinc-950 dark:text-white">
            {totalFormatted.label}
          </p>
          <p className="text-[11px] text-zinc-500 font-mono-tabular">
            ~{stats.averageSessionMin} мин/день
          </p>
        </div>

        <div className="p-5 glass-plaque space-y-1" style={{ borderRadius: 'var(--sona-radius)' }}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Прослушиваний треков всего</p>
          <p className="text-2xl font-bold font-mono-tabular text-zinc-950 dark:text-white">
            {stats.totalPlays}
          </p>
          <p className="text-[11px] text-zinc-500 font-mono-tabular">
            {pluralRu(stats.uniqueTracks, 'трек', 'трека', 'треков')}
          </p>
        </div>

        <div className="p-5 glass-plaque space-y-1" style={{ borderRadius: 'var(--sona-radius)' }}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Исполнители</p>
          <p className="text-2xl font-bold font-mono-tabular text-zinc-950 dark:text-white">
            {stats.uniqueArtists}
          </p>
          <p className="text-[11px] text-zinc-500 truncate">{stats.topArtists[0]?.artist ?? '—'}</p>
        </div>

        <div className="p-5 glass-plaque space-y-1" style={{ borderRadius: 'var(--sona-radius)' }}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Серия</p>
          <p className="text-2xl font-bold font-mono-tabular text-zinc-950 dark:text-white">
            {stats.streakDays} дн.
          </p>
          <p className="text-[11px] text-zinc-500 font-mono-tabular truncate">
            Пик: {bestDay.label} · {bestDay.minutes} м
          </p>
        </div>
      </section>

      {/* Activity & Top Artists (No Genres) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div
          className="lg:col-span-7 p-5 glass-table space-y-4"
          style={{ borderRadius: 'var(--sona-radius)' }}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-sm font-semibold text-zinc-950 dark:text-white">
              По дням недели
            </h2>
            <span className="text-xs font-mono-tabular text-zinc-500">мин</span>
          </div>

          <div className="grid grid-cols-7 gap-3 items-end h-44 pt-3">
            {stats.weekdayActivity.map((day) => {
              const heightPct = Math.max(8, Math.round((day.minutes / maxWeekdayMin) * 100));
              return (
                <div key={day.label} className="flex flex-col items-center justify-end gap-1.5 h-full">
                  <span className="text-[11px] font-mono-tabular text-zinc-500">{day.minutes}</span>
                  <div className="w-full max-w-[36px] glass-plaque rounded-lg h-full flex items-end overflow-hidden p-0.5">
                    <div
                      className="w-full rounded-md transition-all duration-300"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: 'var(--sona-accent)',
                        opacity: day.minutes > 0 ? 0.9 : 0.2,
                      }}
                    />
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="lg:col-span-5 p-5 glass-table space-y-3"
          style={{ borderRadius: 'var(--sona-radius)' }}
        >
          <h2 className="font-display text-sm font-semibold text-zinc-950 dark:text-white">
            Топ исполнителей
          </h2>
          <div className="space-y-1.5">
            {stats.topArtists.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                Статистика появится после прослушивания ваших треков
              </p>
            ) : (
              stats.topArtists.slice(0, 5).map((artist, idx) => (
                <div
                  key={artist.artist}
                  className="px-3.5 py-2.5 glass-table-row flex items-center justify-between gap-3"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono-tabular text-zinc-500 w-5">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100 truncate">
                      {artist.artist}
                    </p>
                  </div>
                  <span className="text-xs font-mono-tabular text-zinc-500 shrink-0">
                    {artist.plays}× · {formatDurationTotal(artist.seconds).label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Semi-Transparent Top Tracks Table */}
      <section className="p-5 glass-table space-y-3" style={{ borderRadius: 'var(--sona-radius)' }}>
        <h2 className="font-display text-sm font-semibold text-zinc-950 dark:text-white">
          Топ треков
        </h2>
        <div className="space-y-1.5">
          {stats.topTracks.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Пока нет прослушанных треков
            </p>
          ) : (
            stats.topTracks.slice(0, 6).map((item, idx) => (
              <div
                key={item.trackId}
                className="px-3.5 py-2.5 glass-table-row flex items-center justify-between gap-3"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono-tabular text-zinc-500 w-5">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{item.artist}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono-tabular text-zinc-500">
                    {item.plays}× · {Math.round(item.seconds / 60)} м
                  </span>
                  <button
                    type="button"
                    onClick={() => onPlayTrack(item.trackId)}
                    aria-label={`Воспроизвести ${item.title}`}
                    className="p-2 glass-plaque rounded-lg text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
