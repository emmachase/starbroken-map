import { byCoord, driveRanges, endpointById, endpoints, gatesByCoord, hullFuel, locations, locationsByCoord, pairedGateById, profiles, regions, zoneClass, zoneCss } from "../data/galaxy";
import type { AppState, Endpoint, HullClass, MapLocation, Region, Zone } from "../types";

export const qs = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node;
};

export const qsa = <T extends Element>(selector: string): T[] => Array.from(document.querySelectorAll<T>(selector));

const endpointText = (id: string): string => endpointById.get(id)?.label ?? id;

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;");

const locationKindLabel: Record<MapLocation["kind"], string> = {
  station: "Station",
  planet: "Planet",
  belt: "Belt",
  gate: "Gate",
  wreck: "Wreck",
  system: "System"
};

const option = (endpoint: Endpoint): string => `<option value="${endpoint.id}">${escapeHtml(endpoint.label)}</option>`;

export const populateSelects = (state: AppState): void => {
  const sectorOptions = endpoints.filter((endpoint) => endpoint.kind === "sector").map(option).join("");
  const locationOptions = endpoints.filter((endpoint) => endpoint.kind === "location").map(option).join("");
  const options = `
    <optgroup label="Sectors">${sectorOptions}</optgroup>
    <optgroup label="Published locations">${locationOptions}</optgroup>
  `;
  qs<HTMLSelectElement>("#origin").innerHTML = options;
  qs<HTMLSelectElement>("#destination").innerHTML = options;
  qs<HTMLSelectElement>("#origin").value = state.origin;
  qs<HTMLSelectElement>("#destination").value = state.destination;
  qs<HTMLSelectElement>("#driveTier").value = String(state.driveTier);
  qs<HTMLSelectElement>("#hullClass").value = state.hull;
};

export const syncControls = (state: AppState): void => {
  qs<HTMLSelectElement>("#origin").value = state.origin;
  qs<HTMLSelectElement>("#destination").value = state.destination;
  qs<HTMLSelectElement>("#driveTier").value = String(state.driveTier);
  qs<HTMLSelectElement>("#hullClass").value = state.hull;
  qs<HTMLInputElement>("#useGates").checked = state.useGates;
  qs<HTMLInputElement>("#avoidNull").checked = state.avoidNull;
  qs<HTMLInputElement>("#useRange").checked = state.useRange;
  qs<HTMLInputElement>("#search").value = state.search;
  qs<HTMLInputElement>("#layerGates").checked = state.layers.gates;
  qs<HTMLInputElement>("#layerRifts").checked = state.layers.rifts;
  qs<HTMLInputElement>("#layerRange").checked = state.layers.range;
  qs<HTMLInputElement>("#layerLabels").checked = state.layers.labels;

  for (const button of qsa<HTMLButtonElement>(".profile")) {
    button.classList.toggle("active", button.dataset.profile === state.profile);
  }

  for (const input of qsa<HTMLInputElement>(".zoneFilter")) {
    input.checked = state.activeZones.has(input.value as Zone);
  }
};

export const readControlState = (state: AppState): void => {
  state.origin = qs<HTMLSelectElement>("#origin").value;
  state.destination = qs<HTMLSelectElement>("#destination").value;
  state.driveTier = Number(qs<HTMLSelectElement>("#driveTier").value);
  state.hull = qs<HTMLSelectElement>("#hullClass").value as HullClass;
  state.useGates = qs<HTMLInputElement>("#useGates").checked;
  state.avoidNull = qs<HTMLInputElement>("#avoidNull").checked;
  state.useRange = qs<HTMLInputElement>("#useRange").checked;
  state.search = qs<HTMLInputElement>("#search").value;
  state.layers.gates = qs<HTMLInputElement>("#layerGates").checked;
  state.layers.rifts = qs<HTMLInputElement>("#layerRifts").checked;
  state.layers.range = qs<HTMLInputElement>("#layerRange").checked;
  state.layers.labels = qs<HTMLInputElement>("#layerLabels").checked;
  state.activeZones = new Set(qsa<HTMLInputElement>(".zoneFilter:checked").map((input) => input.value as Zone));
};

