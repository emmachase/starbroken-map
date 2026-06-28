export type Zone = "CORE" | "MID" | "FRONTIER" | "NULL";

export type RouteProfile = "safe" | "fast" | "cheap" | "risky";

export type HullClass = "Frigate" | "Destroyer" | "Cruiser" | "Battlecruiser" | "Colossal";

export interface Region {
  coord: string;
  name: string;
  slug: string;
  zone: Zone;
  col: number;
  row: number;
  sectors: number;
}

export interface Gate {
  a: string;
  aSector: string;
  b: string;
  bSector: string;
}

export type StepMode = "start" | "gate" | "warp";

export interface RouteStep {
  coord: string;
  mode: StepMode;
  label: string;
}

export interface RouteInfo {
  warpJumps: number;
  gateJumps: number;
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
