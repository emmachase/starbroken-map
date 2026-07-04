import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import {
  byCoord,
  defaultDestination,
  defaultOrigin,
  driveRanges,
  emptyRouteInfo,
  endpointById,
  endpoints,
  gatesByCoord,
  hullFuel,
  locations,
  locationsByCoord,
  pairedGateById,
  profiles,
  regions,
  zoneClass,
  zoneCss
} from "./data/galaxy";
import { GalaxyViewport } from "./render/GalaxyViewport";
import { describeRoute, findPath } from "./routing/routeEngine";
import type { AppState, Endpoint, HullClass, MapLocation, Region, RouteProfile, RouteStep, Zone } from "./types";

const zones: Zone[] = ["CORE", "MID", "FRONTIER", "NULL"];
const hulls: HullClass[] = ["Frigate", "Destroyer", "Cruiser", "Battlecruiser", "Colossal"];
const routeProfiles: RouteProfile[] = ["safe", "fast", "cheap", "risky"];
const inspectorTabs = ["intel", "route", "links", "raw"] as const;
type InspectorTab = (typeof inspectorTabs)[number];

const defaultState = (): AppState => ({
  profile: "safe",
  selected: "A1",
  origin: defaultOrigin,
  destination: defaultDestination,
  driveTier: 1,
  hull: "Frigate",
  useGates: true,
  avoidNull: false,
  useRange: true,
  search: "",
  activeZones: new Set<Zone>(zones),
  layers: {
    gates: true,
    threat: true,
    rifts: false,
    range: true,
    labels: true
  },
  route: [],
  routeInfo: emptyRouteInfo("Frigate")
});

const locationKindLabel: Record<MapLocation["kind"], string> = {
  station: "Station",
  planet: "Planet",
  belt: "Belt",
  gate: "Gate",
  wreck: "Wreck",
  system: "System"
};

const zoneMeaning = (zone: Zone): string => ({
  CORE: "Patrolled starter space. Safest routes and early mining.",
  MID: "Outer lanes. Better yield, some pirate pressure.",
  FRONTIER: "Wormhole-capable, higher-value, higher-risk space.",
  NULL: "Wild Drift. Full PvP, no NPC protection, top-end resources."
})[zone];

const endpointText = (id: string): string => endpointById.get(id)?.label ?? id;

const endpointGroups = {
  sectors: endpoints.filter((endpoint) => endpoint.kind === "sector"),
  locations: endpoints.filter((endpoint) => endpoint.kind === "location")
};

type SearchOption =
  | { commandValue: string; id: string; type: "region"; label: string; detail: string; keywords: string[]; zone: Zone }
  | { commandValue: string; id: string; type: "location"; label: string; detail: string; keywords: string[]; zone: Zone };

const searchOptions: SearchOption[] = [
  ...regions.map((region) => ({
    commandValue: `region:${region.coord}`,
    id: region.coord,
    type: "region" as const,
    label: `${region.coord} - ${region.name}`,
    detail: `${region.zone} / ${region.slug}`,
    keywords: [region.coord, region.name, region.slug, region.zone, `r${region.slug.split("-r")[1]}`],
    zone: region.zone
  })),
  ...locations.map((location) => ({
    commandValue: `location-option:${location.id}`,
    id: endpointById.has(`location:${location.id}`) ? `location:${location.id}` : location.region,
    type: "location" as const,
    label: location.name,
    detail: [
      locationKindLabel[location.kind],
      location.sector ? `${location.region}.${location.sector}` : location.region,
      location.hidden ? "coordinates hidden" : location.details.coordinates,
      location.resources?.slice(0, 3).join(", ")
    ].filter(Boolean).join(" / "),
    keywords: [
      location.name,
      location.kind,
      location.region,
      location.zone,
      location.sector ?? "",
      location.resources?.join(" ") ?? ""
    ],
    zone: location.zone
  }))
];

const calculateRouteState = (state: AppState): AppState => {
  const route = findPath(state);
  return {
    ...state,
    route,
    routeInfo: describeRoute(state, route)
  };
};

const riskLabel = (state: AppState): string => {
  if (state.routeInfo.nulls) return `${state.routeInfo.nulls} NULL`;
  if (state.routeInfo.frontier) return `${state.routeInfo.frontier} FTR`;
  return "Clean";
};

const selectedRouteEndpoint = (selected: string): string | null => {
  if (endpointById.has(selected)) return selected;
  return byCoord.has(selected) ? `sector:${selected}:NW` : null;
};

const routeStepEndpoint = (step: RouteStep): string => {
  if (step.locationId && endpointById.has(`location:${step.locationId}`)) return `location:${step.locationId}`;
  if (step.sector && endpointById.has(`sector:${step.coord}:${step.sector}`)) return `sector:${step.coord}:${step.sector}`;
  return step.coord;
};

