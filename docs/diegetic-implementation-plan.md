# Diegetic Implementation Plan

## Purpose

Track the move from the current DOM shell plus Pixi map into a single NAVCOM instrument where the map, controls, and display material are composited together.

This plan is intentionally implementation-facing. Strategy lives in:

- `diegetic-render-strategy.md`
- `diegetic-ux-strategy.md`
- `effects-and-assets-plan.md`
- `visual-qa-navcom-assets.md`

## Current Baseline

- React owns the full page shell in `src/App.tsx`.
- Pixi owns only the central map in `src/render/GalaxyViewport.ts`.
- The main visible UI is still topbar, route strip, left panel, viewport, right panel.
- The generated NAVCOM asset kit exists in `src/assets/navcom/` and has passed first visual QA.
- `HTMLSource` is the chosen control path. All visible controls should become canvas-child HTML islands rendered into Pixi textures.

## Implementation Principles

- Preserve existing routing, search, layer, and selection behavior while changing presentation.
- Move layout in stages: first make control islands, then compose them in Pixi, then collapse and reorganize UX.
- Keep HTML islands coarse: one source per major control region, not one source per button.
- Animate map, alert, glass, route, and sensor effects in Pixi.
- Request HTML repaints only when React state or controlled input text changes.
- Apply stripe falloff masks wherever alert hatches fade into open display space.

## Phase 0: Harness And Guardrails

Status: ready to start.

Tasks:

- Add a small runtime capability check for HTML-in-canvas support.
- Add a visible development failure state if `canvas.requestPaint` is unavailable.
- Decide whether the dev path requires a browser flag or a specific Chrome launch command.
- Add a local QA checklist for desktop and mobile viewport screenshots.
- Keep `npm run build` and `npm test` green before and after each phase.

Acceptance:

- Unsupported browser state fails clearly.
- Current app still boots with no behavior regression.
- QA commands are documented in this file or a linked QA doc.

## Phase 1: Pixi Shell Refactor

Status: in progress. The first layer skeleton and asset preload pass is implemented in `src/render/GalaxyViewport.ts`.

Goal: make `GalaxyViewport` the top-level visual compositor for NAVCOM.

Tasks:

- Expand `GalaxyViewport` scene graph to match the render strategy:
  - `starfieldLayer`
  - `deepSpaceNoiseLayer`
  - `mapWorldLayer`
  - `mapRouteLayer`
  - `mapSensorFxLayer`
  - `htmlControlLayer`
  - `controlFxLayer`
  - `glassOverlayLayer`
  - `alertInterferenceLayer`
  - `cursorReticleLayer`
- Move existing map containers into the new map layers without changing behavior.
- Load the NAVCOM asset manifest and textures through Pixi asset loading.
- Add resize-aware layer sizing and fixed screen-space `filterArea` values for full-display effects.
- Keep the old DOM controls outside the compositor during this phase.

Acceptance:

- The map looks and behaves like the current version.
- Layer order is explicit in code and matches the strategy doc.
- Assets are loaded once and cleaned up on viewport destroy.
- No new interaction regressions for pan, zoom, click, shift-click, or alt-click.

## Phase 2: HTML Island Host

Status: React island plumbing is active. `top-console`, `bottom-route-command`, `layer-dock`, `left-vector-drawer`, `right-signal-inspector`, and `toast-console` canvas children are created and rendered through `HTMLSource`; React portals live content into each host. Hit testing, input clicks, and text drag-selection are stable. The temporary debug readout has been removed, and `GalaxyViewport` now has reusable per-island host plumbing for rects, source/sprite cleanup, transform correction, and control-event guarding. The old standalone route strip, left sidebar, right sidebar, DOM toast overlay, and interactive topbar controls have been removed from the page shell so route metrics/profile action, reset, layer toggles, vector setup, signal inspection, search text, and status feedback now live on the canvas. The remaining header is a passive identity rail.

Goal: create the bridge that lets React render controls as direct canvas children and Pixi consume them through `HTMLSource`.

Tasks:

- Import and register `pixi.js/html-source`.
- Introduce a `NavcomControlIsland` model with:
  - id
  - DOM element
  - `HTMLSource`
  - Pixi texture/sprite
  - repaint trigger
  - desired screen rect
