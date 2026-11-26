import { loopPath } from './contours';
import { TopoMap, TopoParams } from './composer';

export interface AreaShape {
  /** Group id, e.g. "level-03". */
  group: string;
  /** Path id within the group, e.g. "area-01". */
  id: string;
  /** 1-based contour level. */
  level: number;
  /** Index into map.areas[level - 1]. */
  index: number;
  d: string;
  /** Fill (Colored/Outline) or line color (Lines). */
  color: string;
  strokeWidth: number;
  major: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Which paint carries each area's color: lines are stroke-only. */
export function paintChannel(params: Pick<TopoParams, 'style'>): 'fill' | 'stroke' {
  return params.style === 'lines' ? 'stroke' : 'fill';
}

export function strokeFor(map: TopoMap, level: number): { color: string; width: number; major: boolean } {
  const { params, palette } = map;
  const major = params.majorEvery > 0 && level % params.majorEvery === 0;
  const mult = major ? 2 : 1;
  if (params.style === 'bw') return { color: '#111111', width: Math.max(0.75, params.strokeWidth) * mult, major };
  if (params.style === 'lines') return { color: map.colors[level], width: Math.max(0.5, params.strokeWidth) * mult, major };
  return { color: palette.ink, width: params.strokeWidth * mult, major };
}

/** Every area as a stable group/id/path record. The SVG serializer and the
 *  Figma layer-name map both derive from this, so names always match. */
export function areaShapes(map: TopoMap): AreaShape[] {
  const shapes: AreaShape[] = [];
  map.areas.forEach((list, li) => {
    const level = li + 1;
    const { width, major } = strokeFor(map, level);
    list.forEach((a, i) => {
      if (a.outer.length < 3) return;
      const d = [a.outer, ...a.holes.filter((h) => h.length >= 3)].map(loopPath).join('');
      shapes.push({
        group: `level-${pad(level)}`,
        id: `area-${pad(i + 1)}`,
        level,
        index: i,
        d,
        color: map.colors[level],
        strokeWidth: width,
        major,
      });
    });
  });
  return shapes;
}

/** "area-01" → "Area 01", "level-03" → "Level 03", "background" → "Background". */
export function prettyName(id: string): string {
  if (!/^[a-z]+(-([a-z]+|\d+))*$/.test(id)) return id;
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Figma layer path for a shape: "Level 03/Area 01". */
export function layerName(s: Pick<AreaShape, 'group' | 'id'>): string {
  return `${prettyName(s.group)}/${prettyName(s.id)}`;
}

/** Map of Figma layer path → generated color, matching the names main.ts
 *  produces. The background's is its fill; areas' is the paint channel's. */
export function layerFills(map: TopoMap): Map<string, string> {
  const out = new Map<string, string>();
  out.set('Background', map.colors[0]);
  for (const s of areaShapes(map)) out.set(layerName(s), s.color);
  return out;
}

/** Serialize a contour map. Each level is a <g>; each connected area in it
 *  is one closed compound path (outer boundary + pits, even-odd), so it
 *  becomes an individually selectable VectorNode in Figma. Paths run past the
 *  frame edge on purpose — the frame clips them. */
export function toSVG(map: TopoMap, shapes: AreaShape[] = areaShapes(map)): string {
  const { params } = map;
  const lines = params.style === 'lines';
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}">`,
    `  <rect id="background" width="${params.width}" height="${params.height}" fill="${map.colors[0]}"/>`,
  ];
  let open = '';
  for (const s of shapes) {
    if (s.group !== open) {
      if (open) out.push('  </g>');
      out.push(`  <g id="${s.group}">`);
      open = s.group;
    }
    const stroke = strokeFor(map, s.level);
    const attrs = [`id="${s.id}"`, `d="${s.d}"`, 'fill-rule="evenodd"'];
    attrs.push(lines ? 'fill="none"' : `fill="${s.color}"`);
    if (stroke.width > 0) {
      attrs.push(`stroke="${stroke.color}"`, `stroke-width="${stroke.width}"`, 'stroke-linejoin="round"');
    }
    out.push(`    <path ${attrs.join(' ')}/>`);
  }
  if (open) out.push('  </g>');
  out.push('</svg>');
  return out.join('\n');
}
