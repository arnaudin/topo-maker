/// <reference types="@figma/plugin-typings" />
import { layerFillMap, matchLayers, paintChannel, prettyName, TopoParams } from './core';

const PARAMS_KEY = 'topo-params';

figma.showUI(__html__, { width: 360, height: 700, themeColors: true });

function prettify(node: BaseNode): void {
  node.name = prettyName(node.name);
  if ('children' in node) {
    for (const child of node.children) prettify(child);
  }
}

/** Walk up from a node to the generated topo frame that contains it. */
function topoFrameFor(node: BaseNode): SceneNode | null {
  let cur: BaseNode | null = node;
  while (cur && cur.type !== 'PAGE' && cur.type !== 'DOCUMENT') {
    if (cur.getPluginData(PARAMS_KEY)) return cur as SceneNode;
    cur = cur.parent;
  }
  return null;
}

/** Tell the UI which topo frame (if any) the current selection targets. */
function postTarget(): void {
  for (const selected of figma.currentPage.selection) {
    const frame = topoFrameFor(selected);
    if (frame) {
      let params: unknown = null;
      try {
        params = JSON.parse(frame.getPluginData(PARAMS_KEY));
      } catch {
        // corrupt data — still allow targeting, just without hydration
      }
      figma.ui.postMessage({ type: 'target', nodeId: frame.id, name: frame.name, params });
      return;
    }
  }
  figma.ui.postMessage({ type: 'target', nodeId: null });
}

postTarget();
figma.on('selectionchange', postTarget);

/** "#rrggbb" of a single solid paint, else null (mixed/gradient/multiple/none). */
function solidHex(paints: readonly Paint[] | typeof figma.mixed): string | null {
  if (paints === figma.mixed || !Array.isArray(paints) || paints.length !== 1) return null;
  const p = paints[0];
  if (p.type !== 'SOLID') return null;
  const to = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(p.color.r)}${to(p.color.g)}${to(p.color.b)}`;
}

/** Leaf vectors keyed by their layer path relative to the frame:
 *  "Background", "Level 03/Area 01", … */
function leafMap(root: SceneNode): Map<string, SceneNode> {
  const map = new Map<string, SceneNode>();
  const walk = (node: SceneNode, path: string): void => {
    if ('children' in node && node.children.length > 0) {
      for (const child of node.children) walk(child, `${path}/${child.name}`);
    } else {
      map.set(path, node);
    }
  };
  if ('children' in root) {
    for (const child of root.children) walk(child, child.name);
  }
  return map;
}

/** The paint that carries a layer's color: the background's fill always;
 *  areas' fill, or stroke in Lines style. */
function channelOf(key: string, params: TopoParams): 'fill' | 'stroke' {
  return key === 'Background' ? 'fill' : paintChannel(params);
}

function readPaints(node: SceneNode, channel: 'fill' | 'stroke'): readonly Paint[] | typeof figma.mixed | null {
  if (channel === 'fill') return 'fills' in node ? node.fills : null;
  return 'strokes' in node ? node.strokes : null;
}

function writePaints(node: SceneNode, channel: 'fill' | 'stroke', paints: Paint[]): boolean {
  if (channel === 'fill' && 'fills' in node) {
    node.fills = paints;
    return true;
  }
  if (channel === 'stroke' && 'strokes' in node) {
    node.strokes = paints;
    return true;
  }
  return false;
}

/** The background rect sits under every area; lock it so a stray click
 *  doesn't grab it (unlock it in the Layers panel to recolor). */
function lockBackground(frame: FrameNode): void {
  for (const child of frame.children) {
    if (child.name === 'Background') child.locked = true;
  }
}

function updateNotice(kept: number, total: number): string {
  if (total === 0) return 'Topo map updated';
  const noun = `color${total === 1 ? '' : 's'} you changed by hand`;
  if (kept === total) return `Topo map updated. Kept ${kept} ${noun}.`;
  return `Topo map updated. Kept ${kept} of ${total} ${noun}; ${total - kept} had no matching area.`;
}

interface PluginMsg {
  type: string;
  svg?: string;
  seed?: number;
  style?: string;
  nodeId?: string | null;
  params?: TopoParams;
}

function stampAndPlace(frame: FrameNode, msg: PluginMsg, x?: number, y?: number): void {
  const suffix = msg.style === 'bw' ? ' (Outline)' : msg.style === 'lines' ? ' (Lines)' : '';
  frame.name = `Topo ${msg.seed ?? ''}${suffix}`.trim();
  // Contours deliberately run past the frame edge; the frame hides the overflow.
  frame.clipsContent = true;
  prettify(frame);
  lockBackground(frame);
  if (msg.params) {
    frame.setPluginData(PARAMS_KEY, JSON.stringify(msg.params));
    frame.setRelaunchData({ edit: 'Reopen Topo Maker with this map’s settings' });
  }
  frame.x = x ?? Math.round(figma.viewport.center.x - frame.width / 2);
  frame.y = y ?? Math.round(figma.viewport.center.y - frame.height / 2);
}

figma.ui.onmessage = async (msg: PluginMsg) => {
  try {
    await handle(msg);
  } catch (e) {
    figma.notify(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`, {
      error: true,
    });
  }
};

