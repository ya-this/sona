import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { sonaAudioEngine } from '../../audio/engine';
import { computeAudioEnergy } from '../../utils/livingBackdropMath';
import {
  computeVerticalFade,
  evaluateUnifiedField,
  getContourLayout,
} from '../../utils/terrainContourMath';

export interface TerrainContourSurfaceProps {
  theme?: 'light' | 'dark';
  isPlaying?: boolean;
  className?: string;
  showReticle?: boolean;
}

const FRAME_INTERVAL_MS = 36; // ~28fps silky halftone contour wave, ultra-light alongside Liquid Glass
const DOT_BUCKETS = 14;

/**
 * Pre-bakes crisp anti-aliased halftone dot sprites for ultra-fast GPU/CPU blitting
 * instead of tessellating thousands of Bezier arc() subpaths every animation frame.
 */
function buildDotSpriteAtlas(color: string, maxRadius: number): HTMLCanvasElement[] {
  const sprites: HTMLCanvasElement[] = [];
  const pad = 2;
  for (let i = 0; i < DOT_BUCKETS; i++) {
    const r = Math.max(0.55, ((i + 1) / DOT_BUCKETS) * maxRadius);
    const size = Math.ceil((r + pad) * 2);
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    if (octx) {
      octx.fillStyle = color;
      octx.beginPath();
      octx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      octx.fill();
    }
    sprites.push(off);
  }
  return sprites;
}

/**
 * TOPOGRAPHIC CONTOUR SURFACE
 * Real-time halftone topographic contour canvas with outward radial wave propagation,
 * audio-reactive seismic boost, vertical edge dot attenuation, and interactive cursor ripple distortion.
 */
