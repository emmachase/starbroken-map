import "pixi.js/html-source";
import { Application, Assets, BlurFilter, Container, Graphics, Sprite, Text, Texture, TilingSprite } from "pixi.js";
import { HTMLSource } from "pixi.js/html-source";
import type { HTMLSourceCanvas } from "pixi.js/html-source";
import { byCoord, endpointById, GALAXY_SIZE, gates, locationById, locations, regions, sectorForPoint, zoneColors } from "../data/galaxy";
import type { AppState, MapLocation, Region, RouteStep, SectorName } from "../types";
import { clamp, fitText } from "./geometry";

interface GalaxyViewportOptions {
  root: HTMLElement;
  onSelect: (coord: string) => void;
  onSetOrigin: (coord: string) => void;
  onSetDestination: (coord: string) => void;
  onControlHost?: (id: ControlIslandId, element: HTMLDivElement | null) => void;
  onControlTransitionEnd?: (id: DrawerId, expanded: boolean) => void;
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
type ControlIslandId =
  | "top-console"
  | "search-popover"
  | "bottom-route-command"
  | "layer-dock"
  | "left-vector-tab"
  | "left-vector-panel"
  | "right-signal-tab"
  | "right-signal-panel"
  | "toast-console";
type DrawerId = "left-vector-drawer" | "right-signal-inspector";
type NavcomAssetId =
  | "noise-blue"
  | "noise-red"
  | "scanline-mask"
  | "spark-dot"
  | "ring-soft"
  | "glass-smudge"
  | "reticle-ping";

const MAX_ZOOM = 100;
const SECTOR_LOD_THRESHOLD = 1.4;
const COMPONENT_LOD_THRESHOLD = 3.8;
const LOD12_TRANSITION_SPEED = 0.1;
const REGION_FRAME_SCALE = 1.18;
const SECTOR_FRAME_SCALE = 2.2;
const CONTROL_REVEAL_STEP = 0.03;
const CONTROL_REVEAL_MAX_ALPHA = 0.92;
const CONTROL_FADE_STEP = 0.055;
const TOP_CONSOLE_RECT: ControlIslandRect = { x: 16, y: 14, width: 560, height: 186 };
const SEARCH_POPOVER_RECT: ControlIslandRect = { x: 0, y: 84, width: 304, height: 156 };
const BOTTOM_ROUTE_RECT: ControlIslandRect = { x: 16, y: 0, width: 820, height: 138 };
const LAYER_DOCK_RECT: ControlIslandRect = { x: 0, y: 96, width: 84, height: 236 };
const LEFT_VECTOR_RECT: ControlIslandRect = { x: 16, y: 92, width: 332, height: 520 };
const RIGHT_INSPECTOR_RECT: ControlIslandRect = { x: 0, y: 92, width: 332, height: 520 };
const TOAST_RECT: ControlIslandRect = { x: 0, y: 18, width: 340, height: 42 };
const NAVCOM_ASSETS: Array<{ alias: NavcomAssetId; src: string }> = [
  { alias: "noise-blue", src: new URL("../assets/navcom/noise-blue.svg", import.meta.url).href },
  { alias: "noise-red", src: new URL("../assets/navcom/noise-red.svg", import.meta.url).href },
  { alias: "scanline-mask", src: new URL("../assets/navcom/scanline-mask.svg", import.meta.url).href },
  { alias: "spark-dot", src: new URL("../assets/navcom/spark-dot.svg", import.meta.url).href },
  { alias: "ring-soft", src: new URL("../assets/navcom/ring-soft.svg", import.meta.url).href },
  { alias: "glass-smudge", src: new URL("../assets/navcom/glass-smudge.svg", import.meta.url).href },
  { alias: "reticle-ping", src: new URL("../assets/navcom/reticle-ping.svg", import.meta.url).href }
];

interface ControlIslandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawerTransition {
  progress: number;
  target: number;
  background: Graphics;
  border: Graphics;
  panelMask: Graphics;
}

interface ControlIsland {
  id: ControlIslandId;
  element: HTMLDivElement;
  rect: ControlIslandRect;
  source: HTMLSource;
  sprite: Sprite;
  background: Graphics | null;
  border: Graphics | null;
  contentMask: Graphics | null;
  sourceWidth: number;
  sourceHeight: number;
  visualAlpha: number;
  targetAlpha: number;
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
  private readonly onControlHost?: (id: ControlIslandId, element: HTMLDivElement | null) => void;
  private readonly onControlTransitionEnd?: (id: DrawerId, expanded: boolean) => void;
  private readonly app = new Application();
  private readonly screenRoot = new Container();
  private readonly starfieldLayer = new Container();
  private readonly deepSpaceNoiseLayer = new Container();
  private readonly mapWorldLayer = new Container();
  private readonly mapRouteLayer = new Container();
  private readonly mapSensorFxLayer = new Container();
  private readonly htmlControlLayer = new Container();
  private readonly glassOverlayLayer = new Container();
  private readonly alertInterferenceLayer = new Container();
  private readonly cursorReticleLayer = new Container();
  private readonly glassTint = new Graphics();
  private readonly alertInterference = new Graphics();
  private readonly world = new Container();
  private readonly bloomWorld = new Container();
  private readonly bloomGridLayer = new Graphics();
  private readonly bloomSectorLayer = new Graphics();
  private readonly bloomOverlayLayer = new Graphics();
  private readonly bloomRouteLayer = new Graphics();
  private readonly bloomEffects = new Graphics();
  private readonly bloomFilter = new BlurFilter({ strength: 7, quality: 3, kernelSize: 9 });
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
  private readonly effects = new Graphics();
  private readonly mapReticleLayer = new Container();
  private readonly routeSparkLayer = new Container();
  private readonly particlesLayer = new Graphics();
  private readonly resizeObserver: ResizeObserver;
  private readonly handleCanvasPaint = (): void => this.syncControlIslandTransforms();
  private readonly camera: Camera = { x: 0, y: 0, scale: 1, targetX: 0, targetY: 0, targetScale: 1 };
  private readonly particles: Particle[] = [];
  private readonly navcomTextures = new Map<NavcomAssetId, Texture>();
  private readonly controlIslands = new Map<ControlIslandId, ControlIsland>();
  private readonly expandedControlIslands = new Set<ControlIslandId>();
  private readonly expandedDrawers = new Set<DrawerId>();
  private readonly drawerTransitions = new Map<DrawerId, DrawerTransition>();
  private readonly routeSparkSprites: Sprite[] = [];
  private selectedReticleSprite: Sprite | null = null;
  private rangeRingSprite: Sprite | null = null;
  private blueNoiseSprite: TilingSprite | null = null;
  private redNoiseSprite: TilingSprite | null = null;
  private scanlineSprite: TilingSprite | null = null;
  private glassSmudgeSprite: TilingSprite | null = null;
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
  private renderedSelected = "";
  private lod12Blend = 0;
  private routeCommitFlash = 0;
  private controlIslandAnimating = false;