export const renderRouteStrip = (state: AppState): void => {
  qs("#routeProfileLabel").textContent = profiles[state.profile].label;
  qs("#routeHeadline").innerHTML = `${escapeHtml(endpointText(state.origin))} <span>-></span> ${escapeHtml(endpointText(state.destination))}`;
  qs("#profileHelp").textContent = profiles[state.profile].help;
  qs("#routeMetrics").innerHTML = `
    <div class="metric"><b>${state.route.length ? state.route.length - 1 : "--"}</b><span>Steps</span></div>
    <div class="metric"><b>${state.routeInfo.cells.toLocaleString()}</b><span>Cells</span></div>
    <div class="metric"><b>${state.routeInfo.gateJumps}</b><span>Gates</span></div>
    <div class="metric ${state.routeInfo.nulls ? "null" : state.routeInfo.frontier ? "frontier" : "core"}"><b style="color:var(--zone)">${riskLabel(state)}</b><span>Risk</span></div>
  `;
};

export const renderRoutePanel = (state: AppState): void => {
  const range = driveRanges[state.driveTier];
  const cost = state.route.length ? `${state.routeInfo.cells.toLocaleString()} Drive Cells` : "No path";
  qs("#costReadout").innerHTML = `
    <strong>${cost}</strong>
    <div class="muted">${profiles[state.profile].label} / ${state.routeInfo.hull} / ${state.routeInfo.warpJumps} warp / ${state.routeInfo.gateJumps} gates / ${state.routeInfo.impulseSteps} impulse / ~${state.routeInfo.credits.toLocaleString()} cr</div>
    <div class="data-grid">
      <div>From</div><div>${escapeHtml(endpointText(state.origin))}</div>
      <div>To</div><div>${escapeHtml(endpointText(state.destination))}</div>
      <div>Drive</div><div>${state.driveTier === 5 || !state.useRange ? "Unlimited" : `T${state.driveTier}, ${range} region hop${range === 1 ? "" : "s"}`}</div>
      <div>Warp drop</div><div>Target sector center</div>
      <div>Fuel rate</div><div>${hullFuel[state.hull].toLocaleString()} cells / warp</div>
      <div>Impulse</div><div>${Math.round(state.routeInfo.impulseDistance).toLocaleString()} units</div>
    </div>
  `;

  qs("#routeSteps").innerHTML = state.route.length
    ? state.route.map((step, index) => {
      const region = byCoord.get(step.coord);
      if (!region) return "";
      const location = step.locationId ? locations.find((item) => item.id === step.locationId) : undefined;
      const title = location ? `${location.name} (${region.coord}.${step.sector})` : `${region.coord}.${step.sector ?? "--"} - ${region.name}`;
      const endpointId = location && endpointById.has(`location:${location.id}`)
        ? `location:${location.id}`
        : step.sector && endpointById.has(`sector:${region.coord}:${step.sector}`)
          ? `sector:${region.coord}:${step.sector}`
          : "";
      return `
        <div class="route-step" data-coord="${region.coord}" ${endpointId ? `data-endpoint="${endpointId}"` : ""}>
          <div class="stepnum">${index + 1}</div>
          <div>
            <b>${escapeHtml(title)}</b>
            <div class="muted"><span style="color:${zoneCss[region.zone]}">${region.zone}</span> / ${escapeHtml(step.label)}</div>
          </div>
        </div>`;
    }).join("")
    : `<div class="readout"><strong>No route found</strong><div class="muted">Try allowing gates, increasing drive tier, or disabling Bypass NULL.</div></div>`;
};

export const renderDetails = (state: AppState): void => {
  const selectedEndpoint = endpointById.get(state.selected);
  const selected = selectedEndpoint ? byCoord.get(selectedEndpoint.region) : byCoord.get(state.selected);
  if (!selected) return;
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

  qs("#detailTitle").textContent = detailTitle;
  qs("#detailSub").textContent = detailSub;
  const badge = qs<HTMLElement>("#detailBadge");
  badge.className = `readout ${zoneClass[selected.zone]}`;
  badge.innerHTML = selectedLocation
    ? locationDetailHtml(selectedLocation, selected, selectedEndpoint)
    : selectedSector
      ? sectorDetailHtml(selected, selectedSector, gateCount, published, hidden)
      : regionDetailHtml(selected, gateCount, published, hidden);

  renderStats();
  renderGates(selected);
  renderRegionLocations(selected);
  renderResults(state);
};

