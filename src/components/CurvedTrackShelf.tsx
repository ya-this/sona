import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Disc3,
  Heart,
  ListMusic,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Playlist, Track } from '../types/music';
import {
  buildXscTable,
  computeBookPose,
  computeShelfMetrics,
  computeShortestWrapDelta,
  type ShelfMetrics,
} from '../utils/curvedShelfMath';
import { formatTimecode } from '../utils/stats';
import { ALL_TRACKS_PLAYLIST_ID, LIKED_PLAYLIST_ID } from '../utils/likedPlaylist';
import { CoverArt } from './CoverArt';

interface CurvedTrackShelfProps {
  tracks: Track[];
  allTracks: Track[];
  playlists: Playlist[];
  allTracksPlaylist: Playlist;
  likedPlaylist: Playlist;
  currentTrackId: string | null;
  isPlaying: boolean;
  enrichingTrackIds?: Record<string, boolean>;
  onPlayTrack: (trackId: string, queueIds?: string[]) => void;
  onToggleLike: (trackId: string) => void;
  onAddToQueue: (trackId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, trackId: string) => void;
  onOpenPlaylistTab: (playlistId: string) => void;
  onLookupMetadata?: (track: Track) => void;
  onDeleteTrack?: (trackId: string) => void;
}

const SPINE_PALETTE = [
  '#1F2B3E',
  '#29252B',
  '#1A364F',
  '#2D2520',
  '#1C332D',
  '#2E2439',
  '#1D2E3B',
  '#382526',
  '#1F2D3D',
  '#2E2A24',
];

function extractShortCodec(codec?: string): string {
  const first = (codec || '').split('·')[0]?.trim() || 'HI-RES';
  return first.toUpperCase();
}

function extractMicroCodec(codec?: string): string {
  const token = (codec || '').split(/\s+/)[0]?.trim() || 'FLAC';
  return token.toUpperCase();
}

