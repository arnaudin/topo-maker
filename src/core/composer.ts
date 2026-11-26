import { bbox, chaikin, Point, pointInPoly, signedArea, simplifyLoop, traceLevel } from './contours';
import { getPalette, Palette, PALETTES } from './palettes';
import { mulberry32 } from './rng';
import { sampleField, TerrainId, TERRAINS } from './terrain';

export type StyleId = 'color' | 'lines' | 'bw';
export type ColorStrategy = 'ramp' | 'cycle';
export type Spacing = 'height' | 'area';

export interface TopoParams {
  width: number;
  height: number;
  terrain: TerrainId;
  /** Number of contour lines (the map has one more band than this). */
  levels: number;
  /** 'height' = equal elevation steps; 'area' = each band covers about the
   *  same area of the frame (quantiles), so lines spread out evenly. */
  spacing: Spacing;
  /** Feature size, px. */
  scale: number;
  /** 0–100. */
  roughness: number;
  /** 0–100. */
  warp: number;
  /** Chaikin smoothing passes, 0 (crisp, faceted) – 3 (silky). */
  smoothing: number;
  /** Every Nth contour is an index line drawn at double stroke (0 = off). */
  majorEvery: number;
  strokeWidth: number;
  style: StyleId;
  themeId: string;
  /** Colored only: 'ramp' = smooth elevation gradient, 'cycle' = repeat the
   *  palette band by band. */
  colorStrategy: ColorStrategy;
  seed: number;
}

export const DEFAULT_PARAMS: TopoParams = {
  width: 800,
  height: 600,
  terrain: 'hills',
  levels: 14,
  spacing: 'height',
  scale: 220,
  roughness: 45,
  warp: 35,
  smoothing: 2,
  majorEvery: 5,
  strokeWidth: 1,
  style: 'color',
  themeId: 'survey',
  colorStrategy: 'ramp',
  seed: 12345,
};

/** One connected region at or above a contour level: an outer boundary plus
 *  the pits inside it. Becomes a single compound (even-odd) path. */
export interface Area {
  outer: Point[];
  holes: Point[][];
  /** Net area, px². */
  size: number;
}

export interface TopoMap {
  params: TopoParams;
  palette: Palette;
  /** Contour heights in [0, 1], ascending; level k (1-based) is thresholds[k-1]. */
  thresholds: number[];
  /** areas[k-1] = regions of level k, in reading order. */
  areas: Area[][];
  /** Per band 0..levels (0 = background): the band's color — fill in
   *  Colored/Outline, line color in Lines. */
  colors: string[];
}

/** Hydrated params may come from stale plugin data — coerce everything sane. */
export function clampParams(p: TopoParams): TopoParams {
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const D = DEFAULT_PARAMS;
  return {
    width: clamp(Math.round(num(p.width, D.width)), 100, 4000),
    height: clamp(Math.round(num(p.height, D.height)), 100, 4000),
    terrain: TERRAINS.some((t) => t.id === p.terrain) ? p.terrain : D.terrain,
    levels: clamp(Math.round(num(p.levels, D.levels)), 2, 60),
    spacing: p.spacing === 'area' ? 'area' : 'height',
    scale: clamp(num(p.scale, D.scale), 40, 1200),
    roughness: clamp(num(p.roughness, D.roughness), 0, 100),
    warp: clamp(num(p.warp, D.warp), 0, 100),
    smoothing: clamp(Math.round(num(p.smoothing, D.smoothing)), 0, 3),
    majorEvery: clamp(Math.round(num(p.majorEvery, D.majorEvery)), 0, 20),
    strokeWidth: clamp(num(p.strokeWidth, D.strokeWidth), 0, 8),
    style: p.style === 'lines' || p.style === 'bw' ? p.style : 'color',
    themeId: PALETTES.some((x) => x.id === p.themeId) ? p.themeId : D.themeId,
    colorStrategy: p.colorStrategy === 'cycle' ? 'cycle' : 'ramp',
    seed: Math.round(num(p.seed, D.seed)),
  };
}

