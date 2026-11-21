import { useEffect, useRef } from 'react';
import { sonaAudioEngine } from '../audio/engine';
import {
  FLUID_ORB_SPECS,
  computeAudioEnergy,
  createBackdropMotes,
  evaluateFluidOrb,
  evaluateSilkWaveY,
} from '../utils/livingBackdropMath';

interface LivingBackdropProps {
  theme: 'dark' | 'light';
  isPlaying: boolean;
}

interface OrbPaletteStop {
  inner: string;
  mid: string;
}

const LIGHT_ORB_PALETTE: OrbPaletteStop[] = [
  { inner: 'rgba(56, 189, 248, 0.56)', mid: 'rgba(186, 230, 253, 0.26)' }, // Sky liquid
  { inner: 'rgba(14, 165, 233, 0.44)', mid: 'rgba(125, 211, 252, 0.22)' }, // Cerulean tide
  { inner: 'rgba(255, 255, 255, 0.9)', mid: 'rgba(224, 242, 254, 0.38)' }, // Alabaster pearl
  { inner: 'rgba(125, 211, 252, 0.54)', mid: 'rgba(240, 249, 255, 0.24)' }, // Ice prism
  { inner: 'rgba(2, 132, 199, 0.34)', mid: 'rgba(186, 230, 253, 0.18)' }, // Deep sky glint
];

const DARK_ORB_PALETTE: OrbPaletteStop[] = [
  { inner: 'rgba(228, 228, 231, 0.24)', mid: 'rgba(113, 113, 122, 0.12)' }, // Liquid silver
  { inner: 'rgba(161, 161, 170, 0.22)', mid: 'rgba(63, 63, 70, 0.14)' }, // Brushed graphite
  { inner: 'rgba(244, 244, 245, 0.18)', mid: 'rgba(82, 82, 91, 0.1)' }, // Moonlight fog
  { inner: 'rgba(148, 163, 184, 0.2)', mid: 'rgba(39, 39, 42, 0.14)' }, // Cool slate steel
  { inner: 'rgba(235, 220, 196, 0.15)', mid: 'rgba(82, 82, 91, 0.08)' }, // Archival warm silver
];

const MOTES = createBackdropMotes(42);
const MAX_INTERNAL_WIDTH = 720;
const FRAME_INTERVAL_MS = 28; // ~36fps silky ambient tide without starving backdrop-filter

function createRadialSprite(size: number, inner: string, mid: string): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  if (octx) {
    const c = size / 2;
    const g = octx.createRadialGradient(c, c, c * 0.03, c, c, c);
    g.addColorStop(0, inner);
    g.addColorStop(0.48, mid);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    octx.fillStyle = g;
    octx.fillRect(0, 0, size, size);
  }
  return off;
}

interface ThemeSprites {
  orbs: HTMLCanvasElement[];
  halo: HTMLCanvasElement;
  mote: HTMLCanvasElement;
}

function buildSprites(isDark: boolean): ThemeSprites {
  const palette = isDark ? DARK_ORB_PALETTE : LIGHT_ORB_PALETTE;
  const orbs = palette.map((stop) => createRadialSprite(128, stop.inner, stop.mid));
  const halo = isDark
    ? createRadialSprite(128, 'rgba(244, 244, 245, 0.2)', 'rgba(161, 161, 170, 0.08)')
    : createRadialSprite(128, 'rgba(255, 255, 255, 0.72)', 'rgba(56, 189, 248, 0.24)');
  const mote = isDark
    ? createRadialSprite(48, 'rgba(250, 250, 250, 0.92)', 'rgba(161, 161, 170, 0.34)')
    : createRadialSprite(48, 'rgba(255, 255, 255, 0.98)', 'rgba(56, 189, 248, 0.42)');
  return { orbs, halo, mote };
}

