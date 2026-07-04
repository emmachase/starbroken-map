import "pixi.js/html-source";
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { HTMLSource } from "pixi.js/html-source";
import type { HTMLSourceCanvas } from "pixi.js/html-source";
import { byCoord, endpointById, GALAXY_SIZE, gates, locationById, locations, regions, sectorForPoint, zoneColors } from "../data/galaxy";
import type { AppState, MapLocation, Region, RouteStep, SectorName } from "../types";
import { chamferPoints, clamp, fitText } from "./geometry";

interface GalaxyViewportOptions {
  root: HTMLElement;
  onSelect: (coord: string) => void;
  onSetOrigin: (coord: string) => void;
  onSetDestination: (coord: string) => void;
}

interface Layout {
  cell: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

interface Camera {
  x: number;
  y: number;
  scale: number;
  targetX: number;
  targetY: number;
  targetScale: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}

interface LodState {
  bucket: string;
  regionAlpha: number;
  sectorAlpha: number;
  regionLabelAlpha: number;
  sectorRegionLabelAlpha: number;
  sectorLabelAlpha: number;
}

type HitMode = "region" | "sector" | "component";
type ControlIslandId = "top-console";
type NavcomAssetId =
  | "noise-blue"
  | "noise-red"
  | "scanline-mask"
  | "panel-edge-gradient"
  | "warning-stripe"
  | "critical-stripe"
  | "caution-stripe"
  | "stripe-falloff-horizontal"
  | "stripe-falloff-vertical"
  | "spark-dot"
  | "ring-soft"
  | "glass-smudge"
  | "bracket-corner"
  | "reticle-ping"
  | "holo-grid";

const MAX_ZOOM = 100;
const SECTOR_LOD_THRESHOLD = 1.4;
const COMPONENT_LOD_THRESHOLD = 3.8;
const LOD12_TRANSITION_SPEED = 0.1;
const REGION_FRAME_SCALE = 1.18;
const SECTOR_FRAME_SCALE = 2.2;
const TOP_CONSOLE_RECT: ControlIslandRect = { x: 16, y: 14, width: 520, height: 64 };
const NAVCOM_ASSETS: Array<{ alias: NavcomAssetId; src: string }> = [
  { alias: "noise-blue", src: new URL("../assets/navcom/noise-blue.svg", import.meta.url).href },
  { alias: "noise-red", src: new URL("../assets/navcom/noise-red.svg", import.meta.url).href },
  { alias: "scanline-mask", src: new URL("../assets/navcom/scanline-mask.svg", import.meta.url).href },
  { alias: "panel-edge-gradient", src: new URL("../assets/navcom/panel-edge-gradient.svg", import.meta.url).href },
  { alias: "warning-stripe", src: new URL("../assets/navcom/warning-stripe.svg", import.meta.url).href },
  { alias: "critical-stripe", src: new URL("../assets/navcom/critical-stripe.svg", import.meta.url).href },
  { alias: "caution-stripe", src: new URL("../assets/navcom/caution-stripe.svg", import.meta.url).href },
  { alias: "stripe-falloff-horizontal", src: new URL("../assets/navcom/stripe-falloff-horizontal.svg", import.meta.url).href },
  { alias: "stripe-falloff-vertical", src: new URL("../assets/navcom/stripe-falloff-vertical.svg", import.meta.url).href },
  { alias: "spark-dot", src: new URL("../assets/navcom/spark-dot.svg", import.meta.url).href },
  { alias: "ring-soft", src: new URL("../assets/navcom/ring-soft.svg", import.meta.url).href },
  { alias: "glass-smudge", src: new URL("../assets/navcom/glass-smudge.svg", import.meta.url).href },
  { alias: "bracket-corner", src: new URL("../assets/navcom/bracket-corner.svg", import.meta.url).href },
  { alias: "reticle-ping", src: new URL("../assets/navcom/reticle-ping.svg", import.meta.url).href },
  { alias: "holo-grid", src: new URL("../assets/navcom/holo-grid.svg", import.meta.url).href }
];

interface ControlIslandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ControlIsland {
  id: ControlIslandId;
  element: HTMLDivElement;
  rect: ControlIslandRect;
  source: HTMLSource;
  sprite: Sprite;
  transformCorrection: { x: number; y: number };
  transformCorrectionFrame: number;
}

type HTMLSourceCanvasWithTransform = HTMLSourceCanvas & {
  getElementTransform?: (element: Element, transform: DOMMatrix) => DOMMatrix | null;
};

const stars = Array.from({ length: 160 }, (_, index) => ({
  x: ((index * 97) % 997) / 997,
  y: ((index * 151) % 991) / 991,
  size: index % 5 === 0 ? 1.7 : 0.9,
  blue: index % 9 === 0
}));

export class GalaxyViewport {
  private readonly root: HTMLElement;
  private readonly onSelect: (coord: string) => void;
  private readonly onSetOrigin: (coord: string) => void;
  private readonly onSetDestination: (coord: string) => void;
  private readonly app = new Application();
  private readonly screenRoot = new Container();
  private readonly starfieldLayer = new Container();
  private readonly deepSpaceNoiseLayer = new Container();
  private readonly mapWorldLayer = new Container();
  private readonly mapRouteLayer = new Container();
  private readonly mapSensorFxLayer = new Container();
  private readonly htmlControlLayer = new Container();
  private readonly controlFxLayer = new Container();
  private readonly glassOverlayLayer = new Container();
  private readonly alertInterferenceLayer = new Container();
  private readonly cursorReticleLayer = new Container();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly grid = new Graphics();
  private readonly overlays = new Graphics();
  private readonly routeLayer = new Graphics();
  private readonly regionLayer = new Container();
  private readonly sectorLayer = new Container();
  private readonly contentLayer = new Container();
  private readonly axisLabels = new Container();
  private readonly regionLabels = new Container();
  private readonly sectorRegionLabels = new Container();
  private readonly sectorLabels = new Container();
  private readonly endpointLabels = new Container();
  private readonly effects = new Graphics();
  private readonly particlesLayer = new Graphics();
  private readonly resizeObserver: ResizeObserver;
  private readonly handleCanvasPaint = (): void => this.syncControlIslandTransforms();
  private readonly camera: Camera = { x: 0, y: 0, scale: 1, targetX: 0, targetY: 0, targetScale: 1 };
  private readonly particles: Particle[] = [];
  private readonly navcomTextures = new Map<NavcomAssetId, Texture>();
  private readonly controlIslands = new Map<ControlIslandId, ControlIsland>();
  private htmlCanvas: HTMLSourceCanvasWithTransform | null = null;
  private htmlSourceWarning: HTMLDivElement | null = null;
  private state: AppState | null = null;
  private hovered: string | null = null;
  private hoveredEndpoint: string | null = null;
  private layout: Layout = { cell: 80, originX: 60, originY: 60, width: 8 * 80, height: 8 * 80 };
  private isDragging = false;
  private suppressNextTap = false;
  private dragStart = { x: 0, y: 0 };
  private cameraStart = { x: 0, y: 0 };
  private routePhase = 0;
  private lastGeometryBucket = "";
  private lastHitMode: HitMode | null = null;
  private lastGridSignature = "";
  private lastOverlaySignature = "";
  private lastRouteSignature = "";
  private lastSectorsSignature = "";
  private lastLabelsSignature = "";
  private lastEndpointLabelsSignature = "";
  private renderedSelected = "";
  private lod12Blend = 0;

