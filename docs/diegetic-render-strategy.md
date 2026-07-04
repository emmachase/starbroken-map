# Diegetic Render Strategy

## Goal

Move NAVCOM from a DOM app wrapped around a Pixi map into a single composited instrument. All visible controls should enter the Pixi scene through HTML-in-canvas textures, then receive the same screen, glow, warning, and interference treatment as the map.

## Principle

Use real HTML for control semantics and Pixi for visual integration.

- HTML owns layout, focus, typing, select state, scrolling, and accessibility.
- `HTMLSource` turns each live HTML island into a Pixi texture.
- Pixi owns depth, lighting, scanlines, warning states, route animation, and display material.
- Pixi primitives handle map-native feedback: reticles, route packets, gates, range rings, rift particles, and scan sweeps.

## Scene Graph

```text
Application.stage
  screenRoot
    starfieldLayer
    deepSpaceNoiseLayer
    mapWorldLayer
    mapRouteLayer
    mapSensorFxLayer
    htmlControlLayer
    glassOverlayLayer
    alertInterferenceLayer
    cursorReticleLayer
```

## Layer Contracts

### starfieldLayer

Static/procedural space backing. Slow parallax, no gameplay information.

### deepSpaceNoiseLayer

Ambient texture field used by later shaders and overlays. Blue noise is always subtle; red noise is enabled for warnings and hostile zones.

### mapWorldLayer

The galaxy grid, zone fills, sector boundaries, gates, locations, and labels.

### mapRouteLayer

Route base line, animated packets, gate jump pulses, origin/destination marks, drive envelope.

### mapSensorFxLayer

Selection brackets, hover reticles, scan sweep, route solution flashes, local hostile-zone shimmer.

### htmlControlLayer

Live HTML islands rendered via `HTMLSource`. Each major control region is one texture source, not one source per control.

Initial islands:

- `top-console`
- `search-popover`
- `bottom-route-command`
- `left-vector-drawer`
- `right-signal-inspector`
- `layer-dock`
- `toast-console`

HTML islands own their own notched panel silhouette, background, and focus states. Pixi should not draw extra rectangular frames or corner accents over them unless a future treatment replaces the island's CSS panel language entirely.

### glassOverlayLayer

Full-display material: scanlines, vignette, low-opacity grime, reflection bands, chromatic edge hints.

### alertInterferenceLayer

Conditional high-priority warning effects. NULL exposure, failed route, GateNet unavailable, or risky profile can activate tearing, red scan noise, or brief sync loss.

### cursorReticleLayer

Input feedback and lock-on affordances. This layer should remain crisp and readable.

## HTML-in-Canvas Rules

`HTMLSource` requires DOM elements to be direct children of the Pixi canvas. The control host should create direct canvas children for each island, then wrap each with `HTMLSource` and display it as a `Sprite` or lightly deformed `MeshPlane`.

Safe transforms for live controls:

- translate
- scale
- opacity
- tint/color grading
- edge glow
- scanline filter
- tiny jitter under warning states

Use carefully:

- perspective mesh
- displacement
- curved projection

Avoid for live input fields:

- heavy non-linear warping
- large offsets between DOM hit-testing and visible pixels
- filter stacks that make text hard to read

## Update Policy

Request repaint only when useful.

- State-driven panels repaint on state changes.
- Text input/search repaints during input.
- Toast repaints when message changes.
- Route/map effects animate in Pixi, not in DOM.
- Continuous CSS animations inside HTML islands should be rare.

## Performance Boundaries

- Prefer 5-7 HTMLSource islands total.
- Keep filter stacks on parent containers, not individual controls.
- Set `filterArea` for full-screen or fixed-size filtered containers.
- Use generated SVG textures for repeated material effects.
- Group objects by blend mode where possible.
- Use additive blend for glows and normal blend for readable text/control surfaces.

## First Implementation Milestone

1. Move visible React UI into direct canvas child islands.
2. Create `HTMLSource` textures for top, bottom, left drawer, right inspector, layer dock, and toast.
3. Recompose layout inside Pixi using current viewport dimensions.
4. Add glass overlay and map-native sensor feedback.
5. Keep current map behavior intact while changing only presentation.
