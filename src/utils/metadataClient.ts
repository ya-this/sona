import type { LyricLine, MetadataCandidate } from '../types/music';
import { cleanTrackSearchQuery } from './metadataLookup';

export interface MetadataLookupResult {
  query: string;
  artistHint: string;
  titleHint: string;
  matched: MetadataCandidate | null;
  candidates: MetadataCandidate[];
  lyrics: LyricLine[];
}

export async function searchOriginalMetadata(
  query: string,
  options?: {
    artistHint?: string;
    titleHint?: string;
    durationSec?: number;
    signal?: AbortSignal;
  }
): Promise<MetadataCandidate[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const params = new URLSearchParams({ q: cleanQuery });
  if (options?.artistHint) params.set('artist', options.artistHint);
  if (options?.titleHint) params.set('title', options.titleHint);
  if (typeof options?.durationSec === 'number' && options.durationSec > 0) {
    params.set('duration', String(Math.round(options.durationSec)));
  }

  const resp = await fetch(`/api/metadata/search?${params.toString()}`, {
    signal: options?.signal,
  });
  if (!resp.ok) {
    throw new Error('Не удалось выполнить поиск метаданных');
  }
  const data = (await resp.json()) as { candidates?: MetadataCandidate[] };
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function fetchOriginalLyrics(
  title: string,
  artist: string,
  durationSec?: number,
  signal?: AbortSignal
): Promise<LyricLine[]> {
  if (!title.trim()) return [];
  try {
    const params = new URLSearchParams({ title: title.trim() });
    if (artist.trim()) params.set('artist', artist.trim());
    if (typeof durationSec === 'number' && durationSec > 0) {
      params.set('duration', String(Math.round(durationSec)));
    }
    const resp = await fetch(`/api/metadata/lyrics?${params.toString()}`, { signal });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { lyrics?: LyricLine[] };
    return Array.isArray(data.lyrics) ? data.lyrics : [];
  } catch {
    return [];
  }
}

export async function lookupOriginalMetadataForTrack(input: {
  rawTitleOrFileName: string;
  artistHint?: string;
  durationSec?: number;
  withLyrics?: boolean;
  signal?: AbortSignal;
}): Promise<MetadataLookupResult> {
  const cleaned = cleanTrackSearchQuery(input.rawTitleOrFileName, input.artistHint);
  const candidates = await searchOriginalMetadata(cleaned.query, {
    artistHint: cleaned.artistHint,
    titleHint: cleaned.titleHint,
    durationSec: input.durationSec,
    signal: input.signal,
  });

  const matched = candidates[0] ?? null;
  let lyrics: LyricLine[] = [];
  if (matched && input.withLyrics !== false) {
    lyrics = await fetchOriginalLyrics(
      matched.title,
      matched.artist,
      matched.durationSec ?? input.durationSec,
      input.signal
    );
  }

  return {
    query: cleaned.query,
    artistHint: cleaned.artistHint,
    titleHint: cleaned.titleHint,
    matched,
    candidates,
    lyrics,
  };
}
