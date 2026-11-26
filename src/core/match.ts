import { Area, clampParams, compose, TopoMap, TopoParams } from './composer';
import { Point, pointInPoly } from './contours';
import { areaShapes, frameShapes, layerName, prettyName } from './svg';

/** Params that move contours. Everything else (style, theme, coloring,
 *  stroke, index lines) restyles the same areas under the same layer names. */
const GEOMETRY_KEYS = [
  'width',
  'height',
  'terrain',
  'levels',
  'spacing',
  'scale',
  'roughness',
  'warp',
  'smoothing',
  'seed',
] as const;

export function sameGeometry(a: TopoParams, b: TopoParams): boolean {
  const ca = clampParams(a);
  const cb = clampParams(b);
  return GEOMETRY_KEYS.every((k) => ca[k] === cb[k]);
}

export interface LayerArea {
  level: number;
  area: Area;
  /** A point inside the area's outer boundary. */
  anchor: Point;
}

function inside(p: Point, a: Area): boolean {
  return pointInPoly(p, a.outer) && !a.holes.some((h) => pointInPoly(p, h));
}

/** A point inside `poly`: its bounding-box center when that lands inside,
 *  else the midpoint of the widest span on the horizontal line through it. */
function anchorOf(a: Area): Point {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of a.outer) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  const c = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  if (inside(c, a)) return c;
  const xs: number[] = [];
  const poly = a.outer;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[i];
    const q = poly[j];
    if (p.y > c.y !== q.y > c.y) xs.push(p.x + ((c.y - p.y) * (q.x - p.x)) / (q.y - p.y));
  }
  xs.sort((m, n) => m - n);
  let best = c;
  let width = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > width) {
      width = xs[i + 1] - xs[i];
      best = { x: (xs[i] + xs[i + 1]) / 2, y: c.y };
    }
  }
  return best;
}

function areasOf(map: TopoMap): Map<string, LayerArea> {
  const out = new Map<string, LayerArea>();
  for (const s of areaShapes(map)) {
    const area = map.areas[s.level - 1][s.index];
    out.set(layerName(s), { level: s.level, area, anchor: anchorOf(area) });
  }
  return out;
}

/** Layer path ("Level 03/Area 01") → that area's level, geometry and anchor. */
export function layerAreas(params: TopoParams): Map<string, LayerArea> {
  return areasOf(compose(params));
}

/** Where each overridden layer of a `from` map should land in the `to` map.
 *  Same geometry → the same layer. Otherwise each area's anchor is scaled to
 *  the new frame and its level mapped to the same relative height; it goes to
 *  the area at that level containing the anchor, else the nearest one within
 *  ~12% of the frame diagonal. Each new area is claimed at most once, closest
 *  first. */
export function matchLayers(
  from: TopoParams,
  to: TopoParams,
  names: Iterable<string>,
): Map<string, string> {
  const wanted = [...names];
  const out = new Map<string, string>();
  const toMap = compose(to);
  const toAreas = areasOf(toMap);
  // Background always exists; Mat and Border only while they're turned on.
  // Neither moves with the terrain, so they keep their own names.
  const fixed = new Set(['Background', ...frameShapes(toMap).map((f) => prettyName(f.id))]);
  if (sameGeometry(from, to)) {
    for (const n of wanted) if (fixed.has(n) || toAreas.has(n)) out.set(n, n);
    return out;
  }
  const a = clampParams(from);
  const b = toMap.params;
  const fromAreas = layerAreas(a);
  const sx = b.width / a.width;
  const sy = b.height / a.height;
  const reach = 0.12 * Math.hypot(b.width, b.height);
  const byLevel = new Map<number, [string, LayerArea][]>();
  for (const entry of toAreas) {
    const list = byLevel.get(entry[1].level) ?? [];
    list.push(entry);
    byLevel.set(entry[1].level, list);
  }
  const pairs: { from: string; to: string; d: number }[] = [];
  for (const n of wanted) {
    if (fixed.has(n)) {
      out.set(n, n);
      continue;
    }
    const src = fromAreas.get(n);
    if (!src) continue;
    const level = Math.min(b.levels, Math.max(1, Math.round((src.level * (b.levels + 1)) / (a.levels + 1))));
    const p = { x: src.anchor.x * sx, y: src.anchor.y * sy };
    for (const [name, dst] of byLevel.get(level) ?? []) {
      const d = inside(p, dst.area) ? 0 : Math.hypot(dst.anchor.x - p.x, dst.anchor.y - p.y);
      if (d <= reach) pairs.push({ from: n, to: name, d });
    }
  }
  pairs.sort((m, q) => m.d - q.d);
  const claimed = new Set<string>();
  for (const pr of pairs) {
    if (out.has(pr.from) || claimed.has(pr.to)) continue;
    out.set(pr.from, pr.to);
    claimed.add(pr.to);
  }
  return out;
}
