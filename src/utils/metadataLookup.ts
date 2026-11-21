import type { LyricLine, MetadataCandidate } from '../types/music';

const AUDIO_EXT_REGEX =
  /\.(mp3|flac|wav|ogg|oga|m4a|aac|opus|webm|alac|aiff|aif)$/i;

const SITE_WATERMARK_REGEX =
  /\b(zaycev\.net|muzofond(?:\.\w+)?|muzmo(?:\.\w+)?|myzuka(?:\.\w+)?|spaces\.im|vk\.com|mp3\.cc|musify(?:\.\w+)?|z2\.fm|pleer\.net|lightaudio|x-minus|promodj|mp3party(?:\.\w+)?|drivemusic(?:\.\w+)?|sefon(?:\.\w+)?|hitmo(?:\.\w+)?|zvukogram(?:\.\w+)?|mp3uk(?:\.\w+)?|kissvk(?:\.\w+)?|skachat-mp3)\b/gi;

const JUNK_BRACKETS_REGEX =
  /[\(\[]\s*(?:official\s*(?:music\s*)?(?:video|audio|visualizer|lyric\s*video)|lyric(?:s)?\s*(?:video)?|audio|hd|hq|4k|explicit(?:\s*version)?|clean(?:\s*version)?|radio\s*edit|original\s*mix|remaster(?:ed)?(?:\s*\d{4})?|bonus\s*track|slowed(?:\s*(?:\+|and|&)?\s*reverb)?|reverb|bass\s*boost(?:ed)?|nightcore|speed\s*up|sped\s*up|tiktok(?:\s*(?:version|remix))?|8d\s*audio|full\s*version|snippet|unreleased|prod\.?(?:\s*by)?\s+[^)\]]+|\d{2,3}\s*kbps|mp3|flac|wav|m4a|vbr|cbr|www\.[^)\]]+|[a-z0-9-]+\.(?:net|ru|com|org|me|cc|fm|im))\s*[\)\]]/gi;

const TRAILING_PROD_REGEX =
  /\s+\b(?:prod\.?(?:\s+by)?)\s+[^-–—|]+$/gi;

const FEAT_SEGMENT_REGEX =
  /(?:\s*[\(\[]\s*\b(?:feat\.?|ft\.?|featuring)\b[^)\]]*[\)\]]|\s+\b(?:feat\.?|ft\.?|featuring)\b\s+.+$)/gi;

export interface CleanedSearchQuery {
  query: string;
  artistHint: string;
  titleHint: string;
  hasCyrillic: boolean;
}

export function normalizeCompareText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsCyrillic(value: string): boolean {
  return /[\u0400-\u04FF]/.test(value);
}

export function cleanTrackSearchQuery(
  rawNameOrFileName: string,
  explicitArtist?: string
): CleanedSearchQuery {
  let cleaned = rawNameOrFileName
    .trim()
    .replace(AUDIO_EXT_REGEX, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ' ')
    .replace(/_/g, ' ')
    .replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}\s*[-.)])\s*/, '')
    .replace(SITE_WATERMARK_REGEX, ' ')
    .replace(JUNK_BRACKETS_REGEX, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s*[\(\[]\d{1,2}[\)\]]\s*$/, '')
    .replace(TRAILING_PROD_REGEX, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  cleaned = cleaned.replace(/^[-–—|•\s]+|[-–—|•\s]+$/g, '').trim();

  let artistHint = '';
  let titleHint = cleaned;

  const separators = [' — ', ' – ', ' - ', ' | '];
  for (const sep of separators) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0 && idx < cleaned.length - sep.length) {
      const left = cleaned.slice(0, idx).trim();
      const right = cleaned.slice(idx + sep.length).trim();
      if (left && right) {
        artistHint = left;
        titleHint = right;
        break;
      }
    }
  }

  if (
    !artistHint &&
    explicitArtist &&
    explicitArtist.trim() &&
    explicitArtist.trim() !== 'Локальный файл'
  ) {
    artistHint = explicitArtist.trim();
  }

  const cleanArtistForQuery = artistHint.replace(FEAT_SEGMENT_REGEX, ' ').replace(/\s+/g, ' ').trim();
  const cleanTitleForQuery = titleHint.replace(FEAT_SEGMENT_REGEX, ' ').replace(/\s+/g, ' ').trim();

  const query = [cleanArtistForQuery, cleanTitleForQuery || titleHint]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    query: query || rawNameOrFileName.replace(AUDIO_EXT_REGEX, '').trim(),
    artistHint: cleanArtistForQuery || artistHint,
    titleHint: cleanTitleForQuery || titleHint || rawNameOrFileName.replace(AUDIO_EXT_REGEX, '').trim(),
    hasCyrillic: containsCyrillic(query),
  };
}