export const renderResults = (state: AppState): void => {
  const query = state.search.trim().toLowerCase();
  const regionHits = regions.filter((region) => {
    const haystack = `${region.coord} ${region.name} ${region.slug} ${region.zone} r${region.slug.split("-r")[1]}`.toLowerCase();
    return state.activeZones.has(region.zone) && (!query || haystack.includes(query));
  }).slice(0, 5).map((region) => itemHtml(region, `${region.zone} / ${region.slug}`));
  const locationHits = locations.filter((location) => {
    const haystack = `${location.name} ${location.kind} ${location.region} ${location.zone} ${location.resources?.join(" ") ?? ""}`.toLowerCase();
    return state.activeZones.has(location.zone) && (!query || haystack.includes(query));
  }).slice(0, 7).map(locationHtml);
  qs("#results").innerHTML = [...regionHits, ...locationHits].slice(0, 10).join("") || `<div class="muted">No matches.</div>`;
};

export const itemHtml = (region: Region, detail: string): string => `
  <div class="item" data-coord="${region.coord}">
    <b>${region.coord} - ${escapeHtml(region.name)}</b>
    <div class="muted"><span style="color:${zoneCss[region.zone]}">${region.zone}</span> / ${escapeHtml(detail)}</div>
  </div>
`;

const locationHtml = (location: MapLocation): string => {
  const region = byCoord.get(location.region);
  const endpointId = `location:${location.id}`;
  const endpointAttr = endpointById.has(endpointId) ? `data-endpoint="${endpointId}"` : `data-coord="${location.region}"`;
  const details = [
    locationKindLabel[location.kind],
    location.sector ? `${location.region}.${location.sector}` : location.region,
    location.hidden ? "coordinates hidden" : location.details.coordinates,
    location.resources?.slice(0, 3).join(", ")
  ].filter(Boolean).join(" / ");
  return `
    <div class="item" ${endpointAttr}>
      <b>${escapeHtml(location.name)}</b>
      <div class="muted"><span style="color:${zoneCss[location.zone]}">${region?.zone ?? location.zone}</span> / ${escapeHtml(details)}</div>
    </div>
  `;
};

const actionButtons = (): string => `
  <div class="action-row">
    <button id="setOrigin" type="button">Set Origin</button>
    <button id="setDestination" type="button">Set Dest</button>
  </div>
`;

const regionDetailHtml = (selected: Region, gateCount: number, published: number, hidden: number): string => `
  <strong style="color:var(--zone)">${selected.security}</strong>
  <div class="muted">${zoneMeaning(selected.zone)}</div>
  <div class="data-grid">
    <div>Region</div><div>${selected.coord}</div>
    <div>Range</div><div>x ${selected.xMin.toLocaleString()}-${selected.xMax.toLocaleString()}, z ${selected.zMin.toLocaleString()}-${selected.zMax.toLocaleString()}</div>
    <div>Sectors</div><div>${selected.sectors.map((sector) => `${sector.id}: ${sector.centerX.toLocaleString()}, ${sector.centerZ.toLocaleString()}`).join("<br>")}</div>
    <div>Gates</div><div>${gateCount}</div>
    <div>Locations</div><div>${published}${hidden ? ` published / ${hidden} hidden` : ""}</div>
  </div>
  ${actionButtons()}
`;

