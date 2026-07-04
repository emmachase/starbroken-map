# NAVCOM QA Report

Run date: 2026-07-04

## Environment

- Browser automation: Playwright using Chrome for Testing 149.0.7827.55.
- Launch flag: `--enable-features=CanvasDrawElement`.
- Local target: `http://127.0.0.1:5178/`.
- HTML-in-canvas support detected:
  - `canvas.requestPaint`: yes.
  - `canvas.getElementTransform`: yes.
  - Canvas child islands: 7.

## Screenshots

Captured under `docs/qa-shots/`:

- `desktop-default-collapsed.png`
- `desktop-search-open.png`
- `desktop-drawers-expanded-raw.png`
- `desktop-collapsed-after-size-fix.png`
- `desktop-expanded-after-size-fix.png`
- `desktop-collapsed-chrome-search-route-tuning.png`
- `desktop-search-popover-separate-island.png`
- `desktop-drawers-tabs-route-after-tuning.png`
- `desktop-collapsed-tight-tabs-final.png`
- `desktop-sensor-reticle-range-default.png`
- `desktop-inspector-flush-right-layer-bottom.png`
- `desktop-clean-panel-glass-material.png`
- `desktop-clean-focus-visible.png`
- `mobile-default-collapsed.png`
- `mobile-expanded.png`

## Automated Checks

- No island rect overlaps in desktop default, desktop search, desktop expanded drawers, mobile default, or mobile expanded.
- Search typing previews Halcyon on the map/top console.
- Search result click commits the Halcyon selection.
- Vector drawer opens from collapsed state and drive tier select updates to T3.
- Signal inspector opens from collapsed state and the Route tab exposes route metrics.
- Layer dock `RI` toggle updates `aria-pressed`.
- Route timeline focus changes map/top-console selection context.
- No page errors during the interaction run.
- Regression check: expanded vector and signal drawers render at their full 332x520 island size after opening from collapsed state.
- Regression check: collapsed side drawer tabs render at 56x112 and no longer dominate the display edge.
- Regression check: bottom route timeline does not render warning stripes over route steps.
- Regression check: scanline and red alert interference are low-alpha enough to preserve map label readability.
- Regression check: top search results render as a separate popover island while the top console remains 64px tall.
- Regression check: collapsed vector/intel tabs render at 38x78 with labels still readable.
- Regression check: bottom route command is 138px tall and timeline steps no longer crowd the metric row.
- Regression check: `reticle-ping` and `ring-soft` map sensor sprites render in world space with no page errors.
- Regression check: signal inspector is flush to the right edge while the layer dock sits in the lower-right utility area.
- Regression check: START/END endpoint labels and their badge backgrounds no longer render.
- Regression check: panel material no longer uses `holo-grid`; focus-visible styling remains strong on keyboard focus.
- Regression check: rectangular global reflection bands have been removed; glass material is carried by smudge, edge tint, and subtle vignette.
- Static/build regression check: vector and signal drawers now use separate compact-tab and expanded-panel `HTMLSource` surfaces; Pixi crossfades the sources and draws animated notched chrome.
- Static/build regression check: `reticle-ping` is restricted to selected location components; selected regions/sectors do not get reticle sprites.
- Static/build regression check: `ring-soft` is fixed screen-space size and follows only selected location components.
- Static/build regression check: route, alert, smudge, scanline, reticle, and camera animation cadences were slowed.
- Static/build regression check: a subtle full-display bloom sprite was added alongside the existing vignette/glass material.

## Performance Probe

Lightweight `requestAnimationFrame` probe during active app state:

- Frames sampled: 263.
- Average frame: 6.89ms.
- Approximate FPS: 145.
- Max sampled frame: 16.7ms.

Additional pan and zoom actions completed without page errors.

## Notes

- Chrome emitted a favicon 404 during one run; this is unrelated to NAVCOM runtime behavior.
- Build still reports the existing large chunk warning. This is not a functional failure, but future code splitting may be useful.
