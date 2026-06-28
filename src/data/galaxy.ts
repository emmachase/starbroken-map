import type { Gate, HullClass, ProfileConfig, Region, RouteInfo, RouteProfile, Zone } from "../types";

const rawRegions: Array<[string, string, string, Zone]> = [
  ["A1", "Vega Reach", "vega-reach-r0", "CORE"], ["B1", "Orin Veil", "orin-veil-r1", "CORE"], ["C1", "Helix Verge", "helix-verge-r2", "CORE"], ["D1", "Carina Span", "carina-span-r3", "MID"], ["E1", "Drift Hollows", "drift-hollows-r4", "MID"], ["F1", "Korr Expanse", "korr-expanse-r5", "FRONTIER"], ["G1", "Nyx Marches", "nyx-marches-r6", "MID"], ["H1", "Pyxis Quartz", "pyxis-quartz-r7", "FRONTIER"],
  ["A2", "Solyn Cradle", "solyn-cradle-r8", "CORE"], ["B2", "Tarsis Belt", "tarsis-belt-r9", "CORE"], ["C2", "Umbral Coil", "umbral-coil-r10", "MID"], ["D2", "Wraith Hollow", "wraith-hollow-r11", "MID"], ["E2", "Xanthe Drift", "xanthe-drift-r12", "MID"], ["F2", "Yarrow Pale", "yarrow-pale-r13", "MID"], ["G2", "Zephyr Crown", "zephyr-crown-r14", "FRONTIER"], ["H2", "Aeon Maw", "aeon-maw-r15", "FRONTIER"],
  ["A3", "Briar Cluster", "briar-cluster-r16", "CORE"], ["B3", "Cassia Wash", "cassia-wash-r17", "MID"], ["C3", "Dross Field", "dross-field-r18", "MID"], ["D3", "Echo Trace", "echo-trace-r19", "FRONTIER"], ["E3", "Fenix Shadow", "fenix-shadow-r20", "MID"], ["F3", "Galen Mouth", "galen-mouth-r21", "FRONTIER"], ["G3", "Hesper Edge", "hesper-edge-r22", "FRONTIER"], ["H3", "Indigo Throne", "indigo-throne-r23", "FRONTIER"],
  ["A4", "Janus Spire", "janus-spire-r24", "MID"], ["B4", "Kestrel Gulf", "kestrel-gulf-r25", "MID"], ["C4", "Lyra Glade", "lyra-glade-r26", "MID"], ["D4", "Mira Knot", "mira-knot-r27", "MID"], ["E4", "Nimbus Shoals", "nimbus-shoals-r28", "FRONTIER"], ["F4", "Orpheus Tide", "orpheus-tide-r29", "FRONTIER"], ["G4", "Pyre Sweep", "pyre-sweep-r30", "NULL"], ["H4", "Quill Marsh", "quill-marsh-r31", "FRONTIER"],
  ["A5", "Sable Fold", "sable-fold-r32", "MID"], ["B5", "Theron Bound", "theron-bound-r33", "MID"], ["C5", "Ursa Crest", "ursa-crest-r34", "MID"], ["D5", "Vesper Hollow", "vesper-hollow-r35", "FRONTIER"], ["E5", "Wraith Span", "wraith-span-r36", "FRONTIER"], ["F5", "Xeric Reach", "xeric-reach-r37", "FRONTIER"], ["G5", "Yotun Drift", "yotun-drift-r38", "FRONTIER"], ["H5", "Zorya Veil", "zorya-veil-r39", "FRONTIER"],
  ["A6", "Astor Cinder", "astor-cinder-r40", "CORE"], ["B6", "Brae Threshold", "brae-threshold-r41", "FRONTIER"], ["C6", "Calix Cradle", "calix-cradle-r42", "MID"], ["D6", "Dvalin Steep", "dvalin-steep-r43", "FRONTIER"], ["E6", "Erebos Hollow", "erebos-hollow-r44", "FRONTIER"], ["F6", "Fjord Verge", "fjord-verge-r45", "FRONTIER"], ["G6", "Garm Span", "garm-span-r46", "FRONTIER"], ["H6", "Hyacinth Maw", "hyacinth-maw-r47", "NULL"],
  ["A7", "Iolite Hollow", "iolite-hollow-r48", "CORE"], ["B7", "Juno Belt", "juno-belt-r49", "MID"], ["C7", "Karst March", "karst-march-r50", "MID"], ["D7", "Loam Crown", "loam-crown-r51", "FRONTIER"], ["E7", "Murk Cluster", "murk-cluster-r52", "NULL"], ["F7", "Nephele Coil", "nephele-coil-r53", "FRONTIER"], ["G7", "Onyx Reach", "onyx-reach-r54", "NULL"], ["H7", "Pallid Veil", "pallid-veil-r55", "NULL"],
  ["A8", "Rann Throne", "rann-throne-r56", "CORE"], ["B8", "Sere Glade", "sere-glade-r57", "CORE"], ["C8", "Tang Drift", "tang-drift-r58", "MID"], ["D8", "Volt Verge", "volt-verge-r59", "FRONTIER"], ["E8", "Wisp Pale", "wisp-pale-r60", "FRONTIER"], ["F8", "Yew Spire", "yew-spire-r61", "NULL"], ["G8", "Cinder Shoal", "cinder-shoal-r62", "NULL"], ["H8", "Halcyon March", "halcyon-march-r63", "NULL"]
];