const sectorDetailHtml = (selected: Region, sector: Region["sectors"][number], gateCount: number, published: number, hidden: number): string => `
  <strong style="color:var(--zone)">${selected.security}</strong>
  <div class="muted">${zoneMeaning(selected.zone)}</div>
  <div class="data-grid">
    <div>Sector</div><div>${selected.coord}.${sector.id}</div>
    <div>Center</div><div>x ${sector.centerX.toLocaleString()}, z ${sector.centerZ.toLocaleString()}</div>
    <div>Range</div><div>x ${sector.xMin.toLocaleString()}-${sector.xMax.toLocaleString()}, z ${sector.zMin.toLocaleString()}-${sector.zMax.toLocaleString()}</div>
    <div>Region</div><div>${selected.coord} - ${escapeHtml(selected.name)}</div>
    <div>Gates</div><div>${gateCount}</div>
    <div>Locations</div><div>${published}${hidden ? ` published / ${hidden} hidden` : ""}</div>
  </div>
  ${actionButtons()}
`;

const locationDetailHtml = (location: MapLocation, selected: Region, endpoint: Endpoint | undefined): string => {
  const rows: Array<[string, string | undefined]> = [
    ["Kind", locationKindLabel[location.kind]],
    ["Region", `${selected.coord} - ${selected.name}`],
    ["Sector", `${selected.coord}.${location.sector ?? endpoint?.sector ?? "--"}`],
    ["Coordinates", location.x !== null && location.z !== null ? `x ${location.x.toLocaleString()}, z ${location.z.toLocaleString()}` : location.details.coordinates],
    ["Radius", location.radius?.toLocaleString()],
    ["Density", location.density?.toLocaleString()],
    ["Resources", location.resources?.join(", ")],
    ["Links", location.linksTo]
  ];
  const extraRows = Object.entries(location.details)
    .filter(([key]) => key !== "coordinates")
    .map(([key, value]) => [key.replace(/_/g, " "), value] as [string, string]);
  const htmlRows = [...rows, ...extraRows]
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(([label, value]) => `<div>${escapeHtml(label)}</div><div>${escapeHtml(value)}</div>`)
    .join("");

  return `
    <strong style="color:var(--zone)">${locationKindLabel[location.kind]}</strong>
    <div class="muted">${zoneMeaning(selected.zone)}</div>
    <div class="data-grid">${htmlRows}</div>
    ${actionButtons()}
  `;
};

const renderStats = (): void => {
  const counts: Record<Zone, number> = { CORE: 0, MID: 0, FRONTIER: 0, NULL: 0 };
  for (const region of regions) counts[region.zone] += 1;
  qs("#stats").innerHTML = Object.entries(counts).map(([zone, count]) => `
    <div class="stat ${zoneClass[zone as Zone]}">
      <b style="color:var(--zone)">${count}</b>
      <span>${zone}</span>
    </div>
  `).join("");
};

const renderGates = (selected: Region): void => {
  const list = gatesByCoord.get(selected.coord) ?? [];
  qs("#gateList").innerHTML = list.length
    ? list.map((gate) => {
      const paired = pairedGateById.get(gate.id);
      const otherRegion = paired ? byCoord.get(paired.region) : null;
      const detail = paired
        ? `${gate.name} (${gate.sector}) -> ${paired.name} (${paired.region}.${paired.sector})`
        : `${gate.name} (${gate.sector})`;
      return otherRegion ? itemHtml(otherRegion, detail) : locationHtml(gate);
    }).join("")
    : `<div class="muted">No gate endpoint in this region.</div>`;
};

const renderRegionLocations = (selected: Region): void => {
  const list = (locationsByCoord.get(selected.coord) ?? [])
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  qs("#nearby").innerHTML = list.length
    ? list.map(locationHtml).join("")
    : `<div class="muted">No published signals in this region.</div>`;
};

const zoneMeaning = (zone: Zone): string => ({
  CORE: "Patrolled starter space. Safest routes and early mining.",
  MID: "Outer lanes. Better yield, some pirate pressure.",
  FRONTIER: "Wormhole-capable, higher-value, higher-risk space.",
  NULL: "Wild Drift. Full PvP, no NPC protection, top-end resources."
})[zone];

const riskLabel = (state: AppState): string => {
  if (state.routeInfo.nulls) return `${state.routeInfo.nulls} NULL`;
  if (state.routeInfo.frontier) return `${state.routeInfo.frontier} FTR`;
  return "Clean";
};
