# Effects And Assets Plan

## Goal

Create a small, high-quality material kit that makes NAVCOM feel like projected ship hardware. Assets should be deterministic, lightweight, and easy to tune.

## Asset Strategy

Use generated SVG textures first. They stay crisp, are easy to inspect, and can be loaded by Pixi as textures or inlined into CSS/contact sheets. If a texture later needs painterly complexity, replace that single asset with a raster image.

Generated asset directory:

```text
map/src/assets/navcom/
```

## Locked Initial Assets

### `noise-blue.svg`

Subtle cool display noise. Used in the global glass layer and low-intensity panel grain.

### `noise-red.svg`

Harsher warning/interference noise. Used for NULL exposure, failed route states, and alert flashes.

### `scanline-mask.svg`

Small repeating scanline tile. Used by control and display filters.

### `panel-edge-gradient.svg`

Thin cyan edge bloom strip. Used around HTMLSource control panels.

### `warning-stripe.svg`

General alert hatch in red-orange tones. Used for route warnings and panel rail accents.

### `critical-stripe.svg`

Critical red hatch. Used for NULL exposure, failed routes, emergency rails, and hard system alarms.

### `caution-stripe.svg`

Amber hatch. Used for Frontier exposure, degraded scan confidence, and non-critical caution states.

### `stripe-falloff-horizontal.svg`

Alpha falloff mask for horizontal alert rails. Use with every horizontal stripe placement unless the stripe is intentionally clipped inside a hard mechanical frame.

### `stripe-falloff-vertical.svg`

Alpha falloff mask for vertical alert rails. Use with every vertical stripe placement unless the stripe is intentionally clipped inside a hard mechanical frame.

### `spark-dot.svg`

Small radial energy packet. Used for route packets, gate glints, and moving highlights.

### `ring-soft.svg`

Soft circular gradient. Used for pings, range rings, and sensor pulses.

### `glass-smudge.svg`

Low-opacity full-screen grime/reflection texture. Used in glass overlay.

### `bracket-corner.svg`

Reusable targeting corner. Used for selected panels, selected map targets, and lock-on states.

### `reticle-ping.svg`

Radial reticle mark for hover/selection pulses.

### `holo-grid.svg`

Fine grid tile used for recessed display surfaces and drawer interiors.

## Effect Pipelines

### Display Material

```text
scene
  + blue noise at low alpha
  + scanlines at very low alpha
  + vignette
  + glass smudge/reflection bands
  + chromatic edge accents
```

### Control Surface

```text
HTMLSource sprite
  + subtle tint/color matrix
  + edge gradient sprites
  + corner brackets
  + scanline overlay
  + optional warning hatch through stripe falloff mask
```

### Route Solution

```text
route base line
  + spark-dot packets moving along segments
  + gate pulse on gate edges
  + route commit flash
  + failed branch ghosting during recalculation
```

### Hostile Space

```text
zone fill
  + red/amber noise
  + broken grid fragments
  + local displacement shimmer
  + warning reticle pulse
```

## QA Criteria

Assets should pass these checks:

- readable at small sizes
- no muddy mid-contrast haze
- not dominated by one color family
- no accidental web-app gloss
- useful as compositing layers at low opacity
- crisp enough for retina displays
- not visually noisy when tiled
- stripe placements should fade out through a mask rather than ending as harsh rectangles

## First Asset Milestone

1. Generate initial SVG material kit.
2. Generate a contact sheet.
3. Inspect contact sheet at desktop size.
4. Tune any asset that feels cheap, muddy, too flat, or too busy.
5. Keep the generator as the source of truth.
