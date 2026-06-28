import "./styles.css";
import { byCoord, defaultDestination, defaultOrigin, emptyRouteInfo, endpointById, profiles, regions } from "./data/galaxy";
import { GalaxyViewport } from "./render/GalaxyViewport";
import { describeRoute, findPath } from "./routing/routeEngine";
import { itemHtml, populateSelects, qs, qsa, readControlState, renderDetails, renderResults, renderRoutePanel, renderRouteStrip, syncControls } from "./ui/dom";
import type { AppState, RouteProfile, Zone } from "./types";

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
  activeZones: new Set<Zone>(["CORE", "MID", "FRONTIER", "NULL"]),
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

let state = defaultState();

const viewport = new GalaxyViewport({
  root: qs<HTMLElement>("#galaxyViewport"),
  onSelect: (coord) => {
    state.selected = coord;
    render();
  },
  onSetOrigin: (coord) => setRouteEndpoint("origin", coord),
  onSetDestination: (coord) => setRouteEndpoint("destination", coord)
});

const toast = (message: string): void => {
  const node = qs<HTMLElement>("#toast");
  node.textContent = message;
  node.style.opacity = "1";
  window.clearTimeout(Number(node.dataset.timer || 0));
  node.dataset.timer = String(window.setTimeout(() => {
    node.style.opacity = "0";
  }, 1700));
};

const recalculate = (): void => {
  state.route = findPath(state);
  state.routeInfo = describeRoute(state, state.route);
};

const render = (): void => {
  recalculate();
  syncControls(state);
  renderRouteStrip(state);
  renderRoutePanel(state);
  renderDetails(state);
  viewport.setState(state);
  bindDynamicItems();
};

const setRouteEndpoint = (kind: "origin" | "destination", coord: string): void => {
  const endpoint = endpointById.get(coord);
  state[kind] = coord;
  if (endpoint) state.selected = endpoint.id;
  render();
  toast(`${kind === "origin" ? "Origin" : "Destination"} locked: ${endpoint?.label ?? coord}`);
};

const selectedRouteEndpoint = (): string | null => {
  if (endpointById.has(state.selected)) return state.selected;
  return byCoord.has(state.selected) ? `sector:${state.selected}:NW` : null;
};

const setProfile = (profile: RouteProfile): void => {
  state.profile = profile;
  render();
  toast(`${profiles[profile].label} armed`);
};

const readAndRender = (): void => {
  readControlState(state);
  render();
};

const bindDynamicItems = (): void => {
  for (const node of qsa<HTMLElement>(".item, .route-step")) {
    node.onclick = () => {
      const endpoint = node.dataset.endpoint;
      if (endpoint && endpointById.has(endpoint)) {
        state.selected = endpoint;
        render();
        return;
      }
      const coord = node.dataset.coord;
      if (!coord || !byCoord.has(coord)) return;
      state.selected = coord;
      render();
    };
  }

  const originButton = document.querySelector<HTMLButtonElement>("#setOrigin");
  const destinationButton = document.querySelector<HTMLButtonElement>("#setDestination");
  if (originButton) originButton.onclick = () => {
    const endpoint = selectedRouteEndpoint();
    if (endpoint) setRouteEndpoint("origin", endpoint);
  };
  if (destinationButton) destinationButton.onclick = () => {
    const endpoint = selectedRouteEndpoint();
    if (endpoint) setRouteEndpoint("destination", endpoint);
  };
};

const bindStaticControls = (): void => {
  for (const button of qsa<HTMLButtonElement>(".profile")) {
    button.addEventListener("click", () => setProfile(button.dataset.profile as RouteProfile));
  }

  for (const id of ["origin", "destination", "driveTier", "hullClass", "useGates", "avoidNull", "useRange", "layerGates", "layerThreat", "layerRifts", "layerRange", "layerLabels"]) {
    qs<HTMLElement>(`#${id}`).addEventListener("change", readAndRender);
  }

  for (const input of qsa<HTMLInputElement>(".zoneFilter")) input.addEventListener("change", readAndRender);

  qs<HTMLInputElement>("#search").addEventListener("input", () => {
    state.search = qs<HTMLInputElement>("#search").value;
    renderResults(state);
    viewport.setState(state);
    bindDynamicItems();
  });

  qs<HTMLButtonElement>("#routeBtn").addEventListener("click", readAndRender);

  qs<HTMLButtonElement>("#reset").addEventListener("click", () => {
    state = defaultState();
    render();
    toast("NAVCOM reset");
  });
};

const init = async (): Promise<void> => {
  populateSelects(state);
  bindStaticControls();
  await viewport.init();
  recalculate();
  qs("#results").innerHTML = regions.slice(0, 9).map((region) => itemHtml(region, `${region.zone} / ${region.slug}`)).join("");
  render();
};

init().catch((error: unknown) => {
  console.error(error);
  qs("#galaxyViewport").innerHTML = `<div class="readout"><strong>NAVCOM failed to boot</strong><div class="muted">${error instanceof Error ? error.message : String(error)}</div></div>`;
});
