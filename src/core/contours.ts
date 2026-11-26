import { HeightField } from './terrain';

export interface Point {
  x: number;
  y: number;
}

/** Marching squares: every closed iso-line of `field` at height `level`.
 *  Segments are oriented so the high side (>= level) is always on the same
 *  side, which makes outer boundaries and holes wind in opposite directions.
 *  The field's low outer ring guarantees every loop closes. */
/** Corner shared by two adjacent cell edges (edges: 0 top, 1 right, 2 bottom,
 *  3 left; corners: 0 TL, 1 TR, 2 BR, 3 BL). */
const SHARED: number[][] = [
  [-1, 1, -1, 0],
  [1, -1, 2, -1],
  [-1, 2, -1, 3],
  [0, -1, 3, -1],
];

export function traceLevel(field: HeightField, level: number): Point[][] {
  const { cols, rows, values, x0, y0, step } = field;
  const pts = new Map<number, Point>();
  const next = new Map<number, number>();

  // Edge keys: horizontal edge from sample (i, j) to (i+1, j) is 2·(j·cols+i);
  // the vertical edge from (i, j) to (i, j+1) is that plus one.
  const point = (key: number): Point => {
    let p = pts.get(key);
    if (p) return p;
    const cell = key >> 1;
    const i = cell % cols;
    const j = (cell - i) / cols;
    const a = values[cell];
    const b = key & 1 ? values[cell + cols] : values[cell + 1];
    let t = (level - a) / (b - a);
    t = t < 1e-6 ? 1e-6 : t > 1 - 1e-6 ? 1 - 1e-6 : t;
    p =
      key & 1
        ? { x: x0 + i * step, y: y0 + (j + t) * step }
        : { x: x0 + (i + t) * step, y: y0 + j * step };
    pts.set(key, p);
    return p;
  };

  const cx = [0, 1, 1, 0];
  const cy = [0, 0, 1, 1];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const c = j * cols + i;
      const v = [values[c], values[c + 1], values[c + cols + 1], values[c + cols]];
      const hi = [v[0] >= level, v[1] >= level, v[2] >= level, v[3] >= level];
      const code = (+hi[0] << 3) | (+hi[1] << 2) | (+hi[2] << 1) | +hi[3];
      if (code === 0 || code === 15) continue;
      // Edges: 0 top (TL→TR), 1 right (TR→BR), 2 bottom (BL→BR), 3 left (TL→BL).
      const edgeKey = [2 * c, 2 * (c + 1) + 1, 2 * (c + cols), 2 * c + 1];
      let pairs: [number, number][];
      if (code === 5 || code === 10) {
        const centerHigh = (v[0] + v[1] + v[2] + v[3]) / 4 >= level;
        pairs = (code === 10) === centerHigh ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
      } else {
        const crossed: number[] = [];
        if (hi[0] !== hi[1]) crossed.push(0);
        if (hi[1] !== hi[2]) crossed.push(1);
        if (hi[3] !== hi[2]) crossed.push(2);
        if (hi[0] !== hi[3]) crossed.push(3);
        pairs = [[crossed[0], crossed[1]]];
      }
      for (const [ea, eb] of pairs) {
        let ka = edgeKey[ea];
        let kb = edgeKey[eb];
        const p = point(ka);
        const q = point(kb);
        // Orient so high corners sit on the positive-cross side. A segment
        // between adjacent edges cuts off their shared corner, which decides
        // it (in a saddle the far side mixes high and low corners); one
        // between opposite edges splits the cell 2|2, so the farthest corner
        // decides.
        const shared = (ea - eb + 4) % 2 === 1 ? SHARED[ea][eb] : -1;
        let best = shared;
        let bestCross = 0;
        for (let k = 0; k < 4; k++) {
          if (shared >= 0 && k !== shared) continue;
          const px = x0 + (i + cx[k]) * step;
          const py = y0 + (j + cy[k]) * step;
          const cr = (q.x - p.x) * (py - p.y) - (q.y - p.y) * (px - p.x);
          if (shared >= 0 || Math.abs(cr) > Math.abs(bestCross)) {
            bestCross = cr;
            best = k;
          }
        }
        if (bestCross > 0 !== hi[best]) {
          const t = ka;
          ka = kb;
          kb = t;
        }
        next.set(ka, kb);
      }
    }
  }

  const loops: Point[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Point[] = [];
    let k: number | undefined = start;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      loop.push(point(k));
      k = next.get(k);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Shoelace area; the sign gives the winding direction. */
export function signedArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return a / 2;
}

/** Chaikin corner cutting on a closed loop: each pass replaces every edge by
 *  its ¼ and ¾ points, converging toward a smooth quadratic B-spline. */
export function chaikin(poly: Point[], passes: number): Point[] {
  let cur = poly;
  for (let p = 0; p < passes; p++) {
    const out: Point[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % cur.length];
      out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    cur = out;
  }
  return cur;
}

function segDist2(p: Point, a: Point, b: Point): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = ex * ex + ey * ey;
  let t = len > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = p.x - a.x - t * ex;
  const dy = p.y - a.y - t * ey;
  return dx * dx + dy * dy;
}

function rdp(pts: Point[], lo: number, hi: number, tol2: number, keep: Uint8Array): void {
  // Iterative Ramer–Douglas–Peucker (long contours would blow the call stack).
  const stack: [number, number][] = [[lo, hi]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let far = -1;
    let farD = tol2;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i], pts[a], pts[b]);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
}

/** Douglas–Peucker for a closed loop: split at vertex 0 and its farthest
 *  vertex, simplify both halves. Also drops near-duplicate vertices. */
export function simplifyLoop(poly: Point[], tol: number): Point[] {
  const n = poly.length;
  if (n < 4) return poly;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const d = (poly[i].x - poly[0].x) ** 2 + (poly[i].y - poly[0].y) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const ring = poly.concat([poly[0]]);
  const keep = new Uint8Array(n + 1);
  keep[0] = 1;
  keep[far] = 1;
  rdp(ring, 0, far, tol * tol, keep);
  rdp(ring, far, n, tol * tol, keep);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(poly[i]);
  return out;
}

export function bbox(poly: Point[]): [number, number, number, number] {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of poly) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  return [x1, y1, x2, y2];
}

export function pointInPoly(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** SVG subpath for a closed loop, coordinates rounded to 2 decimals. */
export function loopPath(poly: Point[]): string {
  const r = (v: number) => String(Math.round(v * 100) / 100);
  let d = `M${r(poly[0].x)} ${r(poly[0].y)}`;
  for (let i = 1; i < poly.length; i++) d += `L${r(poly[i].x)} ${r(poly[i].y)}`;
  return d + 'Z';
}
