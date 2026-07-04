# NAVCOM QA Checklist

Use this checklist for the diegetic UI pass. Do not mark the implementation plan complete until these states have been inspected in a browser with the HTML-in-canvas API enabled.

## Commands

- `npm run build`
- `npm test -- --run`

## Screenshot States

- Desktop default route.
- Desktop NULL-risk route.
- Desktop search open.
- Desktop inspector tabs: `Intel`, `Route`, `Links`, `Raw`.
- Desktop vector drawer scrolled to constraints and fuel.
- Mobile or narrow default stacked layout.
- Mobile or narrow search open.
- Mobile or narrow inspector visible.

## Visual Checks

- HTMLSource islands are not blank.
- DOM hit boxes line up with rendered pixels for input, select, buttons, tabs, and route timeline.
- Drag-select inside the search input stays spatially aligned.
- Top search dropdown does not hide behind drawers.
- Bottom timeline does not overflow over route actions.
- Drawers do not overlap bottom route command on narrow layout.
- Warning stripes do not appear over route timeline data or other dense controls.
- Any future warning stripe placements have soft falloff and enough empty frame space to read as warning rails.
- Critical red appears only for no-route or NULL exposure states.
- Blue noise, scanlines, smudge, and vignette do not muddy map labels or primary controls.
- Route sparks move along route direction and remain stable while zooming or panning.
- Gate pulse rings are visible but not dominant.
- Text does not overflow buttons, tabs, route timeline steps, or compact layer buttons.

## Interaction Checks

- Search typing filters results.
- Keyboard navigation through search previews the map selection.
- Search selection commits the selected region or signal.
- Route profile changes update route state and toast.
- Reset returns to default route state.
- Timeline hover/focus/click previews route steps.
- Layer dock buttons toggle map layers.
- Origin and destination buttons in the inspector still work.
- Map click, shift-click, alt-click, pan, and zoom still work outside control islands.
