import type { Game } from '../sim/game';
import type { Customer, EmployeeRuntime } from '../sim/world';
import type { Dir, PlacedObject } from '../core/types';
import { Camera, iso, isoVec, unIso, shade, setView, depth, faces, TW, TH } from './iso';
import { box, diamond, diamondPath, ellipse, emoji, roundRect, badge } from './shapes';
import { drawObject, drawEmote, objectHeight } from './sprites';
import { drawCharacter } from '../assets/art/characters';
import type { Appearance, PoseState } from '../assets/art/characters';
import { customerAppearance, staffAppearance, staffSheet } from '../assets/characters';
import { drawSheetCharacter } from '../assets/sheetDraw';
import { registerBuiltinAssets } from '../assets';
import { ParticleSystem } from './particles';
import { WorldRenderer } from './world';
import { drawSprite } from '../assets/spriteCache';
import { LOCATION_MAP } from '../config/locations';
import { THEME_MAP } from '../config/cosmetics';
import { CUSTOMER_MAP } from '../config/customers';
import { STAFF_MAP } from '../config/staff';
import { OBJECT_MAP } from '../config/objects';
import { EXPANSIONS } from '../config/expansions';
import { featuresAtStage, tierOfStage } from '../config/shopTiers';
import { CAMERA } from '../config/camera';
import { DEPARTMENT_MAP } from '../config/departments';
import { DOOR_TILE, STOCKROOM_TILE } from '../core/state';
import { accessTile } from '../sim/grid';
import { formatMoney } from '../core/format';
import { getSkin } from './skins';
import { styledSkin, ENTRANCE_STYLES, ACCESSORY_STYLES, type EquippedStyles } from './styles';
import { t } from '../core/i18n';

export type PickResult =
  | { type: 'openSign' }
  | { type: 'crate' }
  | { type: 'object'; uid: number }
  | { type: 'dirt'; x: number; y: number }
  | { type: 'expansion' }
  | { type: 'tile'; x: number; y: number }
  | null;

export interface PlacementMode {
  kind: string;
  dir: Dir;
  ignoreUid: number;
  hover: { x: number; y: number } | null;
  valid: Map<string, { ok: boolean; dir: Dir }>;
}