export const regions: Region[] = rawRegions.map(([coord, name, slug, zone]) => ({
  coord,
  name,
  slug,
  zone,
  col: coord.charCodeAt(0) - 65,
  row: Number(coord.slice(1)) - 1,
  sectors: 4
}));

export const gates: Gate[] = [
  { a: "A1", aSector: "NW", b: "A2", bSector: "NW" },
  { a: "A2", aSector: "NW", b: "A8", bSector: "SE" },
  { a: "A8", aSector: "SE", b: "D8", bSector: "NW" },
  { a: "D8", aSector: "NE", b: "H8", bSector: "SW" },
  { a: "D8", aSector: "NE", b: "E4", bSector: "SW" }
];

export const zoneColors: Record<Zone, number> = {
  CORE: 0x58e794,
  MID: 0xf5d760,
  FRONTIER: 0xff9b54,
  NULL: 0xff5571
};

export const zoneCss: Record<Zone, string> = {
  CORE: "#58e794",
  MID: "#f5d760",
  FRONTIER: "#ff9b54",
  NULL: "#ff5571"
};

export const zoneClass: Record<Zone, string> = {
  CORE: "core",
  MID: "mid",
  FRONTIER: "frontier",
  NULL: "null"
};

export const driveRanges: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: Infinity
};

export const hullFuel: Record<HullClass, number> = {
  Frigate: 100,
  Destroyer: 200,
  Cruiser: 500,
  Battlecruiser: 1500,
  Colossal: 5000
};

export const profiles: Record<RouteProfile, ProfileConfig> = {
  safe: {
    label: "Safe Route",
    help: "Safe profile avoids dangerous space unless the route needs it.",
    weights: { fuel: 1, steps: 16, risk: 360 }
  },
  fast: {
    label: "Fast Route",
    help: "Fast profile minimizes jumps first, then fuel and risk.",
    weights: { fuel: 0.04, steps: 150, risk: 24 }
  },
  cheap: {
    label: "Cheap Route",
    help: "Cheap profile favors gates and low fuel burn.",
    weights: { fuel: 1, steps: 4, risk: 42 }
  },
  risky: {
    label: "Risky Route",
    help: "Risky profile accepts hostile space for aggressive routing.",
    weights: { fuel: 0.08, steps: 52, risk: 4 }
  }
};

export const byCoord = new Map(regions.map((region) => [region.coord, region]));

export const gatesByCoord = new Map<string, Gate[]>();

for (const gate of gates) {
  if (!gatesByCoord.has(gate.a)) gatesByCoord.set(gate.a, []);
  if (!gatesByCoord.has(gate.b)) gatesByCoord.set(gate.b, []);
  gatesByCoord.get(gate.a)?.push(gate);
  gatesByCoord.get(gate.b)?.push(gate);
}

export const emptyRouteInfo = (hull: HullClass): RouteInfo => ({
  warpJumps: 0,
  gateJumps: 0,
  cells: 0,
  credits: 0,
  frontier: 0,
  nulls: 0,
  risk: 0,
  hull
});