  constructor(options: GalaxyViewportOptions) {
    this.root = options.root;
    this.onSelect = options.onSelect;
    this.onSetOrigin = options.onSetOrigin;
    this.onSetDestination = options.onSetDestination;
    this.onControlHost = options.onControlHost;
    this.onControlTransitionEnd = options.onControlTransitionEnd;
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
    this.glassOverlayLayer.addChild(this.glassTint);
    this.createDisplayMaterial();
    this.bloomWorld.alpha = 0.48;
    this.bloomWorld.blendMode = "add";
    this.bloomWorld.filters = [this.bloomFilter];
    this.bloomWorld.addChild(
      this.bloomGridLayer,
      this.bloomSectorLayer,
      this.bloomOverlayLayer,
      this.bloomRouteLayer,
      this.bloomEffects
    );
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
      this.effects,
      this.mapReticleLayer,
      this.routeSparkLayer,
      this.particlesLayer
    );
    this.starfieldLayer.addChild(this.background);
    this.mapWorldLayer.addChild(this.bloomWorld, this.world);
    this.alertInterferenceLayer.addChild(this.alertInterference);
    this.screenRoot.addChild(
      this.starfieldLayer,
      this.deepSpaceNoiseLayer,
      this.mapWorldLayer,
      this.mapRouteLayer,
      this.mapSensorFxLayer,
      this.htmlControlLayer,
      this.glassOverlayLayer,
      this.alertInterferenceLayer,
      this.cursorReticleLayer
    );
    this.app.stage.addChild(this.screenRoot);
    this.createControlIslands();
    this.resizeObserver.observe(this.root);
    this.bindCameraInput();
    this.app.ticker.add(() => this.tick());
    this.resize();
  }

  setState(state: AppState): void {
    const previousSelected = this.renderedSelected;
    const nextRouteSignature = this.routeSignature(state);
    if (this.lastRouteSignature && nextRouteSignature !== this.lastRouteSignature) this.routeCommitFlash = 1;
    this.state = state;
    this.renderStatic();
    this.drawAnimatedEffects();
    if (previousSelected && state.selected !== previousSelected) this.focusSelected();
    this.renderedSelected = state.selected;
  }

  requestControlPaint(id?: ControlIslandId): void {
    if (id) {
      this.controlIslands.get(id)?.source.requestPaint();
      return;
    }
    for (const island of this.controlIslands.values()) island.source.requestPaint();
  }

