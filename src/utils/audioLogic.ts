import type { CrossfadeSettings, LyricLine, RepeatMode } from '../types/music';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export function clampEqDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-12, Math.min(12, Math.round(value * 10) / 10));
}

export type TransitionMode = 'crossfade' | 'gapless' | 'gap';

export interface TransitionPlan {
  mode: TransitionMode;
  fadeDurationSec: number;
  triggerEarlySec: number;
  gapPauseMs: number;
  curve: CrossfadeSettings['curve'];
  playbackRateMatch: number;
  bpmSnapped: boolean;
}

export function computeCrossfadeGains(
  progress: number,
  curve: CrossfadeSettings['curve']
): { outgoingGain: number; incomingGain: number } {
  const t = Math.max(0, Math.min(1, progress));
  if (curve === 'linear') {
    return {
      outgoingGain: Number((1 - t).toFixed(4)),
      incomingGain: Number(t.toFixed(4)),
    };
  }
  // Equal-power sinusoidal crossfade preserves perceived loudness
  return {
    outgoingGain: Number(Math.cos(t * Math.PI * 0.5).toFixed(4)),
    incomingGain: Number(Math.sin(t * Math.PI * 0.5).toFixed(4)),
  };
}

export function buildGainCurveSamples(
  curve: CrossfadeSettings['curve'],
  direction: 'in' | 'out',
  steps = 32
): Float32Array<ArrayBuffer> {
  const count = Math.max(2, Math.floor(steps));
  const samples = new Float32Array(new ArrayBuffer(count * 4));
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const { outgoingGain, incomingGain } = computeCrossfadeGains(progress, curve);
    samples[i] = direction === 'out' ? outgoingGain : incomingGain;
  }
  return samples;
}

export function computeTransitionPlan(params: {
  crossfade?: CrossfadeSettings;
  outgoingBpm?: number;
  incomingBpm?: number;
  trackDurationSec?: number;
  reason?: 'manual' | 'auto';
}): TransitionPlan {
  const { crossfade, outgoingBpm, incomingBpm, trackDurationSec, reason = 'auto' } = params;

  if (crossfade?.enabled && crossfade.durationSec > 0) {
    let fadeSec = crossfade.durationSec;
    let bpmSnapped = false;

    if (crossfade.bpmSync && outgoingBpm && Number.isFinite(outgoingBpm) && outgoingBpm >= 40) {
      const barSec = (60 / outgoingBpm) * 4;
      const stepSec = fadeSec < barSec * 0.6 ? barSec / 2 : barSec;
      const units = Math.max(1, Math.round(fadeSec / stepSec));
      fadeSec = Number((units * stepSec).toFixed(2));
      bpmSnapped = true;
    }

    const maxAllowed =
      trackDurationSec && Number.isFinite(trackDurationSec) && trackDurationSec > 0
        ? Math.min(12, Math.max(0.5, trackDurationSec * 0.45))
        : 12;
    fadeSec = Number(Math.max(0.5, Math.min(maxAllowed, fadeSec)).toFixed(2));

    let playbackRateMatch = 1;
    if (
      crossfade.bpmSync &&
      outgoingBpm &&
      incomingBpm &&
      outgoingBpm >= 40 &&
      incomingBpm >= 40
    ) {
      const ratio = outgoingBpm / incomingBpm;
      if (ratio >= 0.9 && ratio <= 1.1) {
        playbackRateMatch = Number(ratio.toFixed(4));
      }
    }

    return {
      mode: 'crossfade',
      fadeDurationSec: fadeSec,
      triggerEarlySec: fadeSec,
      gapPauseMs: 0,
      curve: crossfade.curve,
      playbackRateMatch,
      bpmSnapped,
    };
  }

  if (crossfade?.gapless ?? true) {
    const cap =
      trackDurationSec && Number.isFinite(trackDurationSec) && trackDurationSec > 0
        ? Math.min(0.12, trackDurationSec * 0.25)
        : 0.12;
    return {
      mode: 'gapless',
      fadeDurationSec: Number(Math.min(0.05, cap).toFixed(3)),
      triggerEarlySec: Number(cap.toFixed(3)),
      gapPauseMs: 0,
      curve: 'equal-power',
      playbackRateMatch: 1,
      bpmSnapped: false,
    };
  }

  return {
    mode: 'gap',
    fadeDurationSec: 0,
    triggerEarlySec: 0,
    gapPauseMs: reason === 'auto' ? 650 : 0,
    curve: 'linear',
    playbackRateMatch: 1,
    bpmSnapped: false,
  };
}

export function resolveNextTrackIndex(params: {
  currentIndex: number;
  totalTracks: number;
  repeat: RepeatMode;
  shuffle: boolean;
  direction: 'next' | 'prev';
  randomFn?: () => number;
}): number | null {
  const { currentIndex, totalTracks, repeat, shuffle, direction, randomFn = Math.random } = params;
  if (totalTracks <= 0) return null;
  if (totalTracks === 1) return repeat === 'off' && direction === 'next' ? null : 0;

  if (repeat === 'one' && direction === 'next') {
    return currentIndex;
  }

  if (shuffle) {
    let candidate = Math.floor(randomFn() * totalTracks);
    if (candidate === currentIndex) {
      candidate = (candidate + 1) % totalTracks;
    }
    return candidate;
  }

  if (direction === 'next') {
    if (currentIndex + 1 < totalTracks) return currentIndex + 1;
    return repeat === 'all' ? 0 : null;
  }

  // direction === 'prev'
  if (currentIndex - 1 >= 0) return currentIndex - 1;
  return repeat === 'all' ? totalTracks - 1 : 0;
}

export function findActiveLyricIndex(lyrics: LyricLine[], currentTimeSec: number): number {
  if (lyrics.length === 0) return -1;
  let active = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (currentTimeSec >= lyrics[i].time) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}
