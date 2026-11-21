export interface ContourLayout {
  cx: number;
  cy: number;
  scale: number;
}

export interface ContourPointer {
  x: number;
  y: number;
  active: boolean;
}

export interface ContourRingSpec {
  center: number;
  halfWidth: number;
  peak: number;
}

export const CONTOUR_RING_SPECS: ContourRingSpec[] = [
  { center: 0.345, halfWidth: 0.068, peak: 1.0 },
  { center: 0.515, halfWidth: 0.062, peak: 0.84 },
  { center: 0.68, halfWidth: 0.056, peak: 0.66 },
  { center: 0.845, halfWidth: 0.052, peak: 0.48 },
];

/**
 * Computes responsive center & scale for the topographic halftone contour surface.
 */
export function getContourLayout(w: number, h: number): ContourLayout {
  if (w >= 1024) {
    return {
      cx: w * 0.64,
      cy: h * 0.48,
      scale: Math.min(w * 0.36, h * 0.48),
    };
  }
  if (w >= 768) {
    return {
      cx: w * 0.66,
      cy: h * 0.48,
      scale: Math.min(w * 0.34, h * 0.42),
    };
  }
  return {
    cx: w * 0.5,
    cy: h * 0.44,
    scale: Math.min(w * 0.52, h * 0.34),
  };
}

/**
 * Computes organically distorted radial distance forming terraced terrain indentations
 * paired with continuous outward radial wave propagation.
 */
export function getOrganicContourRadius(
  nx: number,
  ny: number,
  t: number,
  boost: number
): number {
  const rx = nx * 1.04;
  const ry = ny * 0.96;

  const r = Math.hypot(rx, ry);
  const theta = Math.atan2(ry, rx);

  // Characteristic valley indentation on the bottom-left quadrant (~132 deg / 2.31 rad)
  let dTheta = theta - 2.31;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;

  const indent = 0.165 * Math.exp(-Math.pow(dTheta / 0.44, 2));
  const upperLobe = 0.045 * Math.cos(theta * 2.0 + 0.55 + Math.sin(t * 0.8) * 0.12);
  const sideWave = 0.025 * Math.sin(theta * 3.0 - 0.4 - t * 0.6);

  // Outward radial wave propagating smoothly from center toward outer boundary
  const amp = 0.022 + boost * 0.032;
  const outwardRipple = amp * Math.sin(r * 14.0 - t * 2.8) * Math.min(1, r * 2.5);

  return r + indent - upperLobe - sideWave - outwardRipple;
}

/**
 * Evaluates halftone dot density at each grid coordinate (px, py),
 * generating 4 layered elevation contour rings separated by clean gaps
 * plus interactive cursor concentric ripple distortion.
 * Returns -1 inside the clean central summit basin, or 0..1 outside.
 */
export function evaluateUnifiedField(
  px: number,
  py: number,
  cx: number,
  cy: number,
  scale: number,
  t: number,
  pointer: ContourPointer,
  seismicBoost: number
): number {
  let nx = (px - cx) / scale;
  let ny = (py - cy) / scale;

  let cursorWaveOffset = 0;
  if (pointer.active) {
    const dxp = px - pointer.x;
    const dyp = py - pointer.y;
    const distP = Math.hypot(dxp, dyp);
    const influenceRadius = scale * 0.72;
    if (distP < influenceRadius) {
      const falloff = Math.pow(1 - distP / influenceRadius, 2);
      const ripple = Math.sin(distP * 0.14 - t * 9.5) * falloff;
      cursorWaveOffset = ripple * 0.048;

      const radialPush = falloff * (0.045 + 0.025 * Math.sin(distP * 0.1 - t * 8.0));
      nx -= (dxp / (distP + 1)) * radialPush;
      ny -= (dyp / (distP + 1)) * radialPush;
    }
  }

  const d = getOrganicContourRadius(nx, ny, t, seismicBoost) + cursorWaveOffset;

  // 1. Clean central summit basin without dots
  const innerHoleRadius = 0.255 + (0.012 + seismicBoost * 0.016) * Math.sin(t * 2.8);
  if (d < innerHoleRadius) {
    return -1.0;
  }

  // 2. Four terraced contour elevation rings with clear spacing gaps
  let maxRingVal = 0;
  const waveAmp = 0.016 + seismicBoost * 0.024;

  for (let i = 0; i < CONTOUR_RING_SPECS.length; i++) {
    const ring = CONTOUR_RING_SPECS[i];
    const phaseShift = waveAmp * Math.sin(t * 2.8 - i * 1.15);
    const dynamicCenter = ring.center + phaseShift;
    const dynamicHalfWidth = ring.halfWidth * (1 + 0.08 * Math.sin(t * 2.8 - i * 1.15));

    const distFromRing = Math.abs(d - dynamicCenter);
    if (distFromRing < dynamicHalfWidth) {
      const norm = distFromRing / dynamicHalfWidth;
      const profile = Math.pow(Math.cos(norm * Math.PI * 0.5), 1.35);
      const pulsePeak = ring.peak * (0.92 + 0.08 * Math.sin(t * 2.8 - i * 1.15));
      maxRingVal = Math.max(maxRingVal, pulsePeak * profile);
    }
  }

  // 3. Subtle outer lowland halo
  if (d >= 0.88 && d < 1.24) {
    const outerWave = 0.5 + 0.5 * Math.sin(d * 18.0 - t * 2.8);
    const haloFade = (0.08 + 0.08 * outerWave) * Math.exp(-Math.pow((d - 0.88) / 0.16, 2));
    maxRingVal = Math.max(maxRingVal, haloFade);
  }

  return Math.max(0, Math.min(1, maxRingVal));
}

/**
 * Smoothstep vertical attenuation at top and bottom margins to keep nav & player dock crisp.
 */
export function computeVerticalFade(py: number, h: number): number {
  const topFadeEnd = h * 0.22;
  const bottomFadeStart = h * 0.78;
  if (py < topFadeEnd) {
    const normY = Math.max(0, Math.min(1, py / Math.max(1, topFadeEnd)));
    return normY * normY * (3 - 2 * normY);
  }
  if (py > bottomFadeStart) {
    const normY = Math.max(0, Math.min(1, (h - py) / Math.max(1, h - bottomFadeStart)));
    return normY * normY * (3 - 2 * normY);
  }
  return 1.0;
}
