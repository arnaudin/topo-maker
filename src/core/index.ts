import { compose, TopoMap, TopoParams } from './composer';
import { areaShapes, layerFills, paintChannel, prettyName, toSVG } from './svg';

export { clampParams, compose, DEFAULT_PARAMS } from './composer';
export type { Area, ColorStrategy, Spacing, StyleId, TopoMap, TopoParams } from './composer';
export { layerAreas, matchLayers, sameGeometry } from './match';
export type { LayerArea } from './match';
export { getPalette, PALETTES } from './palettes';
export type { Palette } from './palettes';
export { TERRAINS } from './terrain';
export type { TerrainId } from './terrain';
export { paintChannel, prettyName };

export interface GenerateResult {
  svg: string;
  /** Number of area paths (closed vectors), across all levels. */
  areaCount: number;
  levelCount: number;
  map: TopoMap;
}

/** Main entry point: params → deterministic SVG contour map. */
export function generate(params: TopoParams): GenerateResult {
  const map = compose(params);
  const shapes = areaShapes(map);
  return {
    svg: toSVG(map, shapes),
    areaCount: shapes.length,
    levelCount: new Set(shapes.map((s) => s.level)).size,
    map,
  };
}

/** "Background" / "Level 03/Area 01" → generated color, for manual-override
 *  detection (fill, or stroke in Lines style — see paintChannel). */
export function layerFillMap(params: TopoParams): Map<string, string> {
  return layerFills(compose(params));
}

