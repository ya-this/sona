import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  FolderPlus,
  Loader2,
  Music,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { LyricLine, MetadataCandidate, Playlist } from '../types/music';
import {
  detectAudioCodec,
  isSupportedAudioFile,
  parseAudioFileName,
} from '../utils/localAudioFiles';
import { cleanTrackSearchQuery } from '../utils/metadataLookup';
import { readMp3Id3Tags, type ParsedId3Tags } from '../utils/id3Parser';
import {
  fetchOriginalLyrics,
  lookupOriginalMetadataForTrack,
  searchOriginalMetadata,
} from '../utils/metadataClient';
import { pluralRu } from '../utils/stats';
import { CoverArt } from './CoverArt';

export interface StagedTrackMetadata {
  title: string;
  artist: string;
  album: string;
  year: number;
  genre: string;
  coverUrl: string;
  bpm?: number;
  lyrics?: LyricLine[];
  metadataMatched: boolean;
}

export interface StagedUploadPayload {
  file: File;
  metadata?: StagedTrackMetadata;
  id3?: ParsedId3Tags;
  autoLookup?: boolean;
}

interface StagedEntry {
  key: string;
  file: File;
  query: string;
  id3?: ParsedId3Tags;
  status: 'searching' | 'matched' | 'not_found' | 'idle';
  matched: MetadataCandidate | null;
  candidates: MetadataCandidate[];
  lyrics: LyricLine[];
  expanded: boolean;
}

interface LocalUploadModalProps {
  open: boolean;
  playlists: Playlist[];
  onClose: () => void;
  onConfirmUpload: (items: StagedUploadPayload[], targetPlaylistId: string | null) => Promise<void>;
}