export function LivingBackdrop({ theme, isPlaying }: LivingBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef(theme);
  const playingRef = useRef(isPlaying);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const darkSprites = buildSprites(true);
    const lightSprites = buildSprites(false);

    let viewW = window.innerWidth;
    let viewH = window.innerHeight;
    let width = Math.min(MAX_INTERNAL_WIDTH, Math.max(320, Math.round(viewW * 0.55)));
    let height = Math.max(240, Math.round(width * (viewH / Math.max(1, viewW))));

    const resize = () => {
      viewW = window.innerWidth;
      viewH = window.innerHeight;
      width = Math.min(MAX_INTERNAL_WIDTH, Math.max(320, Math.round(viewW * 0.55)));
      height = Math.max(240, Math.round(width * (viewH / Math.max(1, viewW))));
      canvas.width = width;
      canvas.height = height;
    };
    resize();

    // Smoothly damped pointer state (normalized 0..1)
    const pointer = {
      tx: 0.5,
      ty: 0.45,
      x: 0.5,
      y: 0.45,
      active: 0,
      targetActive: 0,
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.tx = e.clientX / Math.max(1, viewW);
      pointer.ty = e.clientY / Math.max(1, viewH);
      pointer.targetActive = 1;
    };

    const onPointerLeave = () => {
      pointer.targetActive = 0;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);

    const freqData = new Uint8Array(new ArrayBuffer(64));
    let smoothBass = 0.08;
    let smoothMid = 0.08;
    let smoothTreble = 0.06;
    let smoothOverall = 0.08;

    let rafId = 0;
    let lastRenderTs = 0;
    let simTime = 1.4; // Start mid-motion so the initial composition is balanced & vibrant
    let hidden = document.hidden;

    const onVisibility = () => {
      hidden = document.hidden;
      if (!hidden) {
        lastRenderTs = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const drawFrame = (now: number) => {
      rafId = window.requestAnimationFrame(drawFrame);
      if (hidden) return;
      if (lastRenderTs !== 0 && now - lastRenderTs < FRAME_INTERVAL_MS) return;

      const rawDt = lastRenderTs === 0 ? 0.016 : Math.min(0.06, Math.max(0.004, (now - lastRenderTs) / 1000));
      lastRenderTs = now;

      const isDark = themeRef.current === 'dark';
      const playing = playingRef.current;
      const sprites = isDark ? darkSprites : lightSprites;

      // Sample live FFT audio energy
      const hasLiveAudio = sonaAudioEngine.getFrequencyData(freqData);
      const targetEnergy = computeAudioEnergy(freqData, hasLiveAudio, simTime, playing);

      const eLerp = 1 - Math.exp(-rawDt * 6.5);
      smoothBass += (targetEnergy.bass - smoothBass) * eLerp;
      smoothMid += (targetEnergy.mid - smoothMid) * eLerp;
      smoothTreble += (targetEnergy.treble - smoothTreble) * eLerp;
      smoothOverall += (targetEnergy.overall - smoothOverall) * eLerp;

      const energy = {
        bass: smoothBass,
        mid: smoothMid,
        treble: smoothTreble,
        overall: smoothOverall,
      };

      const timeScale = prefersReducedMotion ? 0.2 : 1 + energy.overall * 0.7;
      simTime += rawDt * timeScale;

      // Viscous liquid pointer follow
      const pLerp = 1 - Math.exp(-rawDt * 4.5);
      pointer.x += (pointer.tx - pointer.x) * pLerp;
      pointer.y += (pointer.ty - pointer.y) * pLerp;
      pointer.active += (pointer.targetActive - pointer.active) * (1 - Math.exp(-rawDt * 3.0));

      const minDim = Math.min(width, height);
      const maxDim = Math.max(width, height);

      // 1. Living Base Atmospheric Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width * 0.35, height);
      if (isDark) {
        const shift = Math.sin(simTime * 0.32) * 3.5;
        const topLum = Math.round(9 + shift);
        const midLum = Math.round(14 + energy.bass * 7);
        bgGrad.addColorStop(0, `rgb(${topLum}, ${topLum + 1}, ${topLum + 4})`);
        bgGrad.addColorStop(0.52, `rgb(${midLum}, ${midLum + 1}, ${midLum + 5})`);
        bgGrad.addColorStop(1, 'rgb(5, 6, 8)');
      } else {
        bgGrad.addColorStop(0, '#f4faff');
        bgGrad.addColorStop(0.48, '#e6f5ff');
        bgGrad.addColorStop(1, '#d6effe');
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Fluid Moving Liquid-Light Fields (fast pre-baked sprite blits)
      ctx.globalCompositeOperation = isDark ? 'screen' : 'source-over';
      for (let i = 0; i < FLUID_ORB_SPECS.length; i++) {
        const spec = FLUID_ORB_SPECS[i];
        const evaluated = evaluateFluidOrb(spec, simTime, pointer.x, pointer.y, energy);
        const cx = evaluated.nx * width;
        const cy = evaluated.ny * height;
        const rad = maxDim * spec.radiusRatio * evaluated.radiusScale;
        const sprite = sprites.orbs[spec.toneIndex % sprites.orbs.length];

        ctx.globalAlpha = Math.min(1, 0.88 * evaluated.alphaBoost);
        ctx.drawImage(sprite, cx - rad, cy - rad, rad * 2, rad * 2);
      }

      // 3. Interactive Liquid Cursor Halo
      if (pointer.active > 0.01) {
        const px = pointer.x * width;
        const py = pointer.y * height;
        const haloR = minDim * (0.36 + energy.bass * 0.1);
        ctx.globalAlpha = Math.min(1, pointer.active);
        ctx.drawImage(sprites.halo, px - haloR, py - haloR, haloR * 2, haloR * 2);
      }

      // 4. Flowing Acoustic Silk Ribbons (4 layered harmonic wave curtains + caustic crests)
      ctx.globalAlpha = 1;
      const ribbonCount = 4;
      const samples = 32;

      for (let layer = 0; layer < ribbonCount; layer++) {
        const bandHeight = height * (0.12 + layer * 0.025) * (1 + energy.mid * 0.45);
        ctx.beginPath();
        for (let s = 0; s <= samples; s++) {
          const xn = s / samples;
          const x = xn * (width + 40) - 20;
          const y = evaluateSilkWaveY(xn, simTime, layer, energy, pointer.y) * height;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // Translucent silk curtain fill
        ctx.save();
        ctx.lineTo(width + 20, height);
        ctx.lineTo(-20, height);
        ctx.closePath();

        const sheetGrad = ctx.createLinearGradient(
          0,
          height * (0.16 + layer * 0.18),
          0,
          height * (0.16 + layer * 0.18) + bandHeight * 2.1
        );
        if (isDark) {
          const crestAlpha = 0.065 + energy.overall * 0.055 - layer * 0.01;
          sheetGrad.addColorStop(0, `rgba(244, 244, 245, ${Math.max(0.02, crestAlpha)})`);
          sheetGrad.addColorStop(0.45, `rgba(161, 161, 170, ${Math.max(0.01, crestAlpha * 0.42)})`);
          sheetGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          const crestAlpha = 0.26 + energy.overall * 0.14 - layer * 0.032;
          sheetGrad.addColorStop(0, `rgba(255, 255, 255, ${Math.max(0.09, crestAlpha)})`);
          sheetGrad.addColorStop(0.42, `rgba(56, 189, 248, ${Math.max(0.045, crestAlpha * 0.5)})`);
          sheetGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }
        ctx.fillStyle = sheetGrad;
        ctx.fill();
        ctx.restore();

        // Luminous caustic filament along the wave crest
        ctx.beginPath();
        for (let s = 0; s <= samples; s++) {
          const xn = s / samples;
          const x = xn * (width + 40) - 20;
          const y = evaluateSilkWaveY(xn, simTime, layer, energy, pointer.y) * height;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        const strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
        if (isDark) {
          const a = 0.17 + energy.bass * 0.2 - layer * 0.025;
          strokeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          strokeGrad.addColorStop(0.25, `rgba(228, 228, 231, ${Math.max(0.05, a)})`);
          strokeGrad.addColorStop(0.55, `rgba(255, 255, 255, ${Math.max(0.09, a * 1.4)})`);
          strokeGrad.addColorStop(0.82, `rgba(161, 161, 170, ${Math.max(0.05, a)})`);
          strokeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        } else {
          const a = 0.48 + energy.bass * 0.22 - layer * 0.055;
          strokeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          strokeGrad.addColorStop(0.24, `rgba(255, 255, 255, ${Math.max(0.2, a)})`);
          strokeGrad.addColorStop(0.52, `rgba(14, 165, 233, ${Math.max(0.15, a * 0.78)})`);
          strokeGrad.addColorStop(0.8, `rgba(255, 255, 255, ${Math.max(0.2, a)})`);
          strokeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        }

        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = layer === 0 ? 1.2 : 0.85;
        ctx.stroke();
      }

      // 5. Drifting Luminous Bokeh Motes (pre-baked sprites)
      ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over';
      const moteScale = width / 1200;
      for (let i = 0; i < MOTES.length; i++) {
        const m = MOTES[i];
        const yWrapped = (((m.y - simTime * m.speedY) % 1) + 1) % 1;
        const xSwirl =
          m.x +
          Math.sin(simTime * m.swayFreq + m.phase) * m.swayAmp +
          (pointer.x - 0.5) * 0.032 * m.depth;
        const xWrapped = ((xSwirl % 1) + 1) % 1;

        const mx = xWrapped * width;
        const my = yWrapped * height;
        const twinkle = 0.62 + 0.38 * Math.sin(simTime * (1.4 + m.swayFreq) + m.phase * 2.1);
        const drawR = m.radius * 3.4 * moteScale * (1 + energy.treble * 0.55);
        ctx.globalAlpha = Math.min(0.95, m.alpha * twinkle * (0.88 + energy.overall * 0.55));
        ctx.drawImage(sprites.mote, mx - drawR, my - drawR, drawR * 2, drawR * 2);
      }

      // 6. Subtle Framing Vignette so Liquid Glass panels float crisply
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const vig = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        minDim * 0.26,
        width * 0.5,
        height * 0.5,
        maxDim * 0.78
      );
      if (isDark) {
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(1, 'rgba(3, 3, 5, 0.5)');
      } else {
        vig.addColorStop(0, 'rgba(255, 255, 255, 0)');
        vig.addColorStop(1, 'rgba(186, 230, 253, 0.26)');
      }
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);
    };

    rafId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="living-backdrop"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 w-full h-full z-0"
    />
  );
}
