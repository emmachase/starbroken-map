import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(mapRoot, "..");

const dumpPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(repoRoot, "starbroken_wiki_dump", "pages.jsonl");

const outPath = path.join(mapRoot, "src", "data", "generatedGalaxy.ts");

const REGION_SIZE = 8192;
const SECTOR_SIZE = 4096;
const GALAXY_COLUMNS = 8;
const GALAXY_ROWS = 8;

const fallbackRegionNames = {
  A1: "Vega Reach", B1: "Orin Veil", C1: "Helix Verge", D1: "Carina Span", E1: "Drift Hollows", F1: "Korr Expanse", G1: "Nyx Marches", H1: "Pyxis Quartz",
  A2: "Solyn Cradle", B2: "Tarsis Belt", C2: "Umbral Coil", D2: "Wraith Hollow", E2: "Xanthe Drift", F2: "Yarrow Pale", G2: "Zephyr Crown", H2: "Aeon Maw",
  A3: "Briar Cluster", B3: "Cassia Wash", C3: "Dross Field", D3: "Echo Trace", E3: "Fenix Shadow", F3: "Galen Mouth", G3: "Hesper Edge", H3: "Indigo Throne",
  A4: "Janus Spire", B4: "Kestrel Gulf", C4: "Lyra Glade", D4: "Mira Knot", E4: "Nimbus Shoals", F4: "Orpheus Tide", G4: "Pyre Sweep", H4: "Quill Marsh",
  A5: "Sable Fold", B5: "Theron Bound", C5: "Ursa Crest", D5: "Vesper Hollow", E5: "Wraith Span", F5: "Xeric Reach", G5: "Yotun Drift", H5: "Zorya Veil",
  A6: "Astor Cinder", B6: "Brae Threshold", C6: "Calix Cradle", D6: "Dvalin Steep", E6: "Erebos Hollow", F6: "Fjord Verge", G6: "Garm Span", H6: "Hyacinth Maw",
  A7: "Iolite Hollow", B7: "Juno Belt", C7: "Karst March", D7: "Loam Crown", E7: "Murk Cluster", F7: "Nephele Coil", G7: "Onyx Reach", H7: "Pallid Veil",
  A8: "Rann Throne", B8: "Sere Glade", C8: "Tang Drift", D8: "Volt Verge", E8: "Wisp Pale", F8: "Yew Spire", G8: "Cinder Shoal", H8: "Halcyon March"
};

const pageByUrl = new Map();