  constructor(options: GalaxyViewportOptions) {
    this.root = options.root;
    this.onSelect = options.onSelect;
    this.onSetOrigin = options.onSetOrigin;
    this.onSetDestination = options.onSetDestination;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  async init(): Promise<void> {
    await this.app.init({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resizeTo: this.root,
      resolution: Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    });

    this.root.appendChild(this.app.canvas);
    this.app.canvas.style.position = "relative";
    this.htmlCanvas = this.app.canvas as HTMLSourceCanvasWithTransform;
    this.htmlCanvas.setAttribute("layoutsubtree", "");
    await this.loadNavcomAssets();
    this.world.addChild(
      this.grid,
      this.overlays,
      this.routeLayer,
      this.regionLayer,
      this.sectorLayer,
      this.contentLayer,
      this.axisLabels,
      this.regionLabels,
      this.sectorRegionLabels,
      this.sectorLabels,
      this.endpointLabels,
      this.effects,
      this.particlesLayer
    );
    this.starfieldLayer.addChild(this.background);
    this.mapWorldLayer.addChild(this.world);
    this.screenRoot.addChild(
      this.starfieldLayer,
      this.deepSpaceNoiseLayer,
      this.mapWorldLayer,
      this.mapRouteLayer,
      this.mapSensorFxLayer,
      this.htmlControlLayer,
      this.controlFxLayer,
      this.glassOverlayLayer,
      this.alertInterferenceLayer,
      this.cursorReticleLayer
    );
    this.app.stage.addChild(this.screenRoot);
    this.createTopConsoleIsland();
    this.resizeObserver.observe(this.root);
    this.bindCameraInput();
    this.app.ticker.add(() => this.tick());
    this.resize();
  }

  setState(state: AppState): void {
    const previousSelected = this.renderedSelected;
    this.state = state;
    this.renderStatic();
    this.drawAnimatedEffects();
    if (previousSelected && state.selected !== previousSelected) this.focusSelected();
    this.renderedSelected = state.selected;
  }

  focusSelected(immediate = false): void {
    if (!this.state) return;
    const endpoint = endpointById.get(this.state.selected);
    const region = endpoint ? byCoord.get(endpoint.region) : byCoord.get(this.state.selected);
    if (!region) return;

    if (endpoint?.kind === "sector") {
      const sector = region.sectors.find((item) => item.id === endpoint.sector);
      if (sector) {
        const start = this.pointForCoords(sector.xMin, sector.zMin);
        const end = this.pointForCoords(sector.xMax, sector.zMax);
        this.frameRect({ x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y }, immediate, this.root.clientWidth < 720 ? 34 : 72, SECTOR_FRAME_SCALE);
        return;
      }
    }

    if (!endpoint) {
      this.frameRect(this.rectFor(region), immediate, this.root.clientWidth < 720 ? 30 : 68, REGION_FRAME_SCALE);
      return;
    }

    const point = this.pointForCoords(endpoint.x, endpoint.z);
    this.setCameraTarget(point.x, point.y, 5.2, immediate);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.destroyControlIslands();
    this.htmlSourceWarning?.remove();
    this.htmlSourceWarning = null;
    this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  }

  private async loadNavcomAssets(): Promise<void> {
    const loaded = await Assets.load(NAVCOM_ASSETS.map((asset) => ({
      alias: asset.alias,
      src: asset.src,
      parser: "svg"
    })));
    for (const asset of NAVCOM_ASSETS) {
      const texture = loaded[asset.alias] as Texture | undefined;
      if (texture) this.navcomTextures.set(asset.alias, texture);
    }
  }

  private createTopConsoleIsland(): void {
    if (!this.htmlCanvas?.requestPaint) {
      this.showHtmlSourceWarning();
      return;
    }

    const element = document.createElement("div");
    element.className = "navcom-canvas-island navcom-top-console-island";
    element.dataset.island = "top-console";
    element.innerHTML = `
      <div class="island-kicker">HTMLSOURCE LINK</div>
      <div class="island-title">TOP CONSOLE / LIVE CONTROL PROOF</div>
      <label class="island-input">
        <span>Ping</span>
        <input value="editable signal" aria-label="HTMLSource proof input" />
      </label>
    `;
    this.app.canvas.appendChild(element);

    this.registerControlIsland(this.createHtmlControlIsland("top-console", element, TOP_CONSOLE_RECT));
    this.htmlCanvas.addEventListener("paint", this.handleCanvasPaint);
    this.layoutTopConsoleIsland();
    this.controlIslands.get("top-console")?.source.requestPaint();
  }

  private createHtmlControlIsland(id: ControlIslandId, element: HTMLDivElement, rect: ControlIslandRect): ControlIsland {
    const source = new HTMLSource({
      resource: element,
      canvas: this.htmlCanvas!,
      autoRequestPaint: true
    });
    const sprite = Sprite.from(source);
    sprite.alpha = 0.92;
    this.htmlControlLayer.addChild(sprite);
    return {
      id,
      element,
      rect,
      source,
      sprite,
      transformCorrection: { x: 0, y: 0 },
      transformCorrectionFrame: 0
    };
  }

  private registerControlIsland(island: ControlIsland): void {
    this.controlIslands.set(island.id, island);
  }

  private destroyControlIslands(): void {
    this.htmlCanvas?.removeEventListener("paint", this.handleCanvasPaint);
    for (const island of this.controlIslands.values()) {
      if (island.transformCorrectionFrame) window.cancelAnimationFrame(island.transformCorrectionFrame);
      this.htmlControlLayer.removeChild(island.sprite);
      island.sprite.destroy({ texture: true, textureSource: false });
      island.source.destroy();
      island.element.remove();
    }
    this.controlIslands.clear();
  }

  private showHtmlSourceWarning(): void {
    const warning = document.createElement("div");
    warning.className = "navcom-htmlsource-warning";
    warning.textContent = "HTML-in-canvas unavailable: enable the experimental browser API for NAVCOM control compositing.";
    this.root.appendChild(warning);
    this.htmlSourceWarning = warning;
  }

  private bindCameraInput(): void {
    this.app.canvas.addEventListener("wheel", (event) => {
      if (this.isControlEvent(event)) return;
      event.preventDefault();
      const bounds = this.app.canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const before = this.screenToWorld(pointer.x, pointer.y);
      const factor = event.deltaY > 0 ? 0.88 : 1.14;
      this.camera.targetScale = clamp(this.camera.targetScale * factor, 0.62, MAX_ZOOM);
      this.camera.targetX = pointer.x - before.x * this.camera.targetScale;
      this.camera.targetY = pointer.y - before.y * this.camera.targetScale;
      this.clampCameraTarget();
    }, { passive: false });

    this.app.canvas.addEventListener("pointerdown", (event) => {
      if (this.isControlEvent(event)) return;
      if (event.button !== 0) return;
      this.isDragging = true;
      this.suppressNextTap = false;
      this.dragStart = { x: event.clientX, y: event.clientY };
      this.cameraStart = { x: this.camera.targetX, y: this.camera.targetY };
      this.app.canvas.setPointerCapture(event.pointerId);
    });

    this.app.canvas.addEventListener("pointermove", (event) => {
      if (!this.isDragging) return;
      if (Math.hypot(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y) > 6) this.suppressNextTap = true;
      this.camera.targetX = this.cameraStart.x + event.clientX - this.dragStart.x;
      this.camera.targetY = this.cameraStart.y + event.clientY - this.dragStart.y;
      this.clampCameraTarget();
    });

    this.app.canvas.addEventListener("pointerup", () => {
      this.isDragging = false;
    });
    this.app.canvas.addEventListener("pointercancel", () => {
      this.isDragging = false;
    });
  }

  private isControlEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Element && Boolean(target.closest(".navcom-canvas-island"));
  }

