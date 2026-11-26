"use strict";
var TopoCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/core/index.ts
  var index_exports = {};
  __export(index_exports, {
    DEFAULT_PARAMS: () => DEFAULT_PARAMS,
    FRAME_LAYERS: () => FRAME_LAYERS,
    PALETTES: () => PALETTES,
    TERRAINS: () => TERRAINS,
    clampParams: () => clampParams,
    compose: () => compose,
    generate: () => generate,
    getPalette: () => getPalette,
    layerAreas: () => layerAreas,
    layerFillMap: () => layerFillMap,
    matchLayers: () => matchLayers,
    paintChannel: () => paintChannel,
    prettyName: () => prettyName,
    sameGeometry: () => sameGeometry
  });

  // src/core/contours.ts
  var SHARED = [
    [-1, 1, -1, 0],
    [1, -1, 2, -1],
    [-1, 2, -1, 3],
    [0, -1, 3, -1]
  ];
  function traceLevel(field, level) {
    const { cols, rows, values, x0, y0, step } = field;
    const pts = /* @__PURE__ */ new Map();
    const next = /* @__PURE__ */ new Map();
    const point = (key) => {
      let p = pts.get(key);
      if (p) return p;
      const cell = key >> 1;
      const i = cell % cols;
      const j = (cell - i) / cols;
      const a = values[cell];
      const b = key & 1 ? values[cell + cols] : values[cell + 1];
      let t = (level - a) / (b - a);
      t = t < 1e-6 ? 1e-6 : t > 1 - 1e-6 ? 1 - 1e-6 : t;
      p = key & 1 ? { x: x0 + i * step, y: y0 + (j + t) * step } : { x: x0 + (i + t) * step, y: y0 + j * step };
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
        const code = +hi[0] << 3 | +hi[1] << 2 | +hi[2] << 1 | +hi[3];
        if (code === 0 || code === 15) continue;
        const edgeKey = [2 * c, 2 * (c + 1) + 1, 2 * (c + cols), 2 * c + 1];
        let pairs;
        if (code === 5 || code === 10) {
          const centerHigh = (v[0] + v[1] + v[2] + v[3]) / 4 >= level;
          pairs = code === 10 === centerHigh ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
        } else {
          const crossed = [];
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
    const loops = [];
    const seen = /* @__PURE__ */ new Set();
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let k = start;
      while (k !== void 0 && !seen.has(k)) {
        seen.add(k);
        loop.push(point(k));
        k = next.get(k);
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }
  function signedArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    }
    return a / 2;
  }
  function chaikin(poly, passes) {
    let cur = poly;
    for (let p = 0; p < passes; p++) {
      const out = [];
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
  function segDist2(p, a, b) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = ex * ex + ey * ey;
    let t = len > 0 ? ((p.x - a.x) * ex + (p.y - a.y) * ey) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = p.x - a.x - t * ex;
    const dy = p.y - a.y - t * ey;
    return dx * dx + dy * dy;
  }
  function rdp(pts, lo, hi, tol2, keep) {
    const stack = [[lo, hi]];
    while (stack.length) {
      const [a, b] = stack.pop();
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
  function simplifyLoop(poly, tol) {
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
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(poly[i]);
    return out;
  }
  function bbox(poly) {
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
  function pointInPoly(p, poly) {
    let inside2 = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
        inside2 = !inside2;
      }
    }
    return inside2;
  }
  function loopPath(poly) {
    const r = (v) => String(Math.round(v * 100) / 100);
    let d = `M${r(poly[0].x)} ${r(poly[0].y)}`;
    for (let i = 1; i < poly.length; i++) d += `L${r(poly[i].x)} ${r(poly[i].y)}`;
    return d + "Z";
  }

  // src/core/palettes.ts
  var PALETTES = [
    {
      id: "survey",
      name: "Survey",
      bg: "#a8c69f",
      ink: "#6b5236",
      colors: ["#a8c69f", "#c9dbab", "#ece3b2", "#e4c792", "#cf9f6e", "#a97a58", "#f3eee6"],
      lineBg: "#f4efe1",
      lines: ["#7c9a6e", "#a08a4f", "#b06f3f", "#8a4b2d"]
    },
    {
      id: "glacier",
      name: "Glacier",
      bg: "#0b2545",
      ink: "#081a30",
      colors: ["#0b2545", "#13315c", "#1d4e89", "#3f7cac", "#95b8d1", "#d6e6f2", "#ffffff"],
      lineBg: "#071a2f",
      lines: ["#2f6fa3", "#5fa0cf", "#a6cbe6", "#eaf4fb"]
    },
    {
      id: "dusk",
      name: "Dusk",
      bg: "#2b1b3f",
      ink: "#1a0f27",
      colors: ["#2b1b3f", "#4c2a5e", "#7b3f72", "#b0567a", "#e07a6f", "#f4a971", "#fbd38d"],
      lineBg: "#1c1029",
      lines: ["#6a3a7a", "#b0567a", "#e88a6a", "#fbd38d"]
    },
    {
      id: "desert",
      name: "Desert",
      bg: "#efe0cc",
      ink: "#6b3d31",
      colors: ["#efe0cc", "#e6c7a6", "#dca984", "#cc8865", "#b3684f", "#8c4b3d", "#5e3330"],
      lineBg: "#f7efe4",
      lines: ["#d4a27b", "#c07955", "#9a5340", "#5e3330"]
    },
    {
      id: "moss",
      name: "Moss",
      bg: "#0d1b2a",
      ink: "#08121c",
      colors: ["#0d1b2a", "#1b4332", "#2d6a4f", "#40916c", "#74c69d", "#b7e4c7", "#e9f5db"],
      lineBg: "#0b1620",
      lines: ["#2d6a4f", "#52b788", "#95d5b2", "#e9f5db"]
    },
    {
      id: "graphite",
      name: "Graphite",
      bg: "#161616",
      ink: "#000000",
      colors: ["#161616", "#262626", "#3a3a3a", "#525252", "#6e6e6e", "#8f8f8f", "#bdbdbd"],
      lineBg: "#fafafa",
      lines: ["#9a9a9a", "#6e6e6e", "#3f3f3f", "#111111"]
    },
    {
      id: "riso",
      name: "Riso",
      bg: "#fff4e0",
      ink: "#2b2b52",
      colors: ["#fff4e0", "#ffd6a5", "#ffadad", "#ff7aa2", "#9d8df1", "#5a6ff0", "#2b2b52"],
      lineBg: "#fff4e0",
      lines: ["#ff7aa2", "#f25c54", "#5a6ff0", "#2b2b52"]
    }
  ];
  function getPalette(id) {
    var _a;
    return (_a = PALETTES.find((p) => p.id === id)) != null ? _a : PALETTES[0];
  }

  // src/core/rng.ts
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function range(rng, min, max) {
    return min + rng() * (max - min);
  }

  // src/core/noise.ts
  function perlin(rng) {
    const perm = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = base[i];
      base[i] = base[j];
      base[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    const off = rng() * Math.PI * 2;
    const gx = new Float64Array(16);
    const gy = new Float64Array(16);
    for (let i = 0; i < 16; i++) {
      const a = off + i / 16 * Math.PI * 2;
      gx[i] = Math.cos(a);
      gy[i] = Math.sin(a);
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (h, x, y) => gx[h & 15] * x + gy[h & 15] * y;
    return (x, y) => {
      const xf = Math.floor(x);
      const yf = Math.floor(y);
      const X = xf & 255;
      const Y = yf & 255;
      const dx = x - xf;
      const dy = y - yf;
      const u = fade(dx);
      const v = fade(dy);
      const aa = perm[perm[X] + Y];
      const ab = perm[perm[X] + Y + 1];
      const ba = perm[perm[X + 1] + Y];
      const bb = perm[perm[X + 1] + Y + 1];
      const x1 = dot(aa, dx, dy) + u * (dot(ba, dx - 1, dy) - dot(aa, dx, dy));
      const x2 = dot(ab, dx, dy - 1) + u * (dot(bb, dx - 1, dy - 1) - dot(ab, dx, dy - 1));
      return (x1 + v * (x2 - x1)) * 1.41;
    };
  }
  function fbm(noise, x, y, octaves, gain) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(fx, fy);
      norm += amp;
      amp *= gain;
      const nx = fx * 1.6 - fy * 1.2;
      fy = fx * 1.2 + fy * 1.6;
      fx = nx + 17.3;
    }
    return sum / norm;
  }
  function ridged(noise, x, y, octaves, gain) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let o = 0; o < octaves; o++) {
      const r = 1 - Math.abs(noise(fx, fy));
      sum += amp * r * r;
      norm += amp;
      amp *= gain;
      const nx = fx * 1.6 - fy * 1.2;
      fy = fx * 1.2 + fy * 1.6;
      fx = nx + 31.7;
    }
    return sum / norm;
  }

  // src/core/terrain.ts
  var TERRAINS = [
    { id: "hills", name: "Rolling hills" },
    { id: "ridges", name: "Ridges" },
    { id: "peaks", name: "Peaks" },
    { id: "flow", name: "Flow" }
  ];
  var MARGIN = 56;
  var RING = -1e6;
  function sampleStep(width, height) {
    const w = width + 2 * MARGIN;
    const h = height + 2 * MARGIN;
    return Math.max(Math.max(width, height) / 240, Math.sqrt(w * h / 6e4), 1.5);
  }
  function heightFn(s, rng) {
    const base = perlin(rng);
    const warpX = perlin(rng);
    const warpY = perlin(rng);
    const peaks = Array.from({ length: 6 }, () => ({
      x: range(rng, 0.1, 0.9) * s.width,
      y: range(rng, 0.1, 0.9) * s.height,
      sigma: s.scale * range(rng, 0.45, 1.1),
      amp: range(rng, 0.55, 1)
    }));
    const peakCount = 3 + Math.floor(rng() * 4);
    const angle = rng() * Math.PI * 2;
    const ox = rng() * 512;
    const oy = rng() * 512;
    const rough = s.roughness / 100;
    const octaves = 1 + Math.round(rough * 5);
    const gain = 0.32 + 0.28 * rough;
    const warp = s.warp / 100 * 1.6;
    const k = 1 / s.scale;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const activePeaks = peaks.slice(0, peakCount);
    return (x, y) => {
      let u = x * k + ox;
      let v = y * k + oy;
      if (warp > 0) {
        const wu = fbm(warpX, u * 0.55, v * 0.55, 3, 0.5);
        const wv = fbm(warpY, u * 0.55 + 9.1, v * 0.55 + 4.7, 3, 0.5);
        u += warp * wu;
        v += warp * wv;
      }
      switch (s.terrain) {
        case "ridges":
          return ridged(base, u, v, octaves, gain);
        case "peaks": {
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
        case "flow": {
          const along = ((u - ox) * ca + (v - oy) * sa) * 0.45;
          return along + 0.6 * fbm(base, u * 0.8, v * 0.8, octaves, gain);
        }
        default:
          return fbm(base, u, v, octaves, gain);
      }
    };
  }
  function sampleField(s, rng) {
    const h = heightFn(s, rng);
    const step = sampleStep(s.width, s.height);
    const inner = (size) => Math.ceil((size + 2 * MARGIN) / step) + 1;
    const cols = inner(s.width) + 2;
    const rows = inner(s.height) + 2;
    const x0 = -MARGIN - step;
    const y0 = -MARGIN - step;
    const values = new Float64Array(cols * rows).fill(RING);
    let min = Infinity;
    let max = -Infinity;
    const frame = [];
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

  // src/core/composer.ts
  var DEFAULT_PARAMS = {
    width: 800,
    height: 600,
    terrain: "hills",
    levels: 14,
    spacing: "height",
    scale: 220,
    roughness: 45,
    warp: 35,
    smoothing: 2,
    majorEvery: 5,
    strokeWidth: 1,
    borderWidth: 0,
    margin: 0,
    style: "color",
    themeId: "survey",
    colorStrategy: "ramp",
    seed: 12345
  };
  function clampParams(p) {
    const num = (v, d) => typeof v === "number" && isFinite(v) ? v : d;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const D = DEFAULT_PARAMS;
    const width = clamp(Math.round(num(p.width, D.width)), 100, 4e3);
    const height = clamp(Math.round(num(p.height, D.height)), 100, 4e3);
    const maxEdge = Math.min(width, height) / 4;
    return {
      width,
      height,
      terrain: TERRAINS.some((t) => t.id === p.terrain) ? p.terrain : D.terrain,
      levels: clamp(Math.round(num(p.levels, D.levels)), 2, 60),
      spacing: p.spacing === "area" ? "area" : "height",
      scale: clamp(num(p.scale, D.scale), 40, 1200),
      roughness: clamp(num(p.roughness, D.roughness), 0, 100),
      warp: clamp(num(p.warp, D.warp), 0, 100),
      smoothing: clamp(Math.round(num(p.smoothing, D.smoothing)), 0, 3),
      majorEvery: clamp(Math.round(num(p.majorEvery, D.majorEvery)), 0, 20),
      strokeWidth: clamp(num(p.strokeWidth, D.strokeWidth), 0, 8),
      borderWidth: clamp(num(p.borderWidth, D.borderWidth), 0, Math.min(40, maxEdge)),
      margin: clamp(num(p.margin, D.margin), 0, Math.min(200, maxEdge)),
      style: p.style === "lines" || p.style === "bw" ? p.style : "color",
      themeId: PALETTES.some((x) => x.id === p.themeId) ? p.themeId : D.themeId,
      colorStrategy: p.colorStrategy === "cycle" ? "cycle" : "ramp",
      seed: Math.round(num(p.seed, D.seed))
    };
  }
  function thresholdsFor(levels, spacing, sorted) {
    const out = [];
    for (let k = 1; k <= levels; k++) {
      const q = k / (levels + 1);
      if (spacing === "area" && sorted.length > 0) {
        out.push(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
      } else {
        out.push(q);
      }
    }
    return out;
  }
  function buildAreas(loops, width, height, minSize, smoothing) {
    const kept = [];
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
    const holesOf = outers.map(() => []);
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
    const order = outers.map((_, i) => i);
    const cy = (i) => Math.round((outers[i].box[1] + outers[i].box[3]) / 2 / 40);
    const cx = (i) => (outers[i].box[0] + outers[i].box[2]) / 2;
    order.sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
    const tidy = (pts) => simplifyLoop(chaikin(pts, smoothing), 0.3);
    return order.map((i) => ({
      outer: tidy(outers[i].pts),
      holes: holesOf[i].map((h) => tidy(h.pts)),
      size: Math.abs(outers[i].a) - holesOf[i].reduce((s, h) => s + Math.abs(h.a), 0)
    }));
  }
  function hexLerp(a, b, t) {
    const na = parseInt(a.slice(1), 16);
    const nb = parseInt(b.slice(1), 16);
    const mix = (sa, sb) => Math.round(sa + (sb - sa) * t);
    const to = (v) => v.toString(16).padStart(2, "0");
    return "#" + to(mix(na >> 16 & 255, nb >> 16 & 255)) + to(mix(na >> 8 & 255, nb >> 8 & 255)) + to(mix(na & 255, nb & 255));
  }
  function sampleStops(stops, t) {
    const c = Math.min(1, Math.max(0, t));
    const seg = c * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(seg));
    return hexLerp(stops[i], stops[i + 1], seg - i);
  }
  function bandColors(p, palette, phase) {
    const n = p.levels;
    const out = [];
    for (let k = 0; k <= n; k++) {
      if (p.style === "bw") out.push("#ffffff");
      else if (p.style === "lines") out.push(k === 0 ? palette.lineBg : sampleStops(palette.lines, (k - 1) / Math.max(1, n - 1)));
      else if (p.colorStrategy === "cycle") out.push(palette.colors[(k + phase) % palette.colors.length]);
      else out.push(sampleStops(palette.colors, k / n));
    }
    return out;
  }
  function compose(raw) {
    const params = clampParams(raw);
    const rngGeo = mulberry32(params.seed);
    const rngColor = mulberry32((params.seed ^ 2654435769) >>> 0);
    const field = sampleField(params, rngGeo);
    const thresholds = thresholdsFor(params.levels, params.spacing, field.inFrame);
    const minSize = field.step * field.step * 2.5;
    const areas = thresholds.map(
      (t) => buildAreas(traceLevel(field, t), params.width, params.height, minSize, params.smoothing)
    );
    const palette = getPalette(params.themeId);
    const phase = Math.floor(rngColor() * palette.colors.length);
    return { params, palette, thresholds, areas, colors: bandColors(params, palette, phase) };
  }

  // src/core/svg.ts
  var pad = (n) => String(n).padStart(2, "0");
  function paintChannel(params) {
    return params.style === "lines" ? "stroke" : "fill";
  }
  function strokeFor(map, level) {
    const { params, palette } = map;
    const major = params.majorEvery > 0 && level % params.majorEvery === 0;
    const mult = major ? 2 : 1;
    if (params.style === "bw") return { color: "#111111", width: Math.max(0.75, params.strokeWidth) * mult, major };
    if (params.style === "lines") return { color: map.colors[level], width: Math.max(0.5, params.strokeWidth) * mult, major };
    return { color: palette.ink, width: params.strokeWidth * mult, major };
  }
  function areaShapes(map) {
    const shapes = [];
    map.areas.forEach((list, li) => {
      const level = li + 1;
      const { width, major } = strokeFor(map, level);
      list.forEach((a, i) => {
        if (a.outer.length < 3) return;
        const d = [a.outer, ...a.holes.filter((h) => h.length >= 3)].map(loopPath).join("");
        shapes.push({
          group: `level-${pad(level)}`,
          id: `area-${pad(i + 1)}`,
          level,
          index: i,
          d,
          color: map.colors[level],
          strokeWidth: width,
          major
        });
      });
    });
    return shapes;
  }
  function ringPath(w, h, outer, inner) {
    const r = (v) => String(Math.round(v * 100) / 100);
    const rect = (i) => `M${r(i)} ${r(i)}L${r(w - i)} ${r(i)}L${r(w - i)} ${r(h - i)}L${r(i)} ${r(h - i)}Z`;
    return rect(outer) + rect(inner);
  }
  function frameShapes(map) {
    const { params, palette } = map;
    const { width: w, height: h, margin, borderWidth: bw } = params;
    const out = [];
    if (margin > 0) {
      const color = params.style === "bw" ? "#ffffff" : palette.lineBg;
      out.push({ id: "mat", d: ringPath(w, h, 0, margin), color });
    }
    if (bw > 0) {
      const inner = Math.max(margin, bw);
      const color = params.style === "bw" ? "#111111" : params.style === "lines" ? palette.lines[palette.lines.length - 1] : palette.ink;
      out.push({ id: "border", d: ringPath(w, h, inner - bw, inner), color });
    }
    return out;
  }
  function prettyName(id) {
    if (!/^[a-z]+(-([a-z]+|\d+))*$/.test(id)) return id;
    return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  function layerName(s) {
    return `${prettyName(s.group)}/${prettyName(s.id)}`;
  }
  var FRAME_LAYERS = ["Background", "Mat", "Border"];
  function layerFills(map) {
    const out = /* @__PURE__ */ new Map();
    out.set("Background", map.colors[0]);
    for (const s of areaShapes(map)) out.set(layerName(s), s.color);
    for (const f of frameShapes(map)) out.set(prettyName(f.id), f.color);
    return out;
  }
  function toSVG(map, shapes = areaShapes(map)) {
    const { params } = map;
    const lines = params.style === "lines";
    const out = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}">`,
      `  <rect id="background" width="${params.width}" height="${params.height}" fill="${map.colors[0]}"/>`
    ];
    let open = "";
    for (const s of shapes) {
      if (s.group !== open) {
        if (open) out.push("  </g>");
        out.push(`  <g id="${s.group}">`);
        open = s.group;
      }
      const stroke = strokeFor(map, s.level);
      const attrs = [`id="${s.id}"`, `d="${s.d}"`, 'fill-rule="evenodd"'];
      attrs.push(lines ? 'fill="none"' : `fill="${s.color}"`);
      if (stroke.width > 0) {
        attrs.push(`stroke="${stroke.color}"`, `stroke-width="${stroke.width}"`, 'stroke-linejoin="round"');
      }
      out.push(`    <path ${attrs.join(" ")}/>`);
    }
    if (open) out.push("  </g>");
    for (const f of frameShapes(map)) {
      out.push(`  <path id="${f.id}" d="${f.d}" fill-rule="evenodd" fill="${f.color}"/>`);
    }
    out.push("</svg>");
    return out.join("\n");
  }

  // src/core/match.ts
  var GEOMETRY_KEYS = [
    "width",
    "height",
    "terrain",
    "levels",
    "spacing",
    "scale",
    "roughness",
    "warp",
    "smoothing",
    "seed"
  ];
  function sameGeometry(a, b) {
    const ca = clampParams(a);
    const cb = clampParams(b);
    return GEOMETRY_KEYS.every((k) => ca[k] === cb[k]);
  }
  function inside(p, a) {
    return pointInPoly(p, a.outer) && !a.holes.some((h) => pointInPoly(p, h));
  }
  function anchorOf(a) {
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
    const xs = [];
    const poly = a.outer;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[i];
      const q = poly[j];
      if (p.y > c.y !== q.y > c.y) xs.push(p.x + (c.y - p.y) * (q.x - p.x) / (q.y - p.y));
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
  function areasOf(map) {
    const out = /* @__PURE__ */ new Map();
    for (const s of areaShapes(map)) {
      const area = map.areas[s.level - 1][s.index];
      out.set(layerName(s), { level: s.level, area, anchor: anchorOf(area) });
    }
    return out;
  }
  function layerAreas(params) {
    return areasOf(compose(params));
  }
  function matchLayers(from, to, names) {
    var _a, _b;
    const wanted = [...names];
    const out = /* @__PURE__ */ new Map();
    const toMap = compose(to);
    const toAreas = areasOf(toMap);
    const fixed = /* @__PURE__ */ new Set(["Background", ...frameShapes(toMap).map((f) => prettyName(f.id))]);
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
    const byLevel = /* @__PURE__ */ new Map();
    for (const entry of toAreas) {
      const list = (_a = byLevel.get(entry[1].level)) != null ? _a : [];
      list.push(entry);
      byLevel.set(entry[1].level, list);
    }
    const pairs = [];
    for (const n of wanted) {
      if (fixed.has(n)) {
        out.set(n, n);
        continue;
      }
      const src = fromAreas.get(n);
      if (!src) continue;
      const level = Math.min(b.levels, Math.max(1, Math.round(src.level * (b.levels + 1) / (a.levels + 1))));
      const p = { x: src.anchor.x * sx, y: src.anchor.y * sy };
      for (const [name, dst] of (_b = byLevel.get(level)) != null ? _b : []) {
        const d = inside(p, dst.area) ? 0 : Math.hypot(dst.anchor.x - p.x, dst.anchor.y - p.y);
        if (d <= reach) pairs.push({ from: n, to: name, d });
      }
    }
    pairs.sort((m, q) => m.d - q.d);
    const claimed = /* @__PURE__ */ new Set();
    for (const pr of pairs) {
      if (out.has(pr.from) || claimed.has(pr.to)) continue;
      out.set(pr.from, pr.to);
      claimed.add(pr.to);
    }
    return out;
  }

  // src/core/index.ts
  function generate(params) {
    const map = compose(params);
    const shapes = areaShapes(map);
    return {
      svg: toSVG(map, shapes),
      areaCount: shapes.length,
      levelCount: new Set(shapes.map((s) => s.level)).size,
      map
    };
  }
  function layerFillMap(params) {
    return layerFills(compose(params));
  }
  return __toCommonJS(index_exports);
})();