for (const line of fs.readFileSync(dumpPath, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const page = JSON.parse(line);
  if (page.url) pageByUrl.set(page.url, page);
}

const roster = [...pageByUrl.values()].find((page) => page.url?.endsWith("/reference/galaxy-map-roster.html"));
const guide = [...pageByUrl.values()].find((page) => page.url?.endsWith("/reference/galaxy-map.html"));

if (!roster) throw new Error(`Galaxy roster page not found in ${dumpPath}`);

const findTable = (page, firstHeader) => {
  const table = page.tables?.find((candidate) => candidate[0]?.[0] === firstHeader);
  if (!table) throw new Error(`Missing table with first header "${firstHeader}" in ${page.url}`);
  return table;
};

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const zoneFromSecurity = (value) => {
  const match = String(value).match(/\((CORE|MID|FRONTIER|NULL)\)|^(CORE|MID|FRONTIER|NULL)$/);
  if (!match) return "MID";
  return match[1] ?? match[2];
};

const parseCoordinate = (value) => {
  const match = String(value).match(/(-?\d+)\s*,\s*(-?\d+)/);
  if (!match) return null;
  return { x: Number(match[1]), z: Number(match[2]) };
};

const splitList = (value) => String(value)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const sectorFor = (region, x, z) => {
  const east = x >= region.xMin + SECTOR_SIZE;
  const south = z >= region.zMin + SECTOR_SIZE;
  if (!east && !south) return "NW";
  if (east && !south) return "NE";
  if (!east && south) return "SW";
  return "SE";
};

const regionNameByCoord = { ...fallbackRegionNames };
if (guide) {
  const named = guide.tables?.find((table) => table[0]?.join("|") === "Region|Grid|Zone|What's there");
  for (const row of named?.slice(1) ?? []) {
    const [name, coord] = row;
    if (/^[A-H][1-8]$/.test(coord)) regionNameByCoord[coord] = name;
  }
}

const securityRows = findTable(roster, "Region").slice(1);
const regions = securityRows.map(([coord, security]) => {
  const col = coord.charCodeAt(0) - 65;
  const row = Number(coord.slice(1)) - 1;
  const xMin = col * REGION_SIZE;
  const zMin = row * REGION_SIZE;
  const name = regionNameByCoord[coord] ?? coord;
  const sectors = [
    ["NW", xMin, zMin],
    ["NE", xMin + SECTOR_SIZE, zMin],
    ["SW", xMin, zMin + SECTOR_SIZE],
    ["SE", xMin + SECTOR_SIZE, zMin + SECTOR_SIZE]
  ].map(([id, sx, sz]) => ({
    id,
    xMin: sx,
    zMin: sz,
    xMax: sx + SECTOR_SIZE,
    zMax: sz + SECTOR_SIZE,
    centerX: sx + SECTOR_SIZE / 2,
    centerZ: sz + SECTOR_SIZE / 2
  }));
  return {
    coord,
    name,
    slug: `${slugify(name)}-r${row * GALAXY_COLUMNS + col}`,
    zone: zoneFromSecurity(security),
    security,
    col,
    row,
    xMin,
    zMin,
    xMax: xMin + REGION_SIZE,
    zMax: zMin + REGION_SIZE,
    sectors
  };
});

const byCoord = new Map(regions.map((region) => [region.coord, region]));

const locationRows = [
  { kind: "station", table: findTable(roster, "Station"), columns: ["name", "class", "owner", "region", "security", "coordinates"] },
  { kind: "planet", table: findTable(roster, "Planet"), columns: ["name", "type", "region", "security", "coordinates", "minerals"] },
  { kind: "belt", table: findTable(roster, "Belt"), columns: ["name", "region", "security", "coordinates", "radius", "density", "ores"] },
  { kind: "gate", table: findTable(roster, "Gate"), columns: ["name", "region", "security", "coordinates", "linksTo"] },
  { kind: "wreck", table: findTable(roster, "Name"), columns: ["name", "region", "security", "coordinates"] },
  { kind: "system", table: roster.tables.find((table) => table[0]?.join("|") === "Name|Region|Security|Coordinates (x, z)" && table[1]?.[0] === "Veyra"), columns: ["name", "region", "security", "coordinates"] }
];

const locations = [];

for (const spec of locationRows) {
  if (!spec.table) continue;
  for (const row of spec.table.slice(1)) {
    const raw = Object.fromEntries(spec.columns.map((key, index) => [key, row[index] ?? ""]));
    const region = byCoord.get(raw.region);
    if (!region) continue;
    const parsed = parseCoordinate(raw.coordinates);
    const baseId = `${spec.kind}-${slugify(raw.name)}-${raw.region.toLowerCase()}`;
    const details = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!["name", "region", "security", "coordinates", "minerals", "ores"].includes(key) && value && value !== "-") details[key] = value;
    }
    if (raw.coordinates) details.coordinates = raw.coordinates;
    const location = {
      id: baseId,
      name: raw.name,
      kind: spec.kind,
      region: raw.region,
      zone: zoneFromSecurity(raw.security),
      sector: parsed ? sectorFor(region, parsed.x, parsed.z) : null,
      x: parsed?.x ?? null,
      z: parsed?.z ?? null,
      hidden: !parsed,
      details
    };
    if (raw.minerals) location.resources = splitList(raw.minerals);
    if (raw.ores) location.resources = splitList(raw.ores);
    if (raw.radius) location.radius = Number(raw.radius);
    if (raw.density) location.density = Number(raw.density);
    if (raw.linksTo) location.linksTo = raw.linksTo;
    locations.push(location);
  }
}

const gateLocations = locations.filter((location) => location.kind === "gate");
const gatePairs = [];
const seenPairs = new Set();
for (const gate of gateLocations) {
  const target = gateLocations.find((candidate) => candidate.name === gate.linksTo);
  if (!target) continue;
  const key = [gate.id, target.id].sort().join("|");
  if (seenPairs.has(key)) continue;
  seenPairs.add(key);
  gatePairs.push({ a: gate.id, b: target.id });
}

const oreIndexTable = findTable(roster, "Ore");
const oreIndex = oreIndexTable.slice(1).map(([ore, minZone, belts, where]) => ({
  ore,
  minZone,
  belts: Number(belts),
  where
}));

const generatedAt = new Date().toISOString();

const content = `// Generated by scripts/generate-galaxy-data.mjs from ${path.relative(repoRoot, dumpPath).replaceAll("\\", "/")}.
// Do not edit by hand.

export const REGION_SIZE = ${REGION_SIZE};
export const SECTOR_SIZE = ${SECTOR_SIZE};
export const GALAXY_COLUMNS = ${GALAXY_COLUMNS};
export const GALAXY_ROWS = ${GALAXY_ROWS};
export const GALAXY_SIZE = REGION_SIZE * GALAXY_COLUMNS;
export const GENERATED_AT = ${JSON.stringify(generatedAt)};
export const GENERATED_SOURCE = ${JSON.stringify(roster.url)};

export const generatedRegions = ${JSON.stringify(regions, null, 2)} as const;

export const generatedLocations = ${JSON.stringify(locations, null, 2)} as const;

export const generatedGatePairs = ${JSON.stringify(gatePairs, null, 2)} as const;

export const generatedOreIndex = ${JSON.stringify(oreIndex, null, 2)} as const;
`;

fs.writeFileSync(outPath, content);
console.log(`Generated ${path.relative(process.cwd(), outPath)} from ${path.relative(process.cwd(), dumpPath)}.`);
console.log(`${regions.length} regions, ${locations.length} locations, ${gatePairs.length} gate pairs.`);
