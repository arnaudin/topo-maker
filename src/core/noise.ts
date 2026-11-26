import { RNG } from './rng';

export type Noise2D = (x: number, y: number) => number;

/** Seeded 2D gradient (Perlin) noise, roughly in [-1, 1]. The permutation
 *  table and gradient directions both come from `rng`, so a seed fully
 *  determines the noise field. */
export function perlin(rng: RNG): Noise2D {
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

  // 16 evenly spaced unit gradients, rotated by a seeded offset.
  const off = rng() * Math.PI * 2;
  const gx = new Float64Array(16);
  const gy = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    const a = off + (i / 16) * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (h: number, x: number, y: number) => gx[h & 15] * x + gy[h & 15] * y;

  return (x: number, y: number) => {
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
    // Scale so the typical range is close to [-1, 1].
    return (x1 + v * (x2 - x1)) * 1.41;
  };
}

/** Fractal Brownian motion: `octaves` layers of noise, each at twice the
 *  frequency and `gain` times the amplitude of the last. Normalized so the
 *  result stays roughly in [-1, 1] whatever the octave count. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number, gain: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(fx, fy);
    norm += amp;
    amp *= gain;
    // Lacunarity ~2, with a small rotation so octaves don't align on the lattice.
    const nx = fx * 1.6 - fy * 1.2;
    fy = fx * 1.2 + fy * 1.6;
    fx = nx + 17.3;
  }
  return sum / norm;
}

/** Ridged multifractal: sharp crests where the noise crosses zero. In [0, 1]. */
export function ridged(noise: Noise2D, x: number, y: number, octaves: number, gain: number): number {
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
