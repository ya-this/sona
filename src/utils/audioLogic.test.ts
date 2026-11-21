import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGainCurveSamples,
  clampEqDb,
  computeCrossfadeGains,
  computeTransitionPlan,
  findActiveLyricIndex,
  resolveNextTrackIndex,
} from './audioLogic';

test('clamps equalizer gains within -12 to +12 dB', () => {
  assert.equal(clampEqDb(18), 12);
  assert.equal(clampEqDb(-20), -12);
  assert.equal(clampEqDb(3.46), 3.5);
  assert.equal(clampEqDb(Number.NaN), 0);
});

test('computes equal-power and linear crossfade gain envelopes', () => {
  const midEqual = computeCrossfadeGains(0.5, 'equal-power');
  assert.ok(Math.abs(midEqual.outgoingGain - 0.7071) < 0.001);
  assert.ok(Math.abs(midEqual.incomingGain - 0.7071) < 0.001);

  const midLinear = computeCrossfadeGains(0.5, 'linear');
  assert.equal(midLinear.outgoingGain, 0.5);
  assert.equal(midLinear.incomingGain, 0.5);
});

test('builds monotonic Float32Array Web Audio gain curves', () => {
  const fadeOut = buildGainCurveSamples('equal-power', 'out', 16);
  const fadeIn = buildGainCurveSamples('linear', 'in', 16);
  assert.equal(fadeOut.length, 16);
  assert.equal(fadeIn.length, 16);
  assert.ok(fadeOut[0] > 0.99 && fadeOut[15] < 0.01);
  assert.ok(fadeIn[0] < 0.01 && fadeIn[15] > 0.99);
});

test('computes transition plan for crossfade, bpmSync, gapless, and gap modes', () => {
  const cfPlan = computeTransitionPlan({
    crossfade: { gapless: true, enabled: true, durationSec: 4, curve: 'equal-power', bpmSync: false },
    trackDurationSec: 180,
    reason: 'auto',
  });
  assert.equal(cfPlan.mode, 'crossfade');
  assert.equal(cfPlan.fadeDurationSec, 4);
  assert.equal(cfPlan.triggerEarlySec, 4);
  assert.equal(cfPlan.gapPauseMs, 0);

  const bpmPlan = computeTransitionPlan({
    crossfade: { gapless: true, enabled: true, durationSec: 5, curve: 'linear', bpmSync: true },
    outgoingBpm: 120,
    incomingBpm: 126,
    trackDurationSec: 180,
    reason: 'auto',
  });
  assert.equal(bpmPlan.mode, 'crossfade');
  assert.equal(bpmPlan.bpmSnapped, true);
  assert.equal(bpmPlan.fadeDurationSec, 6); // 120 BPM => 2s/bar, 5s rounds to 3 bars = 6s
  assert.ok(bpmPlan.playbackRateMatch > 0.94 && bpmPlan.playbackRateMatch < 0.96);

  const gaplessPlan = computeTransitionPlan({
    crossfade: { gapless: true, enabled: false, durationSec: 4, curve: 'equal-power', bpmSync: false },
    trackDurationSec: 180,
    reason: 'auto',
  });
  assert.equal(gaplessPlan.mode, 'gapless');
  assert.ok(gaplessPlan.triggerEarlySec > 0 && gaplessPlan.gapPauseMs === 0);

  const gapAutoPlan = computeTransitionPlan({
    crossfade: { gapless: false, enabled: false, durationSec: 0, curve: 'linear', bpmSync: false },
    trackDurationSec: 180,
    reason: 'auto',
  });
  assert.equal(gapAutoPlan.mode, 'gap');
  assert.equal(gapAutoPlan.gapPauseMs, 650);

  const gapManualPlan = computeTransitionPlan({
    crossfade: { gapless: false, enabled: false, durationSec: 0, curve: 'linear', bpmSync: false },
    trackDurationSec: 180,
    reason: 'manual',
  });
  assert.equal(gapManualPlan.gapPauseMs, 0);
});

test('resolves next and previous track index under repeat and shuffle modes', () => {
  assert.equal(
    resolveNextTrackIndex({ currentIndex: 2, totalTracks: 3, repeat: 'off', shuffle: false, direction: 'next' }),
    null
  );
  assert.equal(
    resolveNextTrackIndex({ currentIndex: 2, totalTracks: 3, repeat: 'all', shuffle: false, direction: 'next' }),
    0
  );
  assert.equal(
    resolveNextTrackIndex({ currentIndex: 1, totalTracks: 3, repeat: 'one', shuffle: false, direction: 'next' }),
    1
  );
  assert.equal(
    resolveNextTrackIndex({ currentIndex: 0, totalTracks: 4, repeat: 'all', shuffle: true, direction: 'next', randomFn: () => 0 }),
    1
  );
});

test('finds active karaoke lyric line for timestamp', () => {
  const lyrics = [
    { time: 0, text: 'Line 1' },
    { time: 8, text: 'Line 2' },
    { time: 18, text: 'Line 3' },
  ];
  assert.equal(findActiveLyricIndex(lyrics, 0), 0);
  assert.equal(findActiveLyricIndex(lyrics, 12.5), 1);
  assert.equal(findActiveLyricIndex(lyrics, 25), 2);
});
