import { byCoord, driveRanges, endpointById, endpoints, gateLocations, hullFuel, pairedGateById, profiles, sectorCenter } from "../data/galaxy";
import type { AppState, Endpoint, MapLocation, Region, RouteInfo, RouteStep, SectorName } from "../types";

export const chebyshev = (a: Region, b: Region): number => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

export const riskFor = (region: Region): number => ({
  CORE: 0,
  MID: 1,
  FRONTIER: 4,
  NULL: 9
})[region.zone];

interface RouteNode {
  id: string;
  label: string;
  coord: string;
  sector: SectorName;
  x: number;
  z: number;
  locationId?: string;
}

interface Edge {
  to: RouteNode;
  mode: "gate" | "warp" | "impulse";
  fuel: number;
  stepCount: number;
  label: string;
  impulseDistance: number;
  landing?: RouteNode;
}

interface QueueNode {
  id: string;
  fuel: number;
  steps: number;
  impulseDistance: number;
  score: number;
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

const nodeFromEndpoint = (endpoint: Endpoint): RouteNode => ({
  id: endpoint.id,
  label: endpoint.label,
  coord: endpoint.region,
  sector: endpoint.sector,
  x: endpoint.x,
  z: endpoint.z,
  locationId: endpoint.locationId
});

const nodeFromGate = (gate: MapLocation): RouteNode | null => {
  if (gate.x === null || gate.z === null || !gate.sector) return null;
  return {
    id: `gate:${gate.id}`,
    label: gate.name,
    coord: gate.region,
    sector: gate.sector,
    x: gate.x,
    z: gate.z,
    locationId: gate.id
  };
};

const resolveEndpoint = (id: string): Endpoint | null => endpointById.get(id) ?? null;

const allNodesFor = (destination: Endpoint): RouteNode[] => {
  const nodes = new Map<string, RouteNode>();
  for (const endpoint of endpoints) {
    if (endpoint.kind === "sector") nodes.set(endpoint.id, nodeFromEndpoint(endpoint));
  }
  nodes.set(destination.id, nodeFromEndpoint(destination));
  for (const gate of gateLocations) {
    const node = nodeFromGate(gate);
    if (node) nodes.set(node.id, node);
  }
  return [...nodes.values()];
};

const stepScore = (state: AppState, next: Edge): number => {
  const weights = profiles[state.profile].weights;
  const target = byCoord.get(next.to.coord);
  if (!target) return Infinity;
  const impulsePenalty = next.impulseDistance * 0.008;
  return next.fuel * weights.fuel + next.stepCount * weights.steps + riskFor(target) * weights.risk + impulsePenalty;
};

const warpEdge = (state: AppState, from: RouteNode, target: RouteNode): Edge | null => {
  const sourceRegion = byCoord.get(from.coord);
  const targetRegion = byCoord.get(target.coord);
  if (!sourceRegion || !targetRegion) return null;
  if (state.avoidNull && targetRegion.zone === "NULL") return null;
  const maxHop = state.useRange ? driveRanges[state.driveTier] : Infinity;
  const hop = chebyshev(sourceRegion, targetRegion);
  if (maxHop !== Infinity && hop > maxHop) return null;
  const landingEndpoint = sectorCenter(target.coord, target.sector);
  if (!landingEndpoint) return null;
  const landing = nodeFromEndpoint(landingEndpoint);
  const impulseDistance = distance(landing, target);
  return {
    to: target,
    mode: "warp",
    fuel: hullFuel[state.hull],
    stepCount: impulseDistance > 1 ? 2 : 1,
    label: `Warp ${hop} region hop${hop === 1 ? "" : "s"} to ${target.coord}.${target.sector}`,
    impulseDistance,
    landing
  };
};

const gateEdge = (state: AppState, from: RouteNode): Edge | null => {
  if (!state.useGates || !from.locationId) return null;
  const pair = pairedGateById.get(from.locationId);
  if (!pair || pair.x === null || pair.z === null || !pair.sector) return null;
  const targetRegion = byCoord.get(pair.region);
  if (!targetRegion || (state.avoidNull && targetRegion.zone === "NULL")) return null;
  return {
    to: {
      id: `exit:${pair.id}`,
      label: pair.name,
      coord: pair.region,
      sector: pair.sector,
      x: pair.x,
      z: pair.z,
      locationId: pair.id
    },
    mode: "gate",
    fuel: 0,
    stepCount: 1,
    label: `Gate to ${pair.name} (${pair.region}.${pair.sector})`,
    impulseDistance: 0
  };
};

const impulseEdge = (state: AppState, from: RouteNode, target: RouteNode): Edge | null => {
  if (from.id === target.id || from.coord !== target.coord) return null;
  if (from.id.startsWith("gate:")) return null;
  if (!from.locationId && !target.locationId) return null;
  const targetRegion = byCoord.get(target.coord);
  if (!targetRegion || (state.avoidNull && targetRegion.zone === "NULL")) return null;
  const impulseDistance = distance(from, target);
  if (impulseDistance < 1) return null;
  return {
    to: target,
    mode: "impulse",
    fuel: 0,
    stepCount: 1,
    label: `Impulse ${Math.round(impulseDistance).toLocaleString()}u`,
    impulseDistance
  };
};

const neighborsFor = (state: AppState, from: RouteNode, nodes: RouteNode[]): Edge[] => {
  const out: Edge[] = [];
  const gate = gateEdge(state, from);
  if (gate) out.push(gate);

  for (const target of nodes) {
    const impulse = impulseEdge(state, from, target);
    if (impulse) out.push(impulse);
    const warp = warpEdge(state, from, target);
    if (warp && (target.id !== from.id || warp.impulseDistance > 1)) out.push(warp);
  }

  return out;
};

const routeStepFromNode = (node: RouteNode, mode: RouteStep["mode"], label: string, impulseDistance?: number): RouteStep => ({
  id: node.id,
  coord: node.coord,
  sector: node.sector,
  x: node.x,
  z: node.z,
  mode,
  label,
  locationId: node.locationId,
  impulseDistance
});

const buildPath = (origin: RouteNode, dest: RouteNode, prev: Map<string, { from: string; edge: Edge }>): RouteStep[] => {
  const edges: Edge[] = [];
  let cursor = dest.id;

  while (cursor !== origin.id) {
    const prior = prev.get(cursor);
    if (!prior) return [];
    edges.unshift(prior.edge);
    cursor = prior.from;
  }

  const path: RouteStep[] = [routeStepFromNode(origin, "start", "Start")];
  for (const edge of edges) {
    if (edge.mode === "warp" && edge.landing) {
      if (edge.impulseDistance > 1) {
        path.push(routeStepFromNode(edge.landing, "warp", edge.label));
        path.push(routeStepFromNode(edge.to, "impulse", `Impulse ${Math.round(edge.impulseDistance).toLocaleString()}u to ${edge.to.label}`, edge.impulseDistance));
      } else {
        path.push(routeStepFromNode(edge.to, "warp", edge.label));
      }
    } else {
      path.push(routeStepFromNode(edge.to, edge.mode, edge.label, edge.mode === "impulse" ? edge.impulseDistance : undefined));
    }
  }
  return path;
};

export const findPath = (state: AppState): RouteStep[] => {
  const originEndpoint = resolveEndpoint(state.origin);
  const destinationEndpoint = resolveEndpoint(state.destination);
  if (!originEndpoint || !destinationEndpoint) return [];
  const origin = nodeFromEndpoint(originEndpoint);
  const destination = nodeFromEndpoint(destinationEndpoint);
  if (origin.id === destination.id) return [routeStepFromNode(origin, "start", "Already there")];

  const nodes = allNodesFor(destinationEndpoint);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  nodeById.set(origin.id, origin);
  nodeById.set(destination.id, destination);

  const queue: QueueNode[] = [{ id: origin.id, fuel: 0, steps: 0, impulseDistance: 0, score: 0 }];
  const best = new Map<string, QueueNode>([[origin.id, queue[0]]]);
  const prev = new Map<string, { from: string; edge: Edge }>();

  while (queue.length > 0) {
    queue.sort((a, b) => a.score - b.score || a.fuel - b.fuel || a.steps - b.steps || a.impulseDistance - b.impulseDistance);
    const current = queue.shift();
    if (!current) break;

    const known = best.get(current.id);
    if (!known || current.score !== known.score || current.fuel !== known.fuel || current.steps !== known.steps || current.impulseDistance !== known.impulseDistance) continue;
    if (current.id === destination.id) return buildPath(origin, destination, prev);

    const node = nodeById.get(current.id);
    if (!node) continue;

    for (const edge of neighborsFor(state, node, nodes)) {
      nodeById.set(edge.to.id, edge.to);
      const candidate: QueueNode = {
        id: edge.to.id,
        fuel: current.fuel + edge.fuel,
        steps: current.steps + edge.stepCount,
        impulseDistance: current.impulseDistance + edge.impulseDistance,
        score: current.score + stepScore(state, edge)
      };
      const old = best.get(edge.to.id);
      if (old && (old.score < candidate.score || (old.score === candidate.score && old.fuel <= candidate.fuel && old.steps <= candidate.steps && old.impulseDistance <= candidate.impulseDistance))) continue;
      best.set(edge.to.id, candidate);
      prev.set(edge.to.id, { from: current.id, edge });
      queue.push(candidate);
    }
  }

  return [];
};

export const describeRoute = (state: AppState, route: RouteStep[]): RouteInfo => {
  const warpJumps = route.filter((step, index) => index > 0 && step.mode === "warp").length;
  const gateJumps = route.filter((step, index) => index > 0 && step.mode === "gate").length;
  const impulseSteps = route.filter((step, index) => index > 0 && step.mode === "impulse").length;
  const impulseDistance = route.reduce((sum, step) => sum + (step.impulseDistance ?? 0), 0);
  const routeRegions = route.map((step) => byCoord.get(step.coord)).filter((region): region is Region => Boolean(region));
  const frontier = routeRegions.filter((region) => region.zone === "FRONTIER").length;
  const nulls = routeRegions.filter((region) => region.zone === "NULL").length;
  const risk = routeRegions.reduce((sum, region) => sum + riskFor(region), 0);
  const cells = warpJumps * hullFuel[state.hull];

  return {
    warpJumps,
    gateJumps,
    impulseSteps,
    impulseDistance,
    cells,
    credits: cells,
    frontier,
    nulls,
    risk,
    hull: state.hull
  };
};
