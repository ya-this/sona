import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSquareCropRect } from './imageResize';

test('computeSquareCropRect computes centered square crop for landscape and portrait images', () => {
  assert.deepEqual(computeSquareCropRect(1600, 900, 512), {
    sx: 350,
    sy: 0,
    sSize: 900,
    targetSize: 512,
  });

  assert.deepEqual(computeSquareCropRect(800, 1200, 512), {
    sx: 0,
    sy: 200,
    sSize: 800,
    targetSize: 512,
  });

  assert.deepEqual(computeSquareCropRect(500, 500, 512), {
    sx: 0,
    sy: 0,
    sSize: 500,
    targetSize: 512,
  });
});
