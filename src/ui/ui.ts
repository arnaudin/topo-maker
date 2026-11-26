import { DEFAULT_PARAMS, generate, PALETTES, TopoParams } from '../core';

const state: TopoParams = { ...DEFAULT_PARAMS };

let currentSvg = '';
let targetId: string | null = null;
let targetName = '';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const randSeed = (): number => Math.floor(Math.random() * 1_000_000_000);

// Coalesce slider drags to one render per animation frame — a big, rough,
// many-contour map can take >100ms to trace.
let renderQueued = false;
function scheduleRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    if (renderQueued) render();
  });
}

function render(): void {
  renderQueued = false;
  const t0 = performance.now();
  const res = generate(state);
  currentSvg = res.svg;
  const box = $('preview');
  box.style.aspectRatio = `${state.width} / ${state.height}`;
  box.innerHTML = res.svg.replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%" height="100%"');
  const target = targetId ? ` · updating “${targetName}”` : '';
  $('meta').textContent = `${res.areaCount} areas on ${res.levelCount} levels · seed ${state.seed} · ${(
    performance.now() - t0
  ).toFixed(0)}ms${target}`;
  $('insert').textContent = targetId ? 'Update selected' : 'Insert into Figma';
  $('insertNew').classList.toggle('hide', !targetId);
  $('themeRow').classList.toggle('hide', state.style === 'bw');
  $('strategyRow').classList.toggle('hide', state.style !== 'color');
}

/** Sliders where zero turns the feature off. */
const OFF_AT_ZERO = ['majorEvery', 'borderWidth', 'margin'];

/** Slider readout; zero on an optional feature reads as "Off". */
function showValue(id: string, value: string): void {
  const val = document.getElementById(`${id}Val`);
  if (val) val.textContent = OFF_AT_ZERO.includes(id) && Number(value) === 0 ? 'Off' : value;
}

type SegId = 'style' | 'colorStrategy' | 'spacing';

function setSeg(id: SegId, value: string): void {
  $(id)
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.v === value));
}

/** Stored settings from a selected frame. Start from the defaults so a frame
 *  saved before a setting existed doesn't inherit the panel's current value. */
function hydrate(params: Partial<TopoParams>): void {
  Object.assign(state, DEFAULT_PARAMS, params);
  applyState();
}

const SLIDERS = [
  'levels',
  'scale',
  'roughness',
  'warp',
  'smoothing',
  'majorEvery',
  'strokeWidth',
  'borderWidth',
  'margin',
] as const;

/** Push current state into every control (hydrate from a selected frame). */
function applyState(): void {
  for (const id of [...SLIDERS, 'width', 'height', 'seed'] as const) {
    const el = $<HTMLInputElement>(id);
    el.value = String(state[id]);
    showValue(id, el.value);
  }
  $<HTMLSelectElement>('terrain').value = state.terrain;
  setSeg('style', state.style);
  setSeg('colorStrategy', state.colorStrategy);
  setSeg('spacing', state.spacing);
  $('themes')
    .querySelectorAll<HTMLElement>('.swatch')
    .forEach((s) => s.classList.toggle('on', s.dataset.id === state.themeId));
}

window.onmessage = (e: MessageEvent) => {
  const msg = e.data?.pluginMessage;
  if (!msg) return;
  if (msg.type === 'target') {
    const changed = msg.nodeId !== targetId;
    targetId = msg.nodeId ?? null;
    targetName = msg.name ?? '';
    if (targetId && changed && msg.params) hydrate(msg.params);
    render();
  }
};

// Theme swatches: a slice of each elevation ramp.
const themes = $('themes');
for (const p of PALETTES) {
  const sw = document.createElement('div');
  sw.className = 'swatch' + (p.id === state.themeId ? ' on' : '');
  sw.title = p.name;
  sw.dataset.id = p.id;
  for (const c of [p.colors[1], p.colors[3], p.colors[5], p.colors[6]]) {
    const bar = document.createElement('i');
    bar.style.background = c;
    sw.appendChild(bar);
  }
  sw.addEventListener('click', () => {
    themes.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
    sw.classList.add('on');
    state.themeId = p.id;
    render();
  });
  themes.appendChild(sw);
}

for (const id of SLIDERS) {
  const el = $<HTMLInputElement>(id);
  el.addEventListener('input', () => {
    state[id] = Number(el.value);
    showValue(id, el.value);
    scheduleRender();
  });
}

/** Frame dims commit on change (blur/enter) so clamping doesn't fight typing. */
function bindDimension(id: 'width' | 'height'): void {
  const el = $<HTMLInputElement>(id);
  el.addEventListener('change', () => {
    const v = Math.min(4000, Math.max(100, Math.round(Number(el.value) || state[id])));
    el.value = String(v);
    state[id] = v;
    render();
  });
}
bindDimension('width');
bindDimension('height');

$<HTMLSelectElement>('terrain').addEventListener('change', () => {
  state.terrain = $<HTMLSelectElement>('terrain').value as TopoParams['terrain'];
  render();
});

function bindSeg(id: SegId): void {
  $(id)
    .querySelectorAll('button')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        setSeg(id, btn.dataset.v ?? '');
        (state as unknown as Record<string, unknown>)[id] = btn.dataset.v;
        render();
      });
    });
}
bindSeg('style');
bindSeg('colorStrategy');
bindSeg('spacing');

$<HTMLInputElement>('seed').addEventListener('input', () => {
  state.seed = Number($<HTMLInputElement>('seed').value) || 0;
  scheduleRender();
});

$('shuffle').addEventListener('click', () => {
  state.seed = randSeed();
  $<HTMLInputElement>('seed').value = String(state.seed);
  render();
});

function send(type: 'insert' | 'update'): void {
  // A slider drag's last render may still be waiting on the next frame; send
  // what the controls say now, not the previous frame's SVG.
  if (renderQueued) render();
  parent.postMessage(
    {
      pluginMessage: {
        type,
        nodeId: targetId,
        svg: currentSvg,
        seed: state.seed,
        style: state.style,
        params: { ...state },
      },
    },
    '*',
  );
}

$('insert').addEventListener('click', () => send(targetId ? 'update' : 'insert'));
// With a frame selected the main button updates it; this adds a new one instead.
$('insertNew').addEventListener('click', () => send('insert'));

render();