  private resize(): void {
    this.computeLayout();
    this.drawBackground();
    this.layoutTopConsoleIsland();
    this.renderStatic();
    this.fitMap(false);
  }

  private layoutTopConsoleIsland(): void {
    const island = this.controlIslands.get("top-console");
    if (!island) return;
    this.layoutControlIsland(island);
  }

  private layoutControlIsland(island: ControlIsland): void {
    island.element.style.width = `${island.rect.width}px`;
    island.element.style.height = `${island.rect.height}px`;
    island.element.style.transformOrigin = "0 0";
    island.sprite.position.set(island.rect.x, island.rect.y);
    island.sprite.scale.set(1);
    island.source.resize(island.rect.width, island.rect.height);
    island.source.requestPaint();
  }

  private syncControlIslandTransforms(): void {
    if (!this.htmlCanvas?.getElementTransform) return;
    for (const island of this.controlIslands.values()) this.syncControlIslandTransform(island);
  }

  private syncControlIslandTransform(island: ControlIsland): void {
    if (!this.htmlCanvas?.getElementTransform) return;
    const element = island.element;
    element.style.transform = "";
    const elementWidth = Math.max(1, element.offsetWidth);
    const elementHeight = Math.max(1, element.offsetHeight);
    const screenSpaceTransform = new DOMMatrix()
      .translate(island.rect.x, island.rect.y)
      .scale(
        island.rect.width / elementWidth,
        island.rect.height / elementHeight
      );
    try {
      const computedTransform = this.htmlCanvas.getElementTransform(element, screenSpaceTransform);
      if (computedTransform) {
        const correctedCssTransform = this.cssMatrixWithCorrection(computedTransform, island.transformCorrection.x, island.transformCorrection.y);
        element.style.transform = correctedCssTransform;
        this.scheduleControlIslandTransformCorrection(island, computedTransform);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "InvalidStateError") return;
      throw error;
    }
  }

  private cssMatrixWithCorrection(transform: DOMMatrix, dx: number, dy: number): string {
    return `matrix(${transform.a}, ${transform.b}, ${transform.c}, ${transform.d}, ${transform.e + dx}, ${transform.f + dy})`;
  }

  private scheduleControlIslandTransformCorrection(island: ControlIsland, transform: DOMMatrix): void {
    if (island.transformCorrectionFrame) window.cancelAnimationFrame(island.transformCorrectionFrame);
    island.transformCorrectionFrame = window.requestAnimationFrame(() => {
      island.transformCorrectionFrame = 0;
      if (!this.controlIslands.has(island.id)) return;
      const canvasRect = this.app.canvas.getBoundingClientRect();
      const actual = island.element.getBoundingClientRect();
      const expected = {
        left: canvasRect.left + island.rect.x,
        top: canvasRect.top + island.rect.y,
        width: island.rect.width,
        height: island.rect.height
      };
      const residualX = expected.left - actual.left;
      const residualY = expected.top - actual.top;
      island.transformCorrection.x += residualX;
      island.transformCorrection.y += residualY;
      const correctedCssTransform = this.cssMatrixWithCorrection(transform, island.transformCorrection.x, island.transformCorrection.y);
      island.element.style.transform = correctedCssTransform;
    });
  }

  private computeLayout(): void {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const availableW = Math.max(420, width - 120);
    const availableH = Math.max(420, height - 120);
    const cell = Math.min(112, Math.max(50, Math.min(availableW / 8, availableH / 8)));
    const gridW = cell * 8;
    const gridH = cell * 8;
    this.layout = {
      cell,
      originX: 60,
      originY: 60,
      width: gridW,
      height: gridH
    };
  }

  private fitMap(immediate: boolean): void {
    const pad = this.root.clientWidth < 720 ? 26 : 60;
    const scale = clamp(Math.min((this.root.clientWidth - pad * 2) / (this.layout.width + 120), (this.root.clientHeight - pad * 2) / (this.layout.height + 120)), 0.62, 1.35);
    this.camera.targetScale = scale;
    this.camera.targetX = this.root.clientWidth / 2 - (this.layout.originX + this.layout.width / 2) * scale;
    this.camera.targetY = this.root.clientHeight / 2 - (this.layout.originY + this.layout.height / 2) * scale;
    this.clampCameraTarget();
    if (immediate) {
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
      this.camera.scale = this.camera.targetScale;
      this.applyCamera();
    }
  }

  private tick(): void {
    this.routePhase += 0.035;
    this.camera.x += (this.camera.targetX - this.camera.x) * 0.16;
    this.camera.y += (this.camera.targetY - this.camera.y) * 0.16;
    this.camera.scale += (this.camera.targetScale - this.camera.scale) * 0.16;
    this.applyCamera();
    this.updateLodTransition();
    this.updateLodVisibility();
    this.updateHitMode();
    this.redrawZoomGeometryIfNeeded();
    this.updateParticles();
    this.drawAnimatedEffects();
  }

  private applyCamera(): void {
    this.world.position.set(this.camera.x, this.camera.y);
    this.world.scale.set(this.camera.scale);
  }