export function CurvedTrackShelf({
  tracks,
  allTracks,
  playlists,
  allTracksPlaylist,
  likedPlaylist,
  currentTrackId,
  isPlaying,
  enrichingTrackIds,
  onPlayTrack,
  onToggleLike,
  onAddToQueue,
  onAddTrackToPlaylist,
  onOpenPlaylistTab,
  onLookupMetadata,
  onDeleteTrack,
}: CurvedTrackShelfProps) {
  const [activeShelfPlaylistId, setActiveShelfPlaylistId] = useState<string | null>(null);
  const [playlistDrawerOpen, setPlaylistDrawerOpen] = useState(false);
  const [previewPlaylistId, setPreviewPlaylistId] = useState<string>(ALL_TRACKS_PLAYLIST_ID);
  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  const allPlaylists = useMemo(
    () => [allTracksPlaylist, likedPlaylist, ...playlists],
    [allTracksPlaylist, likedPlaylist, playlists]
  );

  const tracksById = useMemo(() => {
    const map: Record<string, Track> = {};
    for (const tr of allTracks) map[tr.id] = tr;
    return map;
  }, [allTracks]);

  const activeShelfPlaylist = useMemo(
    () => allPlaylists.find((p) => p.id === activeShelfPlaylistId) ?? null,
    [allPlaylists, activeShelfPlaylistId]
  );

  const shelfTracks = useMemo(() => {
    if (!activeShelfPlaylist) return tracks;
    const resolved = activeShelfPlaylist.trackIds
      .map((id) => tracksById[id])
      .filter((t): t is Track => Boolean(t));
    return resolved.length > 0 ? resolved : tracks;
  }, [activeShelfPlaylist, tracks, tracksById]);

  const N = shelfTracks.length;
  const totalVirtual = N * 3;

  const initialIdx = useMemo(() => {
    const idx = shelfTracks.findIndex((t) => t.id === currentTrackId);
    return idx >= 0 ? idx : 0;
  }, [shelfTracks, currentTrackId]);

  const [focusedIdx, setFocusedIdx] = useState(initialIdx);

  // Refs for 60fps imperative 3D spring loop (no per-frame React state updates)
  const shelfWrapRef = useRef<HTMLDivElement | null>(null);
  const rulerDotRef = useRef<HTMLDivElement | null>(null);
  const bookElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const spElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const cvElsRef = useRef<Array<HTMLDivElement | null>>([]);

  const sRef = useRef(initialIdx + N);
  const tRef = useRef(initialIdx + N);
  const focusedRef = useRef(initialIdx);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragT0Ref = useRef(0);
  const hoveredVirtualRef = useRef(-1);
  const liftsRef = useRef<Float32Array>(new Float32Array(Math.max(1, totalVirtual)));
  const pointerRef = useRef({ mx: 0, my: 0, inside: false });
  const tiltRef = useRef({ x: 0, y: 0 });
  const metricsRef = useRef<ShelfMetrics>(computeShelfMetrics(360, false));
  const xscTableRef = useRef<Float64Array>(buildXscTable(metricsRef.current.U));
  const wheelSnapTimerRef = useRef<number | null>(null);

  // Reset virtual buffer when active shelf track list changes
  useEffect(() => {
    if (N === 0) return;
    liftsRef.current = new Float32Array(N * 3);
    const cur = shelfTracks.findIndex((t) => t.id === currentTrackId);
    const nextIdx = cur >= 0 ? cur : 0;
    sRef.current = nextIdx + N;
    tRef.current = nextIdx + N;
    focusedRef.current = nextIdx;
    setFocusedIdx(nextIdx);
  }, [N, activeShelfPlaylistId]);

  // Sync shelf rotation when currentTrackId changes externally
  useEffect(() => {
    if (N === 0 || !currentTrackId) return;
    const targetIdx = shelfTracks.findIndex((t) => t.id === currentTrackId);
    if (targetIdx < 0) return;
    if (targetIdx === focusedRef.current) return;

    const delta = computeShortestWrapDelta(tRef.current, targetIdx, N);
    tRef.current = Math.round(tRef.current) + delta;
  }, [currentTrackId, shelfTracks, N]);

  // Close drawer with Escape
  useEffect(() => {
    if (!playlistDrawerOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlaylistDrawerOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [playlistDrawerOpen]);

  const recalcGeometry = useCallback(() => {
    const wrap = shelfWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const isMobile = window.innerWidth < 768;
    // Refined collector book scale so the entire curved arc sits cleanly inside the Liquid Glass frame
    const h = isMobile
      ? Math.min(218, Math.max(192, rect.width * 0.54))
      : Math.min(326, Math.max(276, Math.min(window.innerHeight * 0.36, rect.width * 0.255)));
    const m = computeShelfMetrics(h, isMobile);
    metricsRef.current = m;
    xscTableRef.current = buildXscTable(m.U);

    for (let v = 0; v < N * 3; v++) {
      const sp = spElsRef.current[v];
      const cv = cvElsRef.current[v];
      if (sp) {
        sp.style.width = `${m.ws}px`;
        sp.style.height = `${m.H}px`;
        sp.style.left = `${-m.ws * 0.5}px`;
        sp.style.top = `${-m.H * 0.5}px`;
        sp.style.transform = `translateZ(${(m.d * 0.5).toFixed(2)}px)`;
      }
      if (cv) {
        cv.style.width = `${m.d}px`;
        cv.style.height = `${m.H}px`;
        cv.style.left = `${-m.d * 0.5}px`;
        cv.style.top = `${-m.H * 0.5}px`;
        cv.style.transform = `rotateY(90deg) translateZ(${(m.ws * 0.5).toFixed(2)}px)`;
      }
    }
  }, [N]);

  // Single 60fps spring animation loop
  useEffect(() => {
    if (N === 0) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    recalcGeometry();

    const onResize = () => recalcGeometry();
    window.addEventListener('resize', onResize);

    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const kSpring = prefersReduced ? 100 : draggingRef.current ? 18 : 5.8;
      const alpha = prefersReduced ? 1 : 1 - Math.exp(-kSpring * dt);
      sRef.current += (tRef.current - sRef.current) * alpha;

      if (Math.abs(sRef.current) > N * 4) {
        const shift = Math.round(sRef.current / N) * N;
        sRef.current -= shift;
        tRef.current -= shift;
      }

      const newIdx = (((Math.round(sRef.current) % N) + N) % N);
      if (newIdx !== focusedRef.current) {
        focusedRef.current = newIdx;
        setFocusedIdx(newIdx);
      }

      const m = metricsRef.current;
      const wrap = shelfWrapRef.current;
      let targetTiltY = 0;
      let targetTiltX = 0;

      if (wrap && pointerRef.current.inside && Math.abs(tRef.current - sRef.current) < 0.3) {
        const rect = wrap.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const dx = pointerRef.current.mx - cx;
        const dy = pointerRef.current.my - cy;
        const onCover = Math.abs(dx) < m.d * 0.58 && Math.abs(dy) < m.H * 0.56;
        if (onCover) {
          targetTiltY = (dx / (m.d * 0.58)) * 7.5;
          targetTiltX = -(dy / (m.H * 0.56)) * 4.5;
        } else {
          targetTiltY = (dx / Math.max(1, rect.width)) * 3.5;
        }
      }

      const tiltAlpha = prefersReduced ? 1 : 1 - Math.exp(-7.5 * dt);
      tiltRef.current.x += (targetTiltX - tiltRef.current.x) * tiltAlpha;
      tiltRef.current.y += (targetTiltY - tiltRef.current.y) * tiltAlpha;

      const liftAlpha = prefersReduced ? 1 : 1 - Math.exp(-12 * dt);
      const totalV = N * 3;
      const lifts = liftsRef.current;

      for (let v = 0; v < totalV; v++) {
        const bookEl = bookElsRef.current[v];
        const spEl = spElsRef.current[v];
        const cvEl = cvElsRef.current[v];
        if (!bookEl || !spEl || !cvEl) continue;

        let r = (((v - sRef.current) % totalV) + totalV) % totalV;
        if (r >= totalV * 0.5) r -= totalV;

        const targetLift = hoveredVirtualRef.current === v && Math.abs(r) > 0.48 ? 1 : 0;
        lifts[v] += (targetLift - lifts[v]) * liftAlpha;

        const pose = computeBookPose({
          r,
          metrics: m,
          lift: lifts[v],
          tiltX: tiltRef.current.x,
          tiltY: tiltRef.current.y,
          xscTable: xscTableRef.current,
        });

        if (!pose.visible) {
          bookEl.style.display = 'none';
          continue;
        }

        bookEl.style.display = 'block';
        bookEl.style.transform = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, ${pose.z.toFixed(2)}px) rotateX(${pose.rotX.toFixed(2)}deg) rotateY(${pose.rotY.toFixed(2)}deg)`;
        bookEl.style.zIndex = String(pose.zIndex);
        spEl.style.setProperty('--shade', pose.spShade.toFixed(3));
        cvEl.style.setProperty('--shade', pose.cvShade.toFixed(3));
      }

      if (rulerDotRef.current && N > 1) {
        const modPos = (((sRef.current % N) + N) % N);
        const clampedPos = modPos > N - 0.5 ? 0 : Math.min(N - 1, modPos);
        const pct = (clampedPos / (N - 1)) * 100;
        rulerDotRef.current.style.left = `${pct.toFixed(2)}%`;
      } else if (rulerDotRef.current) {
        rulerDotRef.current.style.left = '50%';
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      if (wheelSnapTimerRef.current) window.clearTimeout(wheelSnapTimerRef.current);
    };
  }, [N, recalcGeometry]);

  // Wheel scrolling over the 3D shelf flips books smoothly
  useEffect(() => {
    const wrap = shelfWrapRef.current;
    if (!wrap || N <= 1) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = metricsRef.current;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      tRef.current += (delta / Math.max(24, m.ws + m.gap)) * 0.45;
      if (wheelSnapTimerRef.current) window.clearTimeout(wheelSnapTimerRef.current);
      wheelSnapTimerRef.current = window.setTimeout(() => {
        tRef.current = Math.round(tRef.current);
      }, 150);
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [N]);

  // ArrowLeft / ArrowRight keyboard navigation
  useEffect(() => {
    if (N <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        tRef.current = Math.round(tRef.current) - 1;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        tRef.current = Math.round(tRef.current) + 1;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [N]);

  // Pointer drag / touch swipe
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.mx = e.clientX;
      pointerRef.current.my = e.clientY;
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartXRef.current;
      if (Math.abs(dx) > 5) dragMovedRef.current = true;
      if (dragMovedRef.current) {
        const m = metricsRef.current;
        tRef.current = dragT0Ref.current - dx / Math.max(28, m.ws + m.gap);
      }
    };

    const onPointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (dragMovedRef.current) {
        tRef.current = Math.round(tRef.current);
        window.setTimeout(() => {
          dragMovedRef.current = false;
        }, 40);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  if (N === 0) return null;

  const focusedTrack = shelfTracks[focusedIdx] ?? shelfTracks[0];
  const isFocusedPlaying = currentTrackId === focusedTrack.id && isPlaying;
  const previewPlaylist =
    allPlaylists.find((p) => p.id === previewPlaylistId) ?? allPlaylists[0] ?? null;
  const previewTracks = previewPlaylist
    ? previewPlaylist.trackIds
        .map((id) => tracksById[id])
        .filter((t): t is Track => Boolean(t))
    : [];

  const stepShelf = (delta: number) => {
    tRef.current = Math.round(tRef.current) + delta;
  };

  const jumpToTrackIndex = (targetIdx: number) => {
    const diff = computeShortestWrapDelta(tRef.current, targetIdx, N);
    tRef.current = Math.round(tRef.current) + diff;
  };

  const handleBookClick = (virtualIndex: number, trackIndex: number) => {
    if (dragMovedRef.current) return;
    let r = (((virtualIndex - sRef.current) % totalVirtual) + totalVirtual) % totalVirtual;
    if (r >= totalVirtual * 0.5) r -= totalVirtual;

    if (Math.abs(r) < 0.45) {
      const target = shelfTracks[trackIndex];
      if (target) {
        onPlayTrack(
          target.id,
          shelfTracks.map((t) => t.id)
        );
      }
    } else {
      tRef.current = Math.round(tRef.current + r);
    }
  };

  const virtualIndices = Array.from({ length: totalVirtual }, (_, idx) => idx);

  return (
    <>
      <section
        aria-label="Изогнутая 3D полка треков"
        className="relative overflow-hidden px-4 py-5 sm:px-7 sm:py-6 glass-surface space-y-2.5 select-none"
        style={{ borderRadius: 'var(--sona-radius)' }}
      >
        {/* Minimal Centered Archival Top Header (No Autoplay Button) */}
        <div className="relative z-20 flex items-center justify-center gap-3 text-center">
          <span className="sona-lbl text-[10px] sm:text-[10.5px] text-zinc-700 dark:text-zinc-300">
            {activeShelfPlaylist ? activeShelfPlaylist.name : 'Коллекция'}
          </span>
          <span className="w-6 h-px bg-zinc-400/60 dark:bg-white/25" aria-hidden="true" />
          <span className="sona-lbl text-[10px] sm:text-[10.5px] font-mono-tabular text-zinc-600 dark:text-zinc-400">
            {String(focusedIdx + 1).padStart(2, '0')} / {String(N).padStart(2, '0')}
          </span>
          {activeShelfPlaylist && (
            <button
              type="button"
              onClick={() => setActiveShelfPlaylistId(null)}
              className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] glass-plaque text-zinc-700 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/15 transition-colors"
              style={{ borderRadius: '8px' }}
            >
              <X className="w-3 h-3" />
              Все треки
            </button>
          )}
        </div>

        {/* Framed High-Craft 3D Curved Book Shelf Stage */}
        <div
          ref={shelfWrapRef}
          onPointerDown={(e) => {
            draggingRef.current = true;
            dragMovedRef.current = false;
            dragStartXRef.current = e.clientX;
            dragT0Ref.current = tRef.current;
          }}
          onPointerEnter={() => {
            pointerRef.current.inside = true;
          }}
          onPointerLeave={() => {
            pointerRef.current.inside = false;
            hoveredVirtualRef.current = -1;
          }}
          className="sona-shelf-stage relative w-full h-[268px] sm:h-[380px] overflow-hidden"
        >
          {/* Sculptural Floor Shadow Beneath the Curved Shelf */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 bottom-1 -translate-x-1/2 w-[82%] max-w-[820px] h-14 rounded-full blur-2xl opacity-45 dark:opacity-72"
            style={{
              background:
                'radial-gradient(50% 50% at 50% 45%, rgba(20, 16, 10, 0.38), rgba(20, 16, 10, 0.12) 55%, transparent 76%)',
            }}
          />

          <div className="sona-shelf-center">
            {virtualIndices.map((v) => {
              const trackIdx = v % N;
              const tr = shelfTracks[trackIdx];
              const volStr = String(trackIdx + 1).padStart(2, '0');
              const spineBg = SPINE_PALETTE[trackIdx % SPINE_PALETTE.length];
              const shortCodec = extractShortCodec(tr.codec);
              const microCodec = extractMicroCodec(tr.codec);

              return (
                <div
                  key={`${tr.id}-${v}`}
                  ref={(el) => {
                    bookElsRef.current[v] = el;
                  }}
                  onPointerEnter={() => {
                    hoveredVirtualRef.current = v;
                  }}
                  onPointerLeave={() => {
                    if (hoveredVirtualRef.current === v) hoveredVirtualRef.current = -1;
                  }}
                  onClick={() => handleBookClick(v, trackIdx)}
                  className="sona-shelf-book"
                >
                  {/* Vertical Archival Cloth/Leather Spine (.sp) */}
                  <div
                    ref={(el) => {
                      spElsRef.current[v] = el;
                    }}
                    className="sona-shelf-face sona-shelf-sp flex flex-col items-center justify-between pt-2.5 sm:pt-4 pb-2 sm:pb-3.5 px-1 text-[#F4EFE4]"
                    style={{ backgroundColor: spineBg }}
                  >
                    <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-1.5 w-full shrink-0">
                      <span className="font-editorial font-semibold text-[10px] sm:text-[12.5px] tracking-[0.14em] text-[#F2E2BC]/95 leading-none">
                        {volStr}
                      </span>

                      <div className="w-[66%] sm:w-[74%] aspect-square rounded-[2px] overflow-hidden border border-[#EBD6A8]/45 bg-black/40 shrink-0 shadow-sm flex items-center justify-center">
                        {tr.coverUrl ? (
                          <img
                            src={tr.coverUrl}
                            alt=""
                            draggable={false}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Disc3 className="w-3.5 h-3.5 text-[#EBD6A8]/60" />
                        )}
                      </div>
                    </div>

                    <div className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden py-1.5 sm:py-2">
                      <span
                        className="font-editorial font-medium text-[10.5px] sm:text-[14.5px] tracking-[0.04em] text-[#F4EFE4] max-h-full overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                      >
                        {tr.title}
                      </span>
                    </div>

                    <div className="relative z-10 flex flex-col items-center gap-0.5 sm:gap-1 w-full shrink-0">
                      <span className="text-[6px] sm:text-[7.5px] font-semibold uppercase tracking-[0.1em] text-[#F2E2BC]/85 truncate max-w-[94%] leading-none">
                        {(tr.artist || 'Локальный').split(' ')[0]}
                      </span>
                      <span className="text-[5.5px] sm:text-[7px] font-semibold uppercase tracking-[0.12em] px-1 py-[1.5px] border border-[#EBD6A8]/45 text-[#F2E2BC]/90 leading-none">
                        {microCodec}
                      </span>
                    </div>
                  </div>

                  {/* High-Craft Collector Outer Book Cover (.cv) */}
                  <div
                    ref={(el) => {
                      cvElsRef.current[v] = el;
                    }}
                    className="sona-shelf-face sona-shelf-cv flex flex-col items-center justify-center px-[8%] py-[7%] text-center"
                  >
                    {/* Double Blind-Debossed Inner Book Frame */}
                    <div className="sona-shelf-cv-frame" aria-hidden="true" />

                    {/* Top Archival Catalogue Number */}
                    <span className="absolute top-[6.5%] left-0 right-0 z-10 pl-[3%] whitespace-nowrap font-editorial font-semibold text-[9.5px] sm:text-[11px] uppercase tracking-[0.18em] text-[#6D6A63] dark:text-[#C5BDAF]">
                      № {volStr} · {tr.year}
                    </span>

                    {/* Centered Matted 1:1 Cover Plate */}
                    <div className="sona-shelf-cv-plate relative z-10 w-[70%] aspect-square ml-[3%] rounded-[2px] overflow-hidden p-[4px] sm:p-[5px] shrink-0 flex items-center justify-center">
                      {tr.coverUrl ? (
                        <img
                          src={tr.coverUrl}
                          alt={`${tr.artist} — ${tr.title}`}
                          draggable={false}
                          className="w-full h-full object-cover rounded-[1px]"
                        />
                      ) : (
                        <Disc3 className="w-10 h-10 text-zinc-500 opacity-50" />
                      )}
                    </div>

                    {/* Cormorant Garamond Vintage Serif Title + Inter Tight Artist + Codec Stamp */}
                    <div className="relative z-10 w-full pl-[3%] mt-[5.5%] flex flex-col items-center gap-0.5 sm:gap-1">
                      <p className="font-editorial font-semibold text-[15px] sm:text-[20px] leading-[1.04] tracking-[-0.01em] text-[#141414] dark:text-[#F4EFE4] line-clamp-2 max-w-[92%]">
                        {tr.title}
                      </p>
                      <p
                        className="text-[7.5px] sm:text-[8.5px] font-semibold uppercase tracking-[0.16em] truncate max-w-[90%]"
                        style={{ color: 'var(--sona-accent-text)' }}
                      >
                        {tr.artist}
                      </p>
                      <span className="mt-0.5 text-[6.5px] sm:text-[7.5px] font-semibold uppercase tracking-[0.16em] px-1.5 py-[2px] border border-[#181511]/30 dark:border-[#F2E2BC]/28 text-[#6D6A63] dark:text-[#C5BDAF] leading-none">
                        {shortCodec}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editorial Caption & Centered Action Cluster */}
        <div className="relative z-20 flex flex-col items-center text-center gap-3 pt-1">
          <div className="flex items-center justify-center gap-3 sm:gap-8 w-full max-w-2xl">
            <button
              type="button"
              onClick={() => stepShelf(-1)}
              aria-label="Предыдущий трек на полке"
              className="w-10 h-10 rounded-full glass-plaque flex items-center justify-center text-zinc-800 dark:text-zinc-100 hover:bg-white/70 dark:hover:bg-white/16 transition-transform active:scale-95 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0 flex-1 flex flex-col items-center gap-1.5">
              <h1 className="font-editorial text-[26px] sm:text-[42px] font-semibold tracking-[-0.015em] leading-[1.06] text-zinc-950 dark:text-white line-clamp-2 sm:truncate max-w-full">
                {focusedTrack.title}
              </h1>
              <p
                className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] truncate max-w-full"
                style={{ color: 'var(--sona-accent-text)' }}
              >
                {focusedTrack.artist} / {focusedTrack.album}
              </p>
              <span
                aria-hidden="true"
                className="w-[18px] h-px opacity-75"
                style={{ backgroundColor: 'var(--sona-accent)' }}
              />
              <p className="text-[10.5px] sm:text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400 font-mono-tabular flex items-center justify-center gap-2">
                <span>
                  {focusedTrack.codec} · {focusedTrack.year}
                </span>
                {enrichingTrackIds?.[focusedTrack.id] && (
                  <span className="inline-flex items-center gap-1 normal-case tracking-normal text-zinc-700 dark:text-zinc-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Поиск оригинала…
                  </span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => stepShelf(1)}
              aria-label="Следующий трек на полке"
              className="w-10 h-10 rounded-full glass-plaque flex items-center justify-center text-zinc-800 dark:text-zinc-100 hover:bg-white/70 dark:hover:bg-white/16 transition-transform active:scale-95 shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Centered Action Buttons: Play, Like, Queue, and Playlist List Button Side-by-Side */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() =>
                onPlayTrack(
                  focusedTrack.id,
                  shelfTracks.map((t) => t.id)
                )
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] shadow-lg transition-opacity hover:opacity-90 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--sona-accent)',
                color: 'var(--sona-accent-fg)',
                borderRadius: 'var(--sona-radius-sm)',
              }}
            >
              {isFocusedPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  Пауза
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Слушать
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onToggleLike(focusedTrack.id)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <Heart
                className="w-3.5 h-3.5"
                style={
                  focusedTrack.liked
                    ? { color: 'var(--sona-accent)', fill: 'var(--sona-accent)' }
                    : undefined
                }
              />
              {focusedTrack.liked ? 'В понравившихся' : 'Нравится'}
            </button>

            <button
              type="button"
              onClick={() => onAddToQueue(focusedTrack.id)}
              aria-label={`Добавить ${focusedTrack.title} в очередь`}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] glass-plaque text-zinc-800 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap"
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <ListPlus className="w-3.5 h-3.5" />
              В очередь
            </button>

            <button
              type="button"
              onClick={() => setPlaylistDrawerOpen(true)}
              aria-label="Список плейлистов"
              aria-expanded={playlistDrawerOpen}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${
                playlistDrawerOpen || activeShelfPlaylist
                  ? 'glass-tab-active text-zinc-950 dark:text-white'
                  : 'glass-plaque text-zinc-800 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/15'
              }`}
              style={{ borderRadius: 'var(--sona-radius-sm)' }}
            >
              <ListMusic className="w-3.5 h-3.5" />
              Список плейлистов
              <span className="ml-0.5 text-[10px] font-mono-tabular opacity-75">
                {allPlaylists.length}
              </span>
            </button>

            {onLookupMetadata && (
              <button
                type="button"
                onClick={() => onLookupMetadata(focusedTrack)}
                aria-label={`Найти оригинальные метаданные для ${focusedTrack.title}`}
                title="Копировать название и найти оригинальные метаданные"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] glass-plaque text-zinc-800 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/15 transition-colors whitespace-nowrap"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Оригинал
              </button>
            )}

            {onDeleteTrack && (
              <button
                type="button"
                onClick={() => onDeleteTrack(focusedTrack.id)}
                aria-label={`Удалить ${focusedTrack.title}`}
                title="Удалить трек из медиатеки"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] glass-plaque text-zinc-700 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors whitespace-nowrap"
                style={{ borderRadius: 'var(--sona-radius-sm)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Удалить
              </button>
            )}
          </div>
        </div>

        {/* Interactive Bottom Timeline / Track Ruler */}
        <div className="relative z-20 pt-2 px-2 sm:px-6">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Линейка перелистывания треков"
            aria-valuemin={1}
            aria-valuemax={N}
            aria-valuenow={focusedIdx + 1}
            aria-valuetext={`${focusedIdx + 1} из ${N}: ${focusedTrack.title}`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                stepShelf(-1);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                stepShelf(1);
              }
            }}
            onClick={(e) => {
              if (N <= 1) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const targetIdx = Math.round(ratio * (N - 1));
              jumpToTrackIndex(targetIdx);
            }}
            className="relative h-8 cursor-pointer flex items-start"
          >
            <div className="absolute left-0 right-0 top-2.5 h-px bg-zinc-400/50 dark:bg-white/25" />

            {shelfTracks.map((tr, idx) => {
              const pct = N > 1 ? (idx / (N - 1)) * 100 : 50;
              const isActive = idx === focusedIdx;
              return (
                <div
                  key={tr.id}
                  className="pointer-events-none absolute top-2.5 -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${pct}%` }}
                >
                  <span
                    className={`w-px transition-all ${
                      isActive
                        ? 'h-3 bg-zinc-950 dark:bg-white'
                        : 'h-2 bg-zinc-500/45 dark:bg-white/25'
                    }`}
                  />
                  <span
                    className={`mt-1 text-[9.5px] font-mono-tabular ${
                      isActive
                        ? 'font-semibold text-zinc-950 dark:text-white'
                        : 'text-zinc-500 dark:text-zinc-500 hidden sm:inline'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>
              );
            })}

            <div
              ref={rulerDotRef}
              aria-hidden="true"
              className="pointer-events-none absolute top-2.5 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full shadow-md"
              style={{
                left: N > 1 ? `${(focusedIdx / (N - 1)) * 100}%` : '50%',
                backgroundColor: 'var(--sona-accent)',
                boxShadow: '0 0 0 3px var(--sona-accent-soft)',
              }}
            />
          </div>
        </div>
      </section>

      {/* Slide-Over Glass Playlist List Drawer (Portaled above Header & PlayerBar) */}
      {playlistDrawerOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex justify-end bg-black/45 backdrop-blur-sm dark:bg-black/75 dark:backdrop-blur-none"
            onClick={() => setPlaylistDrawerOpen(false)}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Список плейлистов"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[460px] h-full glass-popover border-l border-white/60 dark:border-white/15 p-5 sm:p-7 flex flex-col gap-4 overflow-hidden"
            >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-300/60 dark:border-white/12">
              <div>
                <p
                  className="sona-lbl text-[10px]"
                  style={{ color: 'var(--sona-accent-text)' }}
                >
                  Индекс плейлистов
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white mt-0.5">
                  Список плейлистов ({allPlaylists.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPlaylistDrawerOpen(false)}
                aria-label="Закрыть список плейлистов"
                className="w-8 h-8 rounded-full glass-plaque flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-white/70 dark:hover:bg-white/15 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Playlist Selector Pills */}
            <div className="flex flex-wrap gap-1.5 pb-3 border-b border-zinc-300/45 dark:border-white/10">
              {allPlaylists.map((pl) => {
                const isSelected = previewPlaylist?.id === pl.id;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setPreviewPlaylistId(pl.id)}
                    className={`px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] transition-opacity hover:opacity-90 ${
                      isSelected
                        ? 'bg-[#191E12] text-[#F3F1EC] dark:bg-white dark:text-black shadow-sm'
                        : 'glass-plaque text-[#191E12] dark:text-white hover:bg-white/60 dark:hover:bg-white/14'
                    }`}
                    style={{ borderRadius: '8px' }}
                  >
                    {pl.name} · {pl.trackIds.length}
                  </button>
                );
              })}
            </div>

            {/* Selected Playlist Summary & Actions */}
            {previewPlaylist && (
              <div className="flex flex-col gap-3 flex-1 min-h-0">
                <div
                  className="p-3 glass-plaque flex items-center gap-3"
                  style={{ borderRadius: 'var(--sona-radius-sm)' }}
                >
                  <CoverArt
                    src={previewPlaylist.coverUrl}
                    alt={previewPlaylist.name}
                    className="w-12 h-12 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-editorial text-base font-medium text-zinc-950 dark:text-white truncate">
                      {previewPlaylist.name}
                    </h3>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                      {previewPlaylist.description} · {previewTracks.length} треков
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveShelfPlaylistId(previewPlaylist.id);
                      setPlaylistDrawerOpen(false);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap bg-[#0284c7] text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-sm transition-opacity hover:opacity-90"
                    style={{ borderRadius: '10px' }}
                  >
                    На 3D-полку
                  </button>

                  {previewPlaylist.id !== LIKED_PLAYLIST_ID &&
                    previewPlaylist.id !== ALL_TRACKS_PLAYLIST_ID && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddTrackToPlaylist(previewPlaylist.id, focusedTrack.id);
                        setAddedFeedback(previewPlaylist.id);
                        window.setTimeout(() => setAddedFeedback(null), 1600);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap glass-plaque text-zinc-900 dark:text-white hover:bg-white/60 dark:hover:bg-white/15 transition-colors"
                      style={{ borderRadius: '10px' }}
                    >
                      {addedFeedback === previewPlaylist.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Добавлен
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          В плейлист
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setPlaylistDrawerOpen(false);
                      onOpenPlaylistTab(previewPlaylist.id);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] glass-plaque text-zinc-800 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/15 transition-colors"
                    style={{ borderRadius: '10px' }}
                  >
                    Открыть
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Playlist Tracklist */}
                <div className="flex-1 overflow-y-auto pr-1 divide-y divide-zinc-300/40 dark:divide-white/10">
                  {previewTracks.length === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                      В этом плейлисте пока нет треков
                    </p>
                  ) : (
                    previewTracks.map((tr) => {
                      const isCur = currentTrackId === tr.id;
                      return (
                        <button
                          key={tr.id}
                          type="button"
                          onClick={() => {
                            onPlayTrack(
                              tr.id,
                              previewTracks.map((item) => item.id)
                            );
                          }}
                          className={`w-full flex items-center gap-3 py-2.5 px-2 text-left transition-colors rounded-lg hover:bg-white/50 dark:hover:bg-white/8 ${
                            isCur ? 'bg-white/55 dark:bg-white/10' : ''
                          }`}
                        >
                          {tr.coverUrl ? (
                            <img
                              src={tr.coverUrl}
                              alt={tr.title}
                              className="w-10 h-10 rounded object-cover shrink-0 border border-zinc-900/10 dark:border-white/15"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded flex items-center justify-center shrink-0 bg-zinc-200 dark:bg-zinc-900 border border-zinc-900/10 dark:border-white/15">
                              <Disc3 className="w-4 h-4 text-zinc-500" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-sm font-semibold truncate text-zinc-950 dark:text-white"
                              style={isCur ? { color: 'var(--sona-accent-text)' } : undefined}
                            >
                              {tr.title}
                            </p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 truncate">
                              {tr.artist}
                            </p>
                          </div>
                          <span className="text-[11px] font-mono-tabular text-zinc-500 dark:text-zinc-400 shrink-0">
                            {formatTimecode(tr.durationSec)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>,
          document.body
        )}
    </>
  );
}
