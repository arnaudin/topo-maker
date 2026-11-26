# Topo Maker: Figma Community listing

Paste-ready copy for the Publish plugin modal (Figma desktop > Plugins > Manage plugins >
⋯ next to Topo Maker > Publish). Images are in this folder; regenerate them with
`python3 community/render.py` after `npm run build`.

---

## 1. Describe your resource

**Name**

```
Topo Maker
```

**Tagline**

```
Generate editable vector topographic contour maps in Figma
```

Alternates:
- `Topographic contour patterns where every elevation band is a vector`
- `Abstract topo maps, contour lines, and terrain textures as Figma vectors`

**Category:** Design tools

**Description** (plain-text formatting, so it pastes cleanly whether or not the editor
parses Markdown)

```
Topo Maker generates abstract topographic contour maps as editable vectors inside Figma. Every elevation area is its own closed shape, grouped by contour level, so you can click any area (or a whole level) and recolor it after the map is placed.

STYLES
• Colored: stacked elevation bands from 7 themes. Use Elevation ramp for a smooth low-to-high gradient, or Cycle bands for a posterized, striped look.
• Lines: classic contour lines on paper, with the line color shifting with elevation.
• Outline: black lines on white bands, for line art and custom fills.

TERRAIN
• Rolling hills, Ridges, Peaks, or Flow.
• Contours: 2 to 60 lines.
• Spacing: Even height (equal elevation steps) or Even area (every band covers about the same share of the frame).
• Scale, Roughness, Warp, and Smoothing to go from crisp facets to marbled, silky curves.
• Index lines: every Nth contour drawn heavier, like a survey map.
• Border and Margin: a neatline and paper mat for print-style maps.
• Stroke, frame size (100 to 4000 px), and seed.

The same seed and settings always produce the exact same map. Hit Shuffle for a new one.

EDITABLE LATER
Select any frame Topo Maker created and click "Edit topo map" in the properties panel to reopen the plugin with that frame's settings. When you click "Update selected", the frame regenerates in place and keeps any areas you recolored by hand. Restyling keeps them on the exact same layers; reshaping the terrain moves each one to the area at the same spot and relative height.

USES
Backgrounds and textures, posters, packaging, outdoor and travel branding, and stylized maps.

PRIVACY
Runs entirely inside your Figma file with no network access, accounts, or analytics.
```

**Tags** (up to 12)

```
topography, contour lines, topo map, terrain, map, pattern, background, texture, generative, vector, noise, line art
```

**Release notes (v1.0.0)**

```
Initial release. Three styles, four terrains, seven themes, border and margin, and the ability to select any generated frame later to tweak and update it in place.
```

## 2. Choose some images

| Slot | File | Size |
|---|---|---|
| Icon | `icon.png` | 128 × 128 |
| Thumbnail | `thumbnail.png` | 1920 × 1080 |
| Carousel 1 | `carousel-1-styles.png` | 1920 × 1080 |
| Carousel 2 | `carousel-2-terrains.png` | 1920 × 1080 |
| Carousel 3 | `carousel-3-themes.png` | 1920 × 1080 |
| Carousel 4 | `carousel-4-controls.png` | 1920 × 1080 |
| Carousel 5 | `carousel-5-editing.png` | 1920 × 1080 |

Every map is real plugin output drawn by `dist/core.iife.js`; `render.py` only
rasterizes it and adds the titles. In carousel 5, one level is recolored the way you
would by hand in Figma, and the selection box is drawn on top.

Optional, worth adding later:
- **Carousel 6:** a real Figma screenshot of a generated frame selected, with the
  **Edit topo map** button visible in the properties panel. Only a real capture can show
  it.
- **Playground file:** a Figma file with Getting started steps, a frame to try, and
  examples. Insert the "Try it out" frame with the **published** plugin, after the
  manifest id switch (see §5), so its Edit topo map button works for people who open
  the file.

## 3. Data security (optional form)

The form's wording may vary; these are the facts to answer from:

- **Network access:** none. The manifest sets `networkAccess.allowedDomains` to
  `["none"]`, so Figma should label it *No access to network*.
- **Makes network requests:** no.
- **User authentication:** no. No accounts or sign-in, no payments.
- **Stores data:** yes, locally only. The settings used for each frame (contour count,
  seed, theme name, and similar values) are saved on that frame as plugin data
  (`setPluginData`) so it can be edited later. That data stays in the user's file.
- **Collects, stores externally, or transmits user data:** no. No analytics or
  telemetry, no third-party services.
- **Reads:** only the current selection, to check whether it's a frame Topo Maker
  created.
- **Writes:** new frames of vector shapes on the current page, or a regenerated frame in
  place of the selected one.
- **Who built it:** solo developer.

## 4. Add the final details

- **Publish to:** Community
- **Publish as:** yourself (or your team)
- **Support contact:** `https://github.com/arnaudin/topo-maker/issues` once the repo is
  public, or a support email
- **Network access label:** confirm it shows *No access to network*
- **Comments:** allow (recommended for a free plugin; it's where people post requests)

## 5. Publish checklist: read before clicking Publish

1. **Two-factor authentication** must be enabled on your Figma account.
2. **Build is current:** `npm run build` if `src/` changed since the last build.
3. **Test in Figma desktop:** insert a map, select it, click **Edit topo map**, change a
   setting, and **Update selected** after recoloring an area by hand.
4. **⚠️ Manifest id switch.** Our id `601583358154787745` was made locally, and Figma
   has to issue the real one during publishing. Then:
   - Put the Figma-issued id in `manifest.json` > `id`, and **never change it again**.
   - Frames you made during development are tied to the old id. Plugin data is private
     to the plugin id that wrote it, so the published plugin can't read their settings
     and their **Edit topo map** button won't work. Regenerate any frames you want to
     keep editable using the published version.
5. Upload images, paste copy, submit. Figma reviews Community plugins before listing.
   The data-security answers are reviewed separately and can take up to two weeks.
