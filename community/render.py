#!/usr/bin/env python3
"""Regenerates the Figma Community listing images in this folder.

Every map in these images is real plugin output: the SVG comes from
dist/core.iife.js (run `npm run build` first if src/ changed), and this script
only rasterizes it and lays out the slides.

Needs Node, Python 3 and Pillow (`python3 -m pip install pillow`). Text is set
in Inter; point INTER_DIR at a folder holding Inter-*.otf and InterDisplay-*.otf
if it isn't found automatically.

    python3 community/render.py
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
CORE = HERE.parent / "dist" / "core.iife.js"
S = 2  # supersampling factor; every slide is drawn at 2x, then scaled down

# Layout chrome (blue). Map colors always come from the plugin's own themes.
BG = "#f5f7fa"
PANEL = "#ffffff"
INK = "#111827"
MUTED = "#4b5563"
ACCENT = "#2563eb"
CHIP = "#e8eef8"

FONT_DIRS = [
    os.environ.get("INTER_DIR", ""),
    "/usr/share/fonts/opentype/inter",
    str(Path.home() / "Library/Fonts"),
    "/Library/Fonts",
]


def font(name, size):
    for d in FONT_DIRS:
        for ext in (".otf", ".ttf"):
            p = Path(d) / (name + ext)
            if d and p.exists():
                return ImageFont.truetype(str(p), size * S)
    sys.exit(f"Inter font {name} not found; set INTER_DIR")


# --- plugin output ----------------------------------------------------------

NODE = r"""
const fs = require('fs'), vm = require('vm');
vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8') + ';globalThis.TopoCore = TopoCore;');
const jobs = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = jobs.map((p) => {
  const params = TopoCore.clampParams({ ...TopoCore.DEFAULT_PARAMS, ...p });
  return TopoCore.generate(params).svg;
});
process.stdout.write(JSON.stringify(out));
"""


def generate(jobs):
    """Params overrides -> SVG strings, straight from the plugin's core."""
    res = subprocess.run(
        ["node", "-e", NODE, str(CORE)],
        input=json.dumps(jobs).encode(),
        capture_output=True,
        check=True,
    )
    return json.loads(res.stdout)


ATTR = re.compile(r'([a-z-]+)="([^"]*)"')
NUM = re.compile(r"-?\d+(?:\.\d+)?")


def parse(svg):
    """The core emits a rect background plus paths made only of M, L and Z."""
    shapes = []
    for tag in re.findall(r"<(rect|path) ([^>]*)/>", svg):
        a = dict(ATTR.findall(tag[1]))
        if tag[0] == "rect":
            w, h = float(a["width"]), float(a["height"])
            loops = [[(0, 0), (w, 0), (w, h), (0, h)]]
        else:
            loops = []
            for sub in a["d"].split("M")[1:]:
                nums = [float(n) for n in NUM.findall(sub)]
                loops.append(list(zip(nums[0::2], nums[1::2])))
        shapes.append(
            {
                "loops": loops,
                "fill": a.get("fill", "none"),
                "stroke": a.get("stroke"),
                "width": float(a.get("stroke-width", "0")),
            }
        )
    return shapes


def rasterize(svg, w, h, override=None):
    """Draw one map at w x h (already supersampled). `override` maps a shape
    index to a fill color, to show a hand recolor."""
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    for i, s in enumerate(parse(svg)):
        loops = [[(x * S, y * S) for x, y in loop] for loop in s["loops"]]
        fill = (override or {}).get(i, s["fill"])
        if fill != "none":
            xs = [p[0] for l in loops for p in l]
            ys = [p[1] for l in loops for p in l]
            x0, y0 = max(0, int(min(xs))), max(0, int(min(ys)))
            x1, y1 = min(w, int(max(xs)) + 2), min(h, int(max(ys)) + 2)
            if x1 > x0 and y1 > y0:
                mask = Image.new("1", (x1 - x0, y1 - y0))
                for loop in loops:  # even-odd: XOR every subpath
                    m = Image.new("1", mask.size)
                    ImageDraw.Draw(m).polygon([(x - x0, y - y0) for x, y in loop], fill=1)
                    mask = ImageChops.logical_xor(mask, m)
                img.paste(fill, (x0, y0, x1, y1), mask)
        if s["stroke"] and s["width"] > 0:
            for loop in loops:
                draw.line(loop + loop[:1], fill=s["stroke"], width=max(1, round(s["width"] * S)), joint="curve")
    return img


