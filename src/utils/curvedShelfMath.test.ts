import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildXscTable,
  computeBookPose,
  computeShelfMetrics,
  computeShortestWrapDelta,
  shelfBlendB,
  smoothstep,
} from './curvedShelfMath';

test('computes smoothstep and spine-to-cover blend symmetrically', () => {
  assert.equal(smoothstep(-0.5), 0);
  assert.equal(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(1.5), 1);

  assert.equal(shelfBlendB(0), 0);
  assert.equal(shelfBlendB(1), 0.5);
  assert.equal(shelfBlendB(-1), -0.5);
  assert.ok(Math.abs(shelfBlendB(0.5) + shelfBlendB(-0.5)) < 1e-9);
});

test('rotates center track cover face-forward and recedes side spines along curve', () => {
  const metrics = computeShelfMetrics(260, false);
  const table = buildXscTable(metrics.U);

  const center = computeBookPose({
    r: 0,
    metrics,
    lift: 0,
    tiltX: 0,
    tiltY: 0,
    xscTable: table,
  });
  assert.equal(center.visible, true);
  assert.equal(center.openFactor, 1);
  assert.equal(center.rotY, -90);
  assert.equal(center.cvShade, 0);
  assert.ok(center.z > 0);

  const rightSpine = computeBookPose({
    r: 2,
    metrics,
    lift: 0,
    tiltX: 0,
    tiltY: 0,
    xscTable: table,
  });
  assert.equal(rightSpine.visible, true);
  assert.equal(rightSpine.openFactor, 0);
  assert.ok(rightSpine.x > 0);
  assert.ok(rightSpine.z < center.z);
  assert.ok(rightSpine.cvShade > 0.75);
});

test('computes shortest circular wrap delta across shelf boundaries', () => {
  assert.equal(computeShortestWrapDelta(9, 0, 10), 1);
  assert.equal(computeShortestWrapDelta(0, 9, 10), -1);
  assert.equal(computeShortestWrapDelta(3, 5, 10), 2);
  assert.equal(computeShortestWrapDelta(14, 4, 10), 0);
});
