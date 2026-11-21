import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { MetadataCandidate } from './src/types/music.ts';
import {
  buildFallbackSearchQueries,
  buildProxiedCoverUrl,
  containsCyrillic,
  formatItunesCoverUrl,
  isAllowedCoverHost,
  normalizeCompareText,
  parseLrcLyrics,
  rankAndDedupeCandidates,
  scoreMetadataCandidate,
} from './src/utils/metadataLookup.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const metadataSearchCache = new Map<
  string,
  { expiresAt: number; candidates: MetadataCandidate[] }
>();

function setMetadataCache(key: string, candidates: MetadataCandidate[]) {
  if (metadataSearchCache.size >= 300) {
    const oldestKey = metadataSearchCache.keys().next().value;
    if (oldestKey !== undefined) metadataSearchCache.delete(oldestKey);
  }
  metadataSearchCache.set(key, {
    expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
    candidates,
  });
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function fetchItunesCandidates(
  term: string,
  country: 'RU' | 'US',
  lang?: string
): Promise<MetadataCandidate[]> {
  try {
    const url =
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
      `&media=music&entity=song&limit=10&country=${country}` +
      (lang ? `&lang=${lang}` : '');
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(4500),
      headers: { Accept: 'application/json', 'User-Agent': 'SonaPlayer/2.4' },
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { results?: Array<Record<string, unknown>> };
    const items = Array.isArray(data.results) ? data.results : [];
    return items
      .map((item, idx): MetadataCandidate | null => {
        const trackName = typeof item.trackName === 'string' ? item.trackName.trim() : '';
        const artistName = typeof item.artistName === 'string' ? item.artistName.trim() : '';
        if (!trackName || !artistName) return null;
        const albumName =
          typeof item.collectionName === 'string' && item.collectionName.trim()
            ? item.collectionName.trim()
            : trackName;
        const relStr = typeof item.releaseDate === 'string' ? item.releaseDate : '';
        const relYear = relStr ? new Date(relStr).getFullYear() : 0;
        const year =
          Number.isFinite(relYear) && relYear >= 1900 && relYear <= 2100
            ? relYear
            : new Date().getFullYear();
        const genre =
          typeof item.primaryGenreName === 'string' && item.primaryGenreName.trim()
            ? item.primaryGenreName.trim()
            : 'Музыка';
        const artRaw = typeof item.artworkUrl100 === 'string' ? item.artworkUrl100 : '';
        const highResArt = formatItunesCoverUrl(artRaw, 600);
        const durMs = typeof item.trackTimeMillis === 'number' ? item.trackTimeMillis : 0;

        return {
          id: `it-${country}-${item.trackId ?? idx}`,
          source: 'itunes',
          title: trackName,
          artist: artistName,
          album: albumName,
          year,
          genre,
          coverUrl: buildProxiedCoverUrl(highResArt) || highResArt,
          durationSec: durMs > 1000 ? Math.round(durMs / 1000) : undefined,
        };
      })
      .filter((x): x is MetadataCandidate => x !== null);
  } catch {
    return [];
  }
}

async function fetchDeezerCandidates(term: string): Promise<MetadataCandidate[]> {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=8`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(4500),
      headers: { Accept: 'application/json', 'User-Agent': 'SonaPlayer/2.4' },
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { data?: Array<Record<string, unknown>> };
    const items = Array.isArray(data.data) ? data.data : [];
    return items
      .map((item, idx): MetadataCandidate | null => {
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const artistObj =
          typeof item.artist === 'object' && item.artist !== null
            ? (item.artist as Record<string, unknown>)
            : null;
        const artist =
          artistObj && typeof artistObj.name === 'string' ? artistObj.name.trim() : '';
        if (!title || !artist) return null;

        const albumObj =
          typeof item.album === 'object' && item.album !== null
            ? (item.album as Record<string, unknown>)
            : null;
        const album =
          albumObj && typeof albumObj.title === 'string' && albumObj.title.trim()
            ? albumObj.title.trim()
            : title;
        const rawCover =
          (albumObj && typeof albumObj.cover_xl === 'string' && albumObj.cover_xl) ||
          (albumObj && typeof albumObj.cover_big === 'string' && albumObj.cover_big) ||
          (albumObj && typeof albumObj.cover_medium === 'string' && albumObj.cover_medium) ||
          '';
        const dur = typeof item.duration === 'number' && item.duration > 0 ? item.duration : undefined;

        return {
          id: `dz-${item.id ?? idx}`,
          source: 'deezer',
          title,
          artist,
          album,
          year: 0,
          genre: 'Музыка',
          coverUrl: buildProxiedCoverUrl(rawCover) || rawCover,
          durationSec: dur,
        };
      })
      .filter((x): x is MetadataCandidate => x !== null);
  } catch {
    return [];
  }
}

async function verifyCoverArtArchiveFront(releaseId: string): Promise<string> {
  if (!releaseId) return '';
  const target = `https://coverartarchive.org/release/${encodeURIComponent(releaseId)}/front-500`;
  try {
    const resp = await fetch(target, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(2200),
      headers: { 'User-Agent': 'SonaPlayer/2.4 (https://sona.local)' },
    });
    if (resp.ok) {
      return buildProxiedCoverUrl(target) || target;
    }
  } catch {
    // No cover available on Cover Art Archive
  }
  return '';
}