export function TerrainContourSurface({
  theme = 'light',
  isPlaying = false,
  className,
  showReticle = true,
}: TerrainContourSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef(theme);
  const playingRef = useRef(isPlaying);
  const reticleRef = useRef(showReticle);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    reticleRef.current = showReticle;
  }, [showReticle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const state = {
      width: 0,
      height: 0,
      time: 1.2,
      lastRenderTs: 0,
      pointerX: -9999,
      pointerY: -9999,
      smoothPointerX: -9999,
      smoothPointerY: -9999,
      pointerActive: false,
      seismicBoost: 0,
    };

    let lightDots: HTMLCanvasElement[] = [];
    let darkDots: HTMLCanvasElement[] = [];
    let cachedMaxRadius = 0;

    const ensureDotAtlases = (maxRadius: number) => {
      if (Math.abs(maxRadius - cachedMaxRadius) < 0.25 && lightDots.length > 0) return;
      cachedMaxRadius = maxRadius;
      lightDots = buildDotSpriteAtlas('rgba(25, 30, 18, 0.84)', maxRadius);
      darkDots = buildDotSpriteAtlas('rgba(255, 255, 255, 0.84)', maxRadius);
    };

    const freqData = new Uint8Array(new ArrayBuffer(64));
    let smoothAudioBoost = 0;

    const resizeCanvas = () => {
      state.width = Math.max(1, window.innerWidth);
      state.height = Math.max(1, window.innerHeight);
      canvas.width = state.width;
      canvas.height = state.height;
    };

    const updatePointer = (x: number, y: number) => {
      state.pointerX = x;
      state.pointerY = y;
      if (!state.pointerActive) {
        state.smoothPointerX = x;
        state.smoothPointerY = y;
        state.pointerActive = true;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      updatePointer(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleMouseLeave = () => {
      state.pointerActive = false;
    };

    const handlePointerDown = () => {
      state.seismicBoost = Math.min(1, Math.max(state.seismicBoost, 0.55));
    };

    let hidden = document.hidden;
    const onVisibility = () => {
      hidden = document.hidden;
      if (!hidden) {
        state.lastRenderTs = performance.now();
      }
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    resizeCanvas();

    const render = () => {
      const { width: w, height: h, time: t } = state;
      if (w <= 0 || h <= 0) return;

      const isDark = themeRef.current === 'dark';

      // Archival topographic base surface (Light: warm paper | Dark: pure black)
      ctx.fillStyle = isDark ? '#000000' : '#F3F1EC';
      ctx.fillRect(0, 0, w, h);

      const { cx, cy, scale } = getContourLayout(w, h);
      const spacing = Math.max(10.5, scale / 22);
      const minRadius = Math.max(0.6, spacing * 0.075);
      const maxRadius = spacing * 0.58;

      ensureDotAtlases(maxRadius);
      const dots = isDark ? darkDots : lightDots;

      const pointer = {
        x: state.smoothPointerX,
        y: state.smoothPointerY,
        active: state.pointerActive,
      };
      const totalBoost = Math.min(1.25, state.seismicBoost + smoothAudioBoost);

      // Cull grid bounds cleanly around the contour + outer halo so off-contour space costs ~0ms
      const boundR = scale * 1.38;
      const startCol = Math.max(
        Math.floor(-cx / spacing) - 1,
        Math.floor(-boundR / spacing) - 1
      );
      const endCol = Math.min(
        Math.ceil((w - cx) / spacing) + 1,
        Math.ceil(boundR / spacing) + 1
      );
      const startRow = Math.max(
        Math.floor(-cy / spacing) - 1,
        Math.floor(-boundR / spacing) - 1
      );
      const endRow = Math.min(
        Math.ceil((h - cy) / spacing) + 1,
        Math.ceil(boundR / spacing) + 1
      );

      for (let r = startRow; r <= endRow; r++) {
        const py = cy + r * spacing;
        if (py < -spacing || py > h + spacing) continue;

        const verticalFade = computeVerticalFade(py, h);
        if (verticalFade <= 0.02) continue;

        const dy = py - cy;
        for (let c = startCol; c <= endCol; c++) {
          const px = cx + c * spacing;
          if (px < -spacing || px > w + spacing) continue;

          // Quick radial skip beyond outer lowland halo
          const dx = px - cx;
          if (dx * dx + dy * dy > boundR * boundR) continue;

          const val = evaluateUnifiedField(px, py, cx, cy, scale, t, pointer, totalBoost);
          if (val <= 0.01) continue;

          const baseRadius = minRadius + Math.pow(val, 1.12) * (maxRadius - minRadius);
          const radius = baseRadius * verticalFade;
          if (!Number.isFinite(radius) || radius <= 0.35 || maxRadius <= 0) continue;

          const bucket = Math.min(
            DOT_BUCKETS - 1,
            Math.max(0, Math.floor((radius / maxRadius) * DOT_BUCKETS))
          );
          const sprite = dots[bucket];
          if (!sprite) continue;
          const half = sprite.width * 0.5;
          ctx.drawImage(sprite, px - half, py - half);
        }
      }

      // Subtle cartographic reticle around active cursor
      if (state.pointerActive && reticleRef.current) {
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(25, 30, 18, 0.24)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(state.smoothPointerX, state.smoothPointerY, 15, 0, Math.PI * 2);
        ctx.moveTo(state.smoothPointerX - 23, state.smoothPointerY);
        ctx.lineTo(state.smoothPointerX - 9, state.smoothPointerY);
        ctx.moveTo(state.smoothPointerX + 9, state.smoothPointerY);
        ctx.lineTo(state.smoothPointerX + 23, state.smoothPointerY);
        ctx.moveTo(state.smoothPointerX, state.smoothPointerY - 23);
        ctx.lineTo(state.smoothPointerX, state.smoothPointerY - 9);
        ctx.moveTo(state.smoothPointerX, state.smoothPointerY + 9);
        ctx.lineTo(state.smoothPointerX, state.smoothPointerY + 23);
        ctx.stroke();
        ctx.restore();
      }
    };

    let rafId = 0;

    const animate = (timestamp: number) => {
      rafId = window.requestAnimationFrame(animate);
      if (hidden) return;
      if (state.lastRenderTs !== 0 && timestamp - state.lastRenderTs < FRAME_INTERVAL_MS) return;

      const dt =
        state.lastRenderTs === 0
          ? 0.016
          : Math.min((timestamp - state.lastRenderTs) / 1000, 0.06);
      state.lastRenderTs = timestamp;

      // Sample live audio energy so contour waves breathe with music
      const hasLiveAudio = sonaAudioEngine.getFrequencyData(freqData);
      const energy = computeAudioEnergy(freqData, hasLiveAudio, state.time, playingRef.current);
      const targetAudioBoost = playingRef.current ? energy.bass * 0.72 + energy.mid * 0.28 : 0;
      smoothAudioBoost += (targetAudioBoost - smoothAudioBoost) * Math.min(1, dt * 6);

      const speedScale = prefersReducedMotion ? 0.15 : 1 + smoothAudioBoost * 0.45;
      state.time += dt * speedScale;

      if (state.seismicBoost > 0.002) {
        state.seismicBoost *= Math.pow(0.24, dt);
      } else {
        state.seismicBoost = 0;
      }

      if (state.pointerActive) {
        state.smoothPointerX += (state.pointerX - state.smoothPointerX) * Math.min(1, dt * 8);
        state.smoothPointerY += (state.pointerY - state.smoothPointerY) * Math.min(1, dt * 8);
      }

      render();
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div
      data-testid="terrain-contour-backdrop"
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 z-0 overflow-hidden', className)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}

export default TerrainContourSurface;
