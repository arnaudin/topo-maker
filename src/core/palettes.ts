export interface Palette {
  id: string;
  name: string;
  /** Background in Colored style shows only where the lowest band is clipped;
   *  it is the "sea level" color. */
  bg: string;
  /** Contour stroke in Colored style. */
  ink: string;
  /** Elevation ramp, low → high (Colored fills). */
  colors: string[];
  /** Lines style: paper color and the line ramp, low → high, chosen to
   *  contrast with that paper. */
  lineBg: string;
  lines: string[];
}

export const PALETTES: Palette[] = [
  {
    id: 'survey',
    name: 'Survey',
    bg: '#a8c69f',
    ink: '#6b5236',
    colors: ['#a8c69f', '#c9dbab', '#ece3b2', '#e4c792', '#cf9f6e', '#a97a58', '#f3eee6'],
    lineBg: '#f4efe1',
    lines: ['#7c9a6e', '#a08a4f', '#b06f3f', '#8a4b2d'],
  },
  {
    id: 'glacier',
    name: 'Glacier',
    bg: '#0b2545',
    ink: '#081a30',
    colors: ['#0b2545', '#13315c', '#1d4e89', '#3f7cac', '#95b8d1', '#d6e6f2', '#ffffff'],
    lineBg: '#071a2f',
    lines: ['#2f6fa3', '#5fa0cf', '#a6cbe6', '#eaf4fb'],
  },
  {
    id: 'dusk',
    name: 'Dusk',
    bg: '#2b1b3f',
    ink: '#1a0f27',
    colors: ['#2b1b3f', '#4c2a5e', '#7b3f72', '#b0567a', '#e07a6f', '#f4a971', '#fbd38d'],
    lineBg: '#1c1029',
    lines: ['#6a3a7a', '#b0567a', '#e88a6a', '#fbd38d'],
  },
  {
    id: 'desert',
    name: 'Desert',
    bg: '#efe0cc',
    ink: '#6b3d31',
    colors: ['#efe0cc', '#e6c7a6', '#dca984', '#cc8865', '#b3684f', '#8c4b3d', '#5e3330'],
    lineBg: '#f7efe4',
    lines: ['#d4a27b', '#c07955', '#9a5340', '#5e3330'],
  },
  {
    id: 'moss',
    name: 'Moss',
    bg: '#0d1b2a',
    ink: '#08121c',
    colors: ['#0d1b2a', '#1b4332', '#2d6a4f', '#40916c', '#74c69d', '#b7e4c7', '#e9f5db'],
    lineBg: '#0b1620',
    lines: ['#2d6a4f', '#52b788', '#95d5b2', '#e9f5db'],
  },
  {
    id: 'graphite',
    name: 'Graphite',
    bg: '#161616',
    ink: '#000000',
    colors: ['#161616', '#262626', '#3a3a3a', '#525252', '#6e6e6e', '#8f8f8f', '#bdbdbd'],
    lineBg: '#fafafa',
    lines: ['#9a9a9a', '#6e6e6e', '#3f3f3f', '#111111'],
  },
  {
    id: 'riso',
    name: 'Riso',
    bg: '#fff4e0',
    ink: '#2b2b52',
    colors: ['#fff4e0', '#ffd6a5', '#ffadad', '#ff7aa2', '#9d8df1', '#5a6ff0', '#2b2b52'],
    lineBg: '#fff4e0',
    lines: ['#ff7aa2', '#f25c54', '#5a6ff0', '#2b2b52'],
  },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