async function handle(msg: PluginMsg): Promise<void> {
  if (msg.type === 'insert' && msg.svg) {
    const frame = figma.createNodeFromSvg(msg.svg);
    stampAndPlace(frame, msg);
    figma.currentPage.appendChild(frame);
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    figma.notify('Topo map added. Every elevation area is its own vector, so you can recolor any of them.');
  } else if (msg.type === 'update' && msg.svg && msg.nodeId) {
    const old = await figma.getNodeByIdAsync(msg.nodeId);
    if (!old || old.removed || !('x' in old)) {
      figma.ui.postMessage({ type: 'target', nodeId: null });
      figma.notify('The original map was deleted. Use Insert to add a new one.', { error: true });
      return;
    }
    // Collect manual color overrides: any layer whose current paint differs
    // from what its stored params generated. When the terrain changes, area
    // numbers point at different shapes, so matchLayers re-targets each
    // override to the area now in its spot.
    const overrides = new Map<string, Paint[]>();
    const placed = new Map<string, Paint[]>();
    try {
      const stored = JSON.parse(old.getPluginData(PARAMS_KEY)) as TopoParams;
      const original = layerFillMap(stored);
      for (const [key, node] of leafMap(old as SceneNode)) {
        const orig = original.get(key);
        if (!orig) continue;
        const paints = readPaints(node, channelOf(key, stored));
        if (paints === null) continue;
        const cur = solidHex(paints);
        if (cur === null || cur.toLowerCase() !== orig.toLowerCase()) {
          overrides.set(key, JSON.parse(JSON.stringify(paints)) as Paint[]);
        }
      }
      if (overrides.size > 0 && msg.params) {
        for (const [from, to] of matchLayers(stored, msg.params, overrides.keys())) {
          placed.set(to, overrides.get(from) as Paint[]);
        }
      }
    } catch {
      // no/corrupt stored params — update without preservation
    }

    const fresh = figma.createNodeFromSvg(msg.svg);
    stampAndPlace(fresh, msg, old.x, old.y);
    let kept = 0;
    if (placed.size > 0 && msg.params) {
      const freshLeaves = leafMap(fresh);
      for (const [key, paints] of placed) {
        const node = freshLeaves.get(key);
        if (node && writePaints(node, channelOf(key, msg.params), paints)) kept++;
      }
    }
    const parent = old.parent ?? figma.currentPage;
    parent.insertChild(parent.children.indexOf(old as SceneNode), fresh);
    old.remove();
    figma.currentPage.selection = [fresh];
    figma.notify(updateNotice(kept, overrides.size));
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
}
