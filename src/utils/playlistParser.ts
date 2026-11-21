export interface ParsedImportTrack {
  title: string;
  artist: string;
  album: string;
  genre: string;
  durationSec: number;
  year: number;
  bpm: number;
}

export interface ParsePlaylistResult {
  format: 'm3u' | 'json' | 'csv' | 'text';
  playlistName: string;
  tracks: ParsedImportTrack[];
  warnings: string[];
}

function parseDurationToSeconds(raw: string | number | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }
  if (typeof raw !== 'string') return 210;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const val = Number(trimmed);
    return val > 0 ? val : 210;
  }
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
    return Math.max(15, parts[0] * 60 + parts[1]);
  }
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return Math.max(15, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return 210;
}

function splitArtistTitle(line: string): { artist: string; title: string } {
  const separators = [' — ', ' – ', ' - ', ' | '];
  for (const sep of separators) {
    const idx = line.indexOf(sep);
    if (idx > 0) {
      return {
        artist: line.slice(0, idx).trim(),
        title: line.slice(idx + sep.length).trim(),
      };
    }
  }
  return { artist: 'Неизвестный исполнитель', title: line.trim() };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseExternalPlaylist(
  content: string,
  fileName = 'Импортированный плейлист'
): ParsePlaylistResult {
  const trimmed = content.trim();
  const baseName = fileName.replace(/\.(m3u8?|json|csv|txt)$/i, '').trim() || 'Импортированный плейлист';
  const warnings: string[] = [];

  if (!trimmed) {
    return { format: 'text', playlistName: baseName, tracks: [], warnings: ['Файл или поле импорта пусто.'] };
  }

  // 1. JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawTracks = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.tracks)
          ? parsed.tracks
          : Array.isArray(parsed.items)
            ? parsed.items
            : [];

      const name =
        !Array.isArray(parsed) && typeof parsed.name === 'string' && parsed.name.trim()
          ? parsed.name.trim()
          : baseName;

      const tracks: ParsedImportTrack[] = rawTracks
        .filter((item: unknown) => item && typeof item === 'object')
        .map((item: Record<string, unknown>) => ({
          title: String(item.title ?? item.name ?? 'Без названия').trim(),
          artist: String(item.artist ?? item.author ?? 'Неизвестный исполнитель').trim(),
          album: String(item.album ?? 'Импорт JSON').trim(),
          genre: String(item.genre ?? 'Электроника').trim(),
          durationSec: parseDurationToSeconds(
            (item.durationSec ?? item.duration ?? item.length) as string | number | undefined
          ),
          year: Number(item.year) || 2025,
          bpm: Number(item.bpm) || 105,
        }))
        .filter((t: ParsedImportTrack) => t.title.length > 0);

      if (tracks.length === 0) {
        warnings.push('В JSON не найдено ни одного корректного трека.');
      }
      return { format: 'json', playlistName: name, tracks, warnings };
    } catch {
      warnings.push('Не удалось разобрать JSON — применен текстовый парсер.');
    }
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 2. M3U / M3U8 format
  if (lines[0]?.toUpperCase().startsWith('#EXTM3U') || lines.some((l) => l.startsWith('#EXTINF:'))) {
    let playlistName = baseName;
    const tracks: ParsedImportTrack[] = [];
    let pendingMeta: { durationSec: number; artist: string; title: string; album?: string; genre?: string } | null = null;

    for (const line of lines) {
      if (line.startsWith('#PLAYLIST:')) {
        const extracted = line.slice('#PLAYLIST:'.length).trim();
        if (extracted) playlistName = extracted;
        continue;
      }
      if (line.startsWith('#EXTALB:')) {
        if (pendingMeta) pendingMeta.album = line.slice('#EXTALB:'.length).trim();
        continue;
      }
      if (line.startsWith('#EXTGENRE:')) {
        if (pendingMeta) pendingMeta.genre = line.slice('#EXTGENRE:'.length).trim();
        continue;
      }
      if (line.startsWith('#EXTINF:')) {
        const body = line.slice('#EXTINF:'.length);
        const commaIdx = body.indexOf(',');
        const durStr = commaIdx >= 0 ? body.slice(0, commaIdx).trim() : '210';
        const label = commaIdx >= 0 ? body.slice(commaIdx + 1).trim() : '';
        const { artist, title } = splitArtistTitle(label || 'Без названия');
        pendingMeta = {
          durationSec: parseDurationToSeconds(durStr),
          artist,
          title,
        };
        continue;
      }
      if (line.startsWith('#')) continue;

      if (pendingMeta) {
        tracks.push({
          title: pendingMeta.title,
          artist: pendingMeta.artist,
          album: pendingMeta.album || 'Импорт M3U',
          genre: pendingMeta.genre || 'Инди',
          durationSec: pendingMeta.durationSec,
          year: 2025,
          bpm: 108,
        });
        pendingMeta = null;
      } else {
        const cleanFile = line.split(/[\\/]/).pop()?.replace(/\.(mp3|flac|wav|ogg|m4a)$/i, '') || line;
        const { artist, title } = splitArtistTitle(cleanFile);
        tracks.push({
          title,
          artist,
          album: 'Импорт M3U',
          genre: 'Инди',
          durationSec: 210,
          year: 2025,
          bpm: 108,
        });
      }
    }

    if (pendingMeta) {
      tracks.push({
        title: pendingMeta.title,
        artist: pendingMeta.artist,
        album: pendingMeta.album || 'Импорт M3U',
        genre: pendingMeta.genre || 'Инди',
        durationSec: pendingMeta.durationSec,
        year: 2025,
        bpm: 108,
      });
    }

    return { format: 'm3u', playlistName, tracks, warnings };
  }

  // 3. CSV format
  const firstCells = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasCsvHeader =
    firstCells.length >= 2 &&
    (firstCells.some((c) => c.includes('title') || c.includes('track') || c.includes('название')) ||
      firstCells.some((c) => c.includes('artist') || c.includes('исполнитель')));

  if (hasCsvHeader) {
    const titleIdx = firstCells.findIndex((c) => c.includes('title') || c.includes('track') || c.includes('название'));
    const artistIdx = firstCells.findIndex((c) => c.includes('artist') || c.includes('исполнитель'));
    const albumIdx = firstCells.findIndex((c) => c.includes('album') || c.includes('альбом'));
    const genreIdx = firstCells.findIndex((c) => c.includes('genre') || c.includes('жанр'));
    const durIdx = firstCells.findIndex((c) => c.includes('duration') || c.includes('time') || c.includes('длит'));
    const yearIdx = firstCells.findIndex((c) => c.includes('year') || c.includes('год'));
    const bpmIdx = firstCells.findIndex((c) => c.includes('bpm') || c.includes('темп'));

    const tracks: ParsedImportTrack[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const title = titleIdx >= 0 ? row[titleIdx] : row[0];
      if (!title) continue;
      tracks.push({
        title,
        artist: (artistIdx >= 0 ? row[artistIdx] : row[1]) || 'Неизвестный исполнитель',
        album: (albumIdx >= 0 ? row[albumIdx] : '') || 'Импорт CSV',
        genre: (genreIdx >= 0 ? row[genreIdx] : '') || 'Альтернатива',
        durationSec: parseDurationToSeconds(durIdx >= 0 ? row[durIdx] : undefined),
        year: yearIdx >= 0 && Number(row[yearIdx]) ? Number(row[yearIdx]) : 2024,
        bpm: bpmIdx >= 0 && Number(row[bpmIdx]) ? Number(row[bpmIdx]) : 112,
      });
    }
    return { format: 'csv', playlistName: baseName, tracks, warnings };
  }

  // 4. Plain text tracklist (Artist - Title [3:45])
  const tracks: ParsedImportTrack[] = lines
    .filter((l) => !l.startsWith('#'))
    .map((line) => {
      const durationMatch = line.match(/\[(\d{1,2}:\d{2})\]|\((\d{1,2}:\d{2})\)$/);
      const durationSec = durationMatch
        ? parseDurationToSeconds(durationMatch[1] || durationMatch[2])
        : 215;
      const cleaned = line
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/\[(\d{1,2}:\d{2})\]|\((\d{1,2}:\d{2})\)$/, '')
        .trim();
      const { artist, title } = splitArtistTitle(cleaned);
      return {
        title,
        artist,
        album: 'Импорт списка',
        genre: 'Инди',
        durationSec,
        year: 2025,
        bpm: 104,
      };
    })
    .filter((t) => t.title.length > 0);

  return { format: 'text', playlistName: baseName, tracks, warnings };
}