def map_image(params, override=None):
    w, h = params["width"], params["height"]
    return rasterize(generate([params])[0], w * S, h * S, override)


# --- layout helpers ---------------------------------------------------------


def canvas(color=BG, size=(1920, 1080)):
    return Image.new("RGB", (size[0] * S, size[1] * S), color)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *img.size), radius * S, fill=255)
    return mask


def shadow(base, box, radius, blur=28, offset=10, alpha=46):
    x0, y0, x1, y1 = [v * S for v in box]
    layer = Image.new("L", base.size, 0)
    ImageDraw.Draw(layer).rounded_rectangle((x0, y0 + offset * S, x1, y1 + offset * S), radius * S, fill=alpha)
    layer = layer.filter(ImageFilter.GaussianBlur(blur * S))
    base.paste(Image.new("RGB", base.size, "#0f1e3d"), (0, 0), layer)


def tile(base, img, x, y, radius=18):
    w, h = img.size[0] // S, img.size[1] // S
    shadow(base, (x, y, x + w, y + h), radius)
    base.paste(img, (x * S, y * S), rounded(img, radius))


def text(base, xy, s, name, size, color=INK):
    ImageDraw.Draw(base).text((xy[0] * S, xy[1] * S), s, font=font(name, size), fill=color)


def text_width(s, name, size):
    return font(name, size).getlength(s) / S


def caption(base, x, y, bold, rest):
    text(base, (x, y), bold, "Inter-Bold", 30)
    text(base, (x + text_width(bold, "Inter-Bold", 30) + 12, y), rest, "Inter-Medium", 30, MUTED)


def heading(base, title, sub, x=120, y=96):
    text(base, (x, y), title, "InterDisplay-ExtraBold", 72)
    text(base, (x, y + 104), sub, "Inter-Medium", 34, MUTED)


def chip(base, x, y, label):
    w = text_width(label, "Inter-SemiBold", 26) + 48
    ImageDraw.Draw(base).rounded_rectangle((x * S, y * S, (x + w) * S, (y + 52) * S), 26 * S, fill=CHIP)
    text(base, (x + 24, y + 10), label, "Inter-SemiBold", 26, "#1e3a8a")
    return x + w + 14


def save(base, name, size=(1920, 1080)):
    base.resize(size, Image.LANCZOS).save(HERE / name, optimize=True)
    print("wrote", name)


# --- slides -----------------------------------------------------------------

HILLS = {"seed": 4242, "terrain": "hills", "levels": 16, "scale": 260, "warp": 40}


def thumbnail():
    p = {**HILLS, "width": 1920, "height": 1080, "strokeWidth": 1.5}
    colored = map_image({**p, "themeId": "glacier"})
    outline = map_image({**p, "style": "bw"})
    base = colored.copy()
    split = 1000 * S
    base.paste(outline.crop((0, 0, split, 1080 * S)), (0, 0))
    ImageDraw.Draw(base).line((split, 0, split, 1080 * S), fill=INK, width=3 * S)
    box = (96, 240, 900, 840)
    shadow(base, box, 36, blur=40, offset=16, alpha=70)
    ImageDraw.Draw(base).rounded_rectangle([v * S for v in box], 36 * S, fill=PANEL)
    text(base, (164, 306), "FIGMA PLUGIN", "Inter-Bold", 26, ACCENT)
    text(base, (160, 350), "Topo Maker", "InterDisplay-ExtraBold", 118)
    text(base, (164, 520), "Editable vector topographic", "Inter-Medium", 38, MUTED)
    text(base, (164, 568), "maps and contour lines.", "Inter-Medium", 38, MUTED)
    x = 164
    for label in ("Colored", "Lines", "Outline"):
        x = chip(base, x, 690, label)
    save(base, "thumbnail.png")