export function buildFallbackSearchQueries(params: {
  query: string;
  artistHint?: string;
  titleHint?: string;
}): Array<{ query: string; artistHint: string; titleHint: string }> {
  const baseQuery = params.query.trim();
  const artistHint = (params.artistHint ?? '').trim();
  const titleHint = (params.titleHint ?? '').trim();

  const seen = new Set<string>([normalizeCompareText(baseQuery)]);
  const variants: Array<{ query: string; artistHint: string; titleHint: string }> = [];

  const pushVariant = (q: string, a: string, t: string) => {
    const cleanQ = q.replace(/\s+/g, ' ').trim();
    const norm = normalizeCompareText(cleanQ);
    if (!cleanQ || cleanQ.length < 2 || seen.has(norm)) return;
    seen.add(norm);
    variants.push({ query: cleanQ, artistHint: a, titleHint: t });
  };

  // 1) Primary artist only + stripped parenthetical title
  const primaryArtist = artistHint.split(/,|&|\bx\b|\bи\b/i)[0]?.trim() ?? '';
  const coreTitle = titleHint
    .replace(/[\(\[][^)\]]*[\)\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (primaryArtist && (coreTitle || titleHint)) {
    pushVariant(`${primaryArtist} ${coreTitle || titleHint}`, primaryArtist, coreTitle || titleHint);
  }

  // 2) Core title without any leftover parentheticals (plus full artist if different)
  if (coreTitle && coreTitle !== titleHint) {
    pushVariant(
      [artistHint, coreTitle].filter(Boolean).join(' '),
      artistHint,
      coreTitle
    );
  }

  // 3) Title-only fallback (helpful when uploader put a channel/remix label in the artist slot)
  const fallbackTitle = coreTitle || titleHint;
  if (artistHint && fallbackTitle && normalizeCompareText(fallbackTitle).length >= 3) {
    pushVariant(fallbackTitle, '', fallbackTitle);
  }

  return variants.slice(0, 3);
}

function tokenOverlapScore(expected: string, actual: string): number {
  const expNorm = normalizeCompareText(expected);
  const actNorm = normalizeCompareText(actual);
  if (!expNorm || !actNorm) return 0;
  if (expNorm === actNorm) return 1.0;
  if (actNorm.includes(expNorm) || expNorm.includes(actNorm)) return 0.85;

  const expTokens = expNorm.split(' ').filter((t) => t.length > 1);
  const actSet = new Set(actNorm.split(' ').filter((t) => t.length > 1));
  if (expTokens.length === 0 || actSet.size === 0) return 0;

  let hits = 0;
  for (const tok of expTokens) {
    if (actSet.has(tok)) hits++;
  }
  return hits / Math.max(expTokens.length, actSet.size);
}

const TRIBUTE_PENALTY_TERMS = [
  'karaoke',
  '8-bit',
  '8 bit',
  'tribute',
  'lullaby',
  'ringtone',
  'made famous',
  'originally performed',
  'instrumental version',
  'cover version',
  'karaoke version',
];

const ALT_VERSION_PENALTY_TERMS = [
  'remix',
  'mixed',
  'live',
  'acoustic',
  'sped up',
  'slowed',
  'reverb',
  'mashup',
  'bootleg',
  'club mix',
  'extended mix',
  'instrumental',
];

export function scoreMetadataCandidate(
  candidate: MetadataCandidate,
  hints: { query: string; artistHint?: string; titleHint?: string; durationSec?: number }
): number {
  let score = 0;

  const titleHint = hints.titleHint?.trim() || hints.query.trim();
  const artistHint = hints.artistHint?.trim() || '';
  const normTitleHint = normalizeCompareText(titleHint);
  const normCandTitle = normalizeCompareText(candidate.title);
  const normArtistHint = normalizeCompareText(artistHint);
  const normCandArtist = normalizeCompareText(candidate.artist);

  if (titleHint && artistHint) {
    const directScore =
      tokenOverlapScore(titleHint, candidate.title) * 55 +
      (normTitleHint && normCandTitle === normTitleHint ? 30 : 0) +
      tokenOverlapScore(artistHint, candidate.artist) * 45 +
      (normArtistHint && normCandArtist === normArtistHint ? 20 : 0);

    const swappedScore =
      (tokenOverlapScore(artistHint, candidate.title) * 55 +
        (normArtistHint && normCandTitle === normArtistHint ? 30 : 0) +
        tokenOverlapScore(titleHint, candidate.artist) * 45 +
        (normTitleHint && normCandArtist === normTitleHint ? 20 : 0)) *
      0.92;

    score += Math.max(directScore, swappedScore);
  } else if (titleHint) {
    score += tokenOverlapScore(titleHint, candidate.title) * 55;
    if (normTitleHint && normCandTitle === normTitleHint) {
      score += 30;
    }
    score += tokenOverlapScore(hints.query, `${candidate.artist} ${candidate.title}`) * 25;
  } else {
    score += tokenOverlapScore(hints.query, `${candidate.artist} ${candidate.title}`) * 45;
  }

  if (
    typeof hints.durationSec === 'number' &&
    Number.isFinite(hints.durationSec) &&
    hints.durationSec > 10 &&
    typeof candidate.durationSec === 'number' &&
    candidate.durationSec > 10
  ) {
    const diff = Math.abs(hints.durationSec - candidate.durationSec);
    if (diff <= 3) score += 14;
    else if (diff <= 8) score += 8;
    else if (diff <= 20) score += 2;
    else if (diff > 60) score -= 8;
  }

  // Prefer entries with real cover art, valid release year & non-remix album
  if (candidate.coverUrl) score += 6;
  if (candidate.year > 1900) score += 6;
  if (candidate.album && candidate.album !== candidate.title) score += 4;
  if (candidate.source === 'itunes') score += 4;

  const qNorm = normalizeCompareText(hints.query);
  const candTitleNorm = normalizeCompareText(candidate.title);
  const candAlbumNorm = normalizeCompareText(candidate.album);
  const candCombined = normalizeCompareText(`${candidate.title} ${candidate.artist} ${candidate.album}`);

  for (const term of TRIBUTE_PENALTY_TERMS) {
    if (candCombined.includes(term) && !qNorm.includes(term)) {
      score -= 40;
    }
  }

  for (const term of ALT_VERSION_PENALTY_TERMS) {
    if (candTitleNorm.includes(term) && !qNorm.includes(term)) {
      score -= 30;
    } else if (candAlbumNorm.includes(term) && !qNorm.includes(term)) {
      score -= 10;
    }
  }

  return Number(score.toFixed(2));
}

export function rankAndDedupeCandidates(
  candidates: MetadataCandidate[],
  hints: { query: string; artistHint?: string; titleHint?: string; durationSec?: number }
): MetadataCandidate[] {
  const seen = new Map<string, { cand: MetadataCandidate; score: number }>();

  for (const cand of candidates) {
    if (!cand.title.trim() || !cand.artist.trim()) continue;
    const key = `${normalizeCompareText(cand.artist)}::${normalizeCompareText(cand.title)}::${normalizeCompareText(cand.album)}`;
    const score = scoreMetadataCandidate(cand, hints);
    const existing = seen.get(key);
    if (!existing || score > existing.score) {
      seen.set(key, { cand, score });
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.cand);
}

export function formatItunesCoverUrl(url: string, size = 600): string {
  if (!url) return '';
  return url
    .replace(/^http:\/\//i, 'https://')
    .replace(/\/\d+x\d+bb\.(jpg|jpeg|png|webp)$/i, `/${size}x${size}bb.$1`);
}

const ALLOWED_COVER_HOST_SUFFIXES = [
  '.mzstatic.com',
  '.dzcdn.net',
  'coverartarchive.org',
  '.archive.org',
];

export function isAllowedCoverHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (!lower) return false;
  return ALLOWED_COVER_HOST_SUFFIXES.some((suffix) =>
    suffix.startsWith('.') ? lower.endsWith(suffix) || lower === suffix.slice(1) : lower === suffix || lower.endsWith(`.${suffix}`)
  );
}

export function buildProxiedCoverUrl(externalUrl: string): string {
  if (!externalUrl) return '';
  try {
    const parsed = new URL(externalUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (!isAllowedCoverHost(parsed.hostname)) return '';
    return `/api/metadata/cover?url=${encodeURIComponent(externalUrl)}`;
  } catch {
    return '';
  }
}

export function parseLrcLyrics(
  syncedLyrics?: string | null,
  plainLyrics?: string | null,
  durationSec = 180
): LyricLine[] {
  if (typeof syncedLyrics === 'string' && syncedLyrics.trim()) {
    const lines: LyricLine[] = [];
    const linePattern = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;
    for (const rawLine of syncedLyrics.split(/\r?\n/)) {
      const match = rawLine.trim().match(linePattern);
      if (!match) continue;
      const mins = Number(match[1]);
      const secs = Number(match[2]);
      const fracRaw = match[3] ?? '0';
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
      const text = match[4].trim();
      if (!text) continue;
      lines.push({
        time: Math.max(0, Math.round((mins * 60 + secs + frac) * 10) / 10),
        text,
      });
    }
    if (lines.length > 0) {
      return lines.sort((a, b) => a.time - b.time);
    }
  }

  if (typeof plainLyrics === 'string' && plainLyrics.trim()) {
    const rawLines = plainLyrics
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (rawLines.length === 0) return [];
    const safeDur = Number.isFinite(durationSec) && durationSec > 20 ? durationSec : 180;
    const step = Math.max(2, (safeDur - 8) / rawLines.length);
    return rawLines.map((text, idx) => ({
      time: Math.round(4 + idx * step),
      text,
    }));
  }

  return [];
}
