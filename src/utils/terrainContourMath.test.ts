import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVerticalFade,
  evaluateUnifiedField,
  getContourLayout,
  getOrganicContourRadius,
} from './terrainContourMath.ts';

test('computes responsive topographic contour layout for desktop, tablet, and mobile', () => {
  const desktop = getContourLayout(1440, 900);
  const tablet = getContourLayout(820, 900);
  const mobile = getContourLayout(390, 844);

  assert.ok(desktop.cx > 800 && desktop.scale > 300);
  assert.ok(tablet.cx > 500 && tablet.scale > 200);
  assert.equal(mobile.cx, 195);
  assert.ok(mobile.scale > 150);
});

test('produces clean summit basin, terraced contour rings, and cursor ripple distortion', () => {
  const { cx, cy, scale } = getContourLayout(1440, 900);
  const inactivePtr = { x: -9999, y: -9999, active: false };

  // Center of summit basin has no dots (-1)
  const centerVal = evaluateUnifiedField(cx, cy, cx, cy, scale, 1.0, inactivePtr, 0);
  assert.equal(centerVal, -1);

  // First terraced ring around r ~ 0.345 produces strong halftone density
  const ringX = cx + scale * 0.36;
  const ringVal = evaluateUnifiedField(ringX, cy, cx, cy, scale, 1.0, inactivePtr, 0);
  assert.ok(ringVal > 0.3 && ringVal <= 1);

  // Active cursor near the contour creates distortion delta
  const activePtr = { x: ringX + 24, y: cy + 12, active: true };
  const rippledVal = evaluateUnifiedField(ringX, cy, cx, cy, scale, 1.0, activePtr, 0);
  assert.notEqual(rippledVal, ringVal);

  // Seismic boost shifts outward wave radius
  const rCalm = getOrganicContourRadius(0.5, 0.2, 1.5, 0);
  const rBoosted = getOrganicContourRadius(0.5, 0.2, 1.5, 1.0);
  assert.notEqual(rCalm, rBoosted);
});

test('attenuates halftone dots smoothly at top and bottom margins', () => {
  assert.equal(computeVerticalFade(0, 900), 0);
  assert.equal(computeVerticalFade(900, 900), 0);
  assert.equal(computeVerticalFade(450, 900), 1);
  const midTop = computeVerticalFade(99, 900);
  assert.ok(midTop > 0.45 && midTop < 0.55);
});
