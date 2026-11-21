import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLUID_ORB_SPECS,
  computeAudioEnergy,
  createBackdropMotes,
  evaluateFluidOrb,
  evaluateSilkWaveY,
} from './livingBackdropMath.ts';

test('computes live audio energy from FFT bins and ambient tide when silent', () => {
  const silent = new Uint8Array(64);
  const pausedEnergy = computeAudioEnergy(silent, false, 1.0, false);
  const playingIdleEnergy = computeAudioEnergy(silent, false, 1.0, true);

  assert.ok(pausedEnergy.overall >= 0 && pausedEnergy.overall <= 0.2);
  assert.ok(playingIdleEnergy.overall > pausedEnergy.overall);

  const loud = new Uint8Array(64);
  loud.fill(200, 0, 12);
  loud.fill(140, 12, 32);
  loud.fill(90, 32, 64);

  const liveEnergy = computeAudioEnergy(loud, true, 1.0, true);
  assert.ok(liveEnergy.bass > 0.7);
  assert.ok(liveEnergy.mid > 0.45);
  assert.ok(liveEnergy.treble > 0.3);
  assert.ok(liveEnergy.overall <= 1);
});

test('moves fluid orbs continuously over time and responds to pointer and audio energy', () => {
  const spec = FLUID_ORB_SPECS[0];
  const calm = { bass: 0.05, mid: 0.05, treble: 0.05, overall: 0.05 };
  const energetic = { bass: 0.85, mid: 0.6, treble: 0.4, overall: 0.72 };

  const a = evaluateFluidOrb(spec, 0, 0.5, 0.5, calm);
  const b = evaluateFluidOrb(spec, 3.2, 0.5, 0.5, calm);
  const c = evaluateFluidOrb(spec, 3.2, 0.9, 0.2, energetic);

  assert.notEqual(a.nx, b.nx);
  assert.notEqual(a.ny, b.ny);
  assert.ok(c.radiusScale > b.radiusScale);
  assert.ok(c.alphaBoost > b.alphaBoost);
  assert.notEqual(c.nx, b.nx);
});

test('evaluates harmonic silk waves and creates bounded deterministic motes', () => {
  const energy = { bass: 0.3, mid: 0.25, treble: 0.2, overall: 0.27 };
  const y0 = evaluateSilkWaveY(0.5, 0.0, 1, energy, 0.5);
  const y1 = evaluateSilkWaveY(0.5, 2.0, 1, energy, 0.5);
  assert.notEqual(y0, y1);
  assert.ok(y0 > 0 && y0 < 1);

  const motes = createBackdropMotes(40);
  assert.equal(motes.length, 40);
  for (const m of motes) {
    assert.ok(m.x >= 0 && m.x <= 1);
    assert.ok(m.y >= 0 && m.y <= 1);
    assert.ok(m.radius > 0);
    assert.ok(m.alpha > 0 && m.alpha <= 1);
  }
});
