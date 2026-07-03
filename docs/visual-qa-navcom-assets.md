# NAVCOM Asset Visual QA

## Scope

QA pass for the initial generated NAVCOM material kit in `map/src/assets/navcom/`.

## Render Method

The contact sheet was rendered with installed Chrome headless from:

```text
map/src/assets/navcom/contact-sheet.html
```

Screenshot output:

```text
map/src/assets/navcom/contact-sheet.png
```

Stripe seam test:

```text
map/src/assets/navcom/stripe-tile-test.html
map/src/assets/navcom/stripe-tile-test.png
```

Stripe falloff test:

```text
map/src/assets/navcom/stripe-falloff-test.html
map/src/assets/navcom/stripe-falloff-test.png
```

## Result

Pass. The kit is good enough to begin the HTML-in-canvas/Pixi integration pass.

## Notes

- Overall read is crisp and tactical, not painterly or muddy.
- The composite sample has a convincing under-glass feel with scanlines, grid, bloom, and warning material layered together.
- Cyan materials are bright enough for additive effects but not so hot that they will erase map readability.
- The stripe materials are split by severity: general warning, critical red, and amber caution. This avoids every alert state sharing the same visual temperature.
- Stripe tiles are intentionally seamless and hard-edged as source textures, but placements should use `stripe-falloff-horizontal.svg` or `stripe-falloff-vertical.svg` so rails fade into the display surface.
- Critical red material is strong and should be used sparingly, mostly for NULL exposure, failed routes, and alert rails.
- Red noise and glass smudge are now diffuse procedural materials without sparse line details, so they should not create recognizable repeated strokes when tiled or reused.
- The scanline asset looks harsh in isolation because it is magnified in the contact sheet; at texture scale it should work as a low-alpha overlay.
- Stripe assets are intentionally chunky and use periodic diagonal bands so the color sequence repeats correctly at 96px tile boundaries. Use lower alpha or smaller repeat size when they appear on large surfaces.
- The ring and reticle assets are polished enough for selection and pulse effects.

## Follow-Up During Integration

- Verify `noise-blue.svg` does not create visible tiling when used full-screen.
- Tune scanline opacity in shader/CSS composition rather than changing the source asset first.
- Apply stripe falloff masks for ordinary alert rails; reserve hard rectangular stripe edges for framed mechanical slots only.
- Keep `glass-smudge.svg` below 6% opacity unless a stronger damaged-screen state is active.
- Consider adding one later high-resolution PNG/WebP asset if the display needs more organic grime or reflection complexity.
