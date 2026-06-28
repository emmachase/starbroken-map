import type { Endpoint, Gate, HullClass, MapLocation, ProfileConfig, Region, RouteInfo, RouteProfile, Sector, SectorName, Zone } from "../types";
import {
  GALAXY_COLUMNS,
  GALAXY_ROWS,
  GALAXY_SIZE,
  REGION_SIZE,
  SECTOR_SIZE,
  GENERATED_SOURCE,
  generatedGatePairs,
  generatedLocations,
  generatedOreIndex,
  generatedRegions
} from "./generatedGalaxy";

export { GALAXY_COLUMNS, GALAXY_ROWS, GALAXY_SIZE, REGION_SIZE, SECTOR_SIZE, GENERATED_SOURCE };

const sectorOrder: SectorName[] = ["NW", "NE", "SW", "SE"];

export const regions: Region[] = generatedRegions.map((region) => ({
  ...region,
  zone: region.zone as Zone,
  sectors: region.sectors.map((sector) => ({ ...sector, id: sector.id as SectorName })) as Sector[]
}));

export const locations: MapLocation[] = generatedLocations.map((location) => ({
  ...location,
  kind: location.kind as MapLocation["kind"],
  zone: location.zone as Zone,
  sector: location.sector as SectorName | null,
  details: { ...location.details },
  resources: "resources" in location ? [...location.resources] : undefined
}));

export const gates: Gate[] = generatedGatePairs.map((pair) => ({ ...pair }));
export const oreIndex = generatedOreIndex.map((ore) => ({ ...ore }));

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
export const locationById = new Map(locations.map((location) => [location.id, location]));
export const gateLocations = locations.filter((location) => location.kind === "gate" && location.x !== null && location.z !== null);

export const gatesByCoord = new Map<string, MapLocation[]>();
export const locationsByCoord = new Map<string, MapLocation[]>();

for (const location of locations) {
  if (!locationsByCoord.has(location.region)) locationsByCoord.set(location.region, []);
  locationsByCoord.get(location.region)?.push(location);
  if (location.kind === "gate") {
    if (!gatesByCoord.has(location.region)) gatesByCoord.set(location.region, []);
    gatesByCoord.get(location.region)?.push(location);
  }
}

export const pairedGateById = new Map<string, MapLocation>();
for (const gate of gates) {
  const a = locationById.get(gate.a);
  const b = locationById.get(gate.b);
  if (a && b) {
    pairedGateById.set(a.id, b);
    pairedGateById.set(b.id, a);
  }
}

const locationKindLabel: Record<MapLocation["kind"], string> = {
  station: "Station",
  planet: "Planet",
  belt: "Belt",
  gate: "Gate",
  wreck: "Wreck",
  system: "System"
};

export const sectorCenter = (coord: string, sectorName: SectorName): Endpoint | null => {
  const region = byCoord.get(coord);
  const sector = region?.sectors.find((item) => item.id === sectorName);
  if (!region || !sector) return null;
  return {
    id: `sector:${coord}:${sectorName}`,
    label: `${coord}.${sectorName} - ${region.name}`,
    kind: "sector",
    region: coord,
    sector: sectorName,
    x: sector.centerX,
    z: sector.centerZ
  };
};

export const sectorForPoint = (region: Region, x: number, z: number): SectorName => {
  const east = x >= region.xMin + SECTOR_SIZE;
  const south = z >= region.zMin + SECTOR_SIZE;
  if (!east && !south) return "NW";
  if (east && !south) return "NE";
  if (!east && south) return "SW";
  return "SE";
};

export const endpoints: Endpoint[] = [
  ...regions.flatMap((region) => sectorOrder.map((sector) => sectorCenter(region.coord, sector)).filter((endpoint): endpoint is Endpoint => Boolean(endpoint))),
  ...locations.flatMap((location) => {
    if (location.hidden || location.x === null || location.z === null || !location.sector) return [];
    return [{
      id: `location:${location.id}`,
      label: `${locationKindLabel[location.kind]}: ${location.name} (${location.region}.${location.sector})`,
      kind: "location" as const,
      region: location.region,
      sector: location.sector,
      x: location.x,
      z: location.z,
      locationId: location.id
    }];
  })
];

export const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));

export const defaultOrigin = endpointById.get("location:station-ipu-hub-prime-a1")?.id ?? "sector:A1:NW";
export const defaultDestination = endpointById.get("location:station-ipu-outpost-gamma-h8")?.id ?? "sector:H8:SE";

export const emptyRouteInfo = (hull: HullClass): RouteInfo => ({
  warpJumps: 0,
  gateJumps: 0,
  impulseSteps: 0,
  impulseDistance: 0,
  cells: 0,
  credits: 0,
  frontier: 0,
  nulls: 0,
  risk: 0,
  hull
});