def styles():
    base = canvas()
    heading(base, "Three styles, same terrain", "Switch between Colored, Lines, and Outline without changing the map.")
    p = {**HILLS, "width": 516, "height": 620, "scale": 200}
    tiles = [
        ({**p, "themeId": "survey"}, "Colored", "elevation bands"),
        ({**p, "style": "lines", "themeId": "glacier", "strokeWidth": 1.5}, "Lines", "classic contour lines"),
        ({**p, "style": "bw"}, "Outline", "black lines on white"),
    ]
    for i, (params, bold, rest) in enumerate(tiles):
        x = 120 + i * 580
        tile(base, map_image(params), x, 280)
        caption(base, x, 924, bold, rest)
    save(base, "carousel-1-styles.png")


def terrains():
    base = canvas()
    heading(base, "Four terrain types", "Same seed, same map. Hit Shuffle when you want a new one.")
    p = {"width": 384, "height": 620, "levels": 14, "themeId": "desert", "seed": 2026}
    tiles = [
        ({**p, "terrain": "hills", "scale": 180}, "Rolling hills"),
        ({**p, "terrain": "ridges", "scale": 260, "levels": 12}, "Ridges"),
        ({**p, "terrain": "peaks", "scale": 220}, "Peaks"),
        ({**p, "terrain": "flow", "scale": 240}, "Flow"),
    ]
    for i, (params, label) in enumerate(tiles):
        x = 120 + i * 432
        tile(base, map_image(params), x, 280)
        text(base, (x, 924), label, "Inter-Bold", 30)
    save(base, "carousel-2-terrains.png")


def themes():
    base = canvas()
    heading(base, "Seven color themes", "Built-in palettes for both Colored and Lines styles.")
    names = ["survey", "glacier", "dusk", "desert", "moss", "graphite", "riso"]
    p = {**HILLS, "width": 214, "height": 620, "scale": 170, "seed": 777}
    for i, theme in enumerate(names):
        x = 120 + i * 240
        tile(base, map_image({**p, "themeId": theme}), x, 280, radius=14)
        text(base, (x, 924), theme.capitalize(), "Inter-Bold", 28)
    save(base, "carousel-3-themes.png")


def controls():
    base = canvas()
    heading(base, "Fine-tune the geometry", "Adjust contour count, spacing, roughness, warp, smoothing, and borders.")
    p = {"width": 384, "height": 620, "terrain": "hills", "seed": 31, "scale": 200, "themeId": "moss"}
    tiles = [
        ({**p, "smoothing": 0, "levels": 10, "scale": 160}, "Smoothing 0", "faceted"),
        ({**p, "warp": 100, "levels": 18}, "Warp", "swirled"),
        ({**p, "colorStrategy": "cycle", "levels": 24, "themeId": "riso"}, "Cycle bands", "posterized"),
        (
            {**p, "style": "lines", "themeId": "survey", "levels": 20, "margin": 36, "borderWidth": 3, "strokeWidth": 1.25},
            "Margin + border",
            "print mat",
        ),
    ]
    for i, (params, bold, rest) in enumerate(tiles):
        x = 120 + i * 432
        tile(base, map_image(params), x, 280)
        caption(base, x, 924, bold, rest)
    save(base, "carousel-4-controls.png")


