import { describe, expect, it } from "vitest";
import { defaultDestination, defaultOrigin, emptyRouteInfo } from "../data/galaxy";
import type { AppState, HullClass, RouteProfile, Zone } from "../types";
import { describeRoute, findPath } from "./routeEngine";

const stateFor = (overrides: Partial<AppState> = {}): AppState => ({
  profile: "cheap",
  selected: "A1",
  origin: defaultOrigin,
  destination: defaultDestination,
  driveTier: 1,
  hull: "Frigate",
  useGates: true,
  avoidNull: false,
  useRange: true,
  search: "",
  activeZones: new Set<Zone>(["CORE", "MID", "FRONTIER", "NULL"]),
  layers: {
    gates: true,
    threat: true,
    rifts: false,
    range: true,
    labels: true
  },
  route: [],
  routeInfo: emptyRouteInfo((overrides.hull as HullClass | undefined) ?? "Frigate"),
  ...overrides
});

describe("route engine", () => {
  it("prefers the available gate chain for a cheap route from Nimbus-Vesper Gate to Hub Prime", () => {
    const state = stateFor({
      profile: "cheap" as RouteProfile,
      origin: "location:gate-nimbus-vesper-gate-e4",
      destination: "location:station-ipu-hub-prime-a1"
    });

    const route = findPath(state);
    const info = describeRoute(state, route);

    expect(route.map((step) => step.mode)).toContain("gate");
    expect(info.gateJumps).toBeGreaterThanOrEqual(4);
    expect(info.warpJumps).toBeLessThanOrEqual(1);
    expect(route.map((step) => step.locationId)).toContain("gate-vega-solyn-gate-a1");
  });

  it("enters the nearby gate chain for a cheap route from the Nimbus Shoals SW sector to Hub Prime", () => {
    const state = stateFor({
      profile: "cheap" as RouteProfile,
      origin: "sector:E4:SW",
      destination: "location:station-ipu-hub-prime-a1"
    });

    const route = findPath(state);
    const info = describeRoute(state, route);

    expect(route.map((step) => step.mode)).toContain("gate");
    expect(info.gateJumps).toBeGreaterThanOrEqual(4);
    expect(info.warpJumps).toBeLessThanOrEqual(1);
    expect(route.map((step) => step.locationId)).toContain("gate-nimbus-vesper-gate-e4");
  });

  it("still prefers the Nimbus gate chain over two tier-2 warps on cheap routing", () => {
    const state = stateFor({
      profile: "cheap" as RouteProfile,
      origin: "location:gate-nimbus-vesper-gate-e4",
      destination: "location:station-ipu-hub-prime-a1",
      driveTier: 2
    });

    const route = findPath(state);
    const info = describeRoute(state, route);

    expect(info.gateJumps).toBeGreaterThanOrEqual(4);
    expect(info.warpJumps).toBeLessThanOrEqual(1);
    expect(route.map((step) => step.locationId)).toContain("gate-vega-solyn-gate-a1");
  });

  it("does not use gate jumps when gates are disabled", () => {
    const state = stateFor({
      origin: "location:gate-nimbus-vesper-gate-e4",
      destination: "location:station-ipu-hub-prime-a1",
      useGates: false
    });

    const route = findPath(state);
    const info = describeRoute(state, route);

    expect(info.gateJumps).toBe(0);
  });

  it("returns a route between the generated default endpoints", () => {
    const state = stateFor();

    const route = findPath(state);

    expect(route.length).toBeGreaterThan(1);
    expect(route.at(0)?.id).toBe(state.origin);
    expect(route.at(-1)?.id).toBe(state.destination);
  });
});