  setControlIslandExpanded(id: ControlIslandId | DrawerId, expanded: boolean, onComplete?: () => void): void {
    if (this.isDrawerId(id)) {
      this.setDrawerExpanded(id, expanded, onComplete);
      return;
    }

    const had = this.expandedControlIslands.has(id);
    if (had === expanded) return;
    if (expanded) this.expandedControlIslands.add(id);
    else this.expandedControlIslands.delete(id);
    this.layoutControlIslands();
    this.requestControlPaint(id);
    if (this.isFadingControlIsland(id)) this.controlIslandAnimating = true;
    onComplete?.();
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

  private createDisplayMaterial(): void {
    const blueNoise = this.navcomTextures.get("noise-blue");
    const redNoise = this.navcomTextures.get("noise-red");
    const scanlines = this.navcomTextures.get("scanline-mask");
    const smudge = this.navcomTextures.get("glass-smudge");

    if (blueNoise) {
      this.blueNoiseSprite = new TilingSprite({ texture: blueNoise, width: 1, height: 1 });
      this.blueNoiseSprite.alpha = 0.045;
      this.blueNoiseSprite.blendMode = "screen";
      this.deepSpaceNoiseLayer.addChild(this.blueNoiseSprite);
    }

    if (scanlines) {
      this.scanlineSprite = new TilingSprite({ texture: scanlines, width: 1, height: 1 });
      this.scanlineSprite.alpha = 0.022;
      this.scanlineSprite.blendMode = "multiply";
      this.glassOverlayLayer.addChild(this.scanlineSprite);
    }

    if (smudge) {
      this.glassSmudgeSprite = new TilingSprite({ texture: smudge, width: 1, height: 1 });
      this.glassSmudgeSprite.alpha = 0.11;
      this.glassSmudgeSprite.blendMode = "screen";
      this.glassSmudgeSprite.tint = 0xa7e2ff;
      this.glassOverlayLayer.addChild(this.glassSmudgeSprite);
    }

    if (redNoise) {
      this.redNoiseSprite = new TilingSprite({ texture: redNoise, width: 1, height: 1 });
      this.redNoiseSprite.alpha = 0;
      this.redNoiseSprite.blendMode = "screen";
      this.alertInterferenceLayer.addChild(this.redNoiseSprite);
    }
  }

  private createControlIslands(): void {
    if (!this.htmlCanvas?.requestPaint) {
      this.showHtmlSourceWarning();
      return;
    }

    this.createControlIslandHost("top-console", "navcom-top-console-island", TOP_CONSOLE_RECT);
    this.createControlIslandHost("search-popover", "navcom-search-popover-island", this.searchPopoverRect());
    this.createControlIslandHost("left-vector-tab", "navcom-vector-drawer-tab-island", this.leftVectorTabRect());
    this.createControlIslandHost("left-vector-panel", "navcom-vector-drawer-panel-island", this.leftVectorPanelRect());
    this.createControlIslandHost("right-signal-tab", "navcom-signal-inspector-tab-island", this.rightInspectorTabRect());
    this.createControlIslandHost("right-signal-panel", "navcom-signal-inspector-panel-island", this.rightInspectorPanelRect());
    this.createDrawerChrome("left-vector-drawer");
    this.createDrawerChrome("right-signal-inspector");
    this.createControlIslandHost("bottom-route-command", "navcom-bottom-route-island", this.bottomRouteRect());
    this.createControlIslandHost("layer-dock", "navcom-layer-dock-island", this.layerDockRect());
    this.createControlIslandHost("toast-console", "navcom-toast-console-island", this.toastRect());
    this.htmlCanvas.addEventListener("paint", this.handleCanvasPaint);
    this.layoutControlIslands();
    this.requestControlPaint();
  }

  private createControlIslandHost(id: ControlIslandId, className: string, rect: ControlIslandRect): void {
    const element = document.createElement("div");
    element.className = `navcom-canvas-island ${className}`;
    element.dataset.island = id;
    this.app.canvas.appendChild(element);
    this.registerControlIsland(this.createHtmlControlIsland(id, element, rect));
    this.onControlHost?.(id, element);
  }

  private createHtmlControlIsland(id: ControlIslandId, element: HTMLDivElement, rect: ControlIslandRect): ControlIsland {
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    element.style.transformOrigin = "0 0";
    const source = new HTMLSource({
      resource: element,
      canvas: this.htmlCanvas!,
      autoRequestPaint: true
    });
    const sprite = Sprite.from(source);
    const usesStaticChrome = !this.isDrawerSurface(id);
    const background = usesStaticChrome ? new Graphics() : null;
    const border = usesStaticChrome ? new Graphics() : null;
    const contentMask = usesStaticChrome ? new Graphics() : null;
    const initialAlpha = this.isFadingControlIsland(id) ? 0 : CONTROL_REVEAL_MAX_ALPHA;
    sprite.alpha = initialAlpha;
    if (background) this.htmlControlLayer.addChild(background);
    this.htmlControlLayer.addChild(sprite);
    if (contentMask) {
      sprite.mask = contentMask;
      this.htmlControlLayer.addChild(contentMask);
    }
    if (border) this.htmlControlLayer.addChild(border);
    return {
      id,
      element,
      rect,
      source,
      sprite,
      background,
      border,
      contentMask,
      sourceWidth: rect.width,
      sourceHeight: rect.height,
      visualAlpha: initialAlpha,
      targetAlpha: initialAlpha,
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
      this.onControlHost?.(island.id, null);
      if (island.transformCorrectionFrame) window.cancelAnimationFrame(island.transformCorrectionFrame);
      if (island.background) this.htmlControlLayer.removeChild(island.background);
      this.htmlControlLayer.removeChild(island.sprite);
      if (island.contentMask) this.htmlControlLayer.removeChild(island.contentMask);
      if (island.border) this.htmlControlLayer.removeChild(island.border);
      island.background?.destroy();
      island.contentMask?.destroy();
      island.border?.destroy();
      island.sprite.destroy({ texture: true, textureSource: false });
      island.source.destroy();
      island.element.remove();
    }
    for (const transition of this.drawerTransitions.values()) {
      transition.background.destroy();
      transition.border.destroy();
      transition.panelMask.destroy();
    }
    this.drawerTransitions.clear();
    this.controlIslands.clear();
  }

  private showHtmlSourceWarning(): void {
    const warning = document.createElement("div");
    warning.className = "navcom-htmlsource-warning";
    warning.innerHTML = "HTML-in-canvas unavailable (CHROME ONLY): <a href=\"chrome://flags/#canvas-draw-element\">enable the experimental browser API for NAVCOM control compositing.</a>";
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
    this.layoutDisplayMaterial();
    this.layoutControlIslands();
    this.renderStatic();
    this.fitMap(false);
  }

  private layoutControlIslands(): void {
    const topConsole = this.controlIslands.get("top-console");
    const searchPopover = this.controlIslands.get("search-popover");
    const bottomRoute = this.controlIslands.get("bottom-route-command");
    const layerDock = this.controlIslands.get("layer-dock");
    const leftVectorTab = this.controlIslands.get("left-vector-tab");
    const leftVectorPanel = this.controlIslands.get("left-vector-panel");
    const rightInspectorTab = this.controlIslands.get("right-signal-tab");
    const rightInspectorPanel = this.controlIslands.get("right-signal-panel");
    const toast = this.controlIslands.get("toast-console");
    if (topConsole) topConsole.rect = this.topConsoleRect();
    if (searchPopover) searchPopover.rect = this.searchPopoverRect();
    if (bottomRoute) bottomRoute.rect = this.bottomRouteRect();
    if (layerDock) layerDock.rect = this.layerDockRect();
    if (leftVectorTab) leftVectorTab.rect = this.leftVectorTabRect();
    if (leftVectorPanel) leftVectorPanel.rect = this.leftVectorPanelRect();
    if (rightInspectorTab) rightInspectorTab.rect = this.rightInspectorTabRect();
    if (rightInspectorPanel) rightInspectorPanel.rect = this.rightInspectorPanelRect();
    if (toast) toast.rect = this.toastRect();
    for (const island of this.controlIslands.values()) this.layoutControlIsland(island);
    this.updateDrawerVisuals(true);
  }

  private bottomRouteRect(): ControlIslandRect {
    const width = Math.min(BOTTOM_ROUTE_RECT.width, Math.max(360, this.root.clientWidth - 32));
    const height = this.root.clientWidth < 640 ? 178 : BOTTOM_ROUTE_RECT.height;
    return {
      ...BOTTOM_ROUTE_RECT,
      width,
      height,
      y: Math.max(86, this.root.clientHeight - height - 16)
    };
  }

  private topConsoleRect(): ControlIslandRect {
    const width = Math.min(TOP_CONSOLE_RECT.width, Math.max(200, this.root.clientWidth - 32));
    return {
      ...TOP_CONSOLE_RECT,
      width,
      height: 64
    };
  }

  private searchPopoverRect(): ControlIslandRect {
    const top = this.topConsoleRect();
    const expanded = this.expandedControlIslands.has("search-popover");
    const width = Math.min(SEARCH_POPOVER_RECT.width, Math.max(220, top.width - 28));
    return {
      ...SEARCH_POPOVER_RECT,
      x: top.x + top.width - width - 12,
      y: top.y + top.height + 8,
      width,
      height: expanded ? SEARCH_POPOVER_RECT.height : 1
    };
  }

  private layerDockRect(): ControlIslandRect {
    const bottomInset = 16;
    if (this.root.clientWidth < 640) {
      const height = 208;
      return {
        ...LAYER_DOCK_RECT,
        x: Math.max(16, this.root.clientWidth - LAYER_DOCK_RECT.width - 16),
        y: Math.max(this.topConsoleRect().y + this.topConsoleRect().height + 14, this.root.clientHeight - height - bottomInset),
        height
      };
    }

    return {
      ...LAYER_DOCK_RECT,
      x: Math.max(16, this.root.clientWidth - LAYER_DOCK_RECT.width - 16),
      y: Math.max(this.topConsoleRect().y + this.topConsoleRect().height + 14, this.root.clientHeight - LAYER_DOCK_RECT.height - bottomInset)
    };
  }

  private leftVectorTabRect(): ControlIslandRect {
    const top = this.topConsoleRect();
    const y = top.y + top.height + 14;
    return {
      ...LEFT_VECTOR_RECT,
      y,
      width: 38,
      height: 78
    };
  }

  private leftVectorPanelRect(): ControlIslandRect {
    const top = this.topConsoleRect();
    const y = top.y + top.height + 14;
    const compact = this.root.clientWidth < 640;
    const width = compact ? Math.max(120, this.root.clientWidth - LAYER_DOCK_RECT.width - 64) : LEFT_VECTOR_RECT.width;
    const availableHeight = this.root.clientHeight - y - BOTTOM_ROUTE_RECT.height - 34;
    return {
      ...LEFT_VECTOR_RECT,
      y,
      width,
      height: compact ? 220 : Math.max(300, Math.min(LEFT_VECTOR_RECT.height, availableHeight))
    };
  }

  private rightInspectorTabRect(): ControlIslandRect {
    const top = this.topConsoleRect();
    const compact = this.root.clientWidth < 640;
    const compactY = top.y + top.height + 14 + 172;
    const y = compact ? compactY : top.y + top.height + 14;
    return {
      ...RIGHT_INSPECTOR_RECT,
      x: compact ? 16 : Math.max(364, this.root.clientWidth - 38 - 16),
      y: compact ? top.y + top.height + 108 : y,
      width: 38,
      height: 78
    };
  }

  private rightInspectorPanelRect(): ControlIslandRect {
    const top = this.topConsoleRect();
    const compact = this.root.clientWidth < 640;
    const compactY = top.y + top.height + 14 + 172;
    const y = compact ? compactY : top.y + top.height + 14;
    const width = compact ? Math.max(220, this.root.clientWidth - 32) : RIGHT_INSPECTOR_RECT.width;
    const availableHeight = this.root.clientHeight - y - BOTTOM_ROUTE_RECT.height - 34;
    return {
      ...RIGHT_INSPECTOR_RECT,
      x: compact ? 16 : Math.max(364, this.root.clientWidth - RIGHT_INSPECTOR_RECT.width - 16),
      y,
      width,
      height: compact ? 220 : Math.max(300, Math.min(RIGHT_INSPECTOR_RECT.height, availableHeight))
    };
  }

  private toastRect(): ControlIslandRect {
    const bottomRoute = this.bottomRouteRect();
    return {
      ...TOAST_RECT,
      x: Math.max(16, (this.root.clientWidth - TOAST_RECT.width) / 2),
      y: Math.max(this.topConsoleRect().y + this.topConsoleRect().height + 14, bottomRoute.y - TOAST_RECT.height - 12)
    };
  }

  private layoutControlIsland(island: ControlIsland): void {
    island.element.style.width = `${island.rect.width}px`;
    island.element.style.height = `${island.rect.height}px`;
    island.element.style.transformOrigin = "0 0";
    const sourceSizeChanged = island.sourceWidth !== island.rect.width || island.sourceHeight !== island.rect.height;
    if (sourceSizeChanged) this.recreateControlIslandSource(island);
    island.sprite.position.set(island.rect.x, island.rect.y);
    island.sprite.scale.set(1);
    const targetVisible = this.isControlIslandVisible(island.id);
    if (this.isFadingControlIsland(island.id)) {
      island.targetAlpha = targetVisible ? CONTROL_REVEAL_MAX_ALPHA : 0;
      island.sprite.visible = targetVisible || island.visualAlpha > 0.01;
      island.sprite.alpha = island.visualAlpha;
    } else {
      island.visualAlpha = targetVisible ? CONTROL_REVEAL_MAX_ALPHA : 0;
      island.targetAlpha = island.visualAlpha;
      island.sprite.visible = targetVisible;
      island.sprite.alpha = island.visualAlpha;
    }
    island.element.style.pointerEvents = island.sprite.visible ? "auto" : "none";
    island.source.resize(island.rect.width, island.rect.height);
    island.sourceWidth = island.rect.width;
    island.sourceHeight = island.rect.height;
    this.updateStaticIslandChrome(island);
    island.source.requestPaint();
  }

  private setDrawerExpanded(id: DrawerId, expanded: boolean, onComplete?: () => void): void {
    const transition = this.drawerTransitions.get(id);
    if (!transition) {
      onComplete?.();
      return;
    }

    if (expanded) this.expandedDrawers.add(id);
    else this.expandedDrawers.delete(id);
    transition.target = expanded ? 1 : 0;
    this.controlIslandAnimating = true;
    this.updateDrawerVisuals(true);
    this.requestControlPaint(this.drawerTabId(id));
    this.requestControlPaint(this.drawerPanelId(id));
    onComplete?.();
  }

  private isDrawerId(id: ControlIslandId | DrawerId): id is DrawerId {
    return id === "left-vector-drawer" || id === "right-signal-inspector";
  }

  private isControlIslandVisible(id: ControlIslandId): boolean {
    if (id === "search-popover" || id === "toast-console") return this.expandedControlIslands.has(id);
    return true;
  }

  private isFadingControlIsland(id: ControlIslandId): boolean {
    return id === "toast-console";
  }

  private updateControlIslandTransitions(): void {
    if (!this.controlIslandAnimating) return;
    this.controlIslandAnimating = false;

    for (const [id, transition] of this.drawerTransitions) {
      if (Math.abs(transition.progress - transition.target) > 0.001) {
        const previous = transition.progress;
        const direction = transition.target > transition.progress ? 1 : -1;
        transition.progress = clamp(transition.progress + CONTROL_REVEAL_STEP * direction, 0, 1);
        if (Math.abs(transition.progress - transition.target) <= 0.001 && Math.abs(previous - transition.target) > 0.001) {
          this.onControlTransitionEnd?.(id, transition.target === 1);
        }
        this.controlIslandAnimating = true;
      }
    }

    for (const island of this.controlIslands.values()) {
      if (!this.isFadingControlIsland(island.id)) continue;
      if (Math.abs(island.visualAlpha - island.targetAlpha) <= 0.001) continue;

      const direction = island.targetAlpha > island.visualAlpha ? 1 : -1;
      island.visualAlpha = clamp(island.visualAlpha + CONTROL_FADE_STEP * direction, 0, CONTROL_REVEAL_MAX_ALPHA);
      if (Math.abs(island.visualAlpha - island.targetAlpha) <= CONTROL_FADE_STEP) island.visualAlpha = island.targetAlpha;

      island.sprite.alpha = island.visualAlpha;
      island.sprite.visible = island.visualAlpha > 0.01 || island.targetAlpha > 0;
      island.element.style.pointerEvents = island.targetAlpha > 0.5 ? "auto" : "none";
      this.updateStaticIslandChrome(island);
      this.controlIslandAnimating = true;
    }

    this.updateDrawerVisuals(false);
  }

  private createDrawerChrome(id: DrawerId): void {
    const background = new Graphics();
    const border = new Graphics();
    const panelMask = new Graphics();
    this.htmlControlLayer.addChildAt(background, 0);
    this.htmlControlLayer.addChild(panelMask);
    this.htmlControlLayer.addChild(border);
    this.drawerTransitions.set(id, { progress: 0, target: 0, background, border, panelMask });
  }

  private isDrawerSurface(id: ControlIslandId): boolean {
    return id === "left-vector-tab" || id === "left-vector-panel" || id === "right-signal-tab" || id === "right-signal-panel";
  }

  private updateStaticIslandChrome(island: ControlIsland): void {
    if (!island.background || !island.border || !island.contentMask) return;
    const visible = island.sprite.visible;
    const alpha = CONTROL_REVEAL_MAX_ALPHA > 0 ? island.visualAlpha / CONTROL_REVEAL_MAX_ALPHA : 1;
    island.background.visible = visible;
    island.border.visible = visible;
    island.contentMask.visible = visible;
    island.background.alpha = alpha;
    island.border.alpha = alpha;
    this.drawChromeBackground(island.background, island.rect, 1);
    this.drawChromeBorder(island.border, island.rect, 1);
    this.drawChromeMask(island.contentMask, island.rect);
  }

  private updateDrawerVisuals(force: boolean): void {
    for (const [id, transition] of this.drawerTransitions) {
      const amount = this.easeInOutCubic(transition.progress);
      const tab = this.controlIslands.get(this.drawerTabId(id));
      const panel = this.controlIslands.get(this.drawerPanelId(id));
      if (!tab || !panel) continue;

      tab.sprite.alpha = CONTROL_REVEAL_MAX_ALPHA * (1 - amount);
      panel.sprite.alpha = CONTROL_REVEAL_MAX_ALPHA * amount;
      tab.sprite.visible = force || tab.sprite.alpha > 0.01;
      panel.sprite.visible = force || panel.sprite.alpha > 0.01;
      panel.sprite.mask = transition.panelMask;
      tab.element.style.pointerEvents = amount < 0.45 ? "auto" : "none";
      panel.element.style.pointerEvents = amount > 0.55 ? "auto" : "none";

      const chromeRect = this.lerpControlRect(tab.rect, panel.rect, amount);
      this.drawDrawerChrome(transition.background, transition.border, chromeRect, amount);
      this.drawDrawerMask(transition.panelMask, chromeRect);
    }
  }

  private drawDrawerChrome(background: Graphics, border: Graphics, rect: ControlIslandRect, amount: number): void {
    this.drawChromeBackground(background, rect, amount);
    this.drawChromeBorder(border, rect, amount);
  }

  private drawChromeBackground(background: Graphics, rect: ControlIslandRect, amount: number): void {
    background.clear();
    background
      .moveTo(rect.x + 12, rect.y)
      .lineTo(rect.x + rect.width, rect.y)
      .lineTo(rect.x + rect.width, rect.y + rect.height - 12)
      .lineTo(rect.x + rect.width - 12, rect.y + rect.height)
      .lineTo(rect.x, rect.y + rect.height)
      .lineTo(rect.x, rect.y + 12)
      .closePath()
      .fill({ color: 0x06101f, alpha: 0.52 + amount * 0.16 });
  }

  private drawChromeBorder(border: Graphics, rect: ControlIslandRect, amount: number): void {
    const color = 0x71d5ff;
    const cut = 12;
    const alpha = 0.28 + amount * 0.26;
    border.clear();
    border
      .moveTo(rect.x + cut, rect.y)
      .lineTo(rect.x + rect.width, rect.y)
      .lineTo(rect.x + rect.width, rect.y + rect.height - cut)
      .lineTo(rect.x + rect.width - cut, rect.y + rect.height)
      .lineTo(rect.x, rect.y + rect.height)
      .lineTo(rect.x, rect.y + cut)
      .closePath()
      .stroke({ color, alpha, width: 1.5 });

    const accent = Math.min(rect.width * 0.32, 76);
    border.moveTo(rect.x + cut + 4, rect.y + 1).lineTo(rect.x + cut + 4 + accent, rect.y + 1).stroke({ color, alpha: alpha * 1.35, width: 2 });
    border.moveTo(rect.x + rect.width - cut - accent - 4, rect.y + rect.height - 1).lineTo(rect.x + rect.width - cut - 4, rect.y + rect.height - 1).stroke({ color, alpha: alpha, width: 2 });
  }

  private drawDrawerMask(mask: Graphics, rect: ControlIslandRect): void {
    this.drawChromeMask(mask, rect);
  }

  private drawChromeMask(mask: Graphics, rect: ControlIslandRect): void {
    const cut = 12;
    mask.clear();
    mask
      .moveTo(rect.x + cut, rect.y)
      .lineTo(rect.x + rect.width, rect.y)
      .lineTo(rect.x + rect.width, rect.y + rect.height - cut)
      .lineTo(rect.x + rect.width - cut, rect.y + rect.height)
      .lineTo(rect.x, rect.y + rect.height)
      .lineTo(rect.x, rect.y + cut)
      .closePath()
      .fill({ color: 0xffffff, alpha: 1 });
  }

  private drawerTabId(id: DrawerId): ControlIslandId {
    return id === "left-vector-drawer" ? "left-vector-tab" : "right-signal-tab";
  }

  private drawerPanelId(id: DrawerId): ControlIslandId {
    return id === "left-vector-drawer" ? "left-vector-panel" : "right-signal-panel";
  }

  private drawerIdForPanel(id: ControlIslandId): DrawerId | null {
    if (id === "left-vector-panel") return "left-vector-drawer";
    if (id === "right-signal-panel") return "right-signal-inspector";
    return null;
  }

  private lerpControlRect(from: ControlIslandRect, to: ControlIslandRect, amount: number): ControlIslandRect {
    return {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
      width: from.width + (to.width - from.width) * amount,
      height: from.height + (to.height - from.height) * amount
    };
  }

  private easeInOutCubic(amount: number): number {
    return amount < 0.5 ? 4 * amount ** 3 : 1 - (-2 * amount + 2) ** 3 / 2;
  }

  private recreateControlIslandSource(island: ControlIsland): void {
    const childIndex = this.htmlControlLayer.children.indexOf(island.sprite);
    if (island.transformCorrectionFrame) {
      window.cancelAnimationFrame(island.transformCorrectionFrame);
      island.transformCorrectionFrame = 0;
    }

    this.htmlControlLayer.removeChild(island.sprite);
    island.sprite.destroy({ texture: true, textureSource: false });
    island.source.destroy();

    island.source = new HTMLSource({
      resource: island.element,
      canvas: this.htmlCanvas!,
      autoRequestPaint: true
    });
    island.sprite = Sprite.from(island.source);
    island.sprite.alpha = island.visualAlpha;
    const drawerId = this.drawerIdForPanel(island.id);
    if (drawerId) island.sprite.mask = this.drawerTransitions.get(drawerId)?.panelMask ?? null;
    else if (island.contentMask) island.sprite.mask = island.contentMask;
    island.sourceWidth = island.rect.width;
    island.sourceHeight = island.rect.height;
    island.transformCorrection = { x: 0, y: 0 };

    const nextIndex = childIndex < 0 ? this.htmlControlLayer.children.length : Math.min(childIndex, this.htmlControlLayer.children.length);
    this.htmlControlLayer.addChildAt(island.sprite, nextIndex);
  }

  private layoutDisplayMaterial(): void {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    for (const sprite of [this.blueNoiseSprite, this.redNoiseSprite, this.scanlineSprite, this.glassSmudgeSprite]) {
      if (!sprite) continue;
      sprite.width = width;
      sprite.height = height;
    }
    this.glassTint.clear();
    this.glassTint.rect(0, 0, width, height).stroke({ color: 0x71d5ff, alpha: 0.1, width: 2 });
    this.glassTint.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.024 });
    this.glassTint.rect(0, 0, width, Math.max(24, height * 0.05)).fill({ color: 0x000000, alpha: 0.068 });
    this.glassTint.rect(0, height - Math.max(32, height * 0.065), width, Math.max(32, height * 0.065)).fill({ color: 0x000000, alpha: 0.088 });
    this.glassTint.rect(0, 0, Math.max(24, width * 0.035), height).fill({ color: 0x000000, alpha: 0.064 });
    this.glassTint.rect(width - Math.max(24, width * 0.035), 0, Math.max(24, width * 0.035), height).fill({ color: 0x000000, alpha: 0.064 });
    this.glassTint.rect(1, 1, 1, height - 2).fill({ color: 0xff5571, alpha: 0.035 });
    this.glassTint.rect(width - 2, 1, 1, height - 2).fill({ color: 0x71d5ff, alpha: 0.05 });
  }

  private updateDisplayEffects(): void {
    const warning = this.warningLevel();
    if (this.blueNoiseSprite) {
      this.blueNoiseSprite.tilePosition.x = this.routePhase * -1.2;
      this.blueNoiseSprite.tilePosition.y = this.routePhase * 0.6;
    }
    if (this.scanlineSprite) this.scanlineSprite.tilePosition.y = Math.floor(this.routePhase * 5) % 6;
    if (this.glassSmudgeSprite) {
      this.glassSmudgeSprite.tilePosition.x = Math.sin(this.routePhase * 0.09) * 4;
      this.glassSmudgeSprite.tilePosition.y = Math.cos(this.routePhase * 0.07) * 3;
    }
    this.bloomWorld.alpha = 0.42 + Math.sin(this.routePhase * 0.45) * 0.035;
    if (this.redNoiseSprite) {
      this.redNoiseSprite.tilePosition.x = this.routePhase * 3;
      this.redNoiseSprite.alpha = warning === "critical" ? 0.028 + Math.sin(this.routePhase * 2.2) * 0.006 : warning === "caution" ? 0.009 : 0;
    }

    this.alertInterference.clear();
    if (warning === "none") return;
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const color = warning === "critical" ? 0xff5571 : 0xff9b54;
    const alpha = warning === "critical" ? 0.035 : 0.016;
    const offset = (this.routePhase * 5) % 96;
    for (let y = offset; y < height; y += 96) {
      this.alertInterference.rect(0, y, width * 0.18, 1).fill({ color, alpha });
      this.alertInterference.rect(width * 0.82, y + 24, width * 0.18, 1).fill({ color, alpha });
    }
  }

  private warningLevel(): "none" | "caution" | "critical" {
    const state = this.state;
    if (!state) return "none";
    if (!state.route.length || state.routeInfo.nulls > 0) return "critical";
    if (state.routeInfo.frontier > 0 || state.profile === "risky") return "caution";
    return "none";
  }

  private syncControlIslandTransforms(): void {
    if (!this.htmlCanvas?.getElementTransform) return;
    for (const island of this.controlIslands.values()) this.syncControlIslandTransform(island);
  }

  private syncControlIslandTransform(island: ControlIsland): void {
    if (!this.htmlCanvas?.getElementTransform) return;
    const element = island.element;
    const targetRect = island.rect;
    element.style.transform = "";
    const elementWidth = Math.max(1, element.offsetWidth);
    const elementHeight = Math.max(1, element.offsetHeight);
    const screenSpaceTransform = new DOMMatrix()
      .translate(targetRect.x, targetRect.y)
      .scale(
        targetRect.width / elementWidth,
        targetRect.height / elementHeight
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
      const targetRect = island.rect;
      const expected = {
        left: canvasRect.left + targetRect.x,
        top: canvasRect.top + targetRect.y,
        width: targetRect.width,
        height: targetRect.height
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
    this.routePhase += 0.016;
    this.routeCommitFlash *= 0.94;
    this.camera.x += (this.camera.targetX - this.camera.x) * 0.1;
    this.camera.y += (this.camera.targetY - this.camera.y) * 0.1;
    this.camera.scale += (this.camera.targetScale - this.camera.scale) * 0.1;
    this.updateControlIslandTransitions();
    this.applyCamera();
    this.updateLodTransition();
    this.updateLodVisibility();
    this.updateHitMode();
    this.redrawZoomGeometryIfNeeded();
    this.updateParticles();
    this.drawAnimatedEffects();
    this.updateDisplayEffects();
  }

  private applyCamera(): void {
    this.world.position.set(this.camera.x, this.camera.y);
    this.world.scale.set(this.camera.scale);
    this.bloomWorld.position.set(this.camera.x, this.camera.y);
    this.bloomWorld.scale.set(this.camera.scale);
  }

  private clampCameraTarget(): void {
    const scale = this.camera.targetScale;
    const mapLeft = this.layout.originX * scale;
    const mapTop = this.layout.originY * scale;
    const mapRight = (this.layout.originX + this.layout.width) * scale;
    const mapBottom = (this.layout.originY + this.layout.height) * scale;
    const baseSlack = 160 * scale;
    const bottomRoute = this.bottomRouteRect();
    const bottomControlSlack = Math.max(0, this.root.clientHeight - bottomRoute.y) + 40;
    const topControlSlack = this.topConsoleRect().height + 30;
    const sideControlSlack = this.root.clientWidth < 640 ? 120 : Math.max(LAYER_DOCK_RECT.width + 56, 160);
    const minX = this.root.clientWidth - mapRight - baseSlack - sideControlSlack;
    const minY = this.root.clientHeight - mapBottom - baseSlack - bottomControlSlack;
    const maxX = baseSlack + sideControlSlack - mapLeft;
    const maxY = baseSlack + topControlSlack - mapTop;
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
      [...state.activeZones].sort().join(",")
    ].join(";");
  }

  private labelsSignature(state: AppState): string {
    return [
      this.layoutSignature(),
      state.layers.labels
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
    this.bloomSectorLayer.alpha = Math.max(lod.regionAlpha, lod.sectorAlpha);
    this.bloomSectorLayer.visible = this.bloomSectorLayer.alpha > 0.01;
    this.regionLabels.visible = lod.regionLabelAlpha > 0.01;
    this.regionLabels.alpha = lod.regionLabelAlpha;
    this.sectorRegionLabels.visible = lod.sectorRegionLabelAlpha > 0.01;
    this.sectorRegionLabels.alpha = lod.sectorRegionLabelAlpha;
    this.sectorLabels.visible = lod.sectorLabelAlpha > 0.01;
    this.sectorLabels.alpha = lod.sectorLabelAlpha;
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
    this.bloomGridLayer.clear();
    if (includeLabels) this.axisLabels.removeChildren();
    for (let x = 0; x < width; x += 48) {
      this.grid.moveTo(x, 0).lineTo(x, height).stroke({ color: 0x71d5ff, alpha: 0.045, width: this.worldWidth(1) });
      this.bloomGridLayer.moveTo(x, 0).lineTo(x, height).stroke({ color: 0x71d5ff, alpha: 0.04, width: this.worldWidth(3) });
    }
    for (let y = 0; y < height; y += 48) {
      this.grid.moveTo(0, y).lineTo(width, y).stroke({ color: 0x71d5ff, alpha: 0.045, width: this.worldWidth(1) });
      this.bloomGridLayer.moveTo(0, y).lineTo(width, y).stroke({ color: 0x71d5ff, alpha: 0.04, width: this.worldWidth(3) });
    }
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
    this.bloomOverlayLayer.clear();

    if (state.layers.rifts) {
      for (const region of regions.filter((item) => item.zone === "FRONTIER" || item.zone === "NULL")) {
        const point = this.pointFor(region);
        const color = region.zone === "NULL" ? 0xff5571 : 0xff9b54;
        this.overlays.circle(point.x, point.y, this.layout.cell * 0.62).stroke({
          color,
          alpha: region.zone === "NULL" ? 0.34 : 0.26,
          width: this.worldWidth(1.5)
        });
        this.bloomOverlayLayer.circle(point.x, point.y, this.layout.cell * 0.62).stroke({
          color,
          alpha: region.zone === "NULL" ? 0.18 : 0.13,
          width: this.worldWidth(5)
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
        this.bloomOverlayLayer.roundRect(start.x - 8, start.y - 8, end.x + end.w - start.x + 16, end.y + end.h - start.y + 16, 18)
          .stroke({ color: 0xc49cff, alpha: 0.34, width: this.worldWidth(7) });
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
        this.bloomOverlayLayer.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ color: 0x71d5ff, alpha: 0.24, width: this.worldWidth(6) });
        this.drawGateNode(p1.x, p1.y, 0.8);
        this.drawGateNode(p2.x, p2.y, 0.8);
      }
    }
  }

  private drawRouteBase(): void {
    const state = this.state;
    if (!state) return;
    this.routeLayer.clear();
    this.bloomRouteLayer.clear();
    if (state.route.length < 2) return;

    for (let index = 1; index < state.route.length; index += 1) {
      const a = this.pointForStep(state.route[index - 1]);
      const b = this.pointForStep(state.route[index]);
      const color = state.route[index].mode === "gate" ? 0x71d5ff : state.route[index].mode === "impulse" ? 0xf5d760 : 0xc49cff;
      this.routeLayer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
        color,
        alpha: 0.32,
        width: this.worldWidth(5)
      });
      this.bloomRouteLayer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
        color,
        alpha: 0.34,
        width: this.worldWidth(8)
      });
    }
  }

  private drawAnimatedEffects(): void {
    const state = this.state;
    if (!state) return;
    this.effects.clear();
    this.bloomEffects.clear();
    const pulse = 0.55 + Math.sin(this.routePhase * 1.45) * 0.22;
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

    this.updateSensorSprites(state, pulse, hitMode);

    if (state.layers.rifts) {
      for (const region of regions.filter((item) => item.zone === "FRONTIER" || item.zone === "NULL")) {
        const point = this.pointFor(region);
        const radius = this.layout.cell * (0.56 + (Math.sin(this.routePhase * 0.9 + region.col + region.row) + 1) * 0.045);
        const color = region.zone === "NULL" ? 0xff5571 : 0xff9b54;
        this.effects.circle(point.x, point.y, radius).stroke({ color, alpha: 0.18, width: this.worldWidth(2) });
        this.bloomEffects.circle(point.x, point.y, radius).stroke({ color, alpha: 0.16, width: this.worldWidth(5) });
      }
    }

    if (state.route.length > 1) {
      let sparkIndex = 0;
      for (let index = 1; index < state.route.length; index += 1) {
        const a = this.pointForStep(state.route[index - 1]);
        const b = this.pointForStep(state.route[index]);
        const color = state.route[index].mode === "gate" ? 0x71d5ff : state.route[index].mode === "impulse" ? 0xf5d760 : 0xc49cff;
        const flashAlpha = this.routeCommitFlash * 0.34;
        this.effects.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, alpha: 0.72 + flashAlpha, width: this.worldWidth(2.2 + this.routeCommitFlash * 2) });
        this.bloomEffects.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, alpha: 0.42 + flashAlpha * 0.7, width: this.worldWidth(7 + this.routeCommitFlash * 4) });
        if (state.route[index].mode === "gate") {
          const radius = this.worldWidth(9 + pulse * 12 + this.routeCommitFlash * 16);
          this.effects.circle(b.x, b.y, radius).stroke({ color, alpha: 0.36 + flashAlpha, width: this.worldWidth(1.8) });
          this.bloomEffects.circle(b.x, b.y, radius).stroke({ color, alpha: 0.34 + flashAlpha * 0.55, width: this.worldWidth(5) });
        }
        const t = (this.routePhase * 0.09 + index * 0.17) % 1;
        sparkIndex = this.drawRouteSpark(sparkIndex, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, color);
      }
      this.hideUnusedRouteSparks(sparkIndex);
    } else {
      this.hideUnusedRouteSparks(0);
    }
  }

  private updateSensorSprites(state: AppState, pulse: number, _hitMode: HitMode): void {
    const selectedPoint = this.pointForComponentSelection(state.selected);
    const selectedRegion = this.regionForSelection(state.selected);
    const selectedColor = selectedRegion ? zoneColors[selectedRegion.zone] : 0xc49cff;

    this.updateReticleSprite(selectedPoint, selectedColor, 0.36 + pulse * 0.14, 42 + pulse * 4);
    this.updateRangeRingSprite(state, selectedPoint, selectedColor);
  }

  private pointForComponentSelection(id: string): { x: number; y: number } | null {
    const endpoint = endpointById.get(id);
    if (!endpoint || endpoint.kind !== "location") return null;
    return this.pointForCoords(endpoint.x, endpoint.z);
  }

  private regionForSelection(id: string): Region | undefined {
    const endpoint = endpointById.get(id);
    return endpoint ? byCoord.get(endpoint.region) : byCoord.get(id);
  }

  private updateReticleSprite(point: { x: number; y: number } | null, color: number, alpha: number, screenSize: number): void {
    const texture = this.navcomTextures.get("reticle-ping");
    if (!texture || !point) {
      if (this.selectedReticleSprite) this.selectedReticleSprite.visible = false;
      return;
    }

    const reticle = this.selectedReticleSprite ?? this.createReticleSprite(texture);
    this.selectedReticleSprite = reticle;

    const size = this.worldWidth(screenSize);
    reticle.visible = true;
    reticle.position.set(point.x, point.y);
    reticle.width = size;
    reticle.height = size;
    reticle.rotation = this.routePhase * 0.045;
    reticle.tint = color;
    reticle.alpha = alpha;
  }

  private createReticleSprite(texture: Texture): Sprite {
    const sprite = new Sprite({ texture });
    sprite.anchor.set(0.5);
    sprite.blendMode = "add";
    this.mapReticleLayer.addChild(sprite);
    return sprite;
  }

  private updateRangeRingSprite(state: AppState, point: { x: number; y: number } | null, color: number): void {
    const texture = this.navcomTextures.get("ring-soft");
    if (!texture || !point || !state.layers.range || !state.useRange || state.driveTier >= 5) {
      if (this.rangeRingSprite) this.rangeRingSprite.visible = false;
      return;
    }

    if (!this.rangeRingSprite) {
      this.rangeRingSprite = new Sprite({ texture });
      this.rangeRingSprite.anchor.set(0.5);
      this.rangeRingSprite.blendMode = "add";
      this.mapReticleLayer.addChildAt(this.rangeRingSprite, 0);
    }

    const size = this.worldWidth(118);
    this.rangeRingSprite.visible = true;
    this.rangeRingSprite.position.set(point.x, point.y);
    this.rangeRingSprite.width = size;
    this.rangeRingSprite.height = size;
    this.rangeRingSprite.tint = color;
    this.rangeRingSprite.alpha = 0.095 + Math.sin(this.routePhase * 0.55) * 0.016;
  }

  private drawRouteSpark(index: number, x: number, y: number, color: number): number {
    const texture = this.navcomTextures.get("spark-dot");
    if (!texture) {
      this.effects.circle(x, y, this.worldWidth(4)).fill({ color, alpha: 0.95 });
      return index;
    }

    let spark = this.routeSparkSprites[index];
    if (!spark) {
      spark = new Sprite({ texture });
      spark.anchor.set(0.5);
      spark.blendMode = "add";
      this.routeSparkSprites[index] = spark;
      this.routeSparkLayer.addChild(spark);
    }
    const size = this.worldWidth(12);
    spark.visible = true;
    spark.position.set(x, y);
    spark.width = size;
    spark.height = size;
    spark.tint = color;
    spark.alpha = 0.78 + Math.sin(this.routePhase * 2.4 + index) * 0.1;
    return index + 1;
  }

  private hideUnusedRouteSparks(firstUnused: number): void {
    for (let index = firstUnused; index < this.routeSparkSprites.length; index += 1) {
      this.routeSparkSprites[index].visible = false;
    }
  }

  private drawGlow(region: Region, color: number, alpha: number, pad: number): void {
    const rect = this.rectFor(region);
    this.effects.rect(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2)
      .stroke({ color, alpha, width: this.worldWidth(3) });
    this.bloomEffects.rect(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2)
      .stroke({ color, alpha: alpha * 0.7, width: this.worldWidth(9) });
  }

  private drawRegionFill(region: Region, color: number, alpha: number): void {
    const rect = this.rectFor(region);
    this.effects.rect(rect.x, rect.y, rect.w, rect.h).fill({ color, alpha });
    this.bloomEffects.rect(rect.x, rect.y, rect.w, rect.h).fill({ color, alpha: alpha * 0.38 });
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
    this.bloomEffects.rect(start.x, start.y, end.x - start.x, end.y - start.y)
      .fill({ color, alpha: alpha * 0.42 });
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
      this.bloomEffects.rect(start.x - pad, start.y - pad, end.x - start.x + pad * 2, end.y - start.y + pad * 2)
        .stroke({ color, alpha: alpha * 0.7, width: this.worldWidth(9) });
      return;
    }

    const point = this.pointForCoords(endpoint.x, endpoint.z);
    const radius = Math.max(this.worldWidth(12), this.layout.cell * 0.035) + pad * 0.2;
    this.effects.circle(point.x, point.y, radius)
      .stroke({ color, alpha, width: this.worldWidth(3) });
    this.effects.circle(point.x, point.y, Math.max(this.worldWidth(3), radius * 0.22))
      .fill({ color, alpha: Math.min(0.5, alpha * 0.75) });
    this.bloomEffects.circle(point.x, point.y, radius)
      .stroke({ color, alpha: alpha * 0.75, width: this.worldWidth(8) });
    this.bloomEffects.circle(point.x, point.y, Math.max(this.worldWidth(5), radius * 0.34))
      .fill({ color, alpha: Math.min(0.34, alpha * 0.52) });
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
    this.bloomSectorLayer.clear();

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
        .fill({ color, alpha: 0.24 })
        .stroke({ color, alpha: 0.55, width: this.worldWidth(1.2) });
      regionGraphic.rect(rect.x + 8, rect.y + 6, Math.max(12, rect.w * 0.36), this.worldWidth(2)).fill({ color, alpha: 0.26 });
      this.bloomSectorLayer.rect(rect.x, rect.y, rect.w, rect.h)
        .stroke({ color, alpha: visible ? 0.16 : 0.035, width: this.worldWidth(5) });

      const sectorGraphic = new Graphics();
      sectorGraphic.alpha = visible ? 1 : 0.18;
      for (const sector of region.sectors) {
        const start = this.pointForCoords(sector.xMin, sector.zMin);
        const end = this.pointForCoords(sector.xMax, sector.zMax);
        const sectorActive = (origin && originEndpoint?.sector === sector.id) || (destination && destinationEndpoint?.sector === sector.id);
        sectorGraphic.rect(start.x, start.y, end.x - start.x, end.y - start.y)
          .fill({ color, alpha: sectorActive ? 0.18 : 0.055 })
          .stroke({ color, alpha: sectorActive ? 0.92 : 0.45, width: this.worldWidth(sectorActive ? 1.8 : 1) });
        this.bloomSectorLayer.rect(start.x, start.y, end.x - start.x, end.y - start.y)
          .stroke({
            color,
            alpha: visible ? (sectorActive ? 0.32 : 0.075) : 0.02,
            width: this.worldWidth(sectorActive ? 7 : 3.5)
          });
      }

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
