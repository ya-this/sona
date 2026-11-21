export const VOLUME_BAR_COUNT = 10;

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

/**
 * Maps volume [0..1] to rotary arc angle [-135deg .. +135deg].
 */
export function volumeToDialAngle(volume: number): number {
  const v = clampVolume(volume);
  return Math.round(-135 + v * 270);
}

/**
 * Returns how many acoustic bars (out of `barCount`) should be illuminated for volume [0..1].
 */
export function volumeToActiveBars(volume: number, barCount = VOLUME_BAR_COUNT): number {
  const v = clampVolume(volume);
  if (v <= 0) return 0;
  return Math.max(1, Math.min(barCount, Math.round(v * barCount)));
}

/**
 * Maps a clicked bar index (0-based) to a clean normalized volume [0.1..1].
 */
export function barIndexToVolume(index: number, barCount = VOLUME_BAR_COUNT): number {
  const clampedIdx = Math.max(0, Math.min(barCount - 1, Math.floor(index)));
  return clampVolume((clampedIdx + 1) / barCount);
}

/**
 * Formats normalized volume [0..1] into a crisp studio dB attenuation label.
 */
export function formatVolumeDb(volume: number): string {
  const v = clampVolume(volume);
  if (v <= 0) return '-∞ дБ';
  const db = Math.round(20 * Math.log10(v));
  return `${db === 0 ? '0' : db} дБ`;
}
