export type Zone = "CORE" | "MID" | "FRONTIER" | "NULL";

export type RouteProfile = "safe" | "fast" | "cheap" | "risky";

export type HullClass = "Frigate" | "Destroyer" | "Cruiser" | "Battlecruiser" | "Colossal";

export type SectorName = "NW" | "NE" | "SW" | "SE";

export type LocationKind = "station" | "planet" | "belt" | "gate" | "wreck" | "system";

export type EndpointKind = "sector" | "location";

export interface Sector {
  id: SectorName;
  xMin: number;
  zMin: number;
  xMax: number;
  zMax: number;
  centerX: number;
  centerZ: number;
}

export interface Region {
  coord: string;
  name: string;
  slug: string;
  zone: Zone;
  security: string;
  col: number;
  row: number;
  xMin: number;
  zMin: number;
  xMax: number;
  zMax: number;
  sectors: Sector[];
}

export interface Gate {
  a: string;
  b: string;
}

export interface MapLocation {
  id: string;
  name: string;
  kind: LocationKind;
  region: string;
  zone: Zone;
  sector: SectorName | null;
  x: number | null;
  z: number | null;
  hidden: boolean;
  details: Record<string, string>;
  resources?: string[];
  radius?: number;
  density?: number;
  linksTo?: string;
}

export interface Endpoint {
  id: string;
  label: string;
  kind: EndpointKind;
  region: string;
  sector: SectorName;
  x: number;
  z: number;
  locationId?: string;
}

export type StepMode = "start" | "gate" | "warp" | "impulse";

export interface RouteStep {
  id: string;
  coord: string;
  sector?: SectorName;
  x: number;
  z: number;
  mode: StepMode;
  label: string;
  locationId?: string;
  impulseDistance?: number;
}

export interface RouteInfo {
  warpJumps: number;
  gateJumps: number;
  impulseSteps: number;
  impulseDistance: number;
  cells: number;
  credits: number;
  frontier: number;
  nulls: number;
  risk: number;
  hull: HullClass;
}

export interface Layers {
  gates: boolean;
  threat: boolean;
  rifts: boolean;
  range: boolean;
  labels: boolean;
}

export interface AppState {
  profile: RouteProfile;
  selected: string;
  origin: string;
  destination: string;
  driveTier: number;
  hull: HullClass;
  useGates: boolean;
  avoidNull: boolean;
  useRange: boolean;
  search: string;
  activeZones: Set<Zone>;
  layers: Layers;
  route: RouteStep[];
  routeInfo: RouteInfo;
}

export interface ProfileConfig {
  label: string;
  help: string;
  weights: {
    fuel: number;
    steps: number;
    risk: number;
  };
}
