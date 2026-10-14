import type { Game } from '../sim/game';
import type { Customer, EmployeeRuntime } from '../sim/world';
import type { Dir, PlacedObject } from '../core/types';
import { Camera, iso, unIso, shade, TW, TH, WALL_H } from './iso';
import { box, diamond, diamondPath, ellipse, emoji, roundRect, badge } from './shapes';
import { drawObject, drawPerson, drawEmote, objectHeight } from './sprites';
import type { PersonStyle } from './sprites';
import { ParticleSystem } from './particles';
import { LOCATION_MAP } from '../config/locations';
import { THEME_MAP } from '../config/cosmetics';
import { CUSTOMER_MAP } from '../config/customers';
import { STAFF_MAP } from '../config/staff';
import { OBJECT_MAP } from '../config/objects';
import { EXPANSIONS } from '../config/expansions';
import { DEPARTMENT_MAP } from '../config/departments';
import { DOOR_TILE, STOCKROOM_TILE } from '../core/state';
import { accessTile } from '../sim/grid';
import { formatMoney } from '../core/format';
import { getSkin } from './skins';
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

/** Premium staff outfits (bundle_staff_outfits): body + apron colours per outfit. */
const OUTFITS: Record<string, { body: string; apron: string }> = {
  smart: { body: '#1d3557', apron: '#ffd166' },
  diner: { body: '#ff6b9a', apron: '#2ec4b6' },
};


