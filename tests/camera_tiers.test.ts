import { describe, it, expect, beforeEach } from 'vitest';
import { iso, unIso, setView, depth, faces, Camera, view } from '../src/render/iso';
import { CAMERA } from '../src/config/camera';
import { EXPANSIONS } from '../src/config/expansions';
import { SHOP_TIERS, tierOfStage, featuresAtStage } from '../src/config/shopTiers';
import { SaveManager, MemoryStore, validate } from '../src/save/saveManager';
import { createInitialState } from '../src/core/state';
import { Game } from '../src/sim/game';
import { openGame, T0 } from './helpers';

describe('camera projection', () => {
  beforeEach(() => setView(0, 30, 0, 0));

  it('the default view reproduces the original 2:1 isometric projection exactly', () => {
    for (const [x, y, z] of [[0, 0, 0], [3, 1, 0], [2.5, 4.25, 18], [-1, 7, 46]]) {
      const p = iso(x, y, z);
      expect(p.x).toBeCloseTo((x - y) * 32, 9);
      expect(p.y).toBeCloseTo((x + y) * 16 - z, 9);
    }
  });

  it('screen → ground inverse round-trips at any yaw, pitch and pivot', () => {
    for (const [yaw, pitch] of [[0, 30], [37, 25], [180, 55], [-123, 42], [359.5, 20]]) {
      setView(yaw, pitch, 4, 4);
      for (const [x, y] of [[0, 0], [3.3, 1.2], [7, 7]]) {
        const p = iso(x, y);
        const g = unIso(p.x, p.y);
        expect(g.x).toBeCloseTo(x, 9);
        expect(g.y).toBeCloseTo(y, 9);
      }
    }
  });

  it('rotation is a real 360°: 360° gives the same picture as 0°, 180° mirrors depth', () => {
    setView(0, 30, 2, 2);
    const a = iso(3, 1, 10);
    const d0 = depth(3, 1);
    setView(360, 30, 2, 2);
    const b = iso(3, 1, 10);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
    setView(180, 30, 2, 2);
    expect(depth(3, 1)).toBeCloseTo(-d0, 9);
  });

  it('exactly the camera-facing sides of a box are visible, at every angle', () => {
    for (let yaw = -180; yaw <= 180; yaw += 7) {
      setView(yaw, 30, 0, 0);
      const vis = [faces(1, 0), faces(0, 1), faces(-1, 0), faces(0, -1)];
      const n = vis.filter(Boolean).length;
      expect(n === 1 || n === 2).toBe(true);
      expect(vis[0] && vis[2]).toBe(false); // opposite sides never both visible
      expect(vis[1] && vis[3]).toBe(false);
    }
    setView(0, 30, 0, 0);
    expect([faces(1, 0), faces(0, 1), faces(-1, 0), faces(0, -1)]).toEqual([true, true, false, false]);
  });

  it('tilting changes vertical scale and stays within limits', () => {
    setView(0, CAMERA.maxPitch, 0, 0);
    const top = iso(1, 1, 40);
    setView(0, CAMERA.minPitch, 0, 0);
    const low = iso(1, 1, 40);
    expect(view.sinP).toBeLessThan(0.5);
    expect(top.y).not.toBeCloseTo(low.y, 3);
  });
});