- Add direct canvas child elements for:
  - `top-console`
  - `bottom-route-command`
  - `left-vector-drawer`
  - `right-signal-inspector`
  - `layer-dock`
  - `toast-console`
- Ensure the canvas has `layoutsubtree`.
- Keep island elements interactive in the browser while their pixels are displayed in Pixi.
- Add deterministic cleanup for DOM nodes, sources, textures, and sprites.

Acceptance:

- A minimal test island renders as a Pixi sprite.
- The source reports ready after first paint.
- Input focus, typing, button clicks, and pointer hit testing work on the live island.
- Destroying and remounting the viewport leaves no duplicate canvas children.

## Phase 3: React Control Decomposition

Goal: split `App.tsx` into reusable island components without changing state ownership.

Tasks:

- Extract route state helpers and labels from `App.tsx` into local modules where useful.
- Create island components:
  - `TopConsole`
  - `BottomRouteCommand`
  - `VectorDrawer`
  - `SignalInspector`
  - `LayerDock`
  - `ToastConsole`
  - `RouteTimeline`
- Keep `App` as the state owner for the first pass.
- Render each island into its assigned canvas child with React portals.
- Move CSS from page-shell selectors toward island-specific classes.
- Preserve cmdk search behavior inside the top island.

Acceptance:

- Existing controls still update route state.
- Search preview and selection still update the map.
- Route profile, endpoint, layer, hull, GateNet, NULL bypass, and range controls still work.
- Toasts still appear on meaningful route actions.

## Phase 4: Diegetic Layout Pass

Goal: implement the UX strategy while keeping every existing capability reachable.

Tasks:

- Make the Pixi canvas the full application surface.
- Place top console as a compact rail with system state, search, and selected object summary.
- Place bottom route command as the primary decision surface.
- Move layer controls into a compact icon-first map dock.
- Collapse vector setup into the left drawer by default.
- Collapse signal inspector into a contextual right drawer by default.
- Convert the persistent route list into an expandable bottom timeline.
- Hide raw metadata by default behind inspector sections or tabs:
  - `Intel`
  - `Route`
  - `Resources`
  - `Links`
  - `Raw`
- Ensure drawers avoid covering the selected map target when possible.

Acceptance:

- The map is the dominant first-read element on desktop and mobile.
- The always-visible set from the UX strategy remains visible.
- Hidden-by-default details are still reachable.
- The bottom command surface communicates route, risk, fuel, steps, profile, and primary action at a glance.

## Phase 5: Control Surface Effects

Goal: make HTML controls feel physically integrated into the display.

Tasks:

- Add cyan edge bloom from `panel-edge-gradient.svg`.
- Add corner brackets from `bracket-corner.svg` to active panels and selected controls.
- Add low-alpha scanlines from `scanline-mask.svg`.
- Add panel grid interiors from `holo-grid.svg` where they do not hurt readability.
- Add alert rail hatches with the split stripe assets:
  - `warning-stripe.svg` for general warnings.
  - `critical-stripe.svg` for NULL exposure, failed routes, hard alarms.
  - `caution-stripe.svg` for Frontier exposure or degraded scan states.
- Apply `stripe-falloff-horizontal.svg` and `stripe-falloff-vertical.svg` to ordinary stripe placements.
- Keep live text legible by limiting filters on active input controls.

Acceptance:

- Controls read as part of the same glass/display system as the map.
- Stripe placements fade naturally and do not end as hard rectangles.
- Critical red is rare and intentional.
- Search input and select controls remain readable while focused.

## Phase 6: Global Display Effects

Goal: add the full-display material pass without muddying gameplay information.

Tasks:

- Add blue noise at low opacity.
- Add glass smudge under 6% opacity for normal state.
- Add subtle vignette and reflection bands.
- Add optional chromatic edge hints around the display boundary.
- Add red noise and alert interference only during warning states.
- Add brief sync-loss or jitter states for failed route and NULL exposure.

Acceptance:

- Normal state feels richer but not darker or harder to read.
- Warning state is immediately visible before reading text.
- Effects do not obscure map labels, route lines, or primary controls.

## Phase 7: Route And Sensor Feel

Goal: improve game feel around route solving, selection, hover, and map feedback.

Tasks:

