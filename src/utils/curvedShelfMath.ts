export interface ShelfMetrics {
  H: number;
  ws: number;
  d: number;
  gap: number;
  U: number;
  P: number;
}

export interface BookPoseInput {
  r: number;
  metrics: ShelfMetrics;
  lift: number;
  tiltX: number;
  tiltY: number;
  xscTable: Float64Array;
}

export interface BookPose {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  zIndex: number;
  spShade: number;
  cvShade: number;
  openFactor: number;
}

export function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/** Smooth transition curve separating side spines from the centered front-facing cover */
export function shelfBlendB(r: number): number {
  if (Math.abs(r) < 1) {
    return (r + Math.sin(Math.PI * r) / Math.PI) * 0.5;
  }
  return r >= 1 ? 0.5 : -0.5;
}

/** Linear unwrapped arc position u along the shelf for relative index offset r */
export function shelfOffsetF(r: number, ws: number, d: number, gap: number): number {
  return r * (ws + gap) + (d - ws + 1.4 * gap) * shelfBlendB(r);
}

/** Perspective scale falloff away from center */
export function shelfScaleScl(u: number, U: number): number {
  return 1 / (1 + Math.pow(Math.abs(u) / Math.max(1, U), 1.6));
}

/** Precomputes integral of perspective-compressed x coordinate for smooth curvature */
export function buildXscTable(U: number): Float64Array {
  const safeU = Math.max(1, U);
  const maxU = Math.ceil(safeU * 3);
  const steps = Math.ceil(maxU / 2) + 2;
  const table = new Float64Array(steps);
  let acc = 0;
  for (let idx = 0; idx < steps; idx++) {
    table[idx] = acc;
    const uVal = idx * 2;
    acc += 2 / (1 + Math.pow(uVal / safeU, 1.6));
  }
  return table;
}

export function lookupXsc(u: number, table: Float64Array): number {
  const absU = Math.abs(u);
  const fIdx = absU * 0.5;
  const i0 = Math.min(table.length - 2, Math.floor(fIdx));
  const frac = fIdx - i0;
  const val = table[i0] + (table[i0 + 1] - table[i0]) * frac;
  return (u < 0 ? -1 : 1) * val;
}

export function computeShelfMetrics(heightPx: number, isMobile: boolean): ShelfMetrics {
  const H = Math.max(150, heightPx);
  return {
    H,
    ws: H * (142 / 840),
    d: H * (474 / 900),
    gap: H * 0.036,
    U: isMobile ? H * 0.92 : H * 1.24,
    P: 1400,
  };
}

/** Shortest circular step delta on an N-item infinite loop */
export function computeShortestWrapDelta(
  currentPosition: number,
  targetIndex: number,
  count: number
): number {
  if (count <= 0) return 0;
  const curMod = (((Math.round(currentPosition) % count) + count) % count);
  let diff = targetIndex - curMod;
  if (diff > count / 2) diff -= count;
  if (diff < -count / 2) diff += count;
  return diff;
}

export function computeBookPose({
  r,
  metrics,
  lift,
  tiltX,
  tiltY,
  xscTable,
}: BookPoseInput): BookPose {
  const { H, ws, d, gap, U, P } = metrics;
  const u = shelfOffsetF(r, ws, d, gap);
  if (Math.abs(u) > U * 1.85) {
    return {
      visible: false,
      x: 0,
      y: 0,
      z: -2000,
      rotX: 0,
      rotY: 0,
      zIndex: 0,
      spShade: 1,
      cvShade: 1,
      openFactor: 0,
    };
  }

  const openFactor = smoothstep(Math.max(0, 1 - Math.abs(r)));
  const sc = shelfScaleScl(u, U);
  const k = 1 / sc;

  const z = P * (1 - k) + openFactor * H * 0.1;
  const x = lookupXsc(u, xscTable) * k;
  const y =
    (H * 0.5 * (1 - sc) * 0.36 +
      openFactor * H * 0.012 -
      lift * H * 0.055) *
    k;

  const signU = u < 0 ? -1 : u > 0 ? 1 : 0;
  const rotY =
    signU * Math.min(1, Math.abs(u) / U) * 26 * (1 - openFactor) -
    90 * openFactor +
    tiltY * openFactor;
  const rotX = tiltX * openFactor;

  const spShade = Math.min(0.56, openFactor * 0.52 + (1 - sc) * 0.28);
  const cvShade = (1 - openFactor) * 0.8;

  return {
    visible: true,
    x,
    y,
    z,
    rotX,
    rotY,
    zIndex: Math.round(3000 + z),
    spShade,
    cvShade,
    openFactor,
  };
}
