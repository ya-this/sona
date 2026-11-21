export interface FluidOrbSpec {
  id: number;
  baseX: number;
  baseY: number;
  ampX: number;
  ampY: number;
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  radiusRatio: number;
  parallax: number;
  energyGain: number;
  toneIndex: number;
}

export interface BackdropMote {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  depth: number;
  alpha: number;
}

export interface AudioEnergy {
  bass: number;
  mid: number;
  treble: number;
  overall: number;
}

export interface EvaluatedOrb {
  nx: number;
  ny: number;
  radiusScale: number;
  alphaBoost: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Extracts normalized low/mid/high audio energy from FFT byte data.
 * When paused, returns a calm ambient breathing level so the backdrop stays gently alive.
 */
export function computeAudioEnergy(
  freqData: Uint8Array,
  hasLiveAudio: boolean,
  timeSec: number,
  isPlaying: boolean
): AudioEnergy {
  if (hasLiveAudio && freqData.length >= 16) {
    const n = freqData.length;
    const bassEnd = Math.max(2, Math.floor(n * 0.14));
    const midEnd = Math.max(bassEnd + 2, Math.floor(n * 0.48));

    let bassSum = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += freqData[i];
    const bass = clamp01(bassSum / (bassEnd * 255));

    let midSum = 0;
    for (let i = bassEnd; i < midEnd; i++) midSum += freqData[i];
    const mid = clamp01(midSum / ((midEnd - bassEnd) * 255));

    let trebleSum = 0;
    for (let i = midEnd; i < n; i++) trebleSum += freqData[i];
    const treble = clamp01(trebleSum / ((n - midEnd) * 255));

    const overall = clamp01(bass * 0.5 + mid * 0.35 + treble * 0.15);
    if (overall > 0.015) {
      return { bass, mid, treble, overall };
    }
  }

  // Organic living tide (stronger rhythmic swell when playing, serene breath when paused)
  const breath = 0.5 + 0.5 * Math.sin(timeSec * (isPlaying ? 1.85 : 0.65));
  const swell = 0.5 + 0.5 * Math.sin(timeSec * (isPlaying ? 1.12 : 0.38) + 1.4);
  const scale = isPlaying ? 0.36 : 0.14;
  return {
    bass: clamp01(breath * scale * 1.15),
    mid: clamp01(swell * scale),
    treble: clamp01(((breath + swell) * 0.5) * scale * 0.8),
    overall: clamp01(((breath * 0.6 + swell * 0.4)) * scale),
  };
}

/**
 * 7 fluid liquid-light fields orbiting smoothly across the full viewport
 * so refracted currents continuously glide behind Liquid Glass panels.
 */
export const FLUID_ORB_SPECS: FluidOrbSpec[] = [
  {
    id: 0,
    baseX: 0.24,
    baseY: 0.28,
    ampX: 0.28,
    ampY: 0.22,
    freqX: 0.26,
    freqY: 0.19,
    phaseX: 0.0,
    phaseY: 0.9,
    radiusRatio: 0.46,
    parallax: 0.065,
    energyGain: 0.22,
    toneIndex: 0,
  },
  {
    id: 1,
    baseX: 0.78,
    baseY: 0.26,
    ampX: 0.25,
    ampY: 0.26,
    freqX: 0.21,
    freqY: 0.29,
    phaseX: 1.7,
    phaseY: 0.3,
    radiusRatio: 0.44,
    parallax: -0.055,
    energyGain: 0.18,
    toneIndex: 1,
  },
  {
    id: 2,
    baseX: 0.52,
    baseY: 0.72,
    ampX: 0.32,
    ampY: 0.2,
    freqX: 0.18,
    freqY: 0.24,
    phaseX: 3.1,
    phaseY: 2.1,
    radiusRatio: 0.48,
    parallax: 0.045,
    energyGain: 0.26,
    toneIndex: 2,
  },
  {
    id: 3,
    baseX: 0.18,
    baseY: 0.76,
    ampX: 0.24,
    ampY: 0.24,
    freqX: 0.31,
    freqY: 0.22,
    phaseX: 4.5,
    phaseY: 1.2,
    radiusRatio: 0.36,
    parallax: -0.04,
    energyGain: 0.16,
    toneIndex: 3,
  },
  {
    id: 4,
    baseX: 0.84,
    baseY: 0.72,
    ampX: 0.26,
    ampY: 0.22,
    freqX: 0.24,
    freqY: 0.33,
    phaseX: 2.4,
    phaseY: 4.1,
    radiusRatio: 0.38,
    parallax: 0.07,
    energyGain: 0.24,
    toneIndex: 0,
  },
  {
    id: 5,
    baseX: 0.5,
    baseY: 0.44,
    ampX: 0.34,
    ampY: 0.24,
    freqX: 0.34,
    freqY: 0.27,
    phaseX: 5.2,
    phaseY: 3.3,
    radiusRatio: 0.32,
    parallax: 0.09,
    energyGain: 0.32,
    toneIndex: 4,
  },
  {
    id: 6,
    baseX: 0.62,
    baseY: 0.18,
    ampX: 0.28,
    ampY: 0.18,
    freqX: 0.16,
    freqY: 0.36,
    phaseX: 0.8,
    phaseY: 5.0,
    radiusRatio: 0.3,
    parallax: -0.06,
    energyGain: 0.2,
    toneIndex: 2,
  },
];

export function evaluateFluidOrb(
  spec: FluidOrbSpec,
  timeSec: number,
  pointerX: number,
  pointerY: number,
  energy: AudioEnergy
): EvaluatedOrb {
  const pxOffset = (pointerX - 0.5) * spec.parallax;
  const pyOffset = (pointerY - 0.5) * spec.parallax;

  const nx =
    spec.baseX +
    Math.sin(timeSec * spec.freqX + spec.phaseX) * spec.ampX +
    Math.cos(timeSec * spec.freqX * 0.53 + spec.phaseY) * (spec.ampX * 0.26) +
    pxOffset;

  const ny =
    spec.baseY +
    Math.cos(timeSec * spec.freqY + spec.phaseY) * spec.ampY +
    Math.sin(timeSec * spec.freqY * 0.61 + spec.phaseX) * (spec.ampY * 0.24) +
    pyOffset;

  const pulse =
    1 +
    Math.sin(timeSec * 0.85 + spec.phaseX) * 0.08 +
    energy.bass * spec.energyGain +
    energy.mid * (spec.energyGain * 0.5);

  const alphaBoost = 1 + energy.overall * 0.45;

  return {
    nx,
    ny,
    radiusScale: pulse,
    alphaBoost,
  };
}

/**
 * Evaluates normalized vertical offset for a flowing harmonic silk ribbon.
 */
export function evaluateSilkWaveY(
  xNorm: number,
  timeSec: number,
  layerIndex: number,
  energy: AudioEnergy,
  pointerY: number
): number {
  const baseY = 0.22 + layerIndex * 0.195;
  const speed = 0.42 + layerIndex * 0.11;
  const phase = layerIndex * 1.45;
  const ampBoost = 1 + energy.bass * 1.15 + energy.mid * 0.65;

  const primary = Math.sin(xNorm * Math.PI * (2.1 + layerIndex * 0.35) + timeSec * speed + phase) * 0.055;
  const secondary =
    Math.cos(xNorm * Math.PI * (3.8 - layerIndex * 0.25) - timeSec * (speed * 0.78) + phase * 1.3) * 0.028;
  const ripple = Math.sin(xNorm * Math.PI * 6.4 + timeSec * (speed * 1.5) + phase) * 0.011;
  const pointerTilt = (pointerY - 0.5) * (0.045 - layerIndex * 0.008) * Math.sin(xNorm * Math.PI);

  return baseY + (primary + secondary + ripple) * ampBoost + pointerTilt;
}

/**
 * Deterministic seeded PRNG so luminous dust motes distribute evenly without random flashes.
 */
export function createBackdropMotes(count: number): BackdropMote[] {
  let seed = 42197;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const motes: BackdropMote[] = [];
  for (let i = 0; i < count; i++) {
    const depth = 0.35 + nextRand() * 0.65;
    motes.push({
      x: nextRand(),
      y: nextRand(),
      radius: 1.1 + depth * 2.8,
      speedY: 0.008 + depth * 0.018,
      swayAmp: 0.008 + nextRand() * 0.022,
      swayFreq: 0.35 + nextRand() * 0.75,
      phase: nextRand() * Math.PI * 2,
      depth,
      alpha: 0.18 + depth * 0.46,
    });
  }
  return motes;
}
