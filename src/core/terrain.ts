import { fbm, perlin, ridged } from './noise';
import { range, RNG } from './rng';

export type TerrainId = 'hills' | 'ridges' | 'peaks' | 'flow';

export const TERRAINS: { id: TerrainId; name: string }[] = [
  { id: 'hills', name: 'Rolling hills' },
  { id: 'ridges', name: 'Ridges' },
  { id: 'peaks', name: 'Peaks' },
  { id: 'flow', name: 'Flow' },
];

export interface TerrainSettings {
  width: number;
  height: number;
  terrain: TerrainId;
  /** Feature size, px: roughly the distance between neighboring hills. */
  scale: number;
  /** 0–100: octave count and gain of the fractal noise. */
  roughness: number;
  /** 0–100: domain-warp strength (swirls and folds the terrain). */
  warp: number;
}

/** A sampled height grid. Samples run past the frame by `MARGIN` on every side
 *  and are wrapped in one more ring of very low samples, so every contour is a
 *  closed loop, and the part of a loop that hugs the grid edge sits outside the
 *  frame, hidden by its clip. */
export interface HeightField {
  cols: number;
  rows: number;
  /** Position of sample (0, 0) — the low outer ring. */
  x0: number;
  y0: number;
  step: number;
  /** Row-major; in-frame samples are normalized to span exactly [0, 1]. */
  values: Float64Array;
  /** Sorted in-frame samples, for area-even (quantile) contour spacing. */
  inFrame: Float64Array;
}

/** How far the sampled terrain extends past the frame, px. Fixed (not tied to
 *  stroke width) so restyling never moves a contour. */
export const MARGIN = 56;
const RING = -1e6;

/** Sample spacing: fine enough for smooth contours, capped at ~60k samples. */
export function sampleStep(width: number, height: number): number {
  const w = width + 2 * MARGIN;
  const h = height + 2 * MARGIN;
  return Math.max(Math.max(width, height) / 240, Math.sqrt((w * h) / 60000), 1.5);
}

/** The terrain height function in frame px. Every rng draw happens up front,
 *  in the same order for every terrain, so switching terrain keeps the seed's
 *  underlying noise. */
function heightFn(s: TerrainSettings, rng: RNG): (x: number, y: number) => number {
  const base = perlin(rng);
  const warpX = perlin(rng);
  const warpY = perlin(rng);
  const peaks = Array.from({ length: 6 }, () => ({
    x: range(rng, 0.1, 0.9) * s.width,
    y: range(rng, 0.1, 0.9) * s.height,
    sigma: s.scale * range(rng, 0.45, 1.1),
    amp: range(rng, 0.55, 1),
  }));
  const peakCount = 3 + Math.floor(rng() * 4);
  const angle = rng() * Math.PI * 2;
  const ox = rng() * 512;
  const oy = rng() * 512;

  const rough = s.roughness / 100;
  const octaves = 1 + Math.round(rough * 5);
  const gain = 0.32 + 0.28 * rough;
  const warp = (s.warp / 100) * 1.6;
  const k = 1 / s.scale;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const activePeaks = peaks.slice(0, peakCount);

  return (x: number, y: number) => {
    let u = x * k + ox;
    let v = y * k + oy;
    if (warp > 0) {
      const wu = fbm(warpX, u * 0.55, v * 0.55, 3, 0.5);
      const wv = fbm(warpY, u * 0.55 + 9.1, v * 0.55 + 4.7, 3, 0.5);
      u += warp * wu;
      v += warp * wv;
    }
    switch (s.terrain) {
      case 'ridges':
        return ridged(base, u, v, octaves, gain);
      case 'peaks': {
        const px = (u - ox) * s.scale;
        const py = (v - oy) * s.scale;
        let h = 0;
        for (const p of activePeaks) {
          const dx = px - p.x;
          const dy = py - p.y;
          h += p.amp * Math.exp(-(dx * dx + dy * dy) / (2 * p.sigma * p.sigma));
        }
        return h + 0.16 * (0.4 + rough) * fbm(base, u * 1.4, v * 1.4, octaves, gain);
      }
      case 'flow': {
        const along = ((u - ox) * ca + (v - oy) * sa) * 0.45;
        return along + 0.6 * fbm(base, u * 0.8, v * 0.8, octaves, gain);
      }
      default:
        return fbm(base, u, v, octaves, gain);
    }
  };
}

export function sampleField(s: TerrainSettings, rng: RNG): HeightField {
  const h = heightFn(s, rng);
  const step = sampleStep(s.width, s.height);
  // Interior samples cover [-MARGIN, size + MARGIN]; one ring outside that.
  const inner = (size: number) => Math.ceil((size + 2 * MARGIN) / step) + 1;
  const cols = inner(s.width) + 2;
  const rows = inner(s.height) + 2;
  const x0 = -MARGIN - step;
  const y0 = -MARGIN - step;
  const values = new Float64Array(cols * rows).fill(RING);
  let min = Infinity;
  let max = -Infinity;
  const frame: number[] = [];
  for (let j = 1; j < rows - 1; j++) {
    const y = y0 + j * step;
    for (let i = 1; i < cols - 1; i++) {
      const x = x0 + i * step;
      const v = h(x, y);
      values[j * cols + i] = v;
      if (x >= 0 && x <= s.width && y >= 0 && y <= s.height) {
        if (v < min) min = v;
        if (v > max) max = v;
        frame.push(v);
      }
    }
  }
  const span = max - min || 1;
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const idx = j * cols + i;
      values[idx] = (values[idx] - min) / span;
    }
  }
  const inFrame = Float64Array.from(frame, (v) => (v - min) / span).sort();
  return { cols, rows, x0, y0, step, values, inFrame };
}