const regionMatches = (region: Region, query: string): boolean => {
  const haystack = `${region.coord} ${region.name} ${region.slug} ${region.zone} r${region.slug.split("-r")[1]}`.toLowerCase();
  return !query || haystack.includes(query);
};

const locationMatches = (location: MapLocation, query: string): boolean => {
  const haystack = `${location.name} ${location.kind} ${location.region} ${location.zone} ${location.resources?.join(" ") ?? ""}`.toLowerCase();
  return !query || haystack.includes(query);
};

function App() {
  const [state, setState] = useState(() => calculateRouteState(defaultState()));
  const [toast, setToast] = useState("NAVCOM online");
  const [toastVisible, setToastVisible] = useState(true);

  const showToast = (message: string): void => {
    setToast(message);
    setToastVisible(true);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setToastVisible(false), 1700);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patchState = (patch: Partial<AppState>): void => {
    setState((current) => calculateRouteState({ ...current, ...patch }));
  };

  const setRouteEndpoint = (kind: "origin" | "destination", coord: string): void => {
    const endpoint = endpointById.get(coord);
    patchState({ [kind]: coord, selected: endpoint?.id ?? coord });
    showToast(`${kind === "origin" ? "Origin" : "Destination"} locked: ${endpoint?.label ?? coord}`);
  };

  const setProfile = (profile: RouteProfile): void => {
    patchState({ profile });
    showToast(`${profiles[profile].label} armed`);
  };

  const resetNavcom = (): void => {
    setState(calculateRouteState(defaultState()));
    showToast("NAVCOM reset");
  };

  const selectSearchOption = (id: string): void => {
    const option = searchOptions.find((item) => item.id === id);
    patchState({ selected: id, search: option?.label ?? state.search });
    if (option) showToast(`${option.type === "region" ? "Region" : "Signal"} selected: ${option.label}`);
  };

  return (
    <>

      <main className="shell">
        <section className="viewport-wrap">
          <GalaxyMap
            state={state}
            patchState={patchState}
            toast={toast}
            toastVisible={toastVisible}
            onProfileChange={setProfile}
            onReset={resetNavcom}
            onSearchSelect={selectSearchOption}
            onSelect={(selected) => patchState({ selected })}
            onEndpoint={setRouteEndpoint}
          />
        </section>
      </main>
    </>
  );
}