describe('camera controller', () => {
  it('rotation wraps seamlessly and reset goes the short way back', () => {
    const c = new Camera();
    c.rotateBy(350);
    c.snap();
    expect(c.yawDeg).toBeCloseTo(350);
    c.rotateBy(20);
    c.snap();
    expect(c.yawDeg).toBeCloseTo(10); // through 360 without a jump in the unbounded value
    expect(c.yaw).toBeCloseTo(370);
    c.resetView();
    expect(c.tyaw).toBe(360); // nearest default angle, not a full reverse spin
  });

  it('tilt, zoom and pan are clamped', () => {
    const c = new Camera();
    c.tiltBy(1000);
    expect(c.tpitch).toBe(CAMERA.maxPitch);
    c.tiltBy(-1000);
    expect(c.tpitch).toBe(CAMERA.minPitch);
    for (let i = 0; i < 50; i++) c.zoomBy(2);
    expect(c.userZoom).toBe(CAMERA.maxZoom);
    for (let i = 0; i < 50; i++) c.zoomBy(0.5);
    expect(c.userZoom).toBe(CAMERA.minZoom);
    setView(0, 30, 0, 0);
    c.panLimit = 4;
    c.zoom = 1;
    c.autoUnlock = false;
    c.pan(-100000, 50000);
    expect(Math.abs(c.panX)).toBeLessThanOrEqual(4);
    expect(Math.abs(c.panY)).toBeLessThanOrEqual(4);
    expect(c.mode).toBe('locked');
    // with auto-unlock (the default) the same drag frees the camera, clamped to the world instead
    c.autoUnlock = true;
    c.panBounds = { x0: -20, y0: -10, x1: 30, y1: 12 };
    c.pan(-100000, 50000);
    expect(c.mode).toBe('free');
    expect(c.panX).toBeGreaterThanOrEqual(-20);
    expect(c.panX).toBeLessThanOrEqual(30);
    expect(c.panY).toBeGreaterThanOrEqual(-10);
    expect(c.panY).toBeLessThanOrEqual(12);
  });

  it('smoothing eases toward targets; reduced motion jumps straight there', () => {
    const c = new Camera();
    c.rotateBy(90);
    c.update(1 / 60);
    expect(c.yaw).toBeGreaterThan(0);
    expect(c.yaw).toBeLessThan(90);
    const r = new Camera();
    r.reduced = true;
    r.rotateBy(90);
    r.update(1 / 60);
    expect(r.yaw).toBe(90);
  });

  it('pose round-trips and bad values are sanitised', () => {
    const c = new Camera();
    c.restore({ yaw: 123, pitch: 999, zoom: 0.01, panX: NaN, panY: 2 });
    // Shop Lock on: a saved pan is ignored, the camera starts on the shop
    expect([c.yawDeg, c.tpitch, c.userZoom, c.panX, c.panY]).toEqual([123, CAMERA.maxPitch, CAMERA.minZoom, 0, 0]);
    // exploring: the saved pan is restored within the world bounds
    c.setMode('free');
    c.panBounds = { x0: -3, y0: -3, x1: 3, y1: 3 };
    c.restore({ yaw: 0, pitch: 30, zoom: 1, panX: NaN, panY: 2 });
    expect([c.panX, c.panY]).toEqual([0, 2]);
    c.restore({ yaw: 0, pitch: 30, zoom: 1, panX: -50, panY: 50 });
    expect([c.panX, c.panY]).toEqual([-3, 3]);
  });
});