- Replace route packet circles with `spark-dot.svg` sprites or a small pooled particle system.
- Add route commit flash and recalculation ghosting.
- Add gate pulse effects at gate jumps.
- Add hover reticles from `reticle-ping.svg`.
- Add soft range rings from `ring-soft.svg`.
- Add selection brackets for selected regions, sectors, and locations.
- Add local hostile-zone shimmer for NULL/Frontier zones when threat/rifts are active.

Acceptance:

- Route movement feels intentional and directional.
- Hover and selection affordances are clear at every LOD.
- Effects remain stable under pan/zoom and do not explode draw calls.

## Phase 8: Responsive And Accessibility Pass

Goal: make the new instrument usable beyond the target desktop composition.

Tasks:

- Define desktop, tablet, and narrow layouts for each island rect.
- Ensure text never overflows buttons, chips, rails, or drawer headers.
- Keep keyboard navigation and focus states visible inside HTML islands.
- Verify cmdk search remains keyboard-usable.
- Confirm collapsed drawer controls are discoverable by icon, tooltip, and focus label.
- Add ARIA labels where visual labels become icon-first.

Acceptance:

- Desktop and mobile screenshots have no overlapping UI.
- Keyboard-only route selection and search remain possible.
- Screen reader semantics are preserved by the underlying HTML controls.

## Phase 9: Visual QA And Performance

Goal: prove the instrument is stable, readable, and performant.

Tasks:

- Run `npm run build`.
- Run `npm test`.
- Capture screenshots for:
  - desktop default route
  - desktop NULL-risk route
  - desktop search open
  - desktop inspector expanded
  - mobile default
  - mobile drawer open
- Inspect screenshots for:
  - blank HTMLSource textures
  - harsh stripe edges
  - muddy glass overlays
  - text overlap or clipping
  - controls covering selected map target
  - overly repetitive noise or smudge tiling
- Profile frame behavior while panning, zooming, searching, and toggling rifts.
- Tune HTMLSource repaint frequency if typing, scrolling, or drawer animation feels heavy.

Acceptance:

- Build and tests pass.
- Screenshots pass visual QA.
- Interaction remains responsive during route animation and map movement.
- No obvious duplicate DOM islands or leaked Pixi resources after remount.

## Suggested Work Order

1. Phase 1: create the Pixi layer skeleton and asset loading.
2. Phase 2: prove one HTMLSource island end to end.
3. Phase 3: portal all current controls into islands with old layout preserved.
4. Phase 4: recompose the UX into rails, drawers, dock, and timeline.
5. Phase 5: add control surface effects.
6. Phase 6: add global display material and warning interference.
7. Phase 7: improve route and sensor feedback.
8. Phase 8: responsive and accessibility pass.
9. Phase 9: full QA, performance, and final tuning.

## First Implementation Slice

The first code slice should be intentionally narrow:

- [x] Add NAVCOM asset loading to `GalaxyViewport`.
- [x] Rename or reorganize the current Pixi layers into the planned layer stack.
- [x] Add a single `top-console` canvas child.
- [x] Wrap that island with `HTMLSource` and display it inside `htmlControlLayer`.
- [x] Verify repaint, focus, click, drag-selection, cleanup, build, and tests.
- [x] Refactor the proof into reusable per-island host plumbing.
- [x] Replace the temporary DOM proof island with a React-rendered island.
- [x] Add `bottom-route-command` and `layer-dock` React islands.
- [x] Remove the old standalone route strip after its metrics and layer controls moved into canvas islands.
- [x] Add `left-vector-drawer` and move Jump Plotter controls into the canvas.
- [x] Add `right-signal-inspector` and move Details Panel content into the canvas.
- [x] Add `toast-console` and move status feedback into the canvas.
- [x] Move reset into `bottom-route-command` and reduce the topbar to passive identity.
- [x] Re-run `npm run build` and `npm test -- --run` after each route/layer/vector/inspector/toast/topbar cleanup move.
- [ ] Verify one screenshot during manual QA.

This proves the risky technology path before moving every control.

## Open Questions To Resolve During Implementation

- Whether live HTML islands should remain visually aligned one-to-one with DOM hit boxes, or whether some inactive drawers can use perspective/snapshot treatment.
- Whether drawer open/close animation should be DOM layout-driven, Pixi transform-driven, or split by state.
- Whether the route timeline should live inside `bottom-route-command` or become its own island if repaint cost gets high.
- Whether a later raster grime/reflection asset is needed after the SVG glass pass is seen in-scene.
