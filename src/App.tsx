import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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

type SearchOption =
  | { commandValue: string; id: string; type: "region"; label: string; detail: string; keywords: string[]; zone: Zone }
  | { commandValue: string; id: string; type: "location"; label: string; detail: string; keywords: string[]; zone: Zone };

const endpointGroups = {
  sectors: endpoints.filter((endpoint) => endpoint.kind === "sector"),
  locations: endpoints.filter((endpoint) => endpoint.kind === "location")
};

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

  const selectSearchOption = (id: string): void => {
    const option = searchOptions.find((item) => item.id === id);
    patchState({ selected: id, search: option?.label ?? state.search });
    if (option) showToast(`${option.type === "region" ? "Region" : "Signal"} selected: ${option.label}`);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">NAV</div>
          <div>
            <h1>STARBROKEN // NAVCOM</h1>
            <div className="subtitle">Jump plotting / gate lanes / threat overlays</div>
          </div>
        </div>

        <nav className="profiles" aria-label="Route profile">
          {routeProfiles.map((profile) => (
            <button key={profile} className={`profile ${state.profile === profile ? "active" : ""}`} type="button" onClick={() => setProfile(profile)}>
              {profile}
            </button>
          ))}
        </nav>

        <div className="searchbox">
          <NavSearch
            value={state.search}
            onValueChange={(search) => patchState({ search })}
            onActiveChange={(selected) => patchState({ selected })}
            onSelect={selectSearchOption}
          />
          <button
            id="reset"
            type="button"
            onClick={() => {
              setState(calculateRouteState(defaultState()));
              showToast("NAVCOM reset");
            }}
          >
            Reset
          </button>
        </div>
      </header>

      <RouteStrip state={state} patchState={patchState} />

      <main className="shell">
        <JumpPlotter state={state} patchState={patchState} onSelect={patchState} onEndpoint={setRouteEndpoint} />
        <section className="viewport-wrap">
          <GalaxyMap state={state} onSelect={(selected) => patchState({ selected })} onEndpoint={setRouteEndpoint} />
          <div className="toast" style={{ opacity: toastVisible ? 1 : 0 }}>{toast}</div>
        </section>
        <DetailsPanel state={state} onSelect={(selected) => patchState({ selected })} onEndpoint={setRouteEndpoint} />
      </main>
    </>
  );
}