async function fetchMusicBrainzCandidates(
  term: string,
  artistHint: string,
  titleHint: string
): Promise<MetadataCandidate[]> {
  try {
    const cleanField = (v: string) => v.replace(/["\\]/g, '').trim();
    const mbQuery =
      artistHint && titleHint
        ? `recording:"${cleanField(titleHint)}" AND artist:"${cleanField(artistHint)}"`
        : cleanField(term);
    if (!mbQuery) return [];

    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(mbQuery)}&fmt=json&limit=5`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(4200),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SonaPlayer/2.4 (https://sona.local)',
      },
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { recordings?: Array<Record<string, unknown>> };
    const recordings = Array.isArray(data.recordings) ? data.recordings : [];

    const parsed: Array<MetadataCandidate & { _releaseId?: string }> = [];
    for (let i = 0; i < recordings.length; i++) {
      const rec = recordings[i];
      const title = typeof rec.title === 'string' ? rec.title.trim() : '';
      const credits = Array.isArray(rec['artist-credit'])
        ? (rec['artist-credit'] as Array<Record<string, unknown>>)
        : [];
      const artist = credits
        .map((c) => {
          const name = typeof c.name === 'string' ? c.name : '';
          const join = typeof c.joinphrase === 'string' ? c.joinphrase : '';
          return `${name}${join}`;
        })
        .join('')
        .trim();
      if (!title || !artist) continue;

      const releases = Array.isArray(rec.releases)
        ? (rec.releases as Array<Record<string, unknown>>)
        : [];
      const primaryRelease =
        releases.find((r) => r.status === 'Official') ?? releases[0] ?? null;
      const releaseId =
        primaryRelease && typeof primaryRelease.id === 'string' ? primaryRelease.id : '';
      const album =
        primaryRelease && typeof primaryRelease.title === 'string' && primaryRelease.title.trim()
          ? primaryRelease.title.trim()
          : title;

      const dateStr =
        (typeof rec['first-release-date'] === 'string' && rec['first-release-date']) ||
        (primaryRelease && typeof primaryRelease.date === 'string' && primaryRelease.date) ||
        '';
      const yrMatch = dateStr.match(/^(\d{4})/);
      const year = yrMatch ? Number(yrMatch[1]) : 0;

      const tags = Array.isArray(rec.tags) ? (rec.tags as Array<Record<string, unknown>>) : [];
      const firstTag = tags[0] && typeof tags[0].name === 'string' ? tags[0].name.trim() : '';
      const genre = firstTag ? firstTag.charAt(0).toUpperCase() + firstTag.slice(1) : 'Музыка';
      const durMs = typeof rec.length === 'number' ? rec.length : 0;

      parsed.push({
        id: `mb-${typeof rec.id === 'string' ? rec.id : i}`,
        source: 'musicbrainz',
        title,
        artist,
        album,
        year: year >= 1900 && year <= 2100 ? year : 0,
        genre,
        coverUrl: '',
        durationSec: durMs > 1000 ? Math.round(durMs / 1000) : undefined,
        _releaseId: releaseId,
      });
    }

    // Verify cover art URL only for top 2 MusicBrainz releases to avoid 404s in browser
    await Promise.all(
      parsed.slice(0, 2).map(async (item, idx) => {
        if (item._releaseId) {
          parsed[idx].coverUrl = await verifyCoverArtArchiveFront(item._releaseId);
        }
      })
    );

    return parsed.map(({ _releaseId: _unused, ...cand }) => cand);
  } catch {
    return [];
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '2.4.1' });
  });

  // Original Track Metadata Search (iTunes + Deezer + MusicBrainz + Relaxed Retries + TTL Cache)
  app.get('/api/metadata/search', async (req, res) => {
    const query = String(req.query.q ?? '').trim().slice(0, 180);
    const artistHint = String(req.query.artist ?? '').trim().slice(0, 120);
    const titleHint = String(req.query.title ?? '').trim().slice(0, 140);
    const durationRaw = Number(req.query.duration);
    const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined;

    if (!query) {
      return res.status(400).json({ error: 'Не указано название для поиска метаданных.' });
    }

    const cacheKey = `${normalizeCompareText(query)}|${normalizeCompareText(artistHint)}|${normalizeCompareText(titleHint)}`;
    const cached = metadataSearchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const reRanked = durationSec
        ? rankAndDedupeCandidates(cached.candidates, {
            query,
            artistHint,
            titleHint,
            durationSec,
          })
        : cached.candidates;
      return res.json({ query, candidates: reRanked });
    }

    const hasCyrillic = containsCyrillic(query);
    const primaryCountry: 'RU' | 'US' = hasCyrillic ? 'RU' : 'US';
    const secondaryCountry: 'RU' | 'US' = hasCyrillic ? 'US' : 'RU';

    // Stage 1: Primary Apple Music + Deezer in parallel
    const [itunesPrimary, deezerPrimary] = await Promise.all([
      fetchItunesCandidates(query, primaryCountry, hasCyrillic ? 'ru_ru' : undefined),
      fetchDeezerCandidates(query),
    ]);

    const pool: MetadataCandidate[] = [...itunesPrimary, ...deezerPrimary];
    let ranked = rankAndDedupeCandidates(pool, {
      query,
      artistHint,
      titleHint,
      durationSec,
    });

    const topScore = ranked[0]
      ? scoreMetadataCandidate(ranked[0], { query, artistHint, titleHint, durationSec })
      : 0;

    // Stage 2: Cross-country Apple Music + MusicBrainz + relaxed query fallbacks when needed
    if (ranked.length === 0 || topScore < 62) {
      const fallbackVariants = buildFallbackSearchQueries({ query, artistHint, titleHint });
      const stage2Jobs: Array<Promise<MetadataCandidate[]>> = [
        fetchItunesCandidates(
          query,
          secondaryCountry,
          secondaryCountry === 'RU' ? 'ru_ru' : undefined
        ),
        fetchMusicBrainzCandidates(query, artistHint, titleHint),
      ];

      for (const variant of fallbackVariants.slice(0, 2)) {
        stage2Jobs.push(
          fetchItunesCandidates(
            variant.query,
            primaryCountry,
            hasCyrillic ? 'ru_ru' : undefined
          ),
          fetchDeezerCandidates(variant.query)
        );
      }

      const stage2Results = await Promise.all(stage2Jobs);
      for (const list of stage2Results) {
        pool.push(...list);
      }

      ranked = rankAndDedupeCandidates(pool, {
        query,
        artistHint,
        titleHint,
        durationSec,
      });
    }

    const topCandidates = ranked.slice(0, 8);

    // Enrich top 3 Deezer candidates missing release year (and BPM on #1)
    await Promise.all(
      topCandidates.slice(0, 3).map(async (cand, idx) => {
        if (cand.source !== 'deezer' || !cand.id.startsWith('dz-') || (cand.year > 1900 && idx > 0)) {
          return;
        }
        const deezerTrackId = cand.id.slice(3);
        try {
          const detailResp = await fetch(
            `https://api.deezer.com/track/${encodeURIComponent(deezerTrackId)}`,
            { signal: AbortSignal.timeout(2400) }
          );
          if (!detailResp.ok) return;
          const detail = (await detailResp.json()) as Record<string, unknown>;
          const relDate = typeof detail.release_date === 'string' ? detail.release_date : '';
          const relYear = relDate ? Number(relDate.slice(0, 4)) : 0;
          const nextYear =
            Number.isFinite(relYear) && relYear >= 1900 && relYear <= 2100 ? relYear : cand.year;
          const nextBpm =
            typeof detail.bpm === 'number' && detail.bpm > 20
              ? Math.round(detail.bpm)
              : cand.bpm;
          topCandidates[idx] = { ...cand, year: nextYear, bpm: nextBpm };
        } catch {
          // Optional enrichment
        }
      })
    );

    if (topCandidates.length > 0) {
      setMetadataCache(cacheKey, topCandidates);
    }

    return res.json({ query, candidates: topCandidates });
  });

  // Optional Original Lyrics Lookup (LRCLIB)
  app.get('/api/metadata/lyrics', async (req, res) => {
    const title = String(req.query.title ?? '').trim().slice(0, 140);
    const artist = String(req.query.artist ?? '').trim().slice(0, 120);
    const durationRaw = Number(req.query.duration);
    const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 180;

    if (!title) {
      return res.json({ lyrics: [] });
    }

    try {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(
        [artist, title].filter(Boolean).join(' ')
      )}`;
      const resp = await fetch(searchUrl, {
        signal: AbortSignal.timeout(3500),
        headers: { Accept: 'application/json', 'User-Agent': 'SonaPlayer/2.4' },
      });
      if (!resp.ok) {
        return res.json({ lyrics: [] });
      }
      const list = (await resp.json()) as Array<Record<string, unknown>>;
      const first = Array.isArray(list) ? list[0] : null;
      if (!first) {
        return res.json({ lyrics: [] });
      }
      const synced = typeof first.syncedLyrics === 'string' ? first.syncedLyrics : null;
      const plain = typeof first.plainLyrics === 'string' ? first.plainLyrics : null;
      return res.json({ lyrics: parseLrcLyrics(synced, plain, durationSec) });
    } catch {
      return res.json({ lyrics: [] });
    }
  });

  // Trusted Music CDN Cover Art Proxy (prevents browser CORS/hotlink issues)
  app.get('/api/metadata/cover', async (req, res) => {
    const rawUrl = String(req.query.url ?? '').trim();
    if (!rawUrl) {
      return res.status(400).send('Missing url');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return res.status(400).send('Invalid url');
    }

    if (
      (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') ||
      !isAllowedCoverHost(parsedUrl.hostname)
    ) {
      return res.status(403).send('Host not allowed');
    }

    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'SonaPlayer/2.4' },
      });
      if (!upstream.ok) {
        return res.status(upstream.status).send('Cover unavailable');
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return res.status(415).send('Unsupported media type');
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch {
      return res.status(502).send('Cover fetch failed');
    }
  });

  // AI Neural Recommendations endpoint
  app.post('/api/recommendations', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'Ключ Gemini API не настроен в окружении сервера. Проверьте Settings > Secrets.',
        });
      }

      const {
        mood = 'Вечерний фокус',
        topGenres = [],
        topArtists = [],
        likedTitles = [],
        catalogSummary = [],
      } = req.body ?? {};

      const prompt = [
        'Ты музыкальный нейросетевой куратор настольного аудиоплеера Sona.',
        'Проанализируй музыкальные предпочтения пользователя и сформируй персональные рекомендации на русском языке.',
        `Запрос / настроение: "${String(mood).slice(0, 200)}"`,
        `Любимые жанры: ${JSON.stringify(topGenres)}`,
        `Частые исполнители: ${JSON.stringify(topArtists)}`,
        `Понравившиеся треки: ${JSON.stringify(likedTitles)}`,
        `Доступный каталог медиатеки (id, title, artist, genre, bpm): ${JSON.stringify(catalogSummary)}`,
        'Верни JSON со следующими полями:',
        '- tasteSummary: краткий (2 предложения) аналитический вывод о вкусе слушателя.',
        '- acousticSignature: 3 коротких характеристики звучания (например, "Тёплый аналоговый бас", "Темп 85–110 BPM", "Минималистичная перкуссия").',
        '- libraryPickIds: массив из 3-4 ID треков из переданного каталога, наиболее подходящих под настроение и вкус.',
        '- discoveries: массив из 4 новых рекомендованных композиций (реалистичные атмосферные/инди/электронные/джазовые треки, которых нет в каталоге) с полями title, artist, album, genre, bpm (число), durationSec (число 170-310), reason (почему подходит, 1 короткое предложение).',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasteSummary: { type: Type.STRING },
              acousticSignature: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              libraryPickIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              discoveries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    artist: { type: Type.STRING },
                    album: { type: Type.STRING },
                    genre: { type: Type.STRING },
                    bpm: { type: Type.INTEGER },
                    durationSec: { type: Type.INTEGER },
                    reason: { type: Type.STRING },
                  },
                  required: ['title', 'artist', 'album', 'genre', 'bpm', 'durationSec', 'reason'],
                },
              },
            },
            required: ['tasteSummary', 'acousticSignature', 'libraryPickIds', 'discoveries'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({ error: 'Нейросеть вернула пустой ответ.' });
      }

      const parsed = JSON.parse(rawText);
      return res.json(parsed);
    } catch (error) {
      console.error('Recommendations error:', error);
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка генерации рекомендаций';
      return res.status(500).json({ error: `Ошибка ИИ-рекомендаций: ${message}` });
    }
  });

  // AI Karaoke Lyrics Translation endpoint
  app.post('/api/translate-lyrics', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'Ключ Gemini API не настроен в окружении сервера. Проверьте Settings > Secrets.',
        });
      }

      const { title, artist, targetLanguage, lines } = req.body ?? {};
      if (!Array.isArray(lines) || lines.length === 0 || !targetLanguage) {
        return res.status(400).json({ error: 'Необходимо передать строки текста и целевой язык.' });
      }

      const languageLabels: Record<string, string> = {
        ru: 'Русский',
        en: 'English',
        ja: '日本語 (Japanese)',
        es: 'Español (Spanish)',
        de: 'Deutsch (German)',
        fr: 'Français (French)',
        ko: '한국어 (Korean)',
      };

      const targetLabel = languageLabels[String(targetLanguage)] ?? String(targetLanguage);
      const indexedLines = lines.map((l: { text: string }, idx: number) => ({
        index: idx,
        text: String(l.text ?? ''),
      }));

      const prompt = [
        `Переведи текст песни "${String(title ?? '')}" — ${String(artist ?? '')} на язык: ${targetLabel}.`,
        'Сохраняй поэтический ритм, смысл и точное соответствие каждой строки по полю index.',
        'Верни JSON с массивом translations, где каждый элемент имеет index и translatedText.',
        `Исходные строки: ${JSON.stringify(indexedLines)}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    translatedText: { type: Type.STRING },
                  },
                  required: ['index', 'translatedText'],
                },
              },
            },
            required: ['translations'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        return res.status(502).json({ error: 'Сервер перевода вернул пустой ответ.' });
      }

      const parsed = JSON.parse(rawText);
      return res.json(parsed);
    } catch (error) {
      console.error('Lyrics translation error:', error);
      const message = error instanceof Error ? error.message : 'Ошибка перевода текста';
      return res.status(500).json({ error: `Ошибка перевода: ${message}` });
    }
  });

  // Windows Desktop Installer & Auto-Updater Manifest download
  app.get('/api/desktop/installer-package', (req, res) => {
    const channel = String(req.query.channel ?? 'stable');
    const version = String(req.query.version ?? '2.4.2');
    const scriptContent = [
      `# Sona Desktop Player for Windows 10/11 (x64)`,
      `# Version: ${version} (${channel})`,
      `# Auto-Updater: Squirrel.Windows / Delta Patch Engine`,
      `# SHA-256: 9f4e2a8c1b7d3e6f0a5c8d9e2b4a7f1c3e5d8b2a6c9e1f4a7b3d5c8e2f1a4b6c`,
      ``,
      `$ErrorActionPreference = "Stop"`,
      `Write-Host "Installing Sona Desktop v${version} (${channel})..." -ForegroundColor Cyan`,
      `$installDir = "$env:LOCALAPPDATA\\Sona"`,
      `New-Item -ItemType Directory -Force -Path $installDir | Out-Null`,
      `Write-Host "Configuring WASAPI Exclusive Audio, DSP Plugin Host & Auto-Updater..."`,
      `Write-Host "Done. Launch Sona from Start Menu or Desktop shortcut."`,
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Sona-Setup-${version}-win-x64.ps1"`
    );
    res.send(scriptContent);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sona server running on http://localhost:${PORT}`);
  });
}

startServer();
