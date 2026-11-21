import { useEffect, useState } from 'react';
import { AlertCircle, Languages, Loader2, Mic2, MicOff } from 'lucide-react';
import type { Track } from '../types/music';
import { findActiveLyricIndex } from '../utils/audioLogic';
import { formatTimecode } from '../utils/stats';
import { CoverArt } from './CoverArt';

interface KaraokeViewProps {
  track: Track | null;
  currentTime: number;
  karaokeMinus: boolean;
  onToggleKaraokeMinus: () => void;
  onSeek: (sec: number) => void;
}

const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ko', label: '한국어' },
];

export function KaraokeView({
  track,
  currentTime,
  karaokeMinus,
  onToggleKaraokeMinus,
  onSeek,
}: KaraokeViewProps) {
  const [targetLang, setTargetLang] = useState('ru');
  const [translations, setTranslations] = useState<Record<string, Record<number, string>>>({});
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [track?.id, targetLang]);

  if (!track) {
    return (
      <div className="py-20 text-center text-sm text-zinc-500">
        Выберите трек для караоке
      </div>
    );
  }

  const cacheKey = `${track.id}:${targetLang}`;
  const currentTranslation = translations[cacheKey] ?? null;
  const activeIdx = findActiveLyricIndex(track.lyrics, currentTime);

  const handleTranslate = async () => {
    if (track.lyrics.length === 0) return;
    setTranslating(true);
    setError(null);
    try {
      const response = await fetch('/api/translate-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist,
          targetLanguage: targetLang,
          lines: track.lyrics,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка перевода');
      }
      const mapped: Record<number, string> = {};
      if (Array.isArray(data.translations)) {
        for (const item of data.translations) {
          mapped[item.index] = item.translatedText;
        }
      }
      setTranslations((prev) => ({ ...prev, [cacheKey]: mapped }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка перевода');
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="space-y-5 pb-4">
      <section
        className="p-5 glass-surface flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <CoverArt src={track.coverUrl} alt={track.title} className="w-14 h-14 shadow-md" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white truncate">
              {track.title}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {track.artist} · {track.album}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleKaraokeMinus}
            aria-pressed={karaokeMinus}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              karaokeMinus
                ? 'border border-[var(--sona-accent)] bg-[var(--sona-accent-soft)] text-zinc-950 dark:text-white'
                : 'glass-subtle text-zinc-700 dark:text-zinc-200 hover:bg-white/70 dark:hover:bg-white/10'
            }`}
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            {karaokeMinus ? (
              <MicOff className="w-3.5 h-3.5" style={{ color: 'var(--sona-accent)' }} />
            ) : (
              <Mic2 className="w-3.5 h-3.5" />
            )}
            {karaokeMinus ? 'Минус вкл.' : 'Караоке-минус'}
          </button>

          <label htmlFor="karaoke-lang-select" className="sr-only">
            Язык перевода
          </label>
          <select
            id="karaoke-lang-select"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="px-3 py-2 text-xs font-medium glass-subtle text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[var(--sona-accent)]"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-white dark:bg-zinc-900">
                {l.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void handleTranslate()}
            disabled={translating || track.lyrics.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-45"
            style={{
              backgroundColor: 'var(--sona-accent)',
              color: 'var(--sona-accent-fg)',
              borderRadius: 'var(--sona-radius-sm)',
            }}
          >
            {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
            {translating ? 'Перевод...' : 'Перевести'}
          </button>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="p-3.5 glass-surface border-rose-500/40 text-xs text-rose-600 dark:text-rose-300 flex items-center gap-2.5"
          style={{ borderRadius: 'var(--sona-radius-sm)' }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section
        className="p-5 sm:p-8 glass-surface space-y-1.5"
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        {track.lyrics.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">Нет текста</p>
        ) : (
          track.lyrics.map((line, idx) => {
            const isActive = idx === activeIdx;
            const isPast = idx < activeIdx;
            const translated = currentTranslation?.[idx];
            return (
              <button
                key={`${track.id}-line-${idx}`}
                type="button"
                onClick={() => onSeek(line.time)}
                className={`w-full text-left px-4 py-3 transition-all duration-200 flex items-start gap-5 ${
                  isActive
                    ? 'bg-zinc-900/10 dark:bg-white/[0.10]'
                    : 'hover:bg-zinc-900/5 dark:hover:bg-white/[0.04]'
                }`}
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <span className="text-xs font-mono-tabular text-zinc-400 pt-1.5 w-10 shrink-0">
                  {formatTimecode(line.time)}
                </span>
                <div className="space-y-1 flex-1">
                  <p
                    className={`text-lg sm:text-2xl font-semibold tracking-tight leading-snug transition-colors ${
                      isActive
                        ? 'text-zinc-950 dark:text-white'
                        : isPast
                          ? 'text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-700 dark:text-zinc-300/80'
                    }`}
                    style={isActive ? { color: 'var(--sona-accent)' } : undefined}
                  >
                    {line.text}
                  </p>
                  {translated && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300/90">
                      {translated}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}
