import type { ListeningEvent, Track } from '../types/music';

export interface GenreStat {
  genre: string;
  seconds: number;
  plays: number;
  percentage: number;
}

export interface ArtistStat {
  artist: string;
  seconds: number;
  plays: number;
}

export interface TrackStat {
  trackId: string;
  title: string;
  artist: string;
  plays: number;
  seconds: number;
}

export interface WeekdayStat {
  dayIndex: number; // 0=Пн ... 6=Вс
  label: string;
  minutes: number;
  plays: number;
}

export interface ListeningSummary {
  totalSeconds: number;
  totalPlays: number;
  uniqueArtists: number;
  uniqueTracks: number;
  averageSessionMin: number;
  streakDays: number;
  topGenres: GenreStat[];
  topArtists: ArtistStat[];
  topTracks: TrackStat[];
  weekdayActivity: WeekdayStat[];
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function formatDurationTotal(totalSeconds: number): { hours: number; minutes: number; label: string } {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) {
    return { hours: 0, minutes, label: `${minutes} мин` };
  }
  return { hours, minutes, label: `${hours} ч ${minutes} мин` };
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function pluralRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.floor(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 19) return `${abs} ${many}`;
  if (mod10 === 1) return `${abs} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${abs} ${few}`;
  return `${abs} ${many}`;
}

export function computeListeningSummary(
  events: ListeningEvent[],
  tracksById: Record<string, Track>
): ListeningSummary {
  if (events.length === 0) {
    return {
      totalSeconds: 0,
      totalPlays: 0,
      uniqueArtists: 0,
      uniqueTracks: 0,
      averageSessionMin: 0,
      streakDays: 0,
      topGenres: [],
      topArtists: [],
      topTracks: [],
      weekdayActivity: WEEKDAY_LABELS.map((label, dayIndex) => ({
        dayIndex,
        label,
        minutes: 0,
        plays: 0,
      })),
    };
  }

  let totalSeconds = 0;
  const genreMap = new Map<string, { seconds: number; plays: number }>();
  const artistMap = new Map<string, { seconds: number; plays: number }>();
  const trackMap = new Map<string, { seconds: number; plays: number; artist: string }>();
  const dayBuckets = WEEKDAY_LABELS.map((label, dayIndex) => ({
    dayIndex,
    label,
    seconds: 0,
    plays: 0,
  }));
  const uniqueDateKeys = new Set<string>();

  for (const ev of events) {
    const sec = Math.max(0, ev.listenedSec);
    totalSeconds += sec;

    const gEntry = genreMap.get(ev.genre) ?? { seconds: 0, plays: 0 };
    gEntry.seconds += sec;
    gEntry.plays += 1;
    genreMap.set(ev.genre, gEntry);

    const aEntry = artistMap.get(ev.artist) ?? { seconds: 0, plays: 0 };
    aEntry.seconds += sec;
    aEntry.plays += 1;
    artistMap.set(ev.artist, aEntry);

    const tEntry = trackMap.get(ev.trackId) ?? { seconds: 0, plays: 0, artist: ev.artist };
    tEntry.seconds += sec;
    tEntry.plays += 1;
    trackMap.set(ev.trackId, tEntry);

    const dayIdx = ((ev.weekday % 7) + 7) % 7;
    dayBuckets[dayIdx].seconds += sec;
    dayBuckets[dayIdx].plays += 1;

    if (ev.timestamp) {
      uniqueDateKeys.add(ev.timestamp.slice(0, 10));
    }
  }

  const topGenres: GenreStat[] = Array.from(genreMap.entries())
    .map(([genre, data]) => ({
      genre,
      seconds: data.seconds,
      plays: data.plays,
      percentage: totalSeconds > 0 ? Math.round((data.seconds / totalSeconds) * 100) : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const topArtists: ArtistStat[] = Array.from(artistMap.entries())
    .map(([artist, data]) => ({
      artist,
      seconds: data.seconds,
      plays: data.plays,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const topTracks: TrackStat[] = Array.from(trackMap.entries())
    .map(([trackId, data]) => {
      const track = tracksById[trackId];
      return {
        trackId,
        title: track?.title ?? 'Трек',
        artist: track?.artist ?? data.artist,
        plays: data.plays,
        seconds: data.seconds,
      };
    })
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds);

  const activeDays = Math.max(1, uniqueDateKeys.size);
  const averageSessionMin = Math.round(totalSeconds / 60 / activeDays);

  return {
    totalSeconds,
    totalPlays: events.length,
    uniqueArtists: artistMap.size,
    uniqueTracks: trackMap.size,
    averageSessionMin,
    streakDays: uniqueDateKeys.size,
    topGenres,
    topArtists,
    topTracks,
    weekdayActivity: dayBuckets.map((b) => ({
      dayIndex: b.dayIndex,
      label: b.label,
      minutes: Math.round(b.seconds / 60),
      plays: b.plays,
    })),
  };
}
