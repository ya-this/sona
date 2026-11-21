import test from 'node:test';
import assert from 'node:assert/strict';
import {
  barIndexToVolume,
  clampVolume,
  formatVolumeDb,
  volumeToActiveBars,
  volumeToDialAngle,
} from './volumeDial';

test('clamps volume and maps to rotary dial angles cleanly', () => {
  assert.equal(clampVolume(-0.5), 0);
  assert.equal(clampVolume(1.4), 1);
  assert.equal(volumeToDialAngle(0), -135);
  assert.equal(volumeToDialAngle(0.5), 0);
  assert.equal(volumeToDialAngle(1), 135);
});

test('maps volume to acoustic step bars and decibel readout accurately', () => {
  assert.equal(volumeToActiveBars(0), 0);
  assert.equal(volumeToActiveBars(0.04), 1);
  assert.equal(volumeToActiveBars(0.78), 8);
  assert.equal(volumeToActiveBars(1), 10);
  assert.equal(barIndexToVolume(0), 0.1);
  assert.equal(barIndexToVolume(3), 0.4);
  assert.equal(barIndexToVolume(9), 1);
  assert.equal(formatVolumeDb(0), '-∞ дБ');
  assert.equal(formatVolumeDb(1), '0 дБ');
  assert.equal(formatVolumeDb(0.5), '-6 дБ');
});