/** Renders the miniature-diorama shop with Canvas 2D. Pure view: reads game state, never mutates it. */
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function prefersReducedMotion(): boolean {
  return !!motionQuery?.matches;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  readonly particles = new ParticleSystem();
  placement: PlacementMode | null = null;
  /** Temporary cosmetic preview (from the Premium Shop): applies to the real shop until cleared. */
  preview: { skin?: string | null; outfit?: string | null; styles?: EquippedStyles } | null = null;
  selectedUid = 0;
  highlightUid = 0;
  highlightSign = false;
  highlightExpansion = false;
  insets = { top: 120, bottom: 90, right: 0, left: 0 };
  time = 0;
  private dpr = 1;
  private vw = 1;
  private vh = 1;
  private door = 0;
  private bounce = new Map<number, number>();
  private lastSize = 0;
  private lastLocation = '';
  private stars: { x: number; y: number }[] = [];
  /** Wall height of the current shop tier. */
  private wallH = 46;
  /** Building features of the current shop tier (see config/shopTiers.ts). */
  private features = new Set<string>();
  private skinTrim: string | null = null;
  private pivot = { x: 0, y: 0 };

  /** Appearance per character id (deterministic, so the cache is only a speed-up). */
  private looks = new Map<string, Appearance & { sheet?: string | null }>();
  private world: WorldRenderer;

  private look(key: string, make: () => Appearance & { sheet?: string | null }): Appearance & { sheet?: string | null } {
    let a = this.looks.get(key);
    if (!a) {
      if (this.looks.size > 600) this.looks.clear();
      a = make();
      this.looks.set(key, a);
    }
    return a;
  }

  /** Facing index (0 +x, 1 +y, 2 −x, 3 −y) → billboard view for the current camera angle. */
  private view(facing: number): { front: boolean; right: boolean } {
    const d = ([[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][])[((facing % 4) + 4) % 4];
    return { front: faces(d[0], d[1]), right: isoVec(d[0], d[1]).x >= 0 };
  }

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    registerBuiltinAssets();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.world = new WorldRenderer(ctx);
    for (let i = 0; i < 40; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.5 });
    this.bindEvents();
    this.resize();
  }

  /** The renderer can follow a new Game instance (new game / load). */
  setGame(game: Game): void {
    this.game = game;
    this.particles.clear();
    this.bindEvents();
    this.lastSize = 0;
  }

  private unsub: (() => void)[] = [];

  private bindEvents(): void {
    for (const u of this.unsub) u();
    const b = this.game.bus;
    const P = this.particles;
    const at = (x: number, y: number, z = 30) => iso(x, y, z);
    this.unsub = [
      b.on('sale', (e) => {
        const p = at(e.x, e.y, 36);
        P.emit('coin', p.x, p.y, Math.min(8, 2 + e.items), { spread: 30, up: 120 });
        P.text(`+${formatMoney(e.amount)}`, p.x + (Math.random() - 0.5) * 16, p.y - 14 - Math.random() * 10, e.tip ? '#ffd23f' : '#3ddc84', e.tip ? 16 : 14);
      }),
      b.on('objectUpgraded', (e) => {
        const p = at(e.x + 0.5, e.y + 0.5, 30);
        P.emit('sparkle', p.x, p.y, 16, { spread: 50, up: 90 });
        P.emit('star', p.x, p.y, 6, { spread: 30, up: 140, color: '#ffd23f' });
        P.text(t('fx.upgraded'), p.x, p.y - 30, '#ffd23f', 15);
        this.bounce.set(e.uid, 0.6);
      }),
      b.on('objectPlaced', (e) => {
        const p = at(e.x + 0.5, e.y + 0.5, 0);
        P.emit('dust', p.x, p.y, 10, { spread: 40, up: 20 });
        P.emit('sparkle', p.x, p.y - 20, 8, { spread: 40, up: 60 });
        this.bounce.set(e.uid, 0.6);
      }),
      b.on('restocked', (e) => {
        if (!e.manual) return;
        const p = at(e.x + 0.5, e.y + 0.5, 30);
        P.emit('sparkle', p.x, p.y, 8, { spread: 30, up: 50 });
        P.text(t('fx.restocked'), p.x, p.y - 26, '#4cc9f0', 12);
        this.bounce.set(e.uid, 0.4);
      }),
      b.on('customerLeftAngry', (e) => {
        const p = at(e.x, e.y, 44);
        P.text('😠', p.x, p.y, '#ef476f', 14);
      }),
      b.on('customerHappy', (e) => {
        const p = at(e.x, e.y, 40);
        if (Math.random() < 0.5) P.emit('heart', p.x, p.y, 1, { spread: 5, up: 30, life: 1.2 });
      }),
      b.on('crateCollected', (e) => {
        const p = at(e.x + 0.5, e.y + 0.5, 20);
        P.emit('confetti', p.x, p.y, 30, { spread: 70, up: 160 });
        P.text(`+${formatMoney(e.money)}${e.stars ? ' +' + e.stars + '🌟' : ''}`, p.x, p.y - 30, '#ffd23f', 16);
      }),
      b.on('dirtCleaned', (e) => {
        const p = at(e.x + 0.5, e.y + 0.5, 4);
        P.emit('sparkle', p.x, p.y, 6, { spread: 20, up: 40 });
      }),
      b.on('tapBoost', (e) => {
        const p = at(e.x + 0.5, e.y + 0.5, 30);
        P.emit('sparkle', p.x, p.y, 3, { spread: 20, up: 60 });
        this.bounce.set(e.uid, 0.2);
      }),
      b.on('expansionStarted', () => this.camera.resetUser()),
      b.on('expansionCompleted', () => {
        this.camera.resetUser();
        this.camera.zoom *= 0.85; // pull back, then settle
        if (this.shakeAllowed) this.camera.shake = 0.6;
        this.confetti(70);
      }),
      b.on('levelUp', () => this.confetti(60)),
      b.on('departmentUnlocked', () => this.confetti(40)),
      b.on('franchised', () => this.confetti(100)),
      b.on('locationSwitched', () => {
        this.particles.clear();
        this.camera.resetUser();
      }),
    ];
  }

  /** Screen shake needs the shake setting on and reduced motion off. */
  get shakeAllowed(): boolean {
    const s = this.game.state.settings;
    return s.screenShake && !this.reducedMotion;
  }

  /** In-game "reduce flashing" setting or the OS-level reduced-motion preference. */
  get reducedMotion(): boolean {
    return this.game.state.settings.reduceFlashing || prefersReducedMotion();
  }

  activeSkin(): string | null {
    if (this.preview && this.preview.skin !== undefined) return this.preview.skin;
    return this.game.state.monetization.equipped.skin;
  }

  /** Equipped cosmetic styles, with any style being previewed from the store laid on top. */
  activeStyles(): EquippedStyles {
    const eq = this.game.state.monetization.equipped;
    const base: EquippedStyles = { accessory: eq.accessory ?? null, display: eq.display ?? null, checkout: eq.checkout ?? null, sign: eq.sign ?? null, entrance: eq.entrance ?? null };
    return this.preview?.styles ? { ...base, ...this.preview.styles } : base;
  }

  /** Theme plus equipped styles (what displays, checkouts and signs are drawn with). */
  private styled() {
    return styledSkin(getSkin(this.activeSkin()), this.activeStyles());
  }

  activeOutfit(): string | null {
    if (this.preview && this.preview.outfit !== undefined) return this.preview.outfit;
    return this.game.state.monetization.equipped.outfit;
  }

  /** Night falls outside the shop; the interior (drawn after) stays brightly lit. */
  private nightOverlay(S: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(12,6,40,0.58)';
    diamondPath(ctx, -8, -8, S + 15, S + 15);
    ctx.fill();
    // warm pools of light spilling from the shop onto the pavement
    const door = iso(-0.6, DOOR_TILE.y + 0.5);
    const g = this.ctx.createRadialGradient(door.x, door.y, 4, door.x, door.y, 60);
    g.addColorStop(0, 'rgba(255,43,214,0.35)');
    g.addColorStop(1, 'rgba(255,43,214,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(door.x, door.y, 60, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Golden Shelves: static warm light pools (cheap gradients, no per-frame particles) and
   * a gold picture rail along the far walls. Sparkles are drawn by the shelves and respect reduced motion.
   */
  private goldenLighting(S: number): void {
    const ctx = this.ctx;
    const c = iso(S / 2, S / 2);
    const r = 34 * S;
    const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, r);
    g.addColorStop(0, 'rgba(255,214,120,0.22)');
    g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g;
    diamondPath(ctx, 0, 0, S, S);
    ctx.fill();
    ctx.strokeStyle = '#f2b632';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const [a, b] of this.farWallSegments(S, this.wallH - 8)) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  /** Ocean Breeze: soft caustic light rings on the floor (static under reduced motion). */
  private oceanLight(S: number): void {
    const ctx = this.ctx;
    const t = this.reducedMotion ? 0 : this.time;
    ctx.lineWidth = 1.5;
    const n = Math.min(14, S * 2);
    for (let i = 0; i < n; i++) {
      const gx = ((i * 2.37) % S) + 0.5;
      const gy = ((i * 1.61 + 0.7) % S) + 0.3;
      const ph = (t * 0.35 + i * 0.37) % 1;
      const p = iso(gx, gy);
      ctx.strokeStyle = `rgba(72,202,228,${0.35 * (1 - ph)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 6 + ph * 22, (6 + ph * 22) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Cozy Autumn: a few leaves drift down through the shop (resting on the floor under reduced motion). */
  private autumnLeaves(S: number): void {
    const ctx = this.ctx;
    const cols = ['#e76f51', '#f4a261', '#d68c45', '#a44a3f', '#ffb703'];
    const n = Math.min(12, S + 4);
    for (let i = 0; i < n; i++) {
      const fall = this.reducedMotion ? 1 : ((this.time * 0.12 + i * 0.173) % 1);
      const gx = ((i * 2.71 + (this.reducedMotion ? 0 : this.time * 0.05)) % S) + 0.3;
      const gy = ((i * 1.93) % S) + 0.4;
      const p = iso(gx, gy, (1 - fall) * (this.wallH + 20));
      const rot = this.reducedMotion ? i : this.time * 2 + i;
      ctx.save();
      ctx.translate(p.x + (this.reducedMotion ? 0 : Math.sin(this.time * 1.5 + i) * 6), p.y);
      ctx.rotate(rot);
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,40,10,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Glowing neon tubes along the walls, lit windows and a buzzing sign. */
  private neonTrims(S: number): void {
    const ctx = this.ctx;
    const flicker = this.reducedMotion ? 1 : Math.sin(this.time * 23) > -0.92 ? 1 : 0.35;
    ctx.save();
    ctx.lineCap = 'round';
    const tube = (pts: { x: number; y: number }[], color: string) => {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.globalAlpha = flicker;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    // tubes along the top and foot of whichever walls face the camera
    for (const [a, b] of this.farWallSegments(S, this.wallH + 2)) tube([a, b], '#ff2bd6');
    for (const [a, b] of this.farWallSegments(S, 6)) tube([a, b], '#00f0ff');
    // lit windows (same openings the walls draw)
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ffe066';
    ctx.globalAlpha = 1;
    for (const w of this.windowOpenings(S)) this.wallQuad(w.ax, w.ay, w.bx, w.by, 16, w.top, 'rgba(255,224,102,0.95)');
    ctx.shadowBlur = 0;
    // neon "OPEN 24/7" sign on the north wall (or above it, when that wall is cut away)
    const p = iso(Math.max(0.6, S * 0.22), 0, this.wallH - 10);
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    ctx.globalAlpha = flicker;
    ctx.font = '900 9px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('24/7', p.x, p.y);
    ctx.restore();
    // drifting light motes
    if (!this.reducedMotion && Math.random() < 0.15) {
      const m = iso(Math.random() * S, Math.random() * S, 10 + Math.random() * 30);
      this.particles.emit('sparkle', m.x, m.y, 1, { spread: 6, up: 8, color: Math.random() < 0.5 ? '#ff2bd6' : '#00f0ff', life: 1.4 });
    }
  }

  confetti(n: number): void {
    if (this.game.state.settings.reduceFlashing) n = Math.floor(n / 3);
    for (let i = 0; i < n; i++) this.particles.emit('confetti', Math.random() * this.vw, -10, 1, { spread: 60, up: -60 - Math.random() * 60, screen: true, life: 2.5 });
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.vw = Math.max(1, r.width);
    this.vh = Math.max(1, r.height);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
  }

  get viewport() {
    return { w: this.vw, h: this.vh };
  }

  /** Size used for framing: during construction we already frame the target size. */
  private frameSize(): number {
    const shop = this.game.shop;
    const c = shop.construction;
    return c ? EXPANSIONS[c.targetStage].size : shop.size;
  }

  /** Points that must stay in view: the shop footprint (incl. door street side) at floor and roof height. */
  private framePoints(S: number): { x: number; y: number }[] {
    const top = this.wallH + 34;
    const out: { x: number; y: number }[] = [];
    for (const [gx, gy] of [[-1.1, -0.2], [S + 0.25, -0.2], [S + 0.25, S + 0.3], [-1.1, S + 0.5]]) {
      out.push(iso(gx, gy, 0), iso(gx, gy, top));
    }
    return out;
  }

  private updateCamera(dt: number): void {
    const S = this.frameSize();
    const cam = this.camera;
    cam.reduced = this.reducedMotion;
    cam.panLimit = S / 2 + CAMERA.panMarginTiles;
    // Rotate around the shop centre. If the pivot moves (expansion), shift the camera by the same
    // amount so the picture doesn't jump.
    const pivot = { x: S / 2, y: S / 2 };
    if (pivot.x !== this.pivot.x || pivot.y !== this.pivot.y) {
      setView(cam.yaw, cam.pitch, this.pivot.x, this.pivot.y);
      const d = isoVec(-(pivot.x - this.pivot.x), -(pivot.y - this.pivot.y));
      cam.x += d.x;
      cam.y += d.y;
      this.pivot = pivot;
    }
    // Zoom-to-fit uses the classic angle (the widest silhouette), so rotating never "pumps" the zoom.
    setView(CAMERA.defaultYaw, cam.pitch, pivot.x, pivot.y);
    const fitPts = this.framePoints(S);
    const fit = { w: Math.max(...fitPts.map((p) => p.x)) - Math.min(...fitPts.map((p) => p.x)) + 12, h: Math.max(...fitPts.map((p) => p.y)) - Math.min(...fitPts.map((p) => p.y)) + 22 };
    setView(cam.yaw, cam.pitch, pivot.x, pivot.y);
    const pts = this.framePoints(S);
    const minX = Math.min(...pts.map((p) => p.x)) - 6;
    const maxX = Math.max(...pts.map((p) => p.x)) + 6;
    const minY = Math.min(...pts.map((p) => p.y)) - 6;
    const maxY = Math.max(...pts.map((p) => p.y)) + 16;
    cam.frame(minX, minY, maxX, maxY, this.vw, this.vh, this.insets.top, this.insets.bottom, this.insets.right, this.insets.left, fit, isoVec(cam.panX, cam.panY));
    if (this.lastSize === 0 || this.lastLocation !== this.game.shop.locationId) {
      cam.snap();
      this.lastLocation = this.game.shop.locationId;
    }
    this.lastSize = S;
    cam.update(dt);
    // Draw (and pick) with the eased angle.
    setView(cam.yaw, cam.pitch, pivot.x, pivot.y);
  }

  render(dt: number): void {
    this.time += dt;
    const g = this.game;
    const ctx = this.ctx;
    const shop = g.shop;
    const loc = LOCATION_MAP[shop.locationId] ?? LOCATION_MAP.neighborhood;
    const skinDef = getSkin(this.activeSkin());
    const skin = skinDef?.effect ?? null;
    this.skinTrim = skinDef?.displayTrim ?? skinDef?.shelf?.trim ?? null;
    // A premium skin overrides the Star theme while equipped; unequipping shows the Star theme again.
    const baseTheme = THEME_MAP[g.state.cosmetics.theme] ?? THEME_MAP.classic;
    const theme = skinDef ? { ...baseTheme, ...skinDef.palette } : baseTheme;
    this.features = featuresAtStage(shop.stage);
    this.wallH = tierOfStage(shop.stage).wallH;
    this.particles.maxParticles = g.state.settings.graphics === 'low' ? 120 : 400;
    this.particles.enabled = g.state.settings.effectsEnabled;
    this.updateCamera(dt);
    for (const [k, v] of this.bounce) {
      if (v - dt <= 0) this.bounce.delete(k);
      else this.bounce.set(k, v - dt);
    }
    this.particles.update(dt);
    if (shop.construction && Math.random() < dt * 8) {
      const S = EXPANSIONS[shop.construction.targetStage].size;
      const p = iso(shop.size + Math.random() * (S - shop.size), Math.random() * S);
      this.particles.emit('dust', p.x, p.y, 1, { spread: 20, up: 30 });
    }

    // Background
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, this.vh);
    sky.addColorStop(0, loc.theme.sky);
    sky.addColorStop(1, shade(loc.theme.ground, -0.1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (loc.theme.night) {
      ctx.fillStyle = '#fff';
      for (const s of this.stars) ctx.fillRect(s.x * this.vw, s.y * this.vh, 1.5, 1.5);
    }

    const cam = this.camera;
    const sh = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 10 : 0;
    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, this.dpr * (this.vw / 2 - cam.x * cam.zoom + sh), this.dpr * (this.vh / 2 - cam.y * cam.zoom + sh));

    const S = shop.size;
    this.drawOutsideGround(S, loc);
    if (skin === 'neon') this.nightOverlay(S);
    // Outside things (scenery, people on the street) are split into those behind the shop and those
    // between the shop and the camera; the latter are drawn last and faded where they cover the shop.
    const inside: Customer[] = [];
    const outside: { x: number; y: number; draw: () => void }[] = this.sceneryItems(S, loc, skin === 'neon' || !!loc.theme.night);
    for (const c of g.world.customers) {
      if (c.pos.x < 0) outside.push({ x: c.pos.x, y: c.pos.y, draw: () => this.drawCustomer(c) });
      else inside.push(c);
    }
    const front: typeof outside = [];
    const back: typeof outside = [];
    for (const it of outside) (this.inFrontOfShop(it.x, it.y, S) ? front : back).push(it);
    back.sort((a, b) => depth(a.x, a.y) - depth(b.x, b.y));
    for (const it of back) it.draw();
    this.drawFloor(S, theme);
    this.drawWalls(S, theme, 'far');
    if (skin === 'neon') this.neonTrims(S);
    if (skin === 'golden') this.goldenLighting(S);
    if (skin === 'ocean') this.oceanLight(S);
    this.drawSortables(inside, S, theme);
    this.drawWalls(S, theme, 'near');
    if (skin === 'autumn') this.autumnLeaves(S);
    front.sort((a, b) => depth(a.x, a.y) - depth(b.x, b.y));
    for (const it of front) {
      ctx.save();
      if (this.coversShop(it.x, it.y, S)) ctx.globalAlpha = 0.35;
      it.draw();
      ctx.restore();
    }
    this.drawSigns(S, theme);
    this.drawOverlays();
    this.particles.draw(ctx, false);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.particles.draw(ctx, true);
  }

  // ------------------------------------------------------------ outside

  private drawOutsideGround(S: number, loc: (typeof LOCATION_MAP)[string]): void {
    this.world.drawGround(loc.id, S, this.time, !this.reducedMotion);
    // entrance mat in front of the door (an entrance style recolours it)
    const ent = ENTRANCE_STYLES[this.activeStyles().entrance ?? ''];
    if (ent) {
      diamond(this.ctx, -1, DOOR_TILE.y, 1, ent.matTrim, 0.5, 0.06);
      diamond(this.ctx, -1, DOOR_TILE.y, 1, ent.mat, 0.6, 0.16);
    } else diamond(this.ctx, -1, DOOR_TILE.y, 1, 'rgba(180,60,60,0.45)', 0.5, 0.1);
  }

  /** Buildings, props and traffic around the shop, as depth-sortable items. */
  private sceneryItems(S: number, loc: (typeof LOCATION_MAP)[string], lit: boolean): { x: number; y: number; draw: () => void }[] {
    const seasons = this.game.mods.seasons().map((x) => x.id);
    const items = this.world.items(loc.id, S, seasons, this.time, { animate: !this.reducedMotion, lit });
    // entrance style: a matching pair of props either side of the door
    const ent = ENTRANCE_STYLES[this.activeStyles().entrance ?? ''];
    if (ent) {
      ent.props.forEach((id, i) => {
        const x = -0.22;
        const y = i === 0 ? DOOR_TILE.y - 0.2 : DOOR_TILE.y + 1.2;
        items.push({ x, y, draw: () => { const p = iso(x, y); drawSprite(this.ctx, id, p.x, p.y, { size: id.includes('streetlight') || id.includes('lantern') || id.includes('tree') ? 0.7 : 0.8 }); } });
      });
    }
    return items;
  }

  /** True when a ground point outside the shop lies between the shop and the camera. */
  private inFrontOfShop(x: number, y: number, S: number): boolean {
    const qx = Math.max(0, Math.min(S, x));
    const qy = Math.max(0, Math.min(S, y));
    return depth(x, y) > depth(qx, qy) + 0.01;
  }

  /** True when something standing at (x, y) would hide part of the shop on screen. */
  private coversShop(x: number, y: number, S: number): boolean {
    const quad = [iso(0, 0), iso(S, 0), iso(S, S), iso(0, S)];
    const inside = (p: { x: number; y: number }) => {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = quad[i];
        const b = quad[(i + 1) % 4];
        const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (c !== 0) {
          if (sign === 0) sign = Math.sign(c);
          else if (Math.sign(c) !== sign) return false;
        }
      }
      return true;
    };
    return inside(iso(x, y, 20)) || inside(iso(x, y, 50));
  }

  /** Retractable-belt barriers along a queue lane (visual only; the lane itself is sim data). */
  private queueBarriers(tiles: { x: number; y: number }[]): void {
    if (tiles.length < 2) return;
    const ctx = this.ctx;
    const posts: [{ x: number; y: number }[], { x: number; y: number }[]] = [[], []];
    for (let i = 0; i < tiles.length; i++) {
      const a = tiles[Math.max(0, i - 1)];
      const b = tiles[Math.min(tiles.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const px = -(b.y - a.y) / len;
      const py = (b.x - a.x) / len;
      const cx = tiles[i].x + 0.5;
      const cy = tiles[i].y + 0.5;
      posts[0].push({ x: cx + px * 0.46, y: cy + py * 0.46 });
      posts[1].push({ x: cx - px * 0.46, y: cy - py * 0.46 });
    }
    const belt = this.skinTrim ?? '#e63946';
    for (const side of posts) {
      ctx.strokeStyle = belt;
      ctx.lineWidth = 2;
      ctx.beginPath();
      side.forEach((p, i) => {
        const s = iso(p.x, p.y, 9);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      for (const p of side) {
        const a = iso(p.x, p.y, 0);
        const b = iso(p.x, p.y, 12);
        ellipse(ctx, a.x, a.y, 3.2, 1.6, 'rgba(0,0,0,0.25)');
        ctx.strokeStyle = '#adb5bd';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ellipse(ctx, b.x, b.y, 1.8, 1.4, '#dee2e6');
      }
    }
  }

  // --------------------------------------------------------------- floor

  private drawFloor(S: number, theme: (typeof THEME_MAP)[string]): void {
    const ctx = this.ctx;
    const g = this.game;
    const grid = g.world.grid;
    // shop base slab
    box(ctx, 0, 0, S, S, 6, shade(theme.floorB, -0.25), -6, false);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        diamond(ctx, x, y, 1, (x + y) % 2 ? theme.floorA : theme.floorB);
        const tile = grid.get(x, y);
        if (tile?.department && DEPARTMENT_MAP[tile.department]) diamond(ctx, x, y, 1, hexAlpha(DEPARTMENT_MAP[tile.department].floorTint, 0.45), 0, 0.06);
      }
    }
    this.floorFinish(S, theme);
    // queue lanes: dashed floor marks plus belt barriers along both sides
    for (const [, tiles] of grid.queues) {
      for (const q of tiles) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        diamondPath(ctx, q.x + 0.15, q.y + 0.15, 0.7, 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.queueBarriers(tiles);
    }
    // stockroom access
    diamond(ctx, STOCKROOM_TILE.x, STOCKROOM_TILE.y, 1, 'rgba(0,0,0,0.06)', 0, 0.1);
    // dirt
    for (const d of g.shop.dirt) {
      const p = iso(d.x + 0.5, d.y + 0.5);
      ellipse(ctx, p.x, p.y, 13, 6, 'rgba(120,85,40,0.55)');
      ellipse(ctx, p.x + 6, p.y + 2, 6, 3, 'rgba(120,85,40,0.45)');
      drawSprite(ctx, 'ui.drop', p.x - 6, p.y - 1, { size: 0.55 });
    }
    // construction zone / next expansion ghost
    const c = g.shop.construction;
    if (c) {
      const T = EXPANSIONS[c.targetStage].size;
      const prog = 1 - c.remaining / c.duration;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        if (x < S && y < S) continue;
        diamond(ctx, x, y, 1, (x + y) % 2 ? 'rgba(255,214,10,0.35)' : 'rgba(40,40,40,0.25)', 0, 0.04);
      }
      // scaffolding poles
      for (let i = 0; i <= T; i += 1) {
        for (const [gx, gy] of [[T, i], [i, T]]) {
          const pt = iso(gx, gy);
          const top = iso(gx, gy, 30 * prog);
          ctx.strokeStyle = '#adb5bd';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();
        }
      }
      const mid = iso(T - 0.5, T - 0.5, 50);
      roundRect(ctx, mid.x - 40, mid.y - 6, 80, 12, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      roundRect(ctx, mid.x - 38, mid.y - 4, 76 * prog, 8, 4);
      ctx.fillStyle = '#ffd60a';
      ctx.fill();
      drawSprite(ctx, 'ui.barrier', mid.x, mid.y - 8, { size: 1.2 });
    } else {
      const next = g.shopMgr.nextExpansion();
      if (next) {
        const T = next.size;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = this.highlightExpansion ? `rgba(255,190,11,${this.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(this.time * 6)})` : 'rgba(255,255,255,0.7)';
        ctx.lineWidth = this.highlightExpansion ? 3 : 1.5;
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          if (x < S && y < S) continue;
          diamond(ctx, x, y, 1, 'rgba(255,255,255,0.12)', 0, 0.05);
        }
        ctx.beginPath();
        const pts = [iso(S, 0), iso(T, 0), iso(T, T), iso(0, T), iso(0, S), iso(S, S)];
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        const mid = iso(S + (T - S) / 2, S + (T - S) / 2, 6);
        const canLevel = g.state.player.level >= next.requiredLevel;
        badge(ctx, canLevel ? `🔨 ${formatMoney(g.shopMgr.expansionCost() ?? 0)}` : `🔒 ${t('hud.level_short')} ${next.requiredLevel}`, mid.x, mid.y, g.shopMgr.canExpand().ok ? '#2bb673' : 'rgba(0,0,0,0.55)', '#fff', 10);
      }
    }
  }

  /** Tier floor finishes: tiled grout (Super Shop), a border band (Mega Store), a marble medallion (Flagship). */
  private floorFinish(S: number, theme: (typeof THEME_MAP)[string]): void {
    const ctx = this.ctx;
    const f = this.features;
    if (f.has('tiled_floor')) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i <= S; i++) {
        const a = iso(i, 0);
        const b = iso(i, S);
        const c = iso(0, i);
        const d = iso(S, i);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
      }
      ctx.stroke();
    }
    if (f.has('floor_border')) {
      ctx.strokeStyle = shade(theme.trim, -0.1);
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3;
      diamondPath(ctx, 0.18, 0.18, S - 0.36, S - 0.36);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (f.has('marble_inlay')) {
      const c = S / 2;
      for (const [r, col] of [[1.3, 'rgba(255,255,255,0.45)'], [0.95, 'rgba(242,182,50,0.55)'], [0.55, 'rgba(255,255,255,0.6)']] as [number, string][]) {
        diamond(ctx, c - r / 2, c - r / 2, r, col);
      }
    }
  }

  // --------------------------------------------------------------- walls

  /** The four sides of the building with their outward ground normals. */
  private wallSides(S: number) {
    return [
      { id: 'N', x0: 0, y0: 0, x1: S, y1: 0, nx: 0, ny: -1, shade: 0 },
      { id: 'W', x0: 0, y0: 0, x1: 0, y1: S, nx: -1, ny: 0, shade: -0.15 },
      { id: 'S', x0: 0, y0: S, x1: S, y1: S, nx: 0, ny: 1, shade: -0.08 },
      { id: 'E', x0: S, y0: 0, x1: S, y1: S, nx: 1, ny: 0, shade: -0.22 },
    ] as const;
  }

  /** A wall is "far" when the camera looks at its inside face; near walls are cut away (dollhouse view). */
  private isFarWall(side: { nx: number; ny: number }): boolean {
    return !faces(side.nx, side.ny);
  }

  /** Far-wall top edges at height z, as segments (for trims drawn by cosmetic themes). */
  private farWallSegments(S: number, z: number): [{ x: number; y: number }, { x: number; y: number }][] {
    return this.wallSides(S)
      .filter((w) => this.isFarWall(w))
      .map((w) => [iso(w.x0, w.y0, z), iso(w.x1, w.y1, z)]);
  }

  /** Window openings on the far walls (shared by the walls and the Neon Nights lit windows). */
  private windowOpenings(S: number): { ax: number; ay: number; bx: number; by: number; top: number }[] {
    const out: { ax: number; ay: number; bx: number; by: number; top: number }[] = [];
    const H = this.wallH;
    const top = Math.min(H - 8, 34 + (H - 46) * 0.5);
    for (const side of this.wallSides(S)) {
      if (!this.isFarWall(side)) continue;
      const dx = (side.x1 - side.x0) / S;
      const dy = (side.y1 - side.y0) / S;
      for (let k = 0; k < S; k++) {
        if ((side.id === 'W' && k === DOOR_TILE.y) || (side.id === 'N' && k === STOCKROOM_TILE.x)) continue;
        if (!(k % 2 === 0 || k === S - 1)) continue;
        const ax = side.x0 + dx * k;
        const ay = side.y0 + dy * k;
        out.push({ ax: ax + dx * 0.25, ay: ay + dy * 0.25, bx: ax + dx * 0.75, by: ay + dy * 0.75, top });
      }
    }
    return out;
  }

  /** Vertical quad on the wall plane between ground points a→b, from z0 to z1. */
  private wallQuad(ax: number, ay: number, bx: number, by: number, z0: number, z1: number, color: string): void {
    const ctx = this.ctx;
    const a0 = iso(ax, ay, z0);
    const b0 = iso(bx, by, z0);
    const b1 = iso(bx, by, z1);
    const a1 = iso(ax, ay, z1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.closePath();
    ctx.fill();
  }

  private drawWalls(S: number, theme: (typeof THEME_MAP)[string], pass: 'far' | 'near'): void {
    const ctx = this.ctx;
    const f = this.features;
    const NEAR_H = 9;
    for (const side of this.wallSides(S)) {
      const far = this.isFarWall(side);
      if ((pass === 'far') !== far) continue;
      const H = far ? this.wallH : NEAR_H;
      const base = shade(theme.wall, side.shade);
      const dx = (side.x1 - side.x0) / S;
      const dy = (side.y1 - side.y0) / S;
      for (let k = 0; k < S; k++) {
        const ax = side.x0 + dx * k;
        const ay = side.y0 + dy * k;
        const bx = ax + dx;
        const by = ay + dy;
        const isDoor = side.id === 'W' && k === DOOR_TILE.y;
        const isStock = side.id === 'N' && k === STOCKROOM_TILE.x;
        if (isDoor) continue;
        this.wallQuad(ax, ay, bx, by, 0, H, isStock ? shade(base, -0.05) : base);
        // wall-top cap
        this.wallQuad(ax, ay, bx, by, H, H + 5, f.has('gold_cornice') && far ? '#f2b632' : theme.wallTop);
        if (!far) continue;
        if (f.has('baseboard')) this.wallQuad(ax, ay, bx, by, 0, 5, shade(base, -0.3));
        if (f.has('wall_band')) this.wallQuad(ax, ay, bx, by, H * 0.56, H * 0.56 + 3, shade(theme.trim, -0.05));
        if (f.has('gold_cornice')) this.wallQuad(ax, ay, bx, by, H - 4, H, '#ffd166');
        const u = (t: number) => [ax + (bx - ax) * t, ay + (by - ay) * t] as const;
        if (isStock) {
          const [s0x, s0y] = u(0.2);
          const [s1x, s1y] = u(0.8);
          this.wallQuad(s0x, s0y, s1x, s1y, 0, 34, shade(theme.trim, -0.2));
          const m = iso((ax + bx) / 2, (ay + by) / 2, 28);
          badge(ctx, t('world.staff'), m.x, m.y, '#2b2d42', '#fff', 6);
        } else if (k % 2 === 0 || k === S - 1) {
          // window
          const [w0x, w0y] = u(0.25);
          const [w1x, w1y] = u(0.75);
          const top = Math.min(H - 8, 34 + (H - 46) * 0.5);
          this.wallQuad(w0x, w0y, w1x, w1y, 16, top, '#bde0fe');
          const a = iso(w0x, w0y, 16);
          const b = iso(w1x, w1y, 16);
          const c = iso(w1x, w1y, top);
          const d = iso(w0x, w0y, top);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.lineTo(d.x, d.y);
          ctx.closePath();
          ctx.stroke();
        } else if (f.has('wall_lights')) {
          // wall sconce with a soft glow
          const m = iso((ax + bx) / 2, (ay + by) / 2, H * 0.72);
          const glow = ctx.createRadialGradient(m.x, m.y, 1, m.x, m.y, 16);
          glow.addColorStop(0, 'rgba(255,236,170,0.85)');
          glow.addColorStop(1, 'rgba(255,236,170,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 16, 0, Math.PI * 2);
          ctx.fill();
          ellipse(ctx, m.x, m.y, 3.5, 3, '#fff3bf');
        }
      }
      if (side.id === 'W') this.drawDoor(far, H, theme);
    }
    // Corner pillars (Super Shop and up): full height where both walls are far, cut down otherwise.
    if (f.has('pillars') && pass === 'far') {
      const sides = this.wallSides(S);
      const farOf = (id: string) => this.isFarWall(sides.find((w) => w.id === id)!);
      for (const [cx, cy, w1, w2] of [[0, 0, 'N', 'W'], [S, 0, 'N', 'E'], [S, S, 'S', 'E'], [0, S, 'W', 'S']] as [number, number, string, string][]) {
        if (!(farOf(w1) && farOf(w2))) continue;
        box(ctx, cx - 0.14, cy - 0.14, cx + 0.14, cy + 0.14, this.wallH + 5, f.has('gold_cornice') ? '#e0a526' : shade(theme.trim, -0.1));
      }
    }
  }

  /** Door frame and sliding doors on the west wall (full height if far, cut down if near). */
  private drawDoor(far: boolean, H: number, theme: (typeof THEME_MAP)[string]): void {
    const ctx = this.ctx;
    const g = this.game;
    const wide = this.features.has('wide_door');
    const near = g.world.customers.some((c) => Math.abs(c.pos.x - 0) < 1.3 && Math.abs(c.pos.y - (DOOR_TILE.y + 0.5)) < 1);
    this.door += ((near ? 1 : 0) - this.door) * 0.15;
    const y0 = DOOR_TILE.y;
    const y1 = DOOR_TILE.y + 1;
    const post = (y: number) => {
      const a = iso(0, y, 0);
      const b = iso(0, y, H);
      ctx.strokeStyle = theme.trim;
      ctx.lineWidth = wide ? 5 : 4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    post(y0);
    post(y1);
    if (!far) return;
    // header above the opening (taller and two-tone from the Expanded Shop up)
    this.wallQuad(0, y0, 0, y1, H - (wide ? 12 : 8), H + 5, theme.trim);
    if (wide) this.wallQuad(0, y0, 0, y1, H - 12, H - 9, this.features.has('gold_cornice') ? '#ffd166' : shade(theme.trim, -0.25));
    const open = this.door * 0.42;
    for (const [s0, e0] of [
      [0.05, 0.5 - open],
      [0.5 + open, 0.95],
    ]) {
      if (e0 <= s0) continue;
      this.wallQuad(0, y0 + s0, 0, y0 + e0, 0, H - 8, 'rgba(173,232,244,0.55)');
      const a = iso(0, y0 + s0, 0);
      const b = iso(0, y0 + e0, 0);
      const c = iso(0, y0 + e0, H - 8);
      const d = iso(0, y0 + s0, H - 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  /** OPEN/CLOSED sign (tap target) and the shop-name sign. Billboards, always on top so they stay readable. */
  private drawSigns(S: number, theme: (typeof THEME_MAP)[string]): void {
    const ctx = this.ctx;
    const g = this.game;
    const sp = this.signPos();
    const isOpen = g.shop.open;
    const pulse = this.highlightSign && !this.reducedMotion ? 1 + 0.12 * Math.sin(this.time * 8) : 1;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.scale(pulse, pulse);
    roundRect(ctx, -22, -9, 44, 18, 6);
    ctx.fillStyle = isOpen ? '#2bb673' : '#ef476f';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 10px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isOpen ? t('world.open') : t('world.closed'), 0, 1);
    ctx.restore();
    // shop sign above the north wall, sized by tier
    const grand = this.features.has('grand_sign');
    const tier = tierOfStage(g.shop.stage);
    const mid = this.nameSignPos(S);
    const name = t(`location.${g.shop.locationId}`);
    const fs = grand ? 12 : 10;
    ctx.font = `900 ${fs}px Nunito, system-ui, sans-serif`;
    const w = Math.max(80, ctx.measureText(name).width + 34);
    const h = grand ? 24 : 19;
    const sign = this.styled()?.sign;
    roundRect(ctx, mid.x - w / 2, mid.y - h / 2, w, h, 8);
    ctx.save();
    if (sign?.glow || grand) {
      ctx.shadowColor = sign?.glow ?? 'rgba(255,209,102,0.8)';
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = sign?.fill ?? theme.trim;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, mid.x - w / 2, mid.y - h / 2, w, h, 8);
    ctx.strokeStyle = sign?.border ?? (grand ? '#ffd166' : '#fff');
    ctx.lineWidth = grand ? 3 : 2;
    ctx.stroke();
    ctx.fillStyle = sign?.text ?? '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${LOCATION_MAP[g.shop.locationId]?.icon ?? ''} ${name}`, mid.x, mid.y);
    // tier plate under the name
    if (g.shop.stage >= 2) badge(ctx, `${tier.icon} ${t(`tier.${tier.id}`)}`, mid.x, mid.y + h / 2 + 7, grand ? '#b8860b' : 'rgba(43,45,66,0.85)', '#fff', 7);
  }

  /** The shop-name sign hangs above a wall the camera can see (north wall by default). */
  private nameSignPos(S: number): { x: number; y: number } {
    const sides = this.wallSides(S);
    const pick = ['N', 'E', 'S', 'W'].map((id) => sides.find((w) => w.id === id)!).find((w) => this.isFarWall(w)) ?? sides[0];
    const u = pick.id === 'N' ? Math.max(1.6, S * 0.62) / S : 0.5;
    return iso(pick.x0 + (pick.x1 - pick.x0) * u, pick.y0 + (pick.y1 - pick.y0) * u, this.wallH + 18);
  }

  signPos() {
    return iso(0, DOOR_TILE.y + 1.5, this.wallH - 12);
  }

  // ------------------------------------------------------------ sortables

  private drawSortables(inside: Customer[], _S: number, _theme: (typeof THEME_MAP)[string]): void {
    const g = this.game;
    type Item = { d: number; draw: () => void };
    const items: Item[] = [];
    const owner = g.shopMgr.ownerCheckoutUid();
    for (const o of g.shop.objects) {
      items.push({ d: depth(o.x + 0.5, o.y + 0.5), draw: () => this.drawObj(o, owner) });
    }
    for (const c of inside) items.push({ d: depth(c.pos.x, c.pos.y), draw: () => this.drawCustomer(c) });
    for (const e of g.world.employees) items.push({ d: depth(e.pos.x, e.pos.y), draw: () => this.drawEmployee(e) });
    const crate = g.state.events.crate;
    if (crate) {
      items.push({
        d: depth(crate.x + 0.5, crate.y + 0.5),
        draw: () => {
          const bob = Math.sin(this.time * 4) * 3;
          box(this.ctx, crate.x + 0.25, crate.y + 0.25, crate.x + 0.75, crate.y + 0.75, 20, '#c68b59', bob + 2);
          const p = iso(crate.x + 0.5, crate.y + 0.5, 34 + bob);
          emoji(this.ctx, '❓', p.x, p.y - 8, 16);
          if (Math.random() < 0.1) this.particles.emit('sparkle', p.x, p.y, 1, { spread: 20, up: 20 });
        },
      });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw();
  }

  private drawObj(o: PlacedObject, owner: number): void {
    const g = this.game;
    const ctx = this.ctx;
    const isDisplay = OBJECT_MAP[o.kind]?.category === 'display';
    const cap = isDisplay ? g.shopMgr.capacity(o) : 1;
    const b = this.reducedMotion ? 0 : this.bounce.get(o.uid) ?? 0;
    const scale = 1 + Math.sin(b * 20) * b * 0.25;
    const base = iso(o.x + 0.5, o.y + 0.5);
    const rt = g.world.checkouts.get(o.uid);
    if (this.selectedUid === o.uid) {
      // Selected: soft glow under the object + the tile customers use to reach it.
      diamond(ctx, o.x, o.y, 1, 'rgba(255,255,255,0.35)', 0, -0.04);
      if (OBJECT_MAP[o.kind]?.needsAccess) {
        const a = accessTile(o);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        diamondPath(ctx, a.x + 0.12, a.y + 0.12, 0.76, 0.76);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.save();
    if (scale !== 1) {
      ctx.translate(base.x, base.y);
      ctx.scale(scale, 2 - scale);
      ctx.translate(-base.x, -base.y);
    }
    if (this.placement && this.placement.ignoreUid === o.uid) ctx.globalAlpha = 0.3;
    drawObject(ctx, o, {
      skin: this.styled(),
      sparkle: !this.reducedMotion,
      stockRatio: isDisplay ? o.stock / Math.max(1, cap) : 1,
      closed: o.kind === 'checkout' && !(o.uid === owner || rt?.cashierId),
      producing: isDisplay && o.stock < cap,
      powerOff: g.mods.machinesOff(),
      time: this.time,
    });
    ctx.restore();
    if (this.selectedUid === o.uid || this.highlightUid === o.uid) {
      ctx.strokeStyle = this.highlightUid === o.uid ? `rgba(255,190,11,${this.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(this.time * 8)})` : '#ffffff';
      ctx.lineWidth = 3;
      diamondPath(ctx, o.x - 0.02, o.y - 0.02, 1.04, 1.04);
      ctx.stroke();
    }
  }

  private drawCustomer(c: Customer): void {
    const def = CUSTOMER_MAP[c.type];
    if (!def) return;
    const p = iso(c.pos.x + (c.state === 'queue' ? 0 : c.offset.x), c.pos.y + (c.state === 'queue' ? 0 : c.offset.y));
    const look = this.look(`c${c.id}:${c.type}`, () => customerAppearance(c.type, c.id));
    const happy = !!c.emote && (c.emote === 'happy' || c.emote === 'love' || c.emote === 'wow') && c.emoteTime < 0.9;
    let state: PoseState = 'idle';
    if (c.moving) state = 'walk';
    else if (c.state === 'take') state = 'reach';
    else if (c.state === 'browse' || c.state === 'select' || c.state === 'waiting_stock') state = 'browse';
    else if (c.state === 'queue' || c.state === 'wait_queue') state = 'queue';
    else if (c.state === 'pay') state = 'pay';
    if (happy && !c.moving && !this.reducedMotion) state = 'celebrate';
    const v = this.view(c.facing);
    const pose = { state, t: this.reducedMotion && state !== 'walk' ? 0 : this.time + c.id * 0.37, front: v.front, right: v.right, angry: c.angry };
    // PNG sprite sheet first; the live procedural drawing covers looks/expressions no sheet has.
    if (c.angry || !drawSheetCharacter(this.ctx, look.sheet ?? null, 'customer', p.x, p.y, pose, look.scale)) drawCharacter(this.ctx, p.x, p.y, look, pose);
    if (c.type === 'celebrity' && Math.random() < 0.05) this.particles.emit('sparkle', p.x, p.y - 30, 1, { spread: 20, up: 20 });
  }

  private drawEmployee(e: EmployeeRuntime): void {
    const data = this.game.shop.staff.find((s) => s.id === e.id);
    const def = STAFF_MAP[e.type];
    if (!def) return;
    const p = iso(e.pos.x, e.pos.y);
    // An equipped staff outfit wins; otherwise the shop theme may supply a matching uniform.
    const outfit = this.activeOutfit();
    const uniform = getSkin(this.activeSkin())?.uniform;
    const acc = ACCESSORY_STYLES[this.activeStyles().accessory ?? ''];
    const look = this.look(`s${e.id}:${e.type}:${outfit ?? ''}:${uniform ? uniform.body : ''}:${acc ?? ''}`, () => {
      const a = staffAppearance(e.type, e.id, outfit, uniform);
      if (acc && !a.accessories.includes(acc)) a.accessories.push(acc);
      // sheets show the plain uniform, so an accessory means drawing this person live
      return { ...a, sheet: acc ? null : staffSheet(e.type, e.id, outfit, uniform) };
    });
    const k = e.task.kind;
    let state: PoseState = 'idle';
    if (e.moving) state = 'walk';
    else if (k === 'scrub' || k === 'clean') state = 'clean';
    else if (k === 'pick' || k === 'fill') state = 'restock';
    else if (e.workAnim > 0) state = 'work';
    const v = this.view(e.facing);
    const pose = { state, t: this.reducedMotion && state !== 'walk' ? 0 : this.time + e.id * 0.53, front: v.front, right: v.right, carrying: e.carrying > 0 };
    if (!drawSheetCharacter(this.ctx, look.sheet ?? null, 'staff', p.x, p.y, pose, look.scale)) drawCharacter(this.ctx, p.x, p.y, look, pose);
    if (k === 'scrub' && Math.random() < 0.3) this.particles.emit('sparkle', p.x, p.y - 4, 1, { spread: 15, up: 20 });
    if (data && data.level > 1) badge(this.ctx, `${data.level}`, p.x + 10, p.y - 44, '#2b2d42', '#ffd23f', 6);
  }

  // -------------------------------------------------------------- overlays

  private drawOverlays(): void {
    const g = this.game;
    const ctx = this.ctx;
    const cb = g.state.settings.colorblind;
    // Stock badges (text + colour, never colour alone)
    for (const o of g.shop.objects) {
      if (OBJECT_MAP[o.kind]?.category !== 'display') continue;
      const st = g.inventory.status(o);
      const h = objectHeight(o);
      const p = iso(o.x + 0.5, o.y + 0.5, h + 10);
      if (st === 'out') badge(ctx, `⚠ ${t('world.out_of_stock')}`, p.x, p.y, cb ? '#d55e00' : '#ef476f', '#fff', 8);
      else if (st === 'low') badge(ctx, `▼ ${t('world.low_stock')}`, p.x, p.y, cb ? '#e69f00' : '#ff9f1c', '#fff', 8);
      // affordable upgrade hint
      const c = g.shopMgr.upgradeCost(o);
      if (c !== null && g.economy.canAfford(c) && st === 'ok') {
        const bob = Math.sin(this.time * 4 + o.uid) * 2;
        badge(ctx, '⬆', p.x + 18, p.y - 4 + bob, '#2bb673', '#fff', 8);
      }
    }
    for (const o of g.shopMgr.checkouts()) {
      const c = g.shopMgr.upgradeCost(o);
      if (c !== null && g.economy.canAfford(c)) {
        const p = iso(o.x + 0.5, o.y + 0.5, 46);
        badge(ctx, '⬆', p.x + 16, p.y + Math.sin(this.time * 4 + o.uid) * 2, '#2bb673', '#fff', 8);
      }
      const rt = g.world.checkouts.get(o.uid);
      if (rt?.serving && rt.total > 0) {
        const p = iso(o.x + 0.5, o.y + 0.5, 40);
        const prog = 1 - rt.timer / rt.total;
        roundRect(ctx, p.x - 14, p.y - 3, 28, 6, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();
        roundRect(ctx, p.x - 13, p.y - 2, 26 * Math.max(0, Math.min(1, prog)), 4, 2);
        ctx.fillStyle = '#3ddc84';
        ctx.fill();
      }
    }
    // Customer emotes and patience
    for (const c of g.world.customers) {
      const p = iso(c.pos.x, c.pos.y, c.type === 'child' ? 32 : 40);
      if (c.emote) drawEmote(ctx, p.x, p.y, c.emote, 1.6 - c.emoteTime);
      else if ((c.state === 'queue' || c.state === 'wait_queue') && c.patience < c.maxPatience * 0.6) {
        const r = Math.max(0, c.patience / c.maxPatience);
        roundRect(ctx, p.x - 9, p.y - 4, 18, 4, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
        roundRect(ctx, p.x - 9, p.y - 4, 18 * r, 4, 2);
        ctx.fillStyle = r < 0.3 ? (cb ? '#d55e00' : '#ef476f') : '#ffd166';
        ctx.fill();
        if (r < 0.3) emoji(ctx, '⏳', p.x - 13, p.y - 2, 7);
      }
    }
    // Placement preview
    const pm = this.placement;
    if (pm) {
      const okCol = cb ? 'rgba(0,114,178,0.35)' : 'rgba(43,182,115,0.35)';
      const badCol = cb ? 'rgba(213,94,0,0.35)' : 'rgba(239,71,111,0.35)';
      for (const [key, v] of pm.valid) {
        if (!v.ok) continue;
        const [x, y] = key.split(',').map(Number);
        diamond(ctx, x, y, 1, okCol.replace('0.35', '0.15'), 0, 0.3);
      }
      if (pm.hover) {
        const { x, y } = pm.hover;
        const v = pm.valid.get(`${x},${y}`);
        const ok = !!v?.ok;
        diamond(ctx, x, y, 1, ok ? okCol : badCol, 0, 0.02);
        const ghost: PlacedObject = { uid: -1, kind: pm.kind, x, y, dir: v?.dir ?? pm.dir, tier: 0, stock: 1, progress: 0 };
        if (g.world.grid.inBounds(x, y)) {
          ctx.globalAlpha = 0.65;
          drawObject(ctx, ghost, { stockRatio: 1, time: this.time });
          ctx.globalAlpha = 1;
          if (ok && OBJECT_MAP[pm.kind]?.needsAccess) {
            const a = accessTile(ghost);
            diamond(ctx, a.x, a.y, 1, 'rgba(255,255,255,0.35)', 0, 0.25);
            const ap = iso(a.x + 0.5, a.y + 0.5, 2);
            emoji(ctx, '🚶', ap.x, ap.y - 6, 10);
          }
        }
        const p = iso(x + 0.5, y + 0.5, 64);
        badge(ctx, ok ? `✓ ${t('build.valid')}` : `✗ ${t('build.invalid')}`, p.x, p.y, ok ? (cb ? '#0072b2' : '#2bb673') : cb ? '#d55e00' : '#ef476f', '#fff', 9);
      }
    }
  }

  // ---------------------------------------------------------------- picking

  pick(px: number, py: number): PickResult {
    const g = this.game;
    const w = this.camera.toWorld(px, py);
    const sp = this.signPos();
    if (Math.abs(w.x - sp.x) < 26 && Math.abs(w.y - sp.y) < 14) return { type: 'openSign' };
    const crate = g.state.events.crate;
    if (crate) {
      const p = iso(crate.x + 0.5, crate.y + 0.5, 20);
      if (Math.abs(w.x - p.x) < 24 && Math.abs(w.y - p.y) < 30) return { type: 'crate' };
    }
    // objects: front-most first
    const objs = [...g.shop.objects].sort((a, b) => depth(b.x + 0.5, b.y + 0.5) - depth(a.x + 0.5, a.y + 0.5));
    for (const o of objs) {
      const base = iso(o.x + 0.5, o.y + 0.5);
      const h = objectHeight(o);
      // Touch targets never shrink below ~48 CSS px, whatever the zoom.
      const minHalf = 24 / this.camera.zoom;
      const halfW = Math.max(TW * 0.42, minHalf);
      if (Math.abs(w.x - base.x) < halfW && w.y < base.y + Math.max(TH * 0.42, minHalf * 0.6) && w.y > base.y - Math.max(h + 6, minHalf * 2)) return { type: 'object', uid: o.uid };
    }
    const tp = unIso(w.x, w.y);
    const tx = Math.floor(tp.x);
    const ty = Math.floor(tp.y);
    if (g.shop.dirt.some((d) => d.x === tx && d.y === ty)) return { type: 'dirt', x: tx, y: ty };
    const S = g.shop.size;
    const next = g.shopMgr.nextExpansion();
    if (!g.shop.construction && next && tx >= 0 && ty >= 0 && tx < next.size && ty < next.size && (tx >= S || ty >= S)) return { type: 'expansion' };
    if (tx >= 0 && ty >= 0 && tx < S && ty < S) return { type: 'tile', x: tx, y: ty };
    return null;
  }

  /** Tile under a screen point (for placement hover). */
  tileAt(px: number, py: number): { x: number; y: number } {
    const w = this.camera.toWorld(px, py);
    const tp = unIso(w.x, w.y);
    return { x: Math.floor(tp.x), y: Math.floor(tp.y) };
  }

  /** Screen (CSS px) position of a world point — used to anchor DOM hints (tutorial). */
  screenOf(x: number, y: number, z = 0): { x: number; y: number } {
    const p = iso(x, y, z);
    return this.camera.toScreen(p.x, p.y);
  }

  screenOfObject(uid: number): { x: number; y: number } | null {
    const o = this.game.shopMgr.getObject(uid);
    if (!o) return null;
    return this.screenOf(o.x + 0.5, o.y + 0.5, objectHeight(o));
  }

  screenOfSign(): { x: number; y: number } {
    const p = this.signPos();
    return this.camera.toScreen(p.x, p.y);
  }

  screenOfExpansion(): { x: number; y: number } | null {
    const next = this.game.shopMgr.nextExpansion();
    if (!next) return null;
    const S = this.game.shop.size;
    return this.screenOf(S + (next.size - S) / 2, S + (next.size - S) / 2, 6);
  }
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
