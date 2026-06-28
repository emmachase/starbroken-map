import { Application, Container, Graphics, Text } from "pixi.js";
import { byCoord, endpointById, GALAXY_SIZE, gates, gatesByCoord, locationById, locations, regions, sectorForPoint, zoneColors } from "../data/galaxy";
import type { AppState, MapLocation, Region, RouteStep } from "../types";
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
  private readonly screenLayer = new Container();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly grid = new Graphics();
  private readonly overlays = new Graphics();
  private readonly routeLayer = new Graphics();
  private readonly sectors = new Container();
  private readonly labels = new Container();
  private readonly effects = new Graphics();
  private readonly particlesLayer = new Graphics();
  private readonly resizeObserver: ResizeObserver;
  private readonly camera: Camera = { x: 0, y: 0, scale: 1, targetX: 0, targetY: 0, targetScale: 1 };
  private readonly particles: Particle[] = [];
  private state: AppState | null = null;
  private hovered: string | null = null;
  private layout: Layout = { cell: 80, originX: 60, originY: 60, width: 8 * 80, height: 8 * 80 };
  private isDragging = false;
  private suppressNextTap = false;
  private dragStart = { x: 0, y: 0 };
  private cameraStart = { x: 0, y: 0 };
  private routePhase = 0;
  private lastFocus = "";

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
    this.world.addChild(this.grid, this.overlays, this.routeLayer, this.sectors, this.labels, this.effects, this.particlesLayer);
    this.screenLayer.addChild(this.background, this.world);
    this.app.stage.addChild(this.screenLayer);
    this.resizeObserver.observe(this.root);
    this.bindCameraInput();
    this.app.ticker.add(() => this.tick());
    this.resize();
  }

  setState(state: AppState): void {
    const previousSelected = this.state?.selected;
    const previousSearch = this.state?.search;
    this.state = state;
    this.renderStatic();
    if (previousSelected && state.selected !== previousSelected) this.focusSelected();
    if (previousSearch !== undefined && state.search !== previousSearch) this.ensureFocusForSearch();
  }

  focusSelected(immediate = false): void {
    const region = this.state ? byCoord.get(this.state.selected) : undefined;
    if (!region) return;
    const point = this.pointFor(region);
    const nextScale = Math.max(this.camera.targetScale, this.root.clientWidth < 720 ? 1.18 : 1);
    this.camera.targetScale = clamp(nextScale, 0.7, 2.4);
    this.camera.targetX = this.root.clientWidth / 2 - point.x * this.camera.targetScale;
    this.camera.targetY = this.root.clientHeight / 2 - point.y * this.camera.targetScale;
    this.clampCameraTarget();
    if (immediate) {
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
      this.camera.scale = this.camera.targetScale;
      this.applyCamera();
    }
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.app.destroy(true);
  }

  private bindCameraInput(): void {
    this.app.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const bounds = this.app.canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const before = this.screenToWorld(pointer.x, pointer.y);
      const factor = event.deltaY > 0 ? 0.88 : 1.14;
      this.camera.targetScale = clamp(this.camera.targetScale * factor, 0.62, 2.8);
      this.camera.targetX = pointer.x - before.x * this.camera.targetScale;
      this.camera.targetY = pointer.y - before.y * this.camera.targetScale;
      this.clampCameraTarget();
    }, { passive: false });

    this.app.canvas.addEventListener("pointerdown", (event) => {
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

  private resize(): void {
    this.computeLayout();
    this.drawBackground();
    this.renderStatic();
    this.fitMap(false);
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
    this.labels.removeChildren();
    this.drawGrid();
    this.drawOverlays();
    this.drawRouteBase();
    this.drawSectors();
    this.ensureFocusForSearch();
  }

  private ensureFocusForSearch(): void {
    const state = this.state;
    if (!state) return;
    const query = state.search.trim().toLowerCase();
    if (!query || query === this.lastFocus) return;
    const match = regions.find((region) => region.coord.toLowerCase() === query || region.name.toLowerCase().includes(query) || region.slug.toLowerCase().includes(query));
    if (!match) return;
    this.lastFocus = query;
    this.focusRegion(match.coord);
  }

  private focusRegion(coord: string): void {
    const region = byCoord.get(coord);
    if (!region) return;
    const point = this.pointFor(region);
    const nextScale = clamp(Math.max(this.camera.targetScale, 1.2), 0.7, 2.4);
    this.camera.targetScale = nextScale;
    this.camera.targetX = this.root.clientWidth / 2 - point.x * nextScale;
    this.camera.targetY = this.root.clientHeight / 2 - point.y * nextScale;
    this.clampCameraTarget();
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

  private drawGrid(): void {
    const width = this.layout.width + 180;
    const height = this.layout.height + 180;
    this.grid.clear();
    for (let x = 0; x < width; x += 48) this.grid.moveTo(x, 0).lineTo(x, height).stroke({ color: 0x71d5ff, alpha: 0.045, width: 1 });
    for (let y = 0; y < height; y += 48) this.grid.moveTo(0, y).lineTo(width, y).stroke({ color: 0x71d5ff, alpha: 0.045, width: 1 });
    for (let y = 0; y < height; y += 5) this.grid.rect(0, y, width, 1).fill({ color: 0xffffff, alpha: 0.018 });

    for (let index = 0; index < 8; index += 1) {
      const x = this.layout.originX + index * this.layout.cell + this.layout.cell / 2;
      const y = this.layout.originY - 24;
      this.drawHudText(this.labels, String.fromCharCode(65 + index), x, y, 0xa9b8cf, 12, "center");
    }
    for (let index = 0; index < 8; index += 1) {
      const x = this.layout.originX - 24;
      const y = this.layout.originY + index * this.layout.cell + this.layout.cell / 2 - 7;
      this.drawHudText(this.labels, String(index + 1), x, y, 0xa9b8cf, 12, "center");
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
          width: 1.5
        });
      }
    }

    if (state.layers.range && state.useRange && state.driveTier < 5) {
      const originEndpoint = endpointById.get(state.origin);
      const origin = originEndpoint ? byCoord.get(originEndpoint.region) : undefined;
      if (origin) {
        const range = state.driveTier === 4 ? 5 : state.driveTier;
        const minCol = Math.max(0, origin.col - range);
        const maxCol = Math.min(7, origin.col + range);
        const minRow = Math.max(0, origin.row - range);
        const maxRow = Math.min(7, origin.row + range);
        const start = this.rectFor(byCoord.get(`${String.fromCharCode(65 + minCol)}${minRow + 1}`)!);
        const end = this.rectFor(byCoord.get(`${String.fromCharCode(65 + maxCol)}${maxRow + 1}`)!);
        this.overlays.poly(chamferPoints(start.x - 8, start.y - 8, end.x + end.w - start.x + 16, end.y + end.h - start.y + 16, 18))
          .stroke({ color: 0xc49cff, alpha: 0.72, width: 2 });
      }
    }

    if (state.layers.gates) {
      for (const gate of gates) {
        const a = locationById.get(gate.a);
        const b = locationById.get(gate.b);
        const p1 = a ? this.pointForLocation(a) : null;
        const p2 = b ? this.pointForLocation(b) : null;
        if (!p1 || !p2) continue;
        this.overlays.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ color: 0x71d5ff, alpha: 0.42, width: 3 });
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
        width: 5
      });
    }
  }

  private drawAnimatedEffects(): void {
    const state = this.state;
    if (!state) return;
    this.effects.clear();
    const pulse = 0.55 + Math.sin(this.routePhase * 2.8) * 0.25;

    if (this.hovered) {
      const region = byCoord.get(this.hovered);
      if (region) this.drawGlow(region, 0x71d5ff, 0.18 + pulse * 0.24, 10);
    }

    const selected = byCoord.get(state.selected);
    if (selected) this.drawGlow(selected, zoneColors[selected.zone], 0.28 + pulse * 0.3, 14);

    if (state.layers.gates) {
      for (const gate of gates) {
        const a = locationById.get(gate.a);
        const b = locationById.get(gate.b);
        const p1 = a ? this.pointForLocation(a) : null;
        const p2 = b ? this.pointForLocation(b) : null;
        if (!p1 || !p2) continue;
        const t = (this.routePhase * 0.22 + gate.a.length * 0.07) % 1;
        this.effects.circle(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, 3.2).fill({ color: 0x71d5ff, alpha: 0.72 });
      }
    }

    if (state.layers.rifts) {
      for (const region of regions.filter((item) => item.zone === "FRONTIER" || item.zone === "NULL")) {
        const point = this.pointFor(region);
        const radius = this.layout.cell * (0.56 + (Math.sin(this.routePhase * 1.8 + region.col + region.row) + 1) * 0.06);
        this.effects.circle(point.x, point.y, radius).stroke({ color: region.zone === "NULL" ? 0xff5571 : 0xff9b54, alpha: 0.18, width: 2 });
      }
    }

    if (state.route.length > 1) {
      for (let index = 1; index < state.route.length; index += 1) {
        const a = this.pointForStep(state.route[index - 1]);
        const b = this.pointForStep(state.route[index]);
        const color = state.route[index].mode === "gate" ? 0x71d5ff : state.route[index].mode === "impulse" ? 0xf5d760 : 0xc49cff;
        this.effects.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, alpha: 0.72, width: 2.2 });
        const t = (this.routePhase * 0.18 + index * 0.17) % 1;
        this.effects.circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4).fill({ color, alpha: 0.95 });
      }
    }
  }

  private drawGlow(region: Region, color: number, alpha: number, pad: number): void {
    const rect = this.rectFor(region);
    this.effects.poly(chamferPoints(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2, Math.max(10, this.layout.cell * 0.18)))
      .stroke({ color, alpha, width: 3 });
  }

  private updateParticles(): void {
    const state = this.state;
    if (!state) return;
    if (this.particles.length < 90) {
      const sources = regions.filter((region) => state.layers.rifts ? region.zone === "NULL" || region.zone === "FRONTIER" : gatesByCoord.has(region.coord));
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
          color: state.layers.rifts ? zoneColors[source.zone] : 0x71d5ff,
          size: 1.2 + Math.random() * 2.2
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
    this.sectors.removeChildren();

    const routeCoords = new Set(state.route.map((step) => step.coord));
    const search = state.search.trim().toLowerCase();
    const originEndpoint = endpointById.get(state.origin);
    const destinationEndpoint = endpointById.get(state.destination);

    for (const region of regions) {
      const rect = this.rectFor(region);
      const color = zoneColors[region.zone];
      const visible = state.activeZones.has(region.zone) && (!search || `${region.coord} ${region.name} ${region.slug} ${region.zone}`.toLowerCase().includes(search));
      const active = region.coord === state.selected;
      const inRoute = routeCoords.has(region.coord);
      const origin = region.coord === originEndpoint?.region;
      const destination = region.coord === destinationEndpoint?.region;
      const gateCount = gatesByCoord.get(region.coord)?.length ?? 0;

      const tile = new Graphics();
      tile.eventMode = "static";
      tile.cursor = "pointer";
      tile.alpha = visible ? 1 : 0.18;
      tile.rect(rect.x, rect.y, rect.w, rect.h)
        .fill({ color, alpha: state.layers.threat ? 0.35 : 0.24 })
        .stroke({ color, alpha: active ? 1 : 0.55, width: active ? 2.4 : 1.2 });
      tile.rect(rect.x + 8, rect.y + 6, Math.max(12, rect.w * 0.36), 2).fill({ color, alpha: 0.26 });
      tile.moveTo(rect.x + rect.w / 2, rect.y).lineTo(rect.x + rect.w / 2, rect.y + rect.h).stroke({ color: 0x02040a, alpha: 0.42, width: 1 });
      tile.moveTo(rect.x, rect.y + rect.h / 2).lineTo(rect.x + rect.w, rect.y + rect.h / 2).stroke({ color: 0x02040a, alpha: 0.42, width: 1 });

      if (inRoute) {
        tile.poly(chamferPoints(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8, Math.max(6, this.layout.cell * 0.11)))
          .stroke({ color: 0x71d5ff, alpha: 0.88, width: 2 });
      }

      if (origin || destination) this.drawSectorMark(tile, rect, origin ? "START" : "END", origin ? 0x71d5ff : 0xc49cff);
      if (gateCount) this.drawPill(tile, rect.x + rect.w - 7, origin || destination ? rect.y + 25 : rect.y + 7, `${gateCount}G`, color);

      tile.on("pointerover", () => {
        this.hovered = region.coord;
      });
      tile.on("pointerout", () => {
        if (this.hovered === region.coord) this.hovered = null;
      });
      tile.on("pointertap", (event) => {
        const original = event as unknown as { altKey?: boolean; shiftKey?: boolean; global?: { x: number; y: number } };
        if (this.suppressNextTap) {
          this.suppressNextTap = false;
          return;
        }
        const point = original.global ? this.screenToWorld(original.global.x, original.global.y) : this.pointFor(region);
        const mapX = clamp(((point.x - this.layout.originX) / this.layout.width) * GALAXY_SIZE, region.xMin, region.xMax - 1);
        const mapZ = clamp(((point.y - this.layout.originY) / this.layout.height) * GALAXY_SIZE, region.zMin, region.zMax - 1);
        const sector = sectorForPoint(region, mapX, mapZ);
        const endpointId = `sector:${region.coord}:${sector}`;
        if (original.shiftKey) this.onSetDestination(endpointId);
        else if (original.altKey) this.onSetOrigin(endpointId);
        else this.onSelect(region.coord);
      });

      this.sectors.addChild(tile);

      const textOffset = origin || destination ? Math.max(5, this.layout.cell * 0.06) : 0;
      if (state.layers.labels) {
        const denseLabels = this.camera.targetScale > 0.86 && this.layout.cell > 58;
        const nameMax = Math.max(5, Math.floor(rect.w / 7));
        const slugMax = Math.max(6, Math.floor(rect.w / 6));
        this.drawHudText(this.labels, region.coord, rect.x + 9, rect.y + 10 + textOffset, color, Math.max(16, this.layout.cell * 0.24), "left", 900);
        if (denseLabels) {
          this.drawHudText(this.labels, fitText(region.name, nameMax), rect.x + 9, rect.y + rect.h * 0.43 + textOffset * 0.35, 0xedf5ff, Math.max(11, this.layout.cell * 0.145), "left", 800);
          if (rect.w > 48) this.drawHudText(this.labels, fitText(region.slug, slugMax), rect.x + 9, rect.y + rect.h * 0.62 + textOffset * 0.25, 0xa9b8cf, Math.max(9, this.layout.cell * 0.105), "left", 600);
        }
      } else {
        this.drawHudText(this.labels, region.coord, rect.x + rect.w / 2, rect.y + rect.h / 2, color, Math.max(17, this.layout.cell * 0.28), "center", 900);
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
      if (location.kind === "gate") {
        marker.poly([point.x, point.y - 7, point.x + 7, point.y, point.x, point.y + 7, point.x - 7, point.y])
          .fill({ color: 0x07101e, alpha: 0.94 })
          .stroke({ color: markerColor, alpha: 0.92, width: 1.8 });
      } else if (location.kind === "belt") {
        marker.circle(point.x, point.y, 4.8).stroke({ color: markerColor, alpha: 0.92, width: 2 });
      } else {
        marker.circle(point.x, point.y, 4.6).fill({ color: markerColor, alpha: 0.9 });
      }
      marker.on("pointertap", (event) => {
        const original = event as unknown as { altKey?: boolean; shiftKey?: boolean };
        if (this.suppressNextTap) {
          this.suppressNextTap = false;
          return;
        }
        const endpointId = `location:${location.id}`;
        if (original.shiftKey) this.onSetDestination(endpointId);
        else if (original.altKey) this.onSetOrigin(endpointId);
        else this.onSelect(location.region);
      });
      this.sectors.addChild(marker);
    }
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
    this.overlays.poly([x, y - 10, x + 10, y, x, y + 10, x - 10, y])
      .fill({ color: 0x07101e, alpha: 0.88 })
      .stroke({ color: 0x71d5ff, alpha, width: 2 });
  }

  private drawPill(target: Graphics, x: number, y: number, text: string, color: number): void {
    target.poly(chamferPoints(x - 32, y, 32, 16, 5)).fill({ color: 0x07101e, alpha: 0.92 });
    this.drawHudText(this.labels, text, x - 16, y + 2, color, 10, "center", 900);
  }

  private drawSectorMark(target: Graphics, rect: { x: number; y: number; w: number; h: number }, text: string, color: number): void {
    target.poly(chamferPoints(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 8)).fill({ color, alpha: 0.1 });
    const tabW = Math.max(46, Math.min(64, rect.w * 0.62));
    const tabX = rect.x + (rect.w - tabW) / 2;
    const tabY = rect.y - Math.max(15, Math.min(18, rect.h * 0.21)) * 0.68;
    target.poly([tabX + 6, tabY, tabX + tabW, tabY, tabX + tabW, rect.y + 1, tabX, rect.y + 1, tabX, tabY + 6])
      .fill({ color, alpha: 1 });
    this.drawHudText(this.labels, text, tabX + tabW / 2, tabY + 3, 0x04111d, 8, "center", 900);
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
    text.resolution = 4;
    if (align === "center") text.anchor.set(0.5, 0);
    target.addChild(text);
  }

}
