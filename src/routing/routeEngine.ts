import { byCoord, driveRanges, gatesByCoord, hullFuel, profiles } from "../data/galaxy";
import type { AppState, Region, RouteInfo, RouteStep } from "../types";

export const chebyshev = (a: Region, b: Region): number => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

export const riskFor = (region: Region): number => ({
  CORE: 0,
  MID: 1,
  FRONTIER: 4,
  NULL: 9
})[region.zone];

interface Neighbor {
  coord: string;
  mode: "gate" | "warp";
  fuel: number;
  label: string;
}

interface QueueNode {
  coord: string;
  fuel: number;
  steps: number;
  score: number;
}

const stepScore = (state: AppState, next: Neighbor): number => {
  const weights = profiles[state.profile].weights;
  const target = byCoord.get(next.coord);
  if (!target) return Infinity;
  return next.fuel * weights.fuel + weights.steps + riskFor(target) * weights.risk;
};

const neighborsFor = (state: AppState, region: Region): Neighbor[] => {
  const maxHop = state.useRange ? driveRanges[state.driveTier] : Infinity;
  const fuelPerWarp = hullFuel[state.hull];
  const out: Neighbor[] = [];

  if (state.useGates) {
    for (const gate of gatesByCoord.get(region.coord) ?? []) {
      const otherCoord = gate.a === region.coord ? gate.b : gate.a;
      const other = byCoord.get(otherCoord);
      if (!other || (state.avoidNull && other.zone === "NULL")) continue;
      const localSector = gate.a === region.coord ? gate.aSector : gate.bSector;
      const otherSector = gate.a === region.coord ? gate.bSector : gate.aSector;
      out.push({ coord: otherCoord, mode: "gate", fuel: 0, label: `Gate ${localSector} to ${otherSector}` });
    }
  }

  for (const candidate of byCoord.values()) {
    if (candidate.coord === region.coord) continue;
    if (state.avoidNull && candidate.zone === "NULL") continue;
    const hop = chebyshev(region, candidate);
    if (maxHop === Infinity || hop <= maxHop) {
      out.push({ coord: candidate.coord, mode: "warp", fuel: fuelPerWarp, label: `Warp ${hop} hop${hop === 1 ? "" : "s"}` });
    }
  }

  return out;
};

const buildPath = (origin: string, dest: string, prev: Map<string, { from: string } & Neighbor>): RouteStep[] => {
  const path: RouteStep[] = [];
  let cursor = dest;

  while (cursor !== origin) {
    const prior = prev.get(cursor);
    if (!prior) return [];
    path.unshift({ coord: cursor, mode: prior.mode, label: prior.label });
    cursor = prior.from;
  }

  path.unshift({ coord: origin, mode: "start", label: "Start" });
  return path;
};

export const findPath = (state: AppState): RouteStep[] => {
  if (state.origin === state.destination) return [{ coord: state.origin, mode: "start", label: "Already there" }];

  const queue: QueueNode[] = [{ coord: state.origin, fuel: 0, steps: 0, score: 0 }];
  const best = new Map<string, QueueNode>([[state.origin, queue[0]]]);
  const prev = new Map<string, { from: string } & Neighbor>();

  while (queue.length > 0) {
    queue.sort((a, b) => a.score - b.score || a.fuel - b.fuel || a.steps - b.steps);
    const current = queue.shift();
    if (!current) break;

    const known = best.get(current.coord);
    if (!known || current.score !== known.score || current.fuel !== known.fuel || current.steps !== known.steps) continue;
    if (current.coord === state.destination) return buildPath(state.origin, state.destination, prev);

    const region = byCoord.get(current.coord);
    if (!region) continue;

    for (const next of neighborsFor(state, region)) {
      const candidate: QueueNode = {
        coord: next.coord,
        fuel: current.fuel + next.fuel,
        steps: current.steps + 1,
        score: current.score + stepScore(state, next)
      };
      const old = best.get(next.coord);
      if (old && (old.score < candidate.score || (old.score === candidate.score && old.fuel <= candidate.fuel && old.steps <= candidate.steps))) continue;
      best.set(next.coord, candidate);
      prev.set(next.coord, { from: current.coord, ...next });
      queue.push(candidate);
    }
  }

  return [];
};

export const describeRoute = (state: AppState, route: RouteStep[]): RouteInfo => {
  const warpJumps = route.filter((step, index) => index > 0 && step.mode === "warp").length;
  const gateJumps = route.filter((step, index) => index > 0 && step.mode === "gate").length;
  const routeRegions = route.map((step) => byCoord.get(step.coord)).filter((region): region is Region => Boolean(region));
  const frontier = routeRegions.filter((region) => region.zone === "FRONTIER").length;
  const nulls = routeRegions.filter((region) => region.zone === "NULL").length;
  const risk = routeRegions.reduce((sum, region) => sum + riskFor(region), 0);
  const cells = warpJumps * hullFuel[state.hull];

  return {
    warpJumps,
    gateJumps,
    cells,
    credits: cells,
    frontier,
    nulls,
    risk,
    hull: state.hull
  };
};
