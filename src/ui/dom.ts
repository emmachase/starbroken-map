import { byCoord, driveRanges, gatesByCoord, hullFuel, profiles, regions, zoneClass, zoneCss } from "../data/galaxy";
import type { AppState, HullClass, Region, Zone } from "../types";

export const qs = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node;
};

export const qsa = <T extends Element>(selector: string): T[] => Array.from(document.querySelectorAll<T>(selector));

export const populateSelects = (state: AppState): void => {
  const options = regions.map((region) => `<option value="${region.coord}">${region.coord} - ${region.name}</option>`).join("");
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
  qs<HTMLInputElement>("#layerThreat").checked = state.layers.threat;
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
  state.layers.threat = qs<HTMLInputElement>("#layerThreat").checked;
  state.layers.rifts = qs<HTMLInputElement>("#layerRifts").checked;
  state.layers.range = qs<HTMLInputElement>("#layerRange").checked;
  state.layers.labels = qs<HTMLInputElement>("#layerLabels").checked;
  state.activeZones = new Set(qsa<HTMLInputElement>(".zoneFilter:checked").map((input) => input.value as Zone));
};

export const renderRouteStrip = (state: AppState): void => {
  const origin = byCoord.get(state.origin);
  const dest = byCoord.get(state.destination);
  if (!origin || !dest) return;

  qs("#routeProfileLabel").textContent = profiles[state.profile].label;
  qs("#routeHeadline").innerHTML = `${origin.coord} ${origin.name} <span>-></span> ${dest.coord} ${dest.name}`;
  qs("#profileHelp").textContent = profiles[state.profile].help;
  qs("#routeMetrics").innerHTML = `
    <div class="metric"><b>${state.route.length ? state.route.length - 1 : "--"}</b><span>Jumps</span></div>
    <div class="metric"><b>${state.routeInfo.cells.toLocaleString()}</b><span>Cells</span></div>
    <div class="metric"><b>${state.routeInfo.gateJumps}</b><span>Gates</span></div>
    <div class="metric ${state.routeInfo.nulls ? "null" : state.routeInfo.frontier ? "frontier" : "core"}"><b style="color:var(--zone)">${riskLabel(state)}</b><span>Risk</span></div>
  `;
};

export const renderRoutePanel = (state: AppState): void => {
  const origin = byCoord.get(state.origin);
  const dest = byCoord.get(state.destination);
  if (!origin || !dest) return;

  const range = driveRanges[state.driveTier];
  const cost = state.route.length ? `${state.routeInfo.cells.toLocaleString()} Drive Cells` : "No path";
  qs("#costReadout").innerHTML = `
    <strong>${cost}</strong>
    <div class="muted">${profiles[state.profile].label} / ${state.routeInfo.hull} / ${state.routeInfo.warpJumps} warp / ${state.routeInfo.gateJumps} gates / ${state.routeInfo.nulls} NULL / ~${state.routeInfo.credits.toLocaleString()} cr</div>
    <div class="data-grid">
      <div>From</div><div>${origin.coord} - ${origin.name}</div>
      <div>To</div><div>${dest.coord} - ${dest.name}</div>
      <div>Drive</div><div>${state.driveTier === 5 || !state.useRange ? "Unlimited" : `T${state.driveTier}, ${range} region hop${range === 1 ? "" : "s"}`}</div>
      <div>Fuel rate</div><div>${hullFuel[state.hull].toLocaleString()} cells / warp</div>
    </div>
  `;

  qs("#routeSteps").innerHTML = state.route.length
    ? state.route.map((step, index) => {
      const region = byCoord.get(step.coord);
      if (!region) return "";
      return `
        <div class="route-step" data-coord="${region.coord}">
          <div class="stepnum">${index + 1}</div>
          <div>
            <b>${region.coord} - ${region.name}</b>
            <div class="muted"><span style="color:${zoneCss[region.zone]}">${region.zone}</span> / ${step.label}</div>
          </div>
        </div>`;
    }).join("")
    : `<div class="readout"><strong>No route found</strong><div class="muted">Try allowing gates, increasing drive tier, or disabling Bypass NULL.</div></div>`;
};

export const renderDetails = (state: AppState): void => {
  const selected = byCoord.get(state.selected);
  if (!selected) return;
  const gateCount = gatesByCoord.get(selected.coord)?.length ?? 0;

  qs("#detailTitle").textContent = `${selected.coord} - ${selected.name}`;
  qs("#detailSub").textContent = `${selected.zone} / ${selected.slug}`;
  const badge = qs<HTMLElement>("#detailBadge");
  badge.className = `readout ${zoneClass[selected.zone]}`;
  badge.innerHTML = `
    <strong style="color:var(--zone)">${selected.zone}</strong>
    <div class="muted">${zoneMeaning(selected.zone)}</div>
    <div class="data-grid">
      <div>Coordinate</div><div>${selected.coord}</div>
      <div>Slug</div><div>${selected.slug}</div>
      <div>Sectors</div><div>${selected.sectors}</div>
      <div>Gates</div><div>${gateCount}</div>
    </div>
    <div class="action-row">
      <button id="setOrigin" type="button">Set Origin</button>
      <button id="setDestination" type="button">Set Dest</button>
    </div>
  `;

  renderStats();
  renderGates(selected);
  renderNearby(selected);
  renderResults(state);
};

export const renderResults = (state: AppState): void => {
  const query = state.search.trim().toLowerCase();
  const hits = regions.filter((region) => {
    const haystack = `${region.coord} ${region.name} ${region.slug} ${region.zone} r${region.slug.split("-r")[1]}`.toLowerCase();
    return state.activeZones.has(region.zone) && (!query || haystack.includes(query));
  });
  qs("#results").innerHTML = hits.slice(0, 9).map((region) => itemHtml(region, `${region.zone} / ${region.slug}`)).join("") || `<div class="muted">No matches.</div>`;
};

export const itemHtml = (region: Region, detail: string): string => `
  <div class="item" data-coord="${region.coord}">
    <b>${region.coord} - ${region.name}</b>
    <div class="muted"><span style="color:${zoneCss[region.zone]}">${region.zone}</span> / ${detail}</div>
  </div>
`;

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
      const otherCoord = gate.a === selected.coord ? gate.b : gate.a;
      const localSector = gate.a === selected.coord ? gate.aSector : gate.bSector;
      const otherSector = gate.a === selected.coord ? gate.bSector : gate.aSector;
      const other = byCoord.get(otherCoord);
      return other ? itemHtml(other, `${selected.name} ${localSector} gate to ${other.name} ${otherSector}`) : "";
    }).join("")
    : `<div class="muted">No gate endpoint in this region.</div>`;
};

const renderNearby = (selected: Region): void => {
  const list = regions
    .filter((region) => region.coord !== selected.coord)
    .map((region) => ({ ...region, dist: Math.abs(region.col - selected.col) + Math.abs(region.row - selected.row) }))
    .sort((a, b) => a.dist - b.dist || a.coord.localeCompare(b.coord))
    .slice(0, 7);
  qs("#nearby").innerHTML = list.map((region) => itemHtml(region, `${region.dist} grid step${region.dist === 1 ? "" : "s"} away`)).join("");
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