interface StateProps {
  state: AppState;
  patchState: (patch: Partial<AppState>) => void;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Toggle({ label, checked, className = "", onChange, children }: { label: string; checked: boolean; className?: string; onChange: (checked: boolean) => void; children?: ReactNode }) {
  return (
    <label className={`chip ${className}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {children}
      {label}
    </label>
  );
}

function VectorDrawerIsland({
  state,
  patchState,
  open,
  onOpenChange,
  onEndpoint
}: StateProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEndpoint: (kind: "origin" | "destination", coord: string) => void;
}) {
  if (!open) {
    return (
      <button type="button" className="drawer-tab vertical" aria-label="Open vector setup" title="Vector setup" onClick={() => onOpenChange(true)}>
        <span>Vector</span>
      </button>
    );
  }

  return (
    <>
      <button type="button" className="drawer-close" aria-label="Collapse vector setup" title="Collapse vector setup" onClick={() => onOpenChange(false)}>Close</button>
      <JumpPlotter state={state} patchState={patchState} onEndpoint={onEndpoint} island />
    </>
  );
}

function SignalInspectorIsland({
  state,
  open,
  onOpenChange,
  onSelect,
  onEndpoint
}: {
  state: AppState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selected: string) => void;
  onEndpoint: (kind: "origin" | "destination", coord: string) => void;
}) {
  const selectedEndpoint = endpointById.get(state.selected);
  const selected = selectedEndpoint ? byCoord.get(selectedEndpoint.region) : byCoord.get(state.selected);
  const label = selectedEndpoint?.label ?? (selected ? `${selected.coord} - ${selected.name}` : state.selected);
  const zone = selected?.zone ?? "CORE";

  if (!open) {
    return (
      <button type="button" className={`drawer-tab vertical ${zoneClass[zone]}`} aria-label="Open signal inspector" title={label} onClick={() => onOpenChange(true)}>
        <span>Intel</span>
      </button>
    );
  }

  return (
    <>
      <button type="button" className="drawer-close" aria-label="Collapse signal inspector" title="Collapse signal inspector" onClick={() => onOpenChange(false)}>Close</button>
      <DetailsPanel state={state} onSelect={onSelect} onEndpoint={onEndpoint} island />
    </>
  );
}

function JumpPlotter({ state, patchState, onEndpoint, island = false }: StateProps & { onEndpoint: (kind: "origin" | "destination", coord: string) => void; island?: boolean }) {
  const setZone = (zone: Zone, checked: boolean): void => {
    const activeZones = new Set(state.activeZones);
    if (checked) activeZones.add(zone);
    else activeZones.delete(zone);
    patchState({ activeZones });
  };

  const selectedEndpoint = selectedRouteEndpoint(state.selected);

  const content = (
    <>
      <div className="panel-header">
        <h2>Jump Plotter</h2>
        <div className="panel-sub">{profiles[state.profile].help}</div>
      </div>
      <div className="panel-body">
        <div className="section-title">Vector Setup</div>
        <div className="row">
          <EndpointSelect label="Origin" value={state.origin} onChange={(origin) => patchState({ origin })} />
          <EndpointSelect label="Destination" value={state.destination} onChange={(destination) => patchState({ destination })} />
        </div>
        <div className="row">
          <label className="field">
            Warp Drive
            <select value={state.driveTier} onChange={(event) => patchState({ driveTier: Number(event.target.value) })}>
              <option value="1">T1 / Mk I: 1 hop</option>
              <option value="2">T2: 2 hops</option>
              <option value="3">T3: 3 hops</option>
              <option value="4">T4: 5 hops</option>
              <option value="5">T5: unlimited</option>
            </select>
          </label>
          <label className="field">
            Hull
            <select value={state.hull} onChange={(event) => patchState({ hull: event.target.value as HullClass })}>
              {hulls.map((hull) => <option key={hull} value={hull}>{hull}</option>)}
            </select>
          </label>
        </div>
        <div className="toggle-row">
          <Toggle label="GateNet" checked={state.useGates} onChange={(useGates) => patchState({ useGates })} />
          <Toggle label="Bypass NULL" checked={state.avoidNull} onChange={(avoidNull) => patchState({ avoidNull })} />
          <Toggle label="Use drive range" checked={state.useRange} onChange={(useRange) => patchState({ useRange })} />
        </div>
        <button type="button" className="wide" onClick={() => patchState({})}>Replot Course</button>

        <div className="section-title">Zone Bands</div>
        <div className="toggle-row">
          {zones.map((zone) => (
            <Toggle key={zone} label={zone} className={zoneClass[zone]} checked={state.activeZones.has(zone)} onChange={(checked) => setZone(zone, checked)}>
              <span className="dot"></span>
            </Toggle>
          ))}
        </div>

        <FuelBurn state={state} />

        {selectedEndpoint ? (
          <div className="action-row">
            <button type="button" onClick={() => onEndpoint("origin", selectedEndpoint)}>Set Origin</button>
            <button type="button" onClick={() => onEndpoint("destination", selectedEndpoint)}>Set Dest</button>
          </div>
        ) : null}
      </div>
    </>
  );

  if (island) return content;

  return (
    <aside className="panel left">
      {content}
    </aside>
  );
}

function EndpointSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <optgroup label="Sectors">
          {endpointGroups.sectors.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.label}</option>)}
        </optgroup>
        <optgroup label="Published locations">
          {endpointGroups.locations.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.label}</option>)}
        </optgroup>
      </select>
    </label>
  );
}

function FuelBurn({ state }: { state: AppState }) {
  const range = driveRanges[state.driveTier];
  const cost = state.route.length ? `${state.routeInfo.cells.toLocaleString()} Drive Cells` : "No path";

  return (
    <>
      <div className="section-title">Fuel Burn</div>
      <div className="readout">
        <strong>{cost}</strong>
        <div className="muted">
          {profiles[state.profile].label} / {state.routeInfo.hull} / {state.routeInfo.warpJumps} warp / {state.routeInfo.gateJumps} gates / {state.routeInfo.impulseSteps} impulse / ~{state.routeInfo.credits.toLocaleString()} cr
        </div>
        <div className="data-grid">
          <div>From</div><div>{endpointText(state.origin)}</div>
          <div>To</div><div>{endpointText(state.destination)}</div>
          <div>Drive</div><div>{state.driveTier === 5 || !state.useRange ? "Unlimited" : `T${state.driveTier}, ${range} region hop${range === 1 ? "" : "s"}`}</div>
          <div>Warp drop</div><div>Target sector center</div>
          <div>Fuel rate</div><div>{hullFuel[state.hull].toLocaleString()} cells / warp</div>
          <div>Impulse</div><div>{Math.round(state.routeInfo.impulseDistance).toLocaleString()} units</div>
        </div>
      </div>
    </>
  );
}

function GalaxyMap({
  state,
  patchState,
  toast,
  toastVisible,
  onProfileChange,
  onReset,
  onSearchSelect,
  onSelect,
  onEndpoint
}: {
  state: AppState;
  patchState: (patch: Partial<AppState>) => void;
  toast: string;
  toastVisible: boolean;
  onProfileChange: (profile: RouteProfile) => void;
  onReset: () => void;
  onSearchSelect: (selected: string) => void;
  onSelect: (selected: string) => void;
  onEndpoint: (kind: "origin" | "destination", coord: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<GalaxyViewport | null>(null);
  const [topConsoleHost, setTopConsoleHost] = useState<HTMLDivElement | null>(null);
  const [searchPopoverHost, setSearchPopoverHost] = useState<HTMLDivElement | null>(null);
  const [bottomRouteHost, setBottomRouteHost] = useState<HTMLDivElement | null>(null);
  const [layerDockHost, setLayerDockHost] = useState<HTMLDivElement | null>(null);
  const [leftVectorHost, setLeftVectorHost] = useState<HTMLDivElement | null>(null);
  const [rightInspectorHost, setRightInspectorHost] = useState<HTMLDivElement | null>(null);
  const [toastHost, setToastHost] = useState<HTMLDivElement | null>(null);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
  const [vectorDrawerOpen, setVectorDrawerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let disposed = false;
    let initialized = false;
    const viewport = new GalaxyViewport({
      root,
      onSelect,
      onSetOrigin: (coord) => onEndpoint("origin", coord),
      onSetDestination: (coord) => onEndpoint("destination", coord),
      onControlHost: (id, element) => {
        if (id === "top-console") setTopConsoleHost(element);
        if (id === "search-popover") setSearchPopoverHost(element);
        if (id === "bottom-route-command") setBottomRouteHost(element);
        if (id === "layer-dock") setLayerDockHost(element);
        if (id === "left-vector-drawer") setLeftVectorHost(element);
        if (id === "right-signal-inspector") setRightInspectorHost(element);
        if (id === "toast-console") setToastHost(element);
      }
    });
    viewportRef.current = viewport;
    viewport.init().then(() => {
      initialized = true;
      if (disposed) {
        viewport.destroy();
        return;
      }
      viewport.setState(state);
    }).catch((error: unknown) => {
      root.innerHTML = `<div class="readout"><strong>NAVCOM failed to boot</strong><div class="muted">${error instanceof Error ? error.message : String(error)}</div></div>`;
    });

    return () => {
      disposed = true;
      if (initialized) viewport.destroy();
      viewportRef.current = null;
      setTopConsoleHost(null);
      setSearchPopoverHost(null);
      setBottomRouteHost(null);
      setLayerDockHost(null);
      setLeftVectorHost(null);
      setRightInspectorHost(null);
      setToastHost(null);
    };
  }, []);

  useEffect(() => {
    viewportRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    viewportRef.current?.requestControlPaint();
  }, [
    state,
    toast,
    toastVisible,
    searchPopoverOpen,
    vectorDrawerOpen,
    inspectorOpen,
    topConsoleHost,
    searchPopoverHost,
    bottomRouteHost,
    layerDockHost,
    leftVectorHost,
    rightInspectorHost,
    toastHost
  ]);

  useEffect(() => {
    viewportRef.current?.setControlIslandExpanded("search-popover", searchPopoverOpen);
  }, [searchPopoverOpen, searchPopoverHost]);

  useEffect(() => {
    viewportRef.current?.setControlIslandExpanded("left-vector-drawer", vectorDrawerOpen);
  }, [vectorDrawerOpen, leftVectorHost]);

  useEffect(() => {
    viewportRef.current?.setControlIslandExpanded("right-signal-inspector", inspectorOpen);
  }, [inspectorOpen, rightInspectorHost]);

  return (
    <div ref={rootRef} className="galaxy-viewport" aria-label="Starbroken galaxy map">
      {topConsoleHost ? createPortal(
        <TopConsoleIsland
          state={state}
          onSearchChange={(search) => patchState({ search })}
          onSearchPreview={(selected) => patchState({ selected })}
          onSearchSelect={onSearchSelect}
          onSearchOpenChange={setSearchPopoverOpen}
          searchPopoverHost={searchPopoverHost}
        />,
        topConsoleHost
      ) : null}
      {bottomRouteHost ? createPortal(
        <BottomRouteIsland
          state={state}
          onProfileChange={onProfileChange}
          onReplot={() => patchState({})}
          onReset={onReset}
          onRouteStepSelect={(selected) => patchState({ selected })}
        />,
        bottomRouteHost
      ) : null}
      {layerDockHost ? createPortal(
        <LayerDockIsland state={state} patchState={patchState} />,
        layerDockHost
      ) : null}
      {leftVectorHost ? createPortal(
        <VectorDrawerIsland
          state={state}
          patchState={patchState}
          open={vectorDrawerOpen}
          onOpenChange={setVectorDrawerOpen}
          onEndpoint={onEndpoint}
        />,
        leftVectorHost
      ) : null}
      {rightInspectorHost ? createPortal(
        <SignalInspectorIsland
          state={state}
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          onSelect={(selected) => patchState({ selected })}
          onEndpoint={onEndpoint}
        />,
        rightInspectorHost
      ) : null}
      {toastHost ? createPortal(
        <ToastConsole message={toast} visible={toastVisible} />,
        toastHost
      ) : null}
    </div>
  );
}

function ToastConsole({ message, visible }: { message: string; visible: boolean }) {
  return <div className="toast-message" style={{ opacity: visible ? 1 : 0 }}>{message}</div>;
}

function TopConsoleIsland({
  state,
  onSearchChange,
  onSearchPreview,
  onSearchSelect,
  onSearchOpenChange,
  searchPopoverHost
}: {
  state: AppState;
  onSearchChange: (search: string) => void;
  onSearchPreview: (selected: string) => void;
  onSearchSelect: (selected: string) => void;
  onSearchOpenChange: (open: boolean) => void;
  searchPopoverHost: HTMLDivElement | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(searchOptions[0]?.commandValue ?? "");
  const optionByCommandValue = useMemo(() => new Map(searchOptions.map((option) => [option.commandValue, option])), []);
  const selected = endpointById.get(state.selected) ?? byCoord.get(state.selected);
  const selectedLabel = selected
    ? "label" in selected
      ? selected.label
      : `${selected.coord} - ${selected.name}`
    : state.selected;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !searchPopoverHost?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [searchPopoverHost]);

  useEffect(() => {
    onSearchOpenChange(open);
  }, [open, onSearchOpenChange]);

  const choose = (id: string): void => {
    onSearchSelect(id);
    setOpen(false);
  };

  const setActiveCommand = (commandValue: string): void => {
    setActiveValue(commandValue);
    const option = optionByCommandValue.get(commandValue);
    if (option) onSearchPreview(option.id);
  };

  return (
    <>
      <div>
        <div className="island-kicker">NAVCOM / {profiles[state.profile].label}</div>
        <div className="island-title">{endpointText(state.origin)} -&gt; {endpointText(state.destination)}</div>
        <div className={`island-status ${state.routeInfo.nulls ? "null" : state.routeInfo.frontier ? "frontier" : "core"}`}>
          <span>{riskLabel(state)}</span>
          <span>{state.route.length ? `${state.route.length - 1} steps` : "no route"}</span>
          <span>{selectedLabel}</span>
        </div>
      </div>
      <Command
        ref={rootRef}
        className="nav-command island-command"
        label="Signal scan"
        loop
        shouldFilter
        value={activeValue}
        onValueChange={setActiveCommand}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <label className="island-input">
          <span>Scan</span>
          <Command.Input
            value={state.search}
            onValueChange={(search) => {
              onSearchChange(search);
              setOpen(true);
            }}
            placeholder="A1, Halcyon, NULL..."
            autoComplete="off"
            onFocus={() => setOpen(true)}
          />
        </label>
        {open && searchPopoverHost ? createPortal(
          <Command.List className="nav-command-list island-command-list">
            <Command.Empty className="nav-command-empty">No matches.</Command.Empty>
            <Command.Group heading="Regions">
              {searchOptions.filter((option) => option.type === "region").map((option) => (
                <SearchCommandItem key={option.commandValue} option={option} onChoose={choose} />
              ))}
            </Command.Group>
            <Command.Group heading="Signals">
              {searchOptions.filter((option) => option.type === "location").map((option) => (
                <SearchCommandItem key={option.commandValue} option={option} onChoose={choose} />
              ))}
            </Command.Group>
          </Command.List>,
          searchPopoverHost
        ) : null}
      </Command>
    </>
  );
}

function SearchCommandItem({ option, onChoose }: { option: SearchOption; onChoose: (id: string) => void }) {
  return (
    <Command.Item
      value={option.commandValue}
      keywords={option.keywords}
      onClick={() => onChoose(option.id)}
      onMouseDown={(event) => {
        event.preventDefault();
        onChoose(option.id);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        onChoose(option.id);
      }}
      onSelect={() => onChoose(option.id)}
      className="nav-command-item"
    >
      <b>{option.label}</b>
      <span><span style={{ color: zoneCss[option.zone] }}>{option.zone}</span> / {option.detail}</span>
    </Command.Item>
  );
}

function BottomRouteIsland({
  state,
  onProfileChange,
  onReplot,
  onReset,
  onRouteStepSelect
}: {
  state: AppState;
  onProfileChange: (profile: RouteProfile) => void;
  onReplot: () => void;
  onReset: () => void;
  onRouteStepSelect: (selected: string) => void;
}) {
  return (
    <>
      <div className="route-island-main">
        <div>
          <div className="island-kicker">Route Command</div>
          <div className="island-title">{endpointText(state.origin)} -&gt; {endpointText(state.destination)}</div>
        </div>
        <div className={`route-island-risk ${state.routeInfo.nulls ? "null" : state.routeInfo.frontier ? "frontier" : "core"}`}>
          <b>{riskLabel(state)}</b>
          <span>Exposure</span>
        </div>
      </div>
      <div className="route-island-metrics">
        <Metric label="Steps" value={state.route.length ? String(state.route.length - 1) : "--"} />
        <Metric label="Cells" value={state.routeInfo.cells.toLocaleString()} />
        <Metric label="Gates" value={String(state.routeInfo.gateJumps)} />
        <div className="route-island-actions">
          <select value={state.profile} aria-label="Route profile" onChange={(event) => onProfileChange(event.target.value as RouteProfile)}>
            {routeProfiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}
          </select>
          <button type="button" onClick={onReplot}>Replot</button>
          <button type="button" onClick={onReset}>Reset</button>
        </div>
      </div>
      <RouteTimeline state={state} onSelect={onRouteStepSelect} />
    </>
  );
}

function RouteTimeline({ state, onSelect }: { state: AppState; onSelect: (selected: string) => void }) {
  if (!state.route.length) {
    return <div className="route-timeline empty">No route solution</div>;
  }

  return (
    <div className="route-timeline" aria-label="Route timeline">
      {state.route.map((step, index) => {
        const region = byCoord.get(step.coord);
        const zone = region?.zone ?? "CORE";
        const label = step.sector ? `${step.coord}.${step.sector}` : step.coord;
        const selected = routeStepEndpoint(step);
        return (
          <button
            key={`${step.id}-${index}`}
            type="button"
            className={`route-timeline-step ${zoneClass[zone]}`}
            title={`${index + 1}: ${label} / ${step.label}`}
            onMouseEnter={() => onSelect(selected)}
            onFocus={() => onSelect(selected)}
            onClick={() => onSelect(selected)}
          >
            <span>{index + 1}</span>
            <b>{label}</b>
          </button>
        );
      })}
    </div>
  );
}

function LayerDockIsland({ state, patchState }: StateProps) {
  const setLayer = (key: keyof AppState["layers"], value: boolean): void => {
    patchState({ layers: { ...state.layers, [key]: value } });
  };

  const dockLayers: Array<[keyof AppState["layers"], string]> = [
    ["gates", "Gates"],
    ["threat", "Threat"],
    ["rifts", "Rifts"],
    ["range", "Range"],
    ["labels", "Labels"]
  ];

  return (
    <>
      <div className="island-kicker">Layers</div>
      <div className="layer-dock-buttons">
        {dockLayers.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={state.layers[key] ? "active" : ""}
            aria-pressed={state.layers[key]}
            aria-label={label}
            title={label}
            onClick={() => setLayer(key, !state.layers[key])}
          >
            {label.slice(0, 2)}
          </button>
        ))}
      </div>
    </>
  );
}

function DetailsPanel({ state, onSelect, onEndpoint, island = false }: { state: AppState; onSelect: (selected: string) => void; onEndpoint: (kind: "origin" | "destination", coord: string) => void; island?: boolean }) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("intel");
  const selectedEndpoint = endpointById.get(state.selected);
  const selected = selectedEndpoint ? byCoord.get(selectedEndpoint.region) : byCoord.get(state.selected);
  const stats = useMemo(() => {
    const counts: Record<Zone, number> = { CORE: 0, MID: 0, FRONTIER: 0, NULL: 0 };
    for (const region of regions) counts[region.zone] += 1;
    return counts;
  }, []);

  if (!selected) return null;

  const selectedLocation = selectedEndpoint?.locationId ? locations.find((location) => location.id === selectedEndpoint.locationId) : undefined;
  const selectedSector = selectedEndpoint ? selected.sectors.find((sector) => sector.id === selectedEndpoint.sector) : undefined;
  const gateCount = gatesByCoord.get(selected.coord)?.length ?? 0;
  const regionLocations = locationsByCoord.get(selected.coord) ?? [];
  const published = regionLocations.filter((location) => !location.hidden).length;
  const hidden = regionLocations.length - published;
  const detailTitle = selectedLocation
    ? selectedLocation.name
    : selectedSector
      ? `${selected.coord}.${selectedSector.id} - ${selected.name}`
      : `${selected.coord} - ${selected.name}`;
  const detailSub = selectedLocation
    ? `${locationKindLabel[selectedLocation.kind]} / ${selected.coord}.${selectedLocation.sector ?? selectedEndpoint?.sector ?? "--"} / ${selected.zone}`
    : selectedSector
      ? `Sector / ${selected.zone} / ${selected.slug}`
      : `${selected.zone} / ${selected.slug}`;
  const selectedEndpointId = selectedRouteEndpoint(state.selected);

  const content = (
    <>
      <div className="panel-header">
        <h2>{detailTitle}</h2>
        <div className="panel-sub">{detailSub}</div>
      </div>
      <div className="panel-body">
        <div className="inspector-tabs" role="tablist" aria-label="Inspector sections">
          {inspectorTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeTab === "intel" ? (
          <div className={`readout ${zoneClass[selected.zone]}`}>
            {selectedLocation ? (
              <LocationDetails location={selectedLocation} selected={selected} endpoint={selectedEndpoint} />
            ) : selectedSector ? (
              <SectorDetails selected={selected} sector={selectedSector} gateCount={gateCount} published={published} hidden={hidden} />
            ) : (
              <RegionDetails selected={selected} gateCount={gateCount} published={published} hidden={hidden} />
            )}
            {selectedEndpointId ? (
              <div className="action-row">
                <button type="button" onClick={() => onEndpoint("origin", selectedEndpointId)}>Set Origin</button>
                <button type="button" onClick={() => onEndpoint("destination", selectedEndpointId)}>Set Dest</button>
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab === "route" ? (
          <div className="readout">
            <strong>{endpointText(state.origin)} -&gt; {endpointText(state.destination)}</strong>
            <div className="muted">{profiles[state.profile].label} / {riskLabel(state)} / {state.route.length ? `${state.route.length - 1} steps` : "no route"}</div>
            <div className="data-grid">
              <div>Cells</div><div>{state.routeInfo.cells.toLocaleString()}</div>
              <div>Gates</div><div>{state.routeInfo.gateJumps}</div>
              <div>Warp</div><div>{state.routeInfo.warpJumps}</div>
              <div>Impulse</div><div>{state.routeInfo.impulseSteps}</div>
              <div>Credits</div><div>{state.routeInfo.credits.toLocaleString()}</div>
            </div>
          </div>
        ) : null}
        {activeTab === "links" ? (
          <>
            <div className="section-title">GateNet Links</div>
            <div className="list"><GateList selected={selected} onSelect={onSelect} /></div>
            <div className="section-title">Adjacent Signals</div>
            <div className="list"><NearbyList selected={selected} onSelect={onSelect} /></div>
            <div className="section-title">Search Results</div>
            <SearchResults state={state} onSelect={onSelect} />
          </>
        ) : null}
        {activeTab === "raw" ? (
          <>
            <div className="section-title">Zone Index</div>
            <div className="statline">
              {zones.map((zone) => (
                <div key={zone} className={`stat ${zoneClass[zone]}`}>
                  <b style={{ color: "var(--zone)" }}>{stats[zone]}</b>
                  <span>{zone}</span>
                </div>
              ))}
            </div>
            <div className="section-title">Raw Counts</div>
            <div className="data-grid">
              <div>Slug</div><div>{selected.slug}</div>
              <div>Published</div><div>{published}</div>
              <div>Hidden</div><div>{hidden}</div>
              <div>Gates</div><div>{gateCount}</div>
              <div>Bounds</div><div>x {selected.xMin.toLocaleString()}-{selected.xMax.toLocaleString()}, z {selected.zMin.toLocaleString()}-{selected.zMax.toLocaleString()}</div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );

  if (island) return content;

  return (
    <aside className="panel right">
      {content}
    </aside>
  );
}

function RegionDetails({ selected, gateCount, published, hidden }: { selected: Region; gateCount: number; published: number; hidden: number }) {
  return (
    <>
      <strong style={{ color: "var(--zone)" }}>{selected.security}</strong>
      <div className="muted">{zoneMeaning(selected.zone)}</div>
      <div className="data-grid">
        <div>Region</div><div>{selected.coord}</div>
        <div>Range</div><div>x {selected.xMin.toLocaleString()}-{selected.xMax.toLocaleString()}, z {selected.zMin.toLocaleString()}-{selected.zMax.toLocaleString()}</div>
        <div>Sectors</div><div>{selected.sectors.map((sector) => <div key={sector.id}>{sector.id}: {sector.centerX.toLocaleString()}, {sector.centerZ.toLocaleString()}</div>)}</div>
        <div>Gates</div><div>{gateCount}</div>
        <div>Locations</div><div>{published}{hidden ? ` published / ${hidden} hidden` : ""}</div>
      </div>
    </>
  );
}

function SectorDetails({ selected, sector, gateCount, published, hidden }: { selected: Region; sector: Region["sectors"][number]; gateCount: number; published: number; hidden: number }) {
  return (
    <>
      <strong style={{ color: "var(--zone)" }}>{selected.security}</strong>
      <div className="muted">{zoneMeaning(selected.zone)}</div>
      <div className="data-grid">
        <div>Sector</div><div>{selected.coord}.{sector.id}</div>
        <div>Center</div><div>x {sector.centerX.toLocaleString()}, z {sector.centerZ.toLocaleString()}</div>
        <div>Range</div><div>x {sector.xMin.toLocaleString()}-{sector.xMax.toLocaleString()}, z {sector.zMin.toLocaleString()}-{sector.zMax.toLocaleString()}</div>
        <div>Region</div><div>{selected.coord} - {selected.name}</div>
        <div>Gates</div><div>{gateCount}</div>
        <div>Locations</div><div>{published}{hidden ? ` published / ${hidden} hidden` : ""}</div>
      </div>
    </>
  );
}

function LocationDetails({ location, selected, endpoint }: { location: MapLocation; selected: Region; endpoint?: Endpoint }) {
  const rawRows: Array<[string, string | undefined]> = [
    ["Kind", locationKindLabel[location.kind]],
    ["Region", `${selected.coord} - ${selected.name}`],
    ["Sector", `${selected.coord}.${location.sector ?? endpoint?.sector ?? "--"}`],
    ["Coordinates", location.x !== null && location.z !== null ? `x ${location.x.toLocaleString()}, z ${location.z.toLocaleString()}` : location.details.coordinates],
    ["Radius", location.radius?.toLocaleString()],
    ["Density", location.density?.toLocaleString()],
    ["Resources", location.resources?.join(", ")],
    ["Links", location.linksTo],
    ...Object.entries(location.details)
      .filter(([key]) => key !== "coordinates")
      .map(([key, value]) => [key.replace(/_/g, " "), value] as [string, string])
  ];
  const rows = rawRows.filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <>
      <strong style={{ color: "var(--zone)" }}>{locationKindLabel[location.kind]}</strong>
      <div className="muted">{zoneMeaning(selected.zone)}</div>
      <div className="data-grid">
        {rows.map(([label, value]) => (
          <FragmentRow key={`${label}-${value}`} label={label} value={value} />
        ))}
      </div>
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div>{label}</div>
      <div>{value}</div>
    </>
  );
}

function GateList({ selected, onSelect }: { selected: Region; onSelect: (selected: string) => void }) {
  const list = gatesByCoord.get(selected.coord) ?? [];
  if (!list.length) return <div className="muted">No gate endpoint in this region.</div>;

  return (
    <>
      {list.map((gate) => {
        const paired = pairedGateById.get(gate.id);
        const otherRegion = paired ? byCoord.get(paired.region) : null;
        const detail = paired
          ? `${gate.name} (${gate.sector}) -> ${paired.name} (${paired.region}.${paired.sector})`
          : `${gate.name} (${gate.sector})`;
        return otherRegion ? (
          <RegionItem key={gate.id} region={otherRegion} detail={detail} onSelect={onSelect} />
        ) : (
          <LocationItem key={gate.id} location={gate} onSelect={onSelect} />
        );
      })}
    </>
  );
}

function NearbyList({ selected, onSelect }: { selected: Region; onSelect: (selected: string) => void }) {
  const list = [...(locationsByCoord.get(selected.coord) ?? [])]
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  if (!list.length) return <div className="muted">No published signals in this region.</div>;
  return <>{list.map((location) => <LocationItem key={location.id} location={location} onSelect={onSelect} />)}</>;
}

function SearchResults({ state, onSelect }: { state: AppState; onSelect: (selected: string) => void }) {
  const query = state.search.trim().toLowerCase();
  const regionHits = regions
    .filter((region) => state.activeZones.has(region.zone) && regionMatches(region, query))
    .slice(0, 5)
    .map((region) => ({ type: "region" as const, region, detail: `${region.zone} / ${region.slug}` }));
  const locationHits = locations
    .filter((location) => state.activeZones.has(location.zone) && locationMatches(location, query))
    .slice(0, 7)
    .map((location) => ({ type: "location" as const, location }));
  const hits = [...regionHits, ...locationHits].slice(0, 10);

  if (!hits.length) return <div className="muted">No matches.</div>;

  return (
    <div className="list">
      {hits.map((hit) => hit.type === "region"
        ? <RegionItem key={hit.region.coord} region={hit.region} detail={hit.detail} onSelect={onSelect} />
        : <LocationItem key={hit.location.id} location={hit.location} onSelect={onSelect} />)}
    </div>
  );
}

function RegionItem({ region, detail, onSelect }: { region: Region; detail: string; onSelect: (selected: string) => void }) {
  return (
    <button type="button" className="item" onClick={() => onSelect(region.coord)}>
      <b>{region.coord} - {region.name}</b>
      <div className="muted"><span style={{ color: zoneCss[region.zone] }}>{region.zone}</span> / {detail}</div>
    </button>
  );
}

function LocationItem({ location, onSelect }: { location: MapLocation; onSelect: (selected: string) => void }) {
  const region = byCoord.get(location.region);
  const endpointId = `location:${location.id}`;
  const selected = endpointById.has(endpointId) ? endpointId : location.region;
  const details = [
    locationKindLabel[location.kind],
    location.sector ? `${location.region}.${location.sector}` : location.region,
    location.hidden ? "coordinates hidden" : location.details.coordinates,
    location.resources?.slice(0, 3).join(", ")
  ].filter(Boolean).join(" / ");

  return (
    <button type="button" className="item" onClick={() => onSelect(selected)}>
      <b>{location.name}</b>
      <div className="muted"><span style={{ color: zoneCss[location.zone] }}>{region?.zone ?? location.zone}</span> / {details}</div>
    </button>
  );
}

export default App;