function NavSearch({
  value,
  onValueChange,
  onActiveChange,
  onSelect
}: {
  value: string;
  onValueChange: (value: string) => void;
  onActiveChange: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(searchOptions[0]?.commandValue ?? "");
  const optionByCommandValue = useMemo(() => new Map(searchOptions.map((option) => [option.commandValue, option])), []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const choose = (id: string): void => {
    onSelect(id);
    setOpen(false);
  };

  const setActiveCommand = (commandValue: string): void => {
    setActiveValue(commandValue);
    const option = optionByCommandValue.get(commandValue);
    if (option) onActiveChange(option.id);
  };

  return (
    <Command
      ref={rootRef}
      className="nav-command"
      label="Galaxy search"
      loop
      shouldFilter
      value={activeValue}
      onValueChange={setActiveCommand}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <Command.Input
        value={value}
        onValueChange={(search) => {
          onValueChange(search);
          setOpen(true);
        }}
        placeholder="Find A1, Halcyon, NULL, r63..."
        autoComplete="off"
        onFocus={() => setOpen(true)}
      />
      {open ? (
        <Command.List className="nav-command-list">
          <Command.Empty className="nav-command-empty">No matches.</Command.Empty>
          <Command.Group heading="Regions">
            {searchOptions.filter((option) => option.type === "region").map((option) => (
              <Command.Item
                key={option.commandValue}
                value={option.commandValue}
                keywords={option.keywords}
                onClick={() => choose(option.id)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option.id);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option.id);
                }}
                onSelect={() => choose(option.id)}
                className="nav-command-item"
              >
                <b>{option.label}</b>
                <span><span style={{ color: zoneCss[option.zone] }}>{option.zone}</span> / {option.detail}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Signals">
            {searchOptions.filter((option) => option.type === "location").map((option) => (
              <Command.Item
                key={option.commandValue}
                value={option.commandValue}
                keywords={option.keywords}
                onClick={() => choose(option.id)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option.id);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option.id);
                }}
                onSelect={() => choose(option.id)}
                className="nav-command-item"
              >
                <b>{option.label}</b>
                <span><span style={{ color: zoneCss[option.zone] }}>{option.zone}</span> / {option.detail}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      ) : null}
    </Command>
  );
}

interface StateProps {
  state: AppState;
  patchState: (patch: Partial<AppState>) => void;
}

function RouteStrip({ state, patchState }: StateProps) {
  const setLayer = (key: keyof AppState["layers"], value: boolean): void => {
    patchState({ layers: { ...state.layers, [key]: value } });
  };

  return (
    <section className="route-strip" aria-label="Current route">
      <div className="route-command">
        <div className="route-kicker">{profiles[state.profile].label}</div>
        <div className="route-main">
          {endpointText(state.origin)} <span>-&gt;</span> {endpointText(state.destination)}
        </div>
      </div>
      <div className="route-metrics">
        <Metric label="Steps" value={state.route.length ? String(state.route.length - 1) : "--"} />
        <Metric label="Cells" value={state.routeInfo.cells.toLocaleString()} />
        <Metric label="Gates" value={String(state.routeInfo.gateJumps)} />
        <div className={`metric ${state.routeInfo.nulls ? "null" : state.routeInfo.frontier ? "frontier" : "core"}`}>
          <b style={{ color: "var(--zone)" }}>{riskLabel(state)}</b>
          <span>Risk</span>
        </div>
      </div>
      <div className="layer-controls" aria-label="Map layers">
        <Toggle label="Gates" checked={state.layers.gates} onChange={(checked) => setLayer("gates", checked)} />
        <Toggle label="Threat" checked={state.layers.threat} onChange={(checked) => setLayer("threat", checked)} />
        <Toggle label="Rifts" checked={state.layers.rifts} onChange={(checked) => setLayer("rifts", checked)} />
        <Toggle label="Range" checked={state.layers.range} onChange={(checked) => setLayer("range", checked)} />
        <Toggle label="Labels" checked={state.layers.labels} onChange={(checked) => setLayer("labels", checked)} />
      </div>
    </section>
  );
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

function JumpPlotter({ state, patchState, onEndpoint }: StateProps & { onSelect: (patch: Partial<AppState>) => void; onEndpoint: (kind: "origin" | "destination", coord: string) => void }) {
  const setZone = (zone: Zone, checked: boolean): void => {
    const activeZones = new Set(state.activeZones);
    if (checked) activeZones.add(zone);
    else activeZones.delete(zone);
    patchState({ activeZones });
  };

  const selectedEndpoint = selectedRouteEndpoint(state.selected);

  return (
    <aside className="panel left">
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

        <div className="section-title">Jump Sequence</div>
        <div className="list">
          {state.route.length ? state.route.map((step, index) => (
            <RouteStepCard key={`${step.id}-${index}`} step={step} index={index} onSelect={(selected) => patchState({ selected })} />
          )) : (
            <div className="readout">
              <strong>No route found</strong>
              <div className="muted">Try allowing gates, increasing drive tier, or disabling Bypass NULL.</div>
            </div>
          )}
        </div>

        {selectedEndpoint ? (
          <div className="action-row">
            <button type="button" onClick={() => onEndpoint("origin", selectedEndpoint)}>Set Origin</button>
            <button type="button" onClick={() => onEndpoint("destination", selectedEndpoint)}>Set Dest</button>
          </div>
        ) : null}
      </div>
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

function RouteStepCard({ step, index, onSelect }: { step: RouteStep; index: number; onSelect: (selected: string) => void }) {
  const region = byCoord.get(step.coord);
  if (!region) return null;
  const location = step.locationId ? locations.find((item) => item.id === step.locationId) : undefined;
  const title = location ? `${location.name} (${region.coord}.${step.sector})` : `${region.coord}.${step.sector ?? "--"} - ${region.name}`;
  const endpointId = location && endpointById.has(`location:${location.id}`)
    ? `location:${location.id}`
    : step.sector && endpointById.has(`sector:${region.coord}:${step.sector}`)
      ? `sector:${region.coord}:${step.sector}`
      : region.coord;

  return (
    <button type="button" className="route-step" onClick={() => onSelect(endpointId)}>
      <div className="stepnum">{index + 1}</div>
      <div>
        <b>{title}</b>
        <div className="muted"><span style={{ color: zoneCss[region.zone] }}>{region.zone}</span> / {step.label}</div>
      </div>
    </button>
  );
}

function GalaxyMap({ state, onSelect, onEndpoint }: { state: AppState; onSelect: (selected: string) => void; onEndpoint: (kind: "origin" | "destination", coord: string) => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<GalaxyViewport | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let disposed = false;
    let initialized = false;
    const viewport = new GalaxyViewport({
      root,
      onSelect,
      onSetOrigin: (coord) => onEndpoint("origin", coord),
      onSetDestination: (coord) => onEndpoint("destination", coord)
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
    };
  }, []);

  useEffect(() => {
    viewportRef.current?.setState(state);
  }, [state]);

  return <div ref={rootRef} className="galaxy-viewport" aria-label="Starbroken galaxy map"></div>;
}

function DetailsPanel({ state, onSelect, onEndpoint }: { state: AppState; onSelect: (selected: string) => void; onEndpoint: (kind: "origin" | "destination", coord: string) => void }) {
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

  return (
    <aside className="panel right">
      <div className="panel-header">
        <h2>{detailTitle}</h2>
        <div className="panel-sub">{detailSub}</div>
      </div>
      <div className="panel-body">
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
        <div className="section-title">Zone Index</div>
        <div className="statline">
          {zones.map((zone) => (
            <div key={zone} className={`stat ${zoneClass[zone]}`}>
              <b style={{ color: "var(--zone)" }}>{stats[zone]}</b>
              <span>{zone}</span>
            </div>
          ))}
        </div>
        <div className="section-title">GateNet Links</div>
        <div className="list"><GateList selected={selected} onSelect={onSelect} /></div>
        <div className="section-title">Adjacent Signals</div>
        <div className="list"><NearbyList selected={selected} onSelect={onSelect} /></div>
        <div className="section-title">Search Results</div>
        <SearchResults state={state} onSelect={onSelect} />
      </div>
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
