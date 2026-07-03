# Diegetic UX Strategy

## Goal

Reduce dashboard density and make NAVCOM feel like a ship instrument. The player should read the map first, the route second, and raw intel only when they ask for it.

## Primary User Loop

```text
Select or search destination
  -> inspect route and exposure
  -> adjust constraints if needed
  -> commit/replot
  -> inspect exceptions
```

The UI should support this loop directly. Anything outside the loop should be collapsed, contextual, or visually demoted.

## Proposed Layout

```text
Top rail: system state, search/signal scan, selected object summary
Center: full tactical map
Bottom rail: route command, profile, exposure, fuel, steps, primary action
Left drawer: vector setup and constraints
Right drawer: contextual signal/intel inspector
Map dock: compact layer controls
```

The current persistent three-column layout should become a full map with docked instruments.

## Always Visible

- Origin
- Destination
- Route profile
- Exposure/risk
- Fuel/cell cost
- Step count
- GateNet state
- Search/signal scan
- Selected object name and zone

## Hidden By Default

- Coordinate min/max ranges
- Slugs
- Full zone index counts
- Published/hidden counts
- Full fuel breakdown
- Full adjacent signal list
- Full search result list
- Exact impulse distance
- Long resource lists

These remain available behind disclosure controls, tabs, or an expanded inspector.

## Component Moves

### Search

Move search into the top rail or a map-attached command palette. It should feel like scanning the display, not using a website navbar.

### Route Command

Move route summary to the bottom rail. This is the main decision surface:

- current route
- exposure
- fuel/cell cost
- steps
- profile selector
- replot/commit action

### Layer Controls

Move map layers to a compact vertical dock. Use icon-first controls with labels on hover/focus.

### Vector Setup

Move origin/destination selects, drive tier, hull, GateNet, NULL bypass, and range controls into a left drawer. Default state is collapsed unless the user is editing constraints.

### Inspector

Make the right panel contextual and collapsed by default. The collapsed state shows a compact summary; expanded state reveals tabs.

Suggested tabs:

- `Intel`
- `Route`
- `Resources`
- `Links`
- `Raw`

### Route Steps

Convert the route list into an expandable bottom timeline. Hovering a step highlights the corresponding map segment. Clicking focuses it.

## Progressive Disclosure

### Level 1: Command

Immediate route decision information: route endpoints, risk, fuel, profile, and selected object.

### Level 2: Tactical

Controls that change the route: hull, drive tier, GateNet, avoid NULL, use range, map layers.

### Level 3: Intel

Raw data and world details: coordinates, resources, hidden counts, slugs, sector bounds, adjacent lists.

## Visual Hierarchy

Priority order:

1. selected route
2. selected location/region
3. route exposure/fuel summary
4. route controls
5. tactical constraints
6. secondary intel
7. raw metadata

Raw metadata should be low contrast, smaller, and usually hidden.

## Interaction Patterns

- Map click selects.
- Shift-click sets destination.
- Alt-click sets origin.
- Search result focus previews on map before commit.
- Route timeline hover previews route segment.
- Hazard states are visual first and textual second.
- Inspector expansion should not obscure the selected map target.

## First UX Milestone

1. Recompose top, bottom, layer dock, and drawers.
2. Demote raw details into inspector sections.
3. Replace persistent route list with bottom timeline.
4. Make route exposure the strongest non-map element.
5. Keep all existing capabilities reachable.

