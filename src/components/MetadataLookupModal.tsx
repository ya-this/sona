import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Loader2, Search, Sparkles, X } from 'lucide-react';
import type { LyricLine, MetadataCandidate, Track } from '../types/music';
import { cleanTrackSearchQuery } from '../utils/metadataLookup';
import { fetchOriginalLyrics, searchOriginalMetadata } from '../utils/metadataClient';
import { CoverArt } from './CoverArt';

interface MetadataLookupModalProps {
  track: Track | null;
  onClose: () => void;
  onApplyMetadata: (
    trackId: string,
    patch: {
      title: string;
      artist: string;
      album: string;
      year: number;
      genre: string;
      coverUrl: string;
      bpm?: number;
      lyrics?: LyricLine[];
    }
  ) => void;
}

export function MetadataLookupModal({
  track,
  onClose,
  onApplyMetadata,
}: MetadataLookupModalProps) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<MetadataCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runSearch = async (searchStr: string, currentTrack: Track, signal?: AbortSignal) => {
    const clean = cleanTrackSearchQuery(searchStr, currentTrack.artist);
    const term = clean.query || searchStr.trim();
    if (!term) return;

    setLoading(true);
    setErrorText(null);
    try {
      const results = await searchOriginalMetadata(term, {
        artistHint: clean.artistHint,
        titleHint: clean.titleHint,
        durationSec: currentTrack.durationSec,
        signal,
      });
      setCandidates(results);
      if (results.length === 0) {
        setErrorText('Оригинальный релиз не найден. Попробуйте уточнить артиста и название.');
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setErrorText('Не удалось выполнить поиск метаданных. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!track) return;
    const rawSource = track.originalFileName || `${track.artist === 'Локальный файл' ? '' : `${track.artist} - `}${track.title}`;
    const cleaned = cleanTrackSearchQuery(rawSource, track.artist);
    const initialQuery = cleaned.query || track.title;
    setQuery(initialQuery);
    setCandidates([]);
    setErrorText(null);
    setCopied(false);

    const controller = new AbortController();
    void runSearch(initialQuery, track, controller.signal);

    return () => controller.abort();
  }, [track]);

  useEffect(() => {
    if (!track) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applyingId) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [track, applyingId, onClose]);

  if (!track || typeof document === 'undefined') return null;

  const handleCopyTitle = async () => {
    const textToCopy = query.trim() || track.title;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard fallback not needed
    }
  };

  const handleSelectCandidate = async (cand: MetadataCandidate) => {
    if (applyingId) return;
    setApplyingId(cand.id);
    try {
      const lyrics = await fetchOriginalLyrics(
        cand.title,
        cand.artist,
        cand.durationSec ?? track.durationSec
      );
      onApplyMetadata(track.id, {
        title: cand.title,
        artist: cand.artist,
        album: cand.album,
        year: cand.year,
        genre: cand.genre,
        coverUrl: cand.coverUrl || track.coverUrl,
        bpm: cand.bpm,
        lyrics: lyrics.length > 0 ? lyrics : track.lyrics,
      });
      onClose();
    } finally {
      setApplyingId(null);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="metadata-lookup-title"
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45 backdrop-blur-md dark:bg-black/75 dark:backdrop-blur-none"
      onClick={() => {
        if (!applyingId) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl glass-popover p-5 sm:p-6 space-y-4 max-h-[88vh] flex flex-col"
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="sona-lbl text-[10px] text-zinc-500 dark:text-zinc-400">
              Оригинальные метаданные
            </p>
            <h2
              id="metadata-lookup-title"
              className="font-display text-lg sm:text-xl font-bold tracking-tight text-zinc-950 dark:text-white truncate mt-0.5"
            >
              {track.title}
            </h2>
            {track.originalFileName && (
              <p className="text-[11px] font-mono-tabular text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                Файл: {track.originalFileName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!applyingId) onClose();
            }}
            aria-label="Закрыть поиск метаданных"
            className="w-8 h-8 rounded-full glass-plaque flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input with Copy Button */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query, track);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Исполнитель и название трека..."
              aria-label="Поисковый запрос метаданных"
              className="w-full pl-9 pr-3 py-2 text-xs glass-plaque text-zinc-950 dark:text-white bg-transparent focus:outline-none focus:border-[var(--sona-accent)]"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleCopyTitle()}
            title="Скопировать очищенное название"
            aria-label="Копировать название"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium glass-plaque text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white shrink-0"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold shrink-0 disabled:opacity-40"
            style={{
              backgroundColor: 'var(--sona-accent)',
              color: 'var(--sona-accent-fg)',
              borderRadius: 'var(--sona-radius-sm)',
            }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Найти
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {loading && candidates.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-600 dark:text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p className="text-xs">Ищем оригинальный релиз, обложку и теги...</p>
            </div>
          )}

          {!loading && errorText && candidates.length === 0 && (
            <p className="py-10 text-center text-xs text-zinc-600 dark:text-zinc-400">
              {errorText}
            </p>
          )}

          {candidates.map((cand) => {
            const isApplying = applyingId === cand.id;
            return (
              <div
                key={cand.id}
                className="p-2.5 glass-table-row flex items-center justify-between gap-3"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <CoverArt
                    src={cand.coverUrl}
                    alt={`${cand.artist} — ${cand.title}`}
                    className="w-12 h-12 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
                      {cand.title}
                    </p>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                      {cand.artist} · {cand.album}
                    </p>
                    <p className="text-[11px] font-mono-tabular text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {cand.year > 1900 ? `${cand.year} · ` : ''}
                      {cand.genre} ·{' '}
                      {cand.source === 'itunes'
                        ? 'Apple Music'
                        : cand.source === 'deezer'
                          ? 'Deezer'
                          : 'MusicBrainz'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={Boolean(applyingId)}
                  onClick={() => void handleSelectCandidate(cand)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold shrink-0 transition-opacity hover:opacity-90 disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--sona-accent)',
                    color: 'var(--sona-accent-fg)',
                    borderRadius: 'var(--sona-radius-sm)',
                  }}
                >
                  {isApplying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Подставить
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