const STAFF_STYLE: Record<string, Partial<PersonStyle>> = {
  cashier: { hat: 'cap', apron: '#3a86ff' },
  stocker: { hat: 'hard', apron: '#fb8500' },
  cleaner: { apron: '#2a9d8f' },
  chef: { hat: 'chef', apron: '#ffffff' },
  manager: { hat: 'tie' },
};

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
  preview: { skin?: string | null; outfit?: string | null } | null = null;
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

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
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
   * a gold picture rail along the back walls. Sparkles are drawn by the shelves and respect reduced motion.
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
    const a = iso(0, S, WALL_H - 8);
    const b = iso(0, 0, WALL_H - 8);
    const d = iso(S, 0, WALL_H - 8);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
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
    tube([iso(0, S, WALL_H + 2), iso(0, 0, WALL_H + 2), iso(S, 0, WALL_H + 2)], '#ff2bd6');
    tube([iso(0.05, S, 6), iso(0.05, 0.05, 6), iso(S, 0.05, 6)], '#00f0ff');
    // lit windows
    ctx.shadowBlur = 16;
    ctx.globalAlpha = 1;
    for (let x = 0; x < S; x++) {
      if (x === STOCKROOM_TILE.x || !(x % 2 === 0 || x === S - 1)) continue;
      const a = iso(x + 0.25, 0, 16);
      const b = iso(x + 0.75, 0, 16);
      ctx.shadowColor = '#ffe066';
      ctx.fillStyle = 'rgba(255,224,102,0.95)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - 18);
      ctx.lineTo(a.x, a.y - 18);
      ctx.closePath();
      ctx.fill();
    }
    // neon "OPEN 24/7" sign on the back wall
    const p = iso(Math.max(0.6, S * 0.22), 0, WALL_H - 10);
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

  private updateCamera(dt: number): void {
    const S = this.frameSize();
    // Frame the shop itself (walls + door + a little street); the expansion ghost may peek off-screen.
    const pts = [iso(-1.1, -0.2, WALL_H + 34), iso(S + 0.25, -0.2, WALL_H + 34), iso(S + 0.25, S + 0.3), iso(-1.1, S + 0.5)];
    const minX = Math.min(...pts.map((p) => p.x)) - 6;
    const maxX = Math.max(...pts.map((p) => p.x)) + 6;
    const minY = Math.min(...pts.map((p) => p.y)) - 6;
    const maxY = Math.max(...pts.map((p) => p.y)) + 16;
    this.camera.frame(minX, minY, maxX, maxY, this.vw, this.vh, this.insets.top, this.insets.bottom, this.insets.right, this.insets.left);
    if (this.lastSize === 0 || this.lastLocation !== this.game.shop.locationId) {
      this.camera.snap();
      this.lastLocation = this.game.shop.locationId;
    }
    this.lastSize = S;
    this.camera.update(dt);
  }

  render(dt: number): void {
    this.time += dt;
    const g = this.game;
    const ctx = this.ctx;
    const shop = g.shop;
    const loc = LOCATION_MAP[shop.locationId] ?? LOCATION_MAP.neighborhood;
    const skinDef = getSkin(this.activeSkin());
    const skin = skinDef?.effect ?? null;
    // A premium skin overrides the Star theme while equipped; unequipping shows the Star theme again.
    const baseTheme = THEME_MAP[g.state.cosmetics.theme] ?? THEME_MAP.classic;
    const theme = skinDef ? { ...baseTheme, ...skinDef.palette } : baseTheme;
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
    this.drawOutside(S, loc);
    if (skin === 'neon') this.nightOverlay(S);
    // Street NPCs are behind the left wall.
    const inside: Customer[] = [];
    for (const c of g.world.customers) {
      if (c.pos.x < 0) this.drawCustomer(c);
      else inside.push(c);
    }
    this.drawFloor(S, theme);
    this.drawWalls(S, theme);
    if (skin === 'neon') this.neonTrims(S);
    if (skin === 'golden') this.goldenLighting(S);
    this.drawSortables(inside);
    this.drawOverlays();
    this.particles.draw(ctx, false);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.particles.draw(ctx, true);
  }

  // ------------------------------------------------------------ outside

  private drawOutside(S: number, loc: (typeof LOCATION_MAP)[string]): void {
    const ctx = this.ctx;
    const th = loc.theme;
    const ext = S + 7;
    // ground
    diamondPath(ctx, -8, -8, ext + 8, ext + 8);
    ctx.fillStyle = th.ground;
    ctx.fill();
    for (let y = -8; y < ext; y += 2) for (let x = -8; x < ext; x += 2) if (((x + y) / 2) % 2 === 0) diamond(ctx, x, y, 2, th.ground2);
    // road + sidewalk on the left (the street customers walk along)
    diamondPath(ctx, -4.2, -8, 2.6, ext + 8);
    ctx.fillStyle = loc.special === 'tourists' ? th.road : th.road;
    ctx.fill();
    if (loc.special === 'tourists') {
      // the sea, with a little wave animation
      for (let y = -8; y < ext; y += 1) {
        const w = Math.sin(this.time * 2 + y) * 0.08;
        diamond(ctx, -4.2 + w, y, 0.25, 'rgba(255,255,255,0.5)');
      }
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 12]);
      const a = iso(-2.9, -8);
      const b = iso(-2.9, ext);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    diamondPath(ctx, -1.6, -8, 1.6, ext + 8);
    ctx.fillStyle = loc.special === 'tourists' ? '#ffe8b0' : '#dee2e6';
    ctx.fill();
    // scenery: trees / buildings / lanterns depending on the location
    const seed = (n: number) => {
      const v = Math.sin(n * 127.1 + S * 3.7) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let i = 0; i < 6; i++) {
      const x = S + 1.5 + seed(i) * 3;
      const y = -1 + i * ((S + 3) / 6);
      this.scenery(x, y, loc.special, i);
    }
    for (let i = 0; i < 5; i++) {
      const x = 1 + i * ((S + 1) / 5);
      const y = -2.2 - seed(i + 9) * 1.5;
      this.scenery(x, y, loc.special, i + 10);
    }
    // entrance mat in front of the door
    diamond(ctx, -1, DOOR_TILE.y, 1, 'rgba(180,60,60,0.45)', 0.5, 0.1);
  }

  private scenery(x: number, y: number, special: string | undefined, i: number): void {
    const ctx = this.ctx;
    const p = iso(x, y);
    if (special === 'downtown' || special === 'busy') {
      const h = 50 + (i % 3) * 25;
      box(ctx, x - 0.6, y - 0.6, x + 0.6, y + 0.6, h, special === 'busy' ? '#adb5bd' : ['#6c757d', '#8d99ae', '#5c677d'][i % 3]);
      for (let k = 0; k < h / 16 - 1; k++) {
        const w = iso(x + 0.6, y, 12 + k * 14);
        ctx.fillStyle = (i + k) % 3 ? '#ffe066' : '#caf0f8';
        ctx.fillRect(w.x - 8, w.y - 8, 6, 6);
      }
    } else if (special === 'tourists') {
      ellipse(ctx, p.x, p.y, 10, 5, 'rgba(0,0,0,0.15)');
      ctx.strokeStyle = '#8b5e34';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + 6, p.y - 25, p.x + 3, p.y - 45);
      ctx.stroke();
      emoji(ctx, '🌴', p.x + 3, p.y - 50, 26);
    } else if (special === 'night') {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1;
      const top = p.y - 50;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, top);
      ctx.stroke();
      const glow = 0.6 + 0.4 * Math.sin(this.time * 3 + i);
      ellipse(ctx, p.x, top, 14, 14, `rgba(255,158,0,${0.25 * glow})`);
      emoji(ctx, '🏮', p.x, top, 16);
    } else {
      ellipse(ctx, p.x, p.y, 12, 6, 'rgba(0,0,0,0.15)');
      ctx.fillStyle = '#8b5e34';
      ctx.fillRect(p.x - 2, p.y - 18, 4, 18);
      ellipse(ctx, p.x, p.y - 26, 14, 14, i % 2 ? '#2d6a4f' : '#40916c');
      ellipse(ctx, p.x - 5, p.y - 32, 9, 9, i % 2 ? '#40916c' : '#52b788');
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
    // queue lane markings
    for (const [, tiles] of grid.queues) {
      for (const q of tiles) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        diamondPath(ctx, q.x + 0.15, q.y + 0.15, 0.7, 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // stockroom access
    diamond(ctx, STOCKROOM_TILE.x, STOCKROOM_TILE.y, 1, 'rgba(0,0,0,0.06)', 0, 0.1);
    // dirt
    for (const d of g.shop.dirt) {
      const p = iso(d.x + 0.5, d.y + 0.5);
      ellipse(ctx, p.x, p.y, 13, 6, 'rgba(120,85,40,0.55)');
      ellipse(ctx, p.x + 6, p.y + 2, 6, 3, 'rgba(120,85,40,0.45)');
      emoji(ctx, '💧', p.x - 6, p.y - 6, 8);
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
        for (const pt of [iso(T, i), iso(i, T)]) {
          ctx.strokeStyle = '#adb5bd';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x, pt.y - 30 * prog);
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
      emoji(ctx, '🚧', mid.x, mid.y - 18, 18);
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

  // --------------------------------------------------------------- walls

  private drawWalls(S: number, theme: (typeof THEME_MAP)[string]): void {
    const ctx = this.ctx;
    const g = this.game;
    const H = WALL_H;
    const wall = (x0: number, y0: number, x1: number, y1: number, color: string, h = H) => {
      const a = iso(x0, y0, 0);
      const b = iso(x1, y1, 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - h);
      ctx.lineTo(a.x, a.y - h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = theme.wallTop;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h);
      ctx.lineTo(b.x, b.y - h);
      ctx.lineTo(b.x, b.y - h - 5);
      ctx.lineTo(a.x, a.y - h - 5);
      ctx.closePath();
      ctx.fill();
    };
    // Back wall (y = 0), lit
    for (let x = 0; x < S; x++) {
      wall(x, 0, x + 1, 0, x === STOCKROOM_TILE.x ? shade(theme.wall, -0.05) : theme.wall);
      if (x === STOCKROOM_TILE.x) {
        const a = iso(x + 0.2, 0);
        const b = iso(x + 0.8, 0);
        ctx.fillStyle = shade(theme.trim, -0.2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x, b.y - 34);
        ctx.lineTo(a.x, a.y - 34);
        ctx.closePath();
        ctx.fill();
        const m = iso(x + 0.5, 0, 28);
        badge(ctx, t('world.staff'), m.x, m.y, '#2b2d42', '#fff', 6);
      } else if (x % 2 === 0 || x === S - 1) {
        // window
        const a = iso(x + 0.25, 0, 16);
        const b = iso(x + 0.75, 0, 16);
        ctx.fillStyle = '#bde0fe';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x, b.y - 18);
        ctx.lineTo(a.x, a.y - 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Left wall (x = 0), darker, with the entrance
    for (let y = 0; y < S; y++) {
      if (y === DOOR_TILE.y) continue;
      wall(0, y, 0, y + 1, shade(theme.wall, -0.15));
    }
    // Door frame + sliding doors
    const near = g.world.customers.some((c) => Math.abs(c.pos.x - 0) < 1.3 && Math.abs(c.pos.y - (DOOR_TILE.y + 0.5)) < 1);
    this.door += ((near ? 1 : 0) - this.door) * Math.min(1, 0.15 * 60 * (1 / 60));
    const d0 = iso(0, DOOR_TILE.y);
    const d1 = iso(0, DOOR_TILE.y + 1);
    ctx.fillStyle = theme.trim;
    ctx.fillRect(d0.x - 2, d0.y - H, 4, H);
    ctx.fillRect(d1.x - 2, d1.y - H, 4, H);
    wall(0, DOOR_TILE.y, 0, DOOR_TILE.y + 1, theme.trim, 0);
    const top0 = iso(0, DOOR_TILE.y, H);
    const top1 = iso(0, DOOR_TILE.y + 1, H);
    ctx.fillStyle = theme.trim;
    ctx.beginPath();
    ctx.moveTo(top0.x, top0.y);
    ctx.lineTo(top1.x, top1.y);
    ctx.lineTo(top1.x, top1.y + 8);
    ctx.lineTo(top0.x, top0.y + 8);
    ctx.closePath();
    ctx.fill();
    const open = this.door * 0.42;
    for (const [s, e] of [
      [0.05, 0.5 - open],
      [0.5 + open, 0.95],
    ]) {
      if (e <= s) continue;
      const a = iso(0, DOOR_TILE.y + s);
      const b = iso(0, DOOR_TILE.y + e);
      ctx.fillStyle = 'rgba(173,232,244,0.55)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - H + 8);
      ctx.lineTo(a.x, a.y - H + 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // OPEN / CLOSED sign (tap target in the tutorial)
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
    // shop sign on the back wall
    const mid = iso(Math.max(1.6, S * 0.62), 0, H + 18);
    const name = t(`location.${g.shop.locationId}`);
    ctx.font = '900 10px Nunito, system-ui, sans-serif';
    const w = Math.max(80, ctx.measureText(name).width + 34);
    const sign = getSkin(this.activeSkin())?.sign;
    roundRect(ctx, mid.x - w / 2, mid.y - 10, w, 19, 8);
    ctx.save();
    if (sign?.glow) {
      ctx.shadowColor = sign.glow;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = sign?.fill ?? theme.trim;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, mid.x - w / 2, mid.y - 10, w, 19, 8);
    ctx.strokeStyle = sign?.border ?? '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = sign?.text ?? '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${LOCATION_MAP[g.shop.locationId]?.icon ?? ''} ${name}`, mid.x, mid.y);
  }

  signPos() {
    return iso(0, DOOR_TILE.y + 1.5, WALL_H - 12);
  }

  // ------------------------------------------------------------ sortables

  private drawSortables(inside: Customer[]): void {
    const g = this.game;
    type Item = { d: number; draw: () => void };
    const items: Item[] = [];
    const owner = g.shopMgr.ownerCheckoutUid();
    for (const o of g.shop.objects) {
      items.push({ d: o.x + o.y + 1.0, draw: () => this.drawObj(o, owner) });
    }
    for (const c of inside) items.push({ d: c.pos.x + c.pos.y, draw: () => this.drawCustomer(c) });
    for (const e of g.world.employees) items.push({ d: e.pos.x + e.pos.y, draw: () => this.drawEmployee(e) });
    const crate = g.state.events.crate;
    if (crate) {
      items.push({
        d: crate.x + crate.y + 1,
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
      skin: getSkin(this.activeSkin()),
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
    const style: PersonStyle = { ...def.colors, scale: c.type === 'child' ? 0.78 : 1, hat: c.type === 'celebrity' ? 'star' : undefined };
    drawPerson(this.ctx, p.x, p.y, style, {
      moving: c.moving,
      phase: this.time + c.id,
      facing: c.facing,
      reach: c.state === 'take',
      bounce: c.state === 'pay' ? c.stateTime : 0,
      angry: c.angry,
    });
    if (c.type === 'celebrity' && Math.random() < 0.05) this.particles.emit('sparkle', p.x, p.y - 30, 1, { spread: 20, up: 20 });
  }

  private drawEmployee(e: EmployeeRuntime): void {
    const data = this.game.shop.staff.find((s) => s.id === e.id);
    const def = STAFF_MAP[e.type];
    const p = iso(e.pos.x, e.pos.y);
    // An equipped staff outfit wins; otherwise the shop theme may supply a matching uniform.
    const outfit = OUTFITS[this.activeOutfit() ?? ''] ?? getSkin(this.activeSkin())?.uniform;
    const style: PersonStyle = { body: def.color === '#ffffff' ? '#e9ecef' : def.color, head: '#e0ac69', hair: '#4a3728', scale: 1.02, ...STAFF_STYLE[e.type], ...(outfit ? { body: outfit.body, apron: outfit.apron } : {}) };
    drawPerson(this.ctx, p.x, p.y, style, {
      moving: e.moving,
      phase: this.time + e.id * 3,
      facing: e.facing,
      carrying: e.carrying > 0,
      working: e.workAnim > 0,
    });
    if (e.task.kind === 'scrub' && Math.random() < 0.3) this.particles.emit('sparkle', p.x, p.y - 4, 1, { spread: 15, up: 20 });
    if (data && data.level > 1) badge(this.ctx, `${data.level}`, p.x + 9, p.y - 36, '#2b2d42', '#ffd23f', 6);
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
    const objs = [...g.shop.objects].sort((a, b) => b.x + b.y - (a.x + a.y));
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