def editing():
    base = canvas()
    ImageDraw.Draw(base).rectangle((790 * S, 0, 1920 * S, 1080 * S), fill="#e9ecf1")
    text(base, (120, 180), "Every area is", "InterDisplay-ExtraBold", 76)
    text(base, (120, 268), "its own vector", "InterDisplay-ExtraBold", 76)
    bullets = [
        ("Click any area", "to recolor it, or a Level", "group to recolor a whole band."),
        ("Edit topo map", "in the properties panel", "reopens a frame with its settings."),
        ("Update in place", "to change settings", "and keep the colors you set by hand."),
    ]
    y = 430
    for bold, a, b in bullets:
        ImageDraw.Draw(base).rounded_rectangle((120 * S, (y + 14) * S, 138 * S, (y + 32) * S), 5 * S, fill=ACCENT)
        text(base, (162, y), bold, "Inter-Bold", 34)
        text(base, (162 + text_width(bold, "Inter-Bold", 34) + 12, y), a, "Inter-Medium", 34, MUTED)
        text(base, (162, y + 46), b, "Inter-Medium", 34, MUTED)
        y += 148

    # A map with one level recolored by hand, the way a user would in Figma.
    p = {**HILLS, "width": 960, "height": 720, "themeId": "survey", "margin": 28, "borderWidth": 3, "scale": 230}
    svg = generate([p])[0]
    shapes = parse(svg)
    target = "level-08"
    group_idx, idx = None, 0
    override = {}
    for m in re.finditer(r'<g id="(level-\d+)">|<path ', svg):
        if m.group(1):
            group_idx = m.group(1)
        else:
            idx += 1
            if group_idx == target:
                override[idx] = ACCENT
    img = rasterize(svg, p["width"] * S, p["height"] * S, override)
    x, y0 = 850, 180
    tile(base, img, x, y0, radius=10)
    # Figma-style selection box around the recolored level
    loops = [pt for i in override for loop in shapes[i]["loops"] for pt in loop]
    xs = [min(max(pt[0], 28), 960 - 28) for pt in loops]
    ys = [min(max(pt[1], 28), 720 - 28) for pt in loops]
    bx0, by0, bx1, by1 = x + min(xs), y0 + min(ys), x + max(xs), y0 + max(ys)
    d = ImageDraw.Draw(base)
    d.rectangle((bx0 * S, by0 * S, bx1 * S, by1 * S), outline="#0d99ff", width=2 * S)
    for cx, cy in ((bx0, by0), (bx1, by0), (bx0, by1), (bx1, by1)):
        d.rectangle(((cx - 6) * S, (cy - 6) * S, (cx + 6) * S, (cy + 6) * S), fill="#ffffff", outline="#0d99ff", width=2 * S)
    label = "Level 08"
    lw = text_width(label, "Inter-SemiBold", 22) + 24
    d.rounded_rectangle((bx0 * S, (by0 - 44) * S, (bx0 + lw) * S, (by0 - 10) * S), 6 * S, fill="#0d99ff")
    text(base, (bx0 + 12, by0 - 42), label, "Inter-SemiBold", 22, "#ffffff")
    caption(base, 850, 940, "Level 08", "recolored manually, kept on update")
    save(base, "carousel-5-editing.png")


def icon():
    p = {"width": 512, "height": 512, "terrain": "peaks", "seed": 5, "levels": 9, "scale": 280,
         "themeId": "glacier", "strokeWidth": 3, "majorEvery": 0, "roughness": 20, "warp": 25}
    global S
    keep, S = S, 1
    img = map_image(p)
    S = keep
    img.resize((128, 128), Image.LANCZOS).save(HERE / "icon.png", optimize=True)
    print("wrote icon.png")


if __name__ == "__main__":
    if not CORE.exists():
        sys.exit("dist/core.iife.js is missing; run npm run build first")
    only = set(sys.argv[1:])
    for fn in (thumbnail, styles, terrains, themes, controls, editing, icon):
        if not only or fn.__name__ in only:
            fn()