export function thresholdsFor(levels: number, spacing: Spacing, sorted: Float64Array): number[] {
  const out: number[] = [];
  for (let k = 1; k <= levels; k++) {
    const q = k / (levels + 1);
    if (spacing === 'area' && sorted.length > 0) {
      out.push(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
    } else {
      out.push(q);
    }
  }
  return out;
}

/** Group one level's loops into areas: the biggest loop's winding marks
 *  outer boundaries; every other-wound loop is a hole in the smallest outer
 *  that contains it. Loops entirely outside the frame, and specks, are dropped. */
function buildAreas(
  loops: Point[][],
  width: number,
  height: number,
  minSize: number,
  smoothing: number,
): Area[] {
  type L = { pts: Point[]; a: number; box: [number, number, number, number] };
  const kept: L[] = [];
  for (const raw of loops) {
    const a = signedArea(raw);
    if (Math.abs(a) < minSize) continue;
    const box = bbox(raw);
    if (box[2] < 0 || box[3] < 0 || box[0] > width || box[1] > height) continue;
    kept.push({ pts: raw, a, box });
  }
  if (!kept.length) return [];
  let big = kept[0];
  for (const l of kept) if (Math.abs(l.a) > Math.abs(big.a)) big = l;
  const outerSign = Math.sign(big.a);
  const outers = kept.filter((l) => Math.sign(l.a) === outerSign);
  const holes = kept.filter((l) => Math.sign(l.a) !== outerSign);
  const holesOf = outers.map(() => [] as L[]);
  for (const h of holes) {
    let best = -1;
    for (let i = 0; i < outers.length; i++) {
      const o = outers[i];
      if (h.box[0] < o.box[0] || h.box[1] < o.box[1] || h.box[2] > o.box[2] || h.box[3] > o.box[3]) {
        continue;
      }
      if (best >= 0 && Math.abs(o.a) >= Math.abs(outers[best].a)) continue;
      if (pointInPoly(h.pts[0], o.pts)) best = i;
    }
    if (best >= 0) holesOf[best].push(h);
  }
  // Reading order: top-to-bottom, then left-to-right by bounding-box center.
  const order = outers.map((_, i) => i);
  const cy = (i: number) => Math.round((outers[i].box[1] + outers[i].box[3]) / 2 / 40);
  const cx = (i: number) => (outers[i].box[0] + outers[i].box[2]) / 2;
  order.sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
  const tidy = (pts: Point[]) => simplifyLoop(chaikin(pts, smoothing), 0.3);
  return order.map((i) => ({
    outer: tidy(outers[i].pts),
    holes: holesOf[i].map((h) => tidy(h.pts)),
    size: Math.abs(outers[i].a) - holesOf[i].reduce((s, h) => s + Math.abs(h.a), 0),
  }));
}

function hexLerp(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const mix = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
  const to = (v: number) => v.toString(16).padStart(2, '0');
  return (
    '#' +
    to(mix((na >> 16) & 255, (nb >> 16) & 255)) +
    to(mix((na >> 8) & 255, (nb >> 8) & 255)) +
    to(mix(na & 255, nb & 255))
  );
}

export function sampleStops(stops: string[], t: number): string {
  const c = Math.min(1, Math.max(0, t));
  const seg = c * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  return hexLerp(stops[i], stops[i + 1], seg - i);
}

function bandColors(p: TopoParams, palette: Palette, phase: number): string[] {
  const n = p.levels;
  const out: string[] = [];
  for (let k = 0; k <= n; k++) {
    if (p.style === 'bw') out.push('#ffffff');
    else if (p.style === 'lines') out.push(k === 0 ? palette.lineBg : sampleStops(palette.lines, (k - 1) / Math.max(1, n - 1)));
    else if (p.colorStrategy === 'cycle') out.push(palette.colors[(k + phase) % palette.colors.length]);
    else out.push(sampleStops(palette.colors, k / n));
  }
  return out;
}

/** Params → deterministic contour map. Geometry and colors draw from separate
 *  rng streams so the terrain stays identical when only theme/style changes. */
export function compose(raw: TopoParams): TopoMap {
  const params = clampParams(raw);
  const rngGeo = mulberry32(params.seed);
  const rngColor = mulberry32((params.seed ^ 0x9e3779b9) >>> 0);
  const field = sampleField(params, rngGeo);
  const thresholds = thresholdsFor(params.levels, params.spacing, field.inFrame);
  const minSize = field.step * field.step * 2.5;
  const areas = thresholds.map((t) =>
    buildAreas(traceLevel(field, t), params.width, params.height, minSize, params.smoothing),
  );
  const palette = getPalette(params.themeId);
  const phase = Math.floor(rngColor() * palette.colors.length);
  return { params, palette, thresholds, areas, colors: bandColors(params, palette, phase) };
}