  private clampCameraTarget(): void {
    const scaledW = this.layout.width * this.camera.targetScale;
    const scaledH = this.layout.height * this.camera.targetScale;
    const minX = this.root.clientWidth - scaledW - 160 * this.camera.targetScale;
    const minY = this.root.clientHeight - scaledH - 160 * this.camera.targetScale;
    const maxX = 160 * this.camera.targetScale;
    const maxY = 160 * this.camera.targetScale;
    this.camera.targetX = clamp(this.camera.targetX, Math.min(minX, maxX), Math.max(minX, maxX));
    this.camera.targetY = clamp(this.camera.targetY, Math.min(minY, maxY), Math.max(minY, maxY));
  }

  private screenToWorld(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.camera.x) / this.camera.scale,
      y: (y - this.camera.y) / this.camera.scale
    };
  }

  private renderStatic(): void {
    if (!this.state) return;
    this.renderStaticGroups(false, true);
    this.updateLodTransition(true);
    this.updateLodVisibility();
    this.lastHitMode = this.hitMode();
    this.lastGeometryBucket = this.geometryBucket();
  }

  private renderStaticGroups(force: boolean, includeLabels: boolean): void {
    if (!this.state) return;
    const gridSignature = this.gridSignature();
    if (force || gridSignature !== this.lastGridSignature) {
      this.lastGridSignature = gridSignature;
      this.drawGrid(includeLabels);
    }

    const overlaySignature = this.overlaySignature(this.state);
    if (force || overlaySignature !== this.lastOverlaySignature) {
      this.lastOverlaySignature = overlaySignature;
      this.drawOverlays();
    }

    const routeSignature = this.routeSignature(this.state);
    if (force || routeSignature !== this.lastRouteSignature) {
      this.lastRouteSignature = routeSignature;
      this.drawRouteBase();
    }

    const sectorsSignature = this.sectorsSignature(this.state);
    if (force || sectorsSignature !== this.lastSectorsSignature) {
      this.lastSectorsSignature = sectorsSignature;
      this.drawSectors();
    }

    if (includeLabels) {
      const labelsSignature = this.labelsSignature(this.state);
      if (force || labelsSignature !== this.lastLabelsSignature) {
        this.lastLabelsSignature = labelsSignature;
        this.drawLabels();
      }

      const endpointLabelsSignature = this.endpointLabelsSignature(this.state);
      if (force || endpointLabelsSignature !== this.lastEndpointLabelsSignature) {
        this.lastEndpointLabelsSignature = endpointLabelsSignature;
        this.drawEndpointLabels();
      }
    }
  }

  private layoutSignature(): string {
    const { cell, originX, originY, width, height } = this.layout;
    return `${cell}:${originX}:${originY}:${width}:${height}`;
  }

  private gridSignature(): string {
    return `${this.layoutSignature()};${this.geometryBucket()}`;
  }

  private overlaySignature(state: AppState): string {
    return [
      this.layoutSignature(),
      this.geometryBucket(),
      state.selected,
      state.driveTier,
      state.useRange,
      state.layers.rifts,
      state.layers.range,
      state.layers.gates
    ].join(";");
  }

  private routeSignature(state: AppState): string {
    return [
      this.layoutSignature(),
      this.geometryBucket(),
      state.route.map((step) => `${step.id}:${step.mode}:${step.x}:${step.z}`).join("|")
    ].join(";");
  }

  private sectorsSignature(state: AppState): string {
    return [
      this.layoutSignature(),
      this.geometryBucket(),
      this.hitMode(),
      state.origin,
      state.destination,
      state.search,
      [...state.activeZones].sort().join(","),
      state.layers.threat
    ].join(";");
  }

  private labelsSignature(state: AppState): string {
    return [
      this.layoutSignature(),
      state.layers.labels
    ].join(";");
  }

  private endpointLabelsSignature(state: AppState): string {
    return [
      this.layoutSignature(),
      state.origin,
      state.destination
    ].join(";");
  }

  private redrawZoomGeometryIfNeeded(): void {
    if (!this.state) return;
    const bucket = this.geometryBucket();
    if (bucket === this.lastGeometryBucket) return;
    this.lastGeometryBucket = bucket;
    this.renderStaticGroups(false, false);
    this.updateLodVisibility();
  }

  private updateHitMode(): void {
    if (!this.state) return;
    const mode = this.hitMode();
    if (mode === this.lastHitMode) return;
    this.lastHitMode = mode;
    this.hovered = null;
    this.hoveredEndpoint = null;
    this.drawSectors();
    this.lastSectorsSignature = this.sectorsSignature(this.state);
  }

  private geometryBucket(): string {
    return String(Math.round((this.camera.scale || this.camera.targetScale || 1) * 8) / 8);
  }

  private updateLodTransition(immediate = false): void {
    const scale = this.camera.scale || this.camera.targetScale || 1;
    const target = scale >= SECTOR_LOD_THRESHOLD ? 1 : 0;
    if (immediate) {
      this.lod12Blend = target;
      return;
    }
    this.lod12Blend += (target - this.lod12Blend) * LOD12_TRANSITION_SPEED;
    if (Math.abs(target - this.lod12Blend) < 0.015) this.lod12Blend = target;
  }

  private lodState(): LodState {
    const scale = this.camera.scale || this.camera.targetScale || 1;
    if (scale < 2.5) {
      const t = this.lod12Blend;
      if (t <= 0.001) return { bucket: "regions", regionAlpha: 1, sectorAlpha: 0.18, regionLabelAlpha: 1, sectorRegionLabelAlpha: 0, sectorLabelAlpha: 0 };
      if (t >= 0.999) return { bucket: "sectors", regionAlpha: 0.28, sectorAlpha: 0.92, regionLabelAlpha: 0, sectorRegionLabelAlpha: 1, sectorLabelAlpha: 1 };
      return {
        bucket: "lod12-transition",
        regionAlpha: 1 + (0.28 - 1) * t,
        sectorAlpha: 0.18 + (0.92 - 0.18) * t,
        regionLabelAlpha: 1 - t,
        sectorRegionLabelAlpha: t,
        sectorLabelAlpha: t
      };
    }
    if (scale < 3.8) {
      const t = (scale - 2.5) / 1.3;
      return {
        bucket: "fade",
        regionAlpha: 0.28 * (1 - t),
        sectorAlpha: 0.34 + 0.58 * (1 - t),
        regionLabelAlpha: 0,
        sectorRegionLabelAlpha: 1 - t,
        sectorLabelAlpha: 1 - t
      };
    }
    return { bucket: "contents", regionAlpha: 0, sectorAlpha: 0.34, regionLabelAlpha: 0, sectorRegionLabelAlpha: 0, sectorLabelAlpha: 0 };
  }

  private hitMode(): HitMode {
    const scale = this.camera.scale || this.camera.targetScale || 1;
    if (scale >= COMPONENT_LOD_THRESHOLD) return "component";
    return scale >= SECTOR_LOD_THRESHOLD ? "sector" : "region";
  }

  private updateLodVisibility(): void {
    const lod = this.lodState();
    this.regionLayer.alpha = lod.regionAlpha;
    this.regionLayer.visible = lod.regionAlpha > 0.01;
    this.sectorLayer.alpha = lod.sectorAlpha;
    this.sectorLayer.visible = lod.sectorAlpha > 0.01;
    this.regionLabels.visible = lod.regionLabelAlpha > 0.01;
    this.regionLabels.alpha = lod.regionLabelAlpha;
    this.sectorRegionLabels.visible = lod.sectorRegionLabelAlpha > 0.01;
    this.sectorRegionLabels.alpha = lod.sectorRegionLabelAlpha;
    this.sectorLabels.visible = lod.sectorLabelAlpha > 0.01;
    this.sectorLabels.alpha = lod.sectorLabelAlpha;
    this.endpointLabels.visible = lod.regionLabelAlpha > 0.01;
    this.endpointLabels.alpha = lod.regionLabelAlpha;
  }

  private worldWidth(screenPixels: number): number {
    return screenPixels / Math.max(0.75, this.camera.scale || this.camera.targetScale || 1);
  }

  private frameRect(rect: { x: number; y: number; w: number; h: number }, immediate: boolean, padding: number, maxScale: number): void {
    const availableW = Math.max(80, this.root.clientWidth - padding * 2);
    const availableH = Math.max(80, this.root.clientHeight - padding * 2);
    const scale = clamp(Math.min(availableW / Math.max(1, rect.w), availableH / Math.max(1, rect.h)), 0.62, maxScale);
    this.setCameraTarget(rect.x + rect.w / 2, rect.y + rect.h / 2, scale, immediate);
  }

  private setCameraTarget(x: number, y: number, scale: number, immediate: boolean): void {
    this.camera.targetScale = clamp(scale, 0.62, MAX_ZOOM);
    this.camera.targetX = this.root.clientWidth / 2 - x * this.camera.targetScale;
    this.camera.targetY = this.root.clientHeight / 2 - y * this.camera.targetScale;
    this.clampCameraTarget();
    if (immediate) {
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
      this.camera.scale = this.camera.targetScale;
      this.applyCamera();
    }
  }

  private rectFor(region: Region) {
    const start = this.pointForCoords(region.xMin, region.zMin);
    const end = this.pointForCoords(region.xMax, region.zMax);
    return {
      x: start.x,
      y: start.y,
      w: end.x - start.x,
      h: end.y - start.y
    };
  }

  private pointFor(region: Region) {
    const rect = this.rectFor(region);
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }

  private pointForCoords(x: number, z: number) {
    return {
      x: this.layout.originX + (x / GALAXY_SIZE) * this.layout.width,
      y: this.layout.originY + (z / GALAXY_SIZE) * this.layout.height
    };
  }

  private pointForStep(step: RouteStep) {
    return this.pointForCoords(step.x, step.z);
  }

  private pointForLocation(location: MapLocation) {
    if (location.x === null || location.z === null) return null;
    return this.pointForCoords(location.x, location.z);
  }

  private drawBackground(): void {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    this.background.clear();
    this.background.rect(0, 0, width, height).fill({ color: 0x030612, alpha: 1 });
    for (const star of stars) {
      this.background.rect(star.x * width, star.y * height, star.size, star.size).fill({ color: star.blue ? 0x71d5ff : 0xecf5ff, alpha: star.blue ? 0.85 : 0.58 });
    }
  }

  private drawGrid(includeLabels = true): void {
    const width = this.layout.width + 180;
    const height = this.layout.height + 180;
    this.grid.clear();
    if (includeLabels) this.axisLabels.removeChildren();
    for (let x = 0; x < width; x += 48) this.grid.moveTo(x, 0).lineTo(x, height).stroke({ color: 0x71d5ff, alpha: 0.045, width: this.worldWidth(1) });
    for (let y = 0; y < height; y += 48) this.grid.moveTo(0, y).lineTo(width, y).stroke({ color: 0x71d5ff, alpha: 0.045, width: this.worldWidth(1) });
    for (let y = 0; y < height; y += 5) this.grid.rect(0, y, width, 1).fill({ color: 0xffffff, alpha: 0.018 });

    if (!includeLabels) return;
    for (let index = 0; index < 8; index += 1) {
      const x = this.layout.originX + index * this.layout.cell + this.layout.cell / 2;
      const y = this.layout.originY - 24;
      this.drawHudText(this.axisLabels, String.fromCharCode(65 + index), x, y, 0xa9b8cf, 12, "center");
    }
    for (let index = 0; index < 8; index += 1) {
      const x = this.layout.originX - 24;
      const y = this.layout.originY + index * this.layout.cell + this.layout.cell / 2 - 7;
      this.drawHudText(this.axisLabels, String(index + 1), x, y, 0xa9b8cf, 12, "center");
    }
  }

  private drawOverlays(): void {
    const state = this.state;
    if (!state) return;
    this.overlays.clear();

    if (state.layers.rifts) {
      for (const region of regions.filter((item) => item.zone === "FRONTIER" || item.zone === "NULL")) {
        const point = this.pointFor(region);
        this.overlays.circle(point.x, point.y, this.layout.cell * 0.62).stroke({
          color: region.zone === "NULL" ? 0xff5571 : 0xff9b54,
          alpha: region.zone === "NULL" ? 0.34 : 0.26,
          width: this.worldWidth(1.5)
        });
      }
    }

    if (state.layers.range && state.useRange && state.driveTier < 5) {
      const selectedEndpoint = endpointById.get(state.selected);
      const selected = selectedEndpoint ? byCoord.get(selectedEndpoint.region) : byCoord.get(state.selected);
      if (selected) {
        const range = state.driveTier === 4 ? 5 : state.driveTier;
        const minCol = Math.max(0, selected.col - range);
        const maxCol = Math.min(7, selected.col + range);
        const minRow = Math.max(0, selected.row - range);
        const maxRow = Math.min(7, selected.row + range);
        const start = this.rectFor(byCoord.get(`${String.fromCharCode(65 + minCol)}${minRow + 1}`)!);
        const end = this.rectFor(byCoord.get(`${String.fromCharCode(65 + maxCol)}${maxRow + 1}`)!);
        this.overlays.roundRect(start.x - 8, start.y - 8, end.x + end.w - start.x + 16, end.y + end.h - start.y + 16, 18)
          .stroke({ color: 0xc49cff, alpha: 0.72, width: this.worldWidth(2) });
      }
    }

    if (state.layers.gates) {
      for (const gate of gates) {
        const a = locationById.get(gate.a);
        const b = locationById.get(gate.b);
        const p1 = a ? this.pointForLocation(a) : null;
        const p2 = b ? this.pointForLocation(b) : null;
        if (!p1 || !p2) continue;
        this.overlays.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ color: 0x71d5ff, alpha: 0.42, width: this.worldWidth(2) });
        this.drawGateNode(p1.x, p1.y, 0.8);
        this.drawGateNode(p2.x, p2.y, 0.8);
      }
    }
  }

  private drawRouteBase(): void {
    const state = this.state;
    if (!state) return;
    this.routeLayer.clear();
    if (state.route.length < 2) return;

    for (let index = 1; index < state.route.length; index += 1) {
      const a = this.pointForStep(state.route[index - 1]);
      const b = this.pointForStep(state.route[index]);
      this.routeLayer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
        color: state.route[index].mode === "gate" ? 0x71d5ff : state.route[index].mode === "impulse" ? 0xf5d760 : 0xc49cff,
        alpha: 0.32,
        width: this.worldWidth(5)
      });
    }
  }

  private drawAnimatedEffects(): void {
    const state = this.state;
    if (!state) return;
    this.effects.clear();
    const pulse = 0.55 + Math.sin(this.routePhase * 2.8) * 0.25;
    const lod = this.lodState();
    const hitMode = this.hitMode();
    const overlayAlpha = Math.max(lod.regionAlpha, lod.sectorAlpha);

    if (this.hoveredEndpoint) {
      const endpoint = endpointById.get(this.hoveredEndpoint);
      if (endpoint?.kind === "sector") {
        const region = byCoord.get(endpoint.region);
        if (region) this.drawSectorFill(this.hoveredEndpoint, zoneColors[region.zone], 0.16 + pulse * 0.08, hitMode);
      } else {
        this.drawEndpointGlow(this.hoveredEndpoint, 0x71d5ff, 0.22 + pulse * 0.22, 8, hitMode);
      }
    } else if (this.hovered && hitMode === "region" && overlayAlpha > 0) {
      const region = byCoord.get(this.hovered);
      if (region) this.drawRegionFill(region, zoneColors[region.zone], (0.12 + pulse * 0.08) * overlayAlpha);
    }

    if (endpointById.has(state.selected)) {
      const endpoint = endpointById.get(state.selected);
      const selectedRegion = endpoint ? byCoord.get(endpoint.region) : undefined;
      const pad = endpoint?.kind === "sector" ? this.worldWidth(2) : 8;
      this.drawEndpointGlow(state.selected, selectedRegion ? zoneColors[selectedRegion.zone] : 0xc49cff, 0.34 + pulse * 0.28, pad, hitMode);
    } else {
      const selected = byCoord.get(state.selected);
      if (selected && hitMode === "region" && overlayAlpha > 0) this.drawGlow(selected, zoneColors[selected.zone], (0.28 + pulse * 0.3) * overlayAlpha, this.worldWidth(3));
    }

    if (state.layers.rifts) {
      for (const region of regions.filter((item) => item.zone === "FRONTIER" || item.zone === "NULL")) {
        const point = this.pointFor(region);
        const radius = this.layout.cell * (0.56 + (Math.sin(this.routePhase * 1.8 + region.col + region.row) + 1) * 0.06);
        this.effects.circle(point.x, point.y, radius).stroke({ color: region.zone === "NULL" ? 0xff5571 : 0xff9b54, alpha: 0.18, width: this.worldWidth(2) });
      }
    }

    if (state.route.length > 1) {
      for (let index = 1; index < state.route.length; index += 1) {
        const a = this.pointForStep(state.route[index - 1]);
        const b = this.pointForStep(state.route[index]);
        const color = state.route[index].mode === "gate" ? 0x71d5ff : state.route[index].mode === "impulse" ? 0xf5d760 : 0xc49cff;
        this.effects.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, alpha: 0.72, width: this.worldWidth(2.2) });
        const t = (this.routePhase * 0.18 + index * 0.17) % 1;
        this.effects.circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, this.worldWidth(4)).fill({ color, alpha: 0.95 });
      }
    }
  }

  private drawGlow(region: Region, color: number, alpha: number, pad: number): void {
    const rect = this.rectFor(region);
    this.effects.rect(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2)
      .stroke({ color, alpha, width: this.worldWidth(3) });
  }

  private drawRegionFill(region: Region, color: number, alpha: number): void {
    const rect = this.rectFor(region);
    this.effects.rect(rect.x, rect.y, rect.w, rect.h).fill({ color, alpha });
  }

  private drawSectorFill(endpointId: string, color: number, alpha: number, hitMode = this.hitMode()): void {
    if (hitMode !== "sector") return;
    const endpoint = endpointById.get(endpointId);
    const region = endpoint ? byCoord.get(endpoint.region) : undefined;
    if (!endpoint || !region) return;
    const sector = region.sectors.find((item) => item.id === endpoint.sector);
    if (!sector) return;
    const start = this.pointForCoords(sector.xMin, sector.zMin);
    const end = this.pointForCoords(sector.xMax, sector.zMax);
    this.effects.rect(start.x, start.y, end.x - start.x, end.y - start.y)
      .fill({ color, alpha });
  }

  private drawEndpointGlow(endpointId: string, color: number, alpha: number, pad: number, hitMode = this.hitMode()): void {
    const endpoint = endpointById.get(endpointId);
    if (!endpoint) return;
    const region = byCoord.get(endpoint.region);
    if (!region) return;

    if (endpoint.kind === "sector") {
      if (hitMode !== "sector") return;
      const sector = region.sectors.find((item) => item.id === endpoint.sector);
      if (!sector) return;
      const start = this.pointForCoords(sector.xMin, sector.zMin);
      const end = this.pointForCoords(sector.xMax, sector.zMax);
      this.effects.rect(start.x - pad, start.y - pad, end.x - start.x + pad * 2, end.y - start.y + pad * 2)
        .stroke({ color, alpha, width: this.worldWidth(3) });
      return;
    }

    const point = this.pointForCoords(endpoint.x, endpoint.z);
    const radius = Math.max(this.worldWidth(12), this.layout.cell * 0.035) + pad * 0.2;
    this.effects.circle(point.x, point.y, radius)
      .stroke({ color, alpha, width: this.worldWidth(3) });
    this.effects.circle(point.x, point.y, Math.max(this.worldWidth(3), radius * 0.22))
      .fill({ color, alpha: Math.min(0.5, alpha * 0.75) });
  }

  private updateParticles(): void {
    const state = this.state;
    if (!state) return;
    if (!state.layers.rifts) {
      this.particles.length = 0;
      this.particlesLayer.clear();
      return;
    }
    if (this.particles.length < 90) {
      const sources = regions.filter((region) => region.zone === "NULL" || region.zone === "FRONTIER");
      const source = sources[Math.floor(Math.random() * sources.length)];
      if (source) {
        const point = this.pointFor(source);
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.25 + Math.random() * 0.65;
        this.particles.push({
          x: point.x + (Math.random() - 0.5) * this.layout.cell * 0.8,
          y: point.y + (Math.random() - 0.5) * this.layout.cell * 0.8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 50 + Math.random() * 80,
          color: zoneColors[source.zone],
          size: this.worldWidth(1.2 + Math.random() * 2.2)
        });
      }
    }

    this.particlesLayer.clear();
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life += 1;
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.life >= particle.maxLife) {
        this.particles.splice(index, 1);
        continue;
      }
      this.particlesLayer.circle(particle.x, particle.y, particle.size).fill({ color: particle.color, alpha: 1 - particle.life / particle.maxLife });
    }
  }

  private drawSectors(): void {
    const state = this.state;
    if (!state) return;
    this.regionLayer.removeChildren();
    this.sectorLayer.removeChildren();
    this.contentLayer.removeChildren();

    const search = state.search.trim().toLowerCase();
    const originEndpoint = endpointById.get(state.origin);
    const destinationEndpoint = endpointById.get(state.destination);
    const hitMode = this.hitMode();

    for (const region of regions) {
      const rect = this.rectFor(region);
      const color = zoneColors[region.zone];
      const visible = state.activeZones.has(region.zone) && (!search || `${region.coord} ${region.name} ${region.slug} ${region.zone}`.toLowerCase().includes(search));
      const origin = region.coord === originEndpoint?.region;
      const destination = region.coord === destinationEndpoint?.region;

      const regionGraphic = new Graphics();
      regionGraphic.alpha = visible ? 1 : 0.18;
      regionGraphic.rect(rect.x, rect.y, rect.w, rect.h)
        .fill({ color, alpha: state.layers.threat ? 0.35 : 0.24 })
        .stroke({ color, alpha: 0.55, width: this.worldWidth(1.2) });
      regionGraphic.rect(rect.x + 8, rect.y + 6, Math.max(12, rect.w * 0.36), this.worldWidth(2)).fill({ color, alpha: 0.26 });

      const sectorGraphic = new Graphics();
      sectorGraphic.alpha = visible ? 1 : 0.18;
      for (const sector of region.sectors) {
        const start = this.pointForCoords(sector.xMin, sector.zMin);
        const end = this.pointForCoords(sector.xMax, sector.zMax);
        const sectorActive = (origin && originEndpoint?.sector === sector.id) || (destination && destinationEndpoint?.sector === sector.id);
        sectorGraphic.rect(start.x, start.y, end.x - start.x, end.y - start.y)
          .fill({ color, alpha: sectorActive ? 0.18 : 0.055 })
          .stroke({ color, alpha: sectorActive ? 0.92 : 0.45, width: this.worldWidth(sectorActive ? 1.8 : 1) });
      }

      if (origin || destination) this.drawSectorMark(regionGraphic, rect, origin ? 0x71d5ff : 0xc49cff);

      this.regionLayer.addChild(regionGraphic);
      this.sectorLayer.addChild(sectorGraphic);

      if (hitMode === "region") {
        const hitTile = this.createMapHitTarget(region, rect.x, rect.y, rect.w, rect.h);
        this.contentLayer.addChild(hitTile);
      } else if (hitMode === "sector") {
        for (const sector of region.sectors) {
          const start = this.pointForCoords(sector.xMin, sector.zMin);
          const end = this.pointForCoords(sector.xMax, sector.zMax);
          const hitTile = this.createMapHitTarget(region, start.x, start.y, end.x - start.x, end.y - start.y, sector.id);
          this.contentLayer.addChild(hitTile);
        }
      }

    }

    for (const location of locations) {
      if (location.hidden || !location.sector || !state.activeZones.has(location.zone)) continue;
      const region = byCoord.get(location.region);
      const point = this.pointForLocation(location);
      if (!region || !point) continue;
      const visible = !search || `${location.name} ${location.kind} ${location.region} ${location.zone} ${location.resources?.join(" ") ?? ""}`.toLowerCase().includes(search);
      const marker = new Graphics();
      marker.eventMode = "static";
      marker.cursor = "pointer";
      marker.alpha = visible ? 1 : 0.18;
      const markerColor = this.locationColor(location);
      const markerRadius = this.worldWidth(4.8);
      const endpointId = `location:${location.id}`;
      marker.circle(point.x, point.y, Math.max(this.worldWidth(14), markerRadius * 2.4)).fill({ color: 0x000000, alpha: 0.001 });
      if (location.kind === "gate") {
        const r = this.worldWidth(7);
        marker.poly([point.x, point.y - r, point.x + r, point.y, point.x, point.y + r, point.x - r, point.y])
          .fill({ color: 0x07101e, alpha: 0.94 })
          .stroke({ color: markerColor, alpha: 0.92, width: this.worldWidth(1.8) });
      } else if (location.kind === "belt") {
        if (this.hitMode() !== "region" && location.radius) {
          marker.circle(point.x, point.y, this.unitsToWorld(location.radius))
            .fill({ color: markerColor, alpha: 0.045 })
            .stroke({ color: markerColor, alpha: 0.28, width: this.worldWidth(1.2) });
        }
        marker.circle(point.x, point.y, markerRadius).stroke({ color: markerColor, alpha: 0.92, width: this.worldWidth(2) });
      } else {
        marker.circle(point.x, point.y, this.worldWidth(4.6)).fill({ color: markerColor, alpha: 0.9 });
      }
      marker.on("pointerover", () => {
        this.hoveredEndpoint = endpointId;
      });
      marker.on("pointerout", () => {
        if (this.hoveredEndpoint === endpointId) this.hoveredEndpoint = null;
      });
      marker.on("pointertap", (event) => {
        const original = event as unknown as { altKey?: boolean; shiftKey?: boolean };
        if (this.suppressNextTap) {
          this.suppressNextTap = false;
          return;
        }
        if (original.shiftKey) this.onSetDestination(endpointId);
        else if (original.altKey) this.onSetOrigin(endpointId);
        else this.onSelect(endpointId);
      });
      this.contentLayer.addChild(marker);
    }
  }

  private drawLabels(): void {
    const state = this.state;
    if (!state) return;
    this.regionLabels.removeChildren();
    this.sectorRegionLabels.removeChildren();
    this.sectorLabels.removeChildren();

    for (const region of regions) {
      const rect = this.rectFor(region);
      const color = zoneColors[region.zone];
      if (state.layers.labels) {
        const denseLabels = this.layout.cell > 58;
        const nameMax = Math.max(5, Math.floor(rect.w / 7));
        const slugMax = Math.max(6, Math.floor(rect.w / 6));
        this.drawHudText(this.regionLabels, region.coord, rect.x + 9, rect.y + 10, color, Math.max(16, this.layout.cell * 0.24), "left", 900);
        if (denseLabels) {
          this.drawHudText(this.regionLabels, fitText(region.name, nameMax), rect.x + 9, rect.y + rect.h * 0.43, 0xedf5ff, Math.max(11, this.layout.cell * 0.145), "left", 800);
          if (rect.w > 48) this.drawHudText(this.regionLabels, fitText(region.slug, slugMax), rect.x + 9, rect.y + rect.h * 0.62, 0xa9b8cf, Math.max(9, this.layout.cell * 0.105), "left", 600);
        }
        this.drawHudText(this.sectorRegionLabels, region.coord, rect.x + rect.w / 2, rect.y + rect.h / 2 - this.layout.cell * 0.1, color, this.layout.cell * 0.2, "center", 900);
        for (const sector of region.sectors) {
          const start = this.pointForCoords(sector.xMin, sector.zMin);
          const end = this.pointForCoords(sector.xMax, sector.zMax);
          this.drawHudText(this.sectorLabels, sector.id, (start.x + end.x) / 2, (start.y + end.y) / 2 - this.layout.cell * 0.08, 0xa9b8cf, this.layout.cell * 0.135, "center", 800);
        }
      } else {
        this.drawHudText(this.regionLabels, region.coord, rect.x + rect.w / 2, rect.y + rect.h / 2, color, Math.max(17, this.layout.cell * 0.28), "center", 900);
      }
    }
  }

  private drawEndpointLabels(): void {
    const state = this.state;
    if (!state) return;
    this.endpointLabels.removeChildren();
    const originEndpoint = endpointById.get(state.origin);
    const destinationEndpoint = endpointById.get(state.destination);
    for (const [endpoint, text] of [[originEndpoint, "START"], [destinationEndpoint, "END"]] as const) {
      if (!endpoint) continue;
      const region = byCoord.get(endpoint.region);
      if (!region) continue;
      const rect = this.rectFor(region);
      const { x, y } = this.sectorMarkLabelPoint(rect);
      this.drawHudText(this.endpointLabels, text, x, y, 0x04111d, Math.max(8, this.layout.cell * 0.1), "center", 900);
    }
  }

  private createMapHitTarget(region: Region, x: number, y: number, w: number, h: number, fixedSector?: SectorName): Graphics {
    const hitTile = new Graphics();
    hitTile.eventMode = "static";
    hitTile.cursor = "pointer";
    hitTile.rect(x, y, w, h).fill({ color: 0x000000, alpha: 0.001 });
    const hoverId = fixedSector ? `sector:${region.coord}:${fixedSector}` : null;
    hitTile.on("pointerover", () => {
      if (hoverId) this.hoveredEndpoint = hoverId;
      else this.hovered = region.coord;
    });
    hitTile.on("pointerout", () => {
      if (hoverId && this.hoveredEndpoint === hoverId) this.hoveredEndpoint = null;
      if (!hoverId && this.hovered === region.coord) this.hovered = null;
    });
    hitTile.on("pointertap", (event) => {
      const original = event as unknown as { altKey?: boolean; shiftKey?: boolean; global?: { x: number; y: number } };
      if (this.suppressNextTap) {
        this.suppressNextTap = false;
        return;
      }
      const point = original.global ? this.screenToWorld(original.global.x, original.global.y) : this.pointFor(region);
      const mapX = clamp(((point.x - this.layout.originX) / this.layout.width) * GALAXY_SIZE, region.xMin, region.xMax - 1);
      const mapZ = clamp(((point.y - this.layout.originY) / this.layout.height) * GALAXY_SIZE, region.zMin, region.zMax - 1);
      const sector = fixedSector ?? sectorForPoint(region, mapX, mapZ);
      const endpointId = `sector:${region.coord}:${sector}`;
      if (original.shiftKey) this.onSetDestination(endpointId);
      else if (original.altKey) this.onSetOrigin(endpointId);
      else this.onSelect(fixedSector ? endpointId : region.coord);
    });
    return hitTile;
  }

  private locationColor(location: MapLocation): number {
    return ({
      station: 0xecf5ff,
      planet: 0x58e794,
      belt: 0xf5d760,
      gate: 0x71d5ff,
      wreck: 0xff9b54,
      system: 0xc49cff
    })[location.kind];
  }

  private drawGateNode(x: number, y: number, alpha: number): void {
    const r = this.worldWidth(9);
    this.overlays.poly([x, y - r, x + r, y, x, y + r, x - r, y])
      .fill({ color: 0x07101e, alpha: 0.88 })
      .stroke({ color: 0x71d5ff, alpha, width: this.worldWidth(2) });
  }

  private unitsToWorld(units: number): number {
    return (units / GALAXY_SIZE) * this.layout.width;
  }

  private drawSectorMark(target: Graphics, rect: { x: number; y: number; w: number; h: number }, color: number): void {
    target.poly(chamferPoints(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 8)).fill({ color, alpha: 0.1 });
    const { tabX, tabY, tabW } = this.sectorMarkGeometry(rect);
    target.poly([tabX + 6, tabY, tabX + tabW, tabY, tabX + tabW, rect.y + 1, tabX, rect.y + 1, tabX, tabY + 6])
      .fill({ color, alpha: 1 });
  }

  private sectorMarkGeometry(rect: { x: number; y: number; w: number; h: number }): { tabX: number; tabY: number; tabW: number } {
    const tabW = Math.max(46, Math.min(64, rect.w * 0.62));
    const tabX = rect.x + (rect.w - tabW) / 2;
    const tabY = rect.y - Math.max(15, Math.min(18, rect.h * 0.21)) * 0.68;
    return { tabX, tabY, tabW };
  }

  private sectorMarkLabelPoint(rect: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
    const { tabX, tabY, tabW } = this.sectorMarkGeometry(rect);
    return { x: tabX + tabW / 2, y: tabY + 3 };
  }

  private drawHudText(target: Container, value: string, x: number, y: number, color: number, size: number, align: "left" | "center", weight = 700): void {
    const fontWeight = weight >= 900 ? "900" : weight >= 800 ? "800" : weight >= 700 ? "700" : "600";
    const text = new Text({
      text: value,
      style: {
        fill: color,
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: size,
        fontWeight,
        align
      }
    });
    text.x = x;
    text.y = y;
    text.resolution = 8;
    if (align === "center") text.anchor.set(0.5, 0);
    target.addChild(text);
  }

}