describe('shop tiers and physical expansion', () => {
  it('five named tiers group the existing stages; every tier is visibly different', () => {
    expect(SHOP_TIERS.map((t) => t.id)).toEqual(['starter', 'expanded', 'super', 'mega', 'flagship']);
    const sizes = SHOP_TIERS.map((t) => EXPANSIONS[t.firstStage].size);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(5);
    for (let i = 1; i < SHOP_TIERS.length; i++) {
      expect(SHOP_TIERS[i].wallH).toBeGreaterThan(SHOP_TIERS[i - 1].wallH);
      expect(SHOP_TIERS[i].features.length).toBeGreaterThan(0);
      expect(featuresAtStage(SHOP_TIERS[i].firstStage).size).toBeGreaterThan(featuresAtStage(SHOP_TIERS[i - 1].firstStage).size);
    }
    expect(tierOfStage(EXPANSIONS.length - 1).id).toBe('flagship');
  });

  it('an expansion is charged once, grows the real grid and adds usable floor', () => {
    const g = openGame(3, 100_000);
    g.state.player.level = 20;
    const before = { money: g.state.player.money, size: g.shop.size };
    const cost = g.shopMgr.expansionCost()!;
    expect(g.shopMgr.expand()).toBe(true);
    for (let i = 0; i < 5; i++) expect(g.shopMgr.expand()).toBe(false); // rapid taps
    expect(g.state.player.money).toBe(before.money - cost);
    g.runFor(10);
    expect(g.shop.size).toBe(EXPANSIONS[1].size);
    expect(g.world.grid.inBounds(g.shop.size - 1, g.shop.size - 1)).toBe(true);
    // the new corner tile is buildable
    const spot = g.shopMgr.canPlace('plant', g.shop.size - 1, g.shop.size - 1);
    expect(spot.ok).toBe(true);
  });

  it('level, lifetime revenue and cash are all enforced', () => {
    const g = openGame(3, 0);
    g.shop.stage = 3;
    g.shop.size = EXPANSIONS[3].size;
    g.onLayoutChanged();
    g.state.player.level = 5;
    expect(g.shopMgr.canExpand()).toEqual({ ok: false, reason: 'level' });
    g.state.player.level = 20;
    g.state.player.lifetimeRevenue = 14_999;
    expect(g.shopMgr.canExpand()).toEqual({ ok: false, reason: 'revenue' });
    g.state.player.lifetimeRevenue = 15_000;
    expect(g.shopMgr.canExpand()).toEqual({ ok: false, reason: 'money' });
    g.economy.earn(1e6, false);
    expect(g.shopMgr.canExpand().ok).toBe(true);
  });

  it('reaching a new tier raises real limits and fires a tier event', () => {
    const g = openGame(3, 1e7);
    g.state.player.level = 30;
    g.state.player.lifetimeRevenue = 1e7;
    expect(g.shopMgr.maxCountFor('checkout')).toBe(2);
    const tiers: string[] = [];
    g.bus.on('tierReached', (e) => tiers.push(e.tier));
    for (let i = 0; i < 9; i++) {
      expect(g.shopMgr.expand()).toBe(true);
      g.runFor(8);
    }
    expect(tiers).toEqual(['expanded', 'super', 'mega', 'flagship']);
    expect(g.shopMgr.maxCountFor('checkout')).toBe(6);
    expect(g.shopMgr.maxCountFor('plant')).toBeGreaterThan(12 * 0.5);
    const st = g.shopMgr.layoutStats();
    expect(st.area).toBe(144);
    expect(st.staffCap).toBeGreaterThan(g.shopMgr.layoutStats(0).staffCap);
    g.achievements.evaluate();
    for (const id of ['super_shop', 'mega_store', 'flagship']) expect(g.state.progression.achievements[id]?.unlocked).toBe(true);
  });

  it('the checkout cap of a small shop is enforced in canBuy', () => {
    const g = openGame(3, 1e6);
    g.state.player.level = 10;
    g.shop.stage = 1;
    g.shop.size = EXPANSIONS[1].size;
    g.onLayoutChanged();
    expect(g.shopMgr.canBuy('checkout').ok).toBe(true);
    while (g.shopMgr.count('checkout') < 2) g.shop.objects.push({ uid: 900 + g.shop.objects.length, kind: 'checkout', x: 3, y: 3, dir: 1, tier: 0, stock: 0, progress: 0 });
    expect(g.shopMgr.canBuy('checkout')).toMatchObject({ ok: false, reason: 'tier_cap' });
    g.shop.stage = 2; // Expanded Shop allows a third
    expect(g.shopMgr.canBuy('checkout').ok).toBe(true);
  });

  it('the expanded shop and camera view survive save/load; old saves keep their size', () => {
    const g = openGame(3, 1e6);
    g.state.player.level = 20;
    g.shopMgr.expand();
    g.runFor(10);
    g.state.camera = { yaw: 135, pitch: 45, zoom: 1.5, panX: 1, panY: -1 };
    const sm = new SaveManager(new MemoryStore());
    sm.save(g.state, T0);
    const g2 = new Game(sm.load(T0).state, { seed: 3, now: () => T0 });
    expect(g2.shop.size).toBe(g.shop.size);
    expect(g2.shop.stage).toBe(1);
    expect(g2.state.camera).toEqual({ yaw: 135, pitch: 45, zoom: 1.5, panX: 1, panY: -1 });
    // A v3 save at stage 5 keeps its stage (no reset, no free expansion).
    const raw: any = JSON.parse(JSON.stringify(createInitialState(T0, 1)));
    raw.version = 3;
    raw.shops.neighborhood.stage = 5;
    raw.shops.neighborhood.size = EXPANSIONS[5].size;
    delete raw.settings.cameraDrag;
    const st = validate(raw, T0);
    expect(st.shops.neighborhood.stage).toBe(5);
    expect(st.shops.neighborhood.size).toBe(EXPANSIONS[5].size);
    expect(st.settings.cameraDrag).toBe('orbit');
    expect(st.camera).toBeUndefined();
  });
});