export function LocalUploadModal({
  open,
  playlists,
  onClose,
  onConfirmUpload,
}: LocalUploadModalProps) {
  const [entries, setEntries] = useState<StagedEntry[]>([]);
  const [autoLookup, setAutoLookup] = useState(true);
  const [targetPlaylistId, setTargetPlaylistId] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    if (!open) {
      for (const ctrl of abortControllersRef.current.values()) {
        ctrl.abort();
      }
      abortControllersRef.current.clear();
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isSaving, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const lookupForEntry = async (
    entryKey: string,
    rawSourceOrFileName: string,
    overrideQuery?: string,
    artistHintOverride?: string
  ) => {
    const existingCtrl = abortControllersRef.current.get(entryKey);
    if (existingCtrl) existingCtrl.abort();
    const controller = new AbortController();
    abortControllersRef.current.set(entryKey, controller);

    setEntries((prev) =>
      prev.map((item) =>
        item.key === entryKey ? { ...item, status: 'searching' } : item
      )
    );

    try {
      if (overrideQuery !== undefined) {
        const cleaned = cleanTrackSearchQuery(overrideQuery, artistHintOverride);
        const candidates = await searchOriginalMetadata(cleaned.query || overrideQuery, {
          artistHint: cleaned.artistHint || artistHintOverride,
          titleHint: cleaned.titleHint,
          signal: controller.signal,
        });
        const top = candidates[0] ?? null;
        const lyrics = top
          ? await fetchOriginalLyrics(top.title, top.artist, top.durationSec, controller.signal)
          : [];
        setEntries((prev) =>
          prev.map((item) =>
            item.key === entryKey
              ? {
                  ...item,
                  status: top ? 'matched' : 'not_found',
                  matched: top,
                  candidates,
                  lyrics,
                }
              : item
          )
        );
      } else {
        const res = await lookupOriginalMetadataForTrack({
          rawTitleOrFileName: rawSourceOrFileName,
          artistHint: artistHintOverride,
          withLyrics: true,
          signal: controller.signal,
        });
        setEntries((prev) =>
          prev.map((item) =>
            item.key === entryKey
              ? {
                  ...item,
                  query: res.query || item.query,
                  status: res.matched ? 'matched' : 'not_found',
                  matched: res.matched,
                  candidates: res.candidates,
                  lyrics: res.lyrics,
                }
              : item
          )
        );
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setEntries((prev) =>
        prev.map((item) =>
          item.key === entryKey ? { ...item, status: 'not_found' } : item
        )
      );
    } finally {
      abortControllersRef.current.delete(entryKey);
    }
  };

  const runLookupQueue = async (
    items: Array<{ key: string; searchSource: string; artistHint?: string }>
  ) => {
    const queue = [...items];
    const workerCount = Math.min(2, queue.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        await lookupForEntry(next.key, next.searchSource, undefined, next.artistHint);
      }
    });
    await Promise.all(workers);
  };

  const appendFiles = async (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const valid = incoming.filter((f) => isSupportedAudioFile(f.name, f.type));
    const rejectedCount = incoming.length - valid.length;

    if (rejectedCount > 0) {
      setErrorText(
        `Пропущено неподдерживаемых файлов: ${rejectedCount}. Поддерживаются MP3, FLAC, WAV, OGG, M4A, AAC, OPUS.`
      );
    } else {
      setErrorText(null);
    }

    if (valid.length === 0) return;

    const id3List = await Promise.all(valid.map((file) => readMp3Id3Tags(file)));

    const lookupJobs: Array<{ key: string; searchSource: string; artistHint?: string }> = [];
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.key));
      const next = [...prev];
      for (let idx = 0; idx < valid.length; idx++) {
        const file = valid[idx];
        const id3 = id3List[idx];
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          const id3Source =
            id3.title && id3.artist
              ? `${id3.artist} - ${id3.title}`
              : id3.title || file.name;
          const cleaned = cleanTrackSearchQuery(id3Source, id3.artist);
          const entry: StagedEntry = {
            key,
            file,
            query: cleaned.query,
            id3,
            status: autoLookup ? 'searching' : 'idle',
            matched: null,
            candidates: [],
            lyrics: [],
            expanded: false,
          };
          next.push(entry);
          lookupJobs.push({
            key,
            searchSource: id3Source,
            artistHint: id3.artist,
          });
        }
      }
      return next;
    });

    if (autoLookup && lookupJobs.length > 0) {
      void runLookupQueue(lookupJobs);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void appendFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveEntry = (key: string) => {
    const ctrl = abortControllersRef.current.get(key);
    if (ctrl) {
      ctrl.abort();
      abortControllersRef.current.delete(key);
    }
    setEntries((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSelectCandidate = async (entryKey: string, cand: MetadataCandidate) => {
    setEntries((prev) =>
      prev.map((item) =>
        item.key === entryKey
          ? { ...item, matched: cand, status: 'matched', expanded: false }
          : item
      )
    );
    const lyrics = await fetchOriginalLyrics(cand.title, cand.artist, cand.durationSec);
    if (lyrics.length > 0) {
      setEntries((prev) =>
        prev.map((item) => (item.key === entryKey ? { ...item, lyrics } : item))
      );
    }
  };

  const handleSubmit = async () => {
    if (entries.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const payloads: StagedUploadPayload[] = entries.map((entry) => ({
        file: entry.file,
        id3: entry.id3,
        autoLookup,
        metadata: entry.matched
          ? {
              title: entry.matched.title,
              artist: entry.matched.artist,
              album: entry.matched.album,
              year: entry.matched.year,
              genre: entry.matched.genre,
              coverUrl: entry.matched.coverUrl || entry.id3?.coverDataUrl || '',
              bpm: entry.matched.bpm,
              lyrics: entry.lyrics,
              metadataMatched: true,
            }
          : undefined,
      }));
      await onConfirmUpload(payloads, targetPlaylistId || null);
      setEntries([]);
      setTargetPlaylistId('');
      setErrorText(null);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const totalSizeMb = entries.reduce((acc, e) => acc + e.file.size, 0) / (1024 * 1024);
  const searchingCount = entries.filter((e) => e.status === 'searching').length;
  const matchedCount = entries.filter((e) => Boolean(e.matched)).length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-upload-modal-title"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/45 backdrop-blur-md dark:bg-black/75 dark:backdrop-blur-none"
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl glass-popover p-5 sm:p-6 space-y-4 max-h-[90vh] flex flex-col"
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="sona-lbl text-[10px] text-zinc-500 dark:text-zinc-400">
              Локальное хранилище
            </p>
            <h2
              id="local-upload-modal-title"
              className="font-display text-xl font-bold tracking-tight text-zinc-950 dark:text-white mt-0.5"
            >
              Загрузка треков
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isSaving) onClose();
            }}
            aria-label="Закрыть окно загрузки"
            className="w-8 h-8 rounded-full glass-plaque flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Dropzone */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac,.opus,.webm,.alac,.aiff"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void appendFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`p-5 sm:p-6 border border-dashed text-center cursor-pointer transition-colors space-y-2 ${
            dragOver
              ? 'border-[var(--sona-accent)] bg-zinc-900/5 dark:bg-white/10'
              : 'border-zinc-400/50 dark:border-white/22 hover:border-zinc-700 dark:hover:border-white/45 glass-subtle'
          }`}
          style={{ borderRadius: 'var(--sona-radius-sm)' }}
        >
          <div
            className="w-10 h-10 mx-auto glass-plaque flex items-center justify-center text-zinc-900 dark:text-white"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            <Upload className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              {dragOver ? 'Отпустите файлы здесь' : 'Перетащите треки сюда или выберите с устройства'}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-mono-tabular">
              MP3 · FLAC · WAV · OGG · M4A · AAC · OPUS
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold glass-plaque text-zinc-900 dark:text-white mt-0.5"
            style={{ borderRadius: 'var(--sona-radius-sm)' }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Выбрать файлы
          </span>
        </div>

        {/* Auto-match Toggle */}
        <label className="flex items-center justify-between gap-3 px-1 cursor-pointer select-none">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300 shrink-0" />
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
              Копировать название и искать оригинальные метаданные
            </span>
          </div>
          <input
            type="checkbox"
            checked={autoLookup}
            onChange={(e) => {
              const enabled = e.target.checked;
              setAutoLookup(enabled);
              if (enabled) {
                const jobs = entries
                  .filter((item) => !item.matched && item.status !== 'searching')
                  .map((item) => ({
                    key: item.key,
                    searchSource:
                      item.id3?.title && item.id3?.artist
                        ? `${item.id3.artist} - ${item.id3.title}`
                        : item.id3?.title || item.file.name,
                    artistHint: item.id3?.artist,
                  }));
                if (jobs.length > 0) void runLookupQueue(jobs);
              }
            }}
            className="accent-[var(--sona-accent)] w-4 h-4 shrink-0"
          />
        </label>

        {errorText && (
          <p className="text-xs text-rose-600 dark:text-rose-400 px-1">{errorText}</p>
        )}

        {/* Staged Files List */}
        {entries.length > 0 && (
          <div className="space-y-2 min-h-0 flex-1 flex flex-col">
            <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 px-0.5">
              <span>
                Выбрано: {pluralRu(entries.length, 'трек', 'трека', 'треков')}
                {searchingCount > 0
                  ? ` · поиск оригинала (${searchingCount})…`
                  : matchedCount > 0
                    ? ` · найдено оригиналов: ${matchedCount}`
                    : ''}
              </span>
              <span className="font-mono-tabular">{totalSizeMb.toFixed(1)} МБ</span>
            </div>

            <div className="overflow-y-auto max-h-60 space-y-2 pr-1">
              {entries.map((entry) => {
                const parsed = parseAudioFileName(entry.file.name);
                const codec = detectAudioCodec(entry.file.name, entry.file.type);
                const sizeMb = (entry.file.size / (1024 * 1024)).toFixed(1);
                const fallbackTitle = entry.id3?.title || parsed.title;
                const fallbackArtist = entry.id3?.artist || parsed.artist;
                const displayTitle = entry.matched?.title ?? fallbackTitle;
                const yearSuffix =
                  entry.matched && entry.matched.year > 1900 ? ` · ${entry.matched.year}` : '';
                const displaySubtitle = entry.matched
                  ? `${entry.matched.artist} · ${entry.matched.album}${yearSuffix}`
                  : `${fallbackArtist}${entry.id3?.album ? ` · ${entry.id3.album}` : ''} · ${codec} · ${sizeMb} МБ`;
                const previewCover = entry.matched?.coverUrl || entry.id3?.coverDataUrl || '';

                return (
                  <div
                    key={entry.key}
                    className="p-2.5 glass-table-row space-y-2"
                    style={{ borderRadius: 'var(--sona-radius-sm)' }}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {previewCover ? (
                          <CoverArt
                            src={previewCover}
                            alt={displayTitle}
                            className="w-10 h-10 shrink-0"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 glass-plaque flex items-center justify-center text-zinc-500 dark:text-zinc-400 shrink-0"
                            style={{ borderRadius: 'var(--sona-radius-sm)' }}
                          >
                            {entry.status === 'searching' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Music className="w-4 h-4" />
                            )}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                              {displayTitle}
                            </p>
                            {entry.matched && (
                              <span className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] px-1.5 py-[1px] border border-zinc-400/50 dark:border-white/25 text-zinc-700 dark:text-zinc-200 shrink-0">
                                <Check className="w-2.5 h-2.5" />
                                Оригинал
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                            {displaySubtitle}
                          </p>
                          {entry.status === 'searching' && (
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              Ищем оригинальные теги и обложку…
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setEntries((prev) =>
                              prev.map((item) =>
                                item.key === entry.key
                                  ? { ...item, expanded: !item.expanded }
                                  : item
                              )
                            )
                          }
                          aria-label={`Изменить или найти метаданные для ${entry.file.name}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-medium glass-plaque text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors"
                          style={{ borderRadius: 'var(--sona-radius-sm)' }}
                        >
                          <Search className="w-3 h-3" />
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              entry.expanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveEntry(entry.key)}
                          aria-label={`Убрать ${entry.file.name}`}
                          className="p-1.5 text-zinc-500 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Query Editor & Candidate Picker */}
                    {entry.expanded && (
                      <div className="pt-2 border-t border-zinc-300/35 dark:border-white/10 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={entry.query}
                            onChange={(e) => {
                              const nextQ = e.target.value;
                              setEntries((prev) =>
                                prev.map((item) =>
                                  item.key === entry.key ? { ...item, query: nextQ } : item
                                )
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void lookupForEntry(entry.key, entry.file.name, entry.query);
                              }
                            }}
                            placeholder="Название трека для поиска..."
                            aria-label={`Запрос поиска для ${entry.file.name}`}
                            className="flex-1 px-2.5 py-1.5 text-xs glass-plaque text-zinc-950 dark:text-white bg-transparent focus:outline-none"
                            style={{ borderRadius: 'var(--sona-radius-sm)' }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void lookupForEntry(entry.key, entry.file.name, entry.query)
                            }
                            className="px-2.5 py-1.5 text-[11px] font-semibold"
                            style={{
                              backgroundColor: 'var(--sona-accent)',
                              color: 'var(--sona-accent-fg)',
                              borderRadius: 'var(--sona-radius-sm)',
                            }}
                          >
                            Найти
                          </button>
                        </div>

                        {entry.candidates.length > 0 ? (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {entry.candidates.slice(0, 4).map((cand) => {
                              const selected = entry.matched?.id === cand.id;
                              return (
                                <button
                                  key={cand.id}
                                  type="button"
                                  onClick={() => void handleSelectCandidate(entry.key, cand)}
                                  className={`w-full flex items-center gap-2 p-1.5 text-left transition-colors rounded ${
                                    selected
                                      ? 'glass-tab-active'
                                      : 'hover:bg-white/45 dark:hover:bg-white/10'
                                  }`}
                                >
                                  <CoverArt
                                    src={cand.coverUrl}
                                    alt={cand.title}
                                    className="w-8 h-8 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold text-zinc-950 dark:text-white truncate">
                                      {cand.title}
                                    </p>
                                    <p className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate">
                                      {cand.artist} · {cand.album}
                                      {cand.year > 1900 ? ` (${cand.year})` : ''}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 px-1">
                            {entry.status === 'searching'
                              ? 'Выполняется поиск…'
                              : 'Совпадения не найдены. Отредактируйте название и нажмите «Найти».'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Target Playlist Selector */}
        {playlists.length > 0 && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <label
              htmlFor="upload-target-playlist"
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300 shrink-0"
            >
              Добавить в плейлист:
            </label>
            <select
              id="upload-target-playlist"
              value={targetPlaylistId}
              onChange={(e) => setTargetPlaylistId(e.target.value)}
              className="flex-1 max-w-[240px] px-3 py-1.5 text-xs glass-plaque text-zinc-950 dark:text-white bg-transparent focus:outline-none"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <option value="" className="bg-white dark:bg-black text-zinc-950 dark:text-white">
                Только в медиатеку
              </option>
              {playlists.map((pl) => (
                <option
                  key={pl.id}
                  value={pl.id}
                  className="bg-white dark:bg-black text-zinc-950 dark:text-white"
                >
                  {pl.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-300/40 dark:border-white/12">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              setEntries([]);
              setErrorText(null);
              onClose();
            }}
            className="px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={entries.length === 0 || isSaving}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{
              backgroundColor: 'var(--sona-accent)',
              color: 'var(--sona-accent-fg)',
              borderRadius: 'var(--sona-radius-sm)',
            }}
          >
            <Upload className="w-3.5 h-3.5" />
            {isSaving
              ? 'Сохранение...'
              : entries.length > 0
                ? `Загрузить (${entries.length})`
                : 'Загрузить треки'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
