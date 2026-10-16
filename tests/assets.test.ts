import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinAssets } from '../src/assets';
import { listAssets, getAsset, validateAsset, assetDiagnostics, FALLBACK, hasAsset } from '../src/assets/registry';
import { ART } from '../src/assets/spec';
import { productArtIds } from '../src/assets/art/products';
import { PRODUCTS } from '../src/config/products';
import { OBJECTS } from '../src/config/objects';
import { CUSTOMER_TYPES } from '../src/config/customers';
import { STAFF } from '../src/config/staff';
import { LOCATIONS } from '../src/config/locations';
import { PREMIUM_CATALOG } from '../src/monetization/catalog';
import { SHOP_SKINS } from '../src/render/skins';
import { TYPE_ARCHETYPES, ARCHETYPES, STAFF_LOOKS, OUTFITS, customerAppearance, staffAppearance } from '../src/assets/characters';
import { drawCharacter, poseMotion, type PoseState } from '../src/assets/art/characters';
import { TERRAIN } from '../src/assets/terrain';
import { LOCATION_ART, LOCATION_SETS, clearOfShop, seasonalProps, stockroomAnnex } from '../src/assets/locations';
import { terrainGrid, GROUND_MIN, groundMax } from '../src/render/world';
import { EXPANSIONS } from '../src/config/expansions';
import { FURNITURE_FOOTPRINT } from '../src/assets/art/furniture';
import { SaveManager, MemoryStore } from '../src/save/saveManager';
import { newGame, openGame, T0 } from './helpers';

/**
 * A fake 2D context that records every point a drawing touches (through the current transform),
 * so artwork can be checked against its declared box without a browser.
 */
function recordingContext() {
  let m = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const pts: [number, number][] = [];
  const tx = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const add = (x: number, y: number) => pts.push(tx(x, y));
  const circle = (x: number, y: number, rx: number, ry = rx) => {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) add(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
  };
  const mul = (n: number[]) => {
    const [a, b, c, d, e, f] = m;
    m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f];
  };
  const grad = { addColorStop() {} };
  const ctx: any = {
    save: () => stack.push([...m]),
    restore: () => (m = stack.pop() ?? m),
    translate: (x: number, y: number) => mul([1, 0, 0, 1, x, y]),
    scale: (x: number, y: number) => mul([x, 0, 0, y, 0, 0]),
    rotate: (r: number) => mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => mul([a, b, c, d, e, f]),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => (m = [a, b, c, d, e, f]),
    getTransform: () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }),
    beginPath() {},
    closePath() {},
    moveTo: add,
    lineTo: add,
    quadraticCurveTo: (_cx: number, _cy: number, x: number, y: number) => add(x, y),
    bezierCurveTo: (_a: number, _b: number, _c: number, _d: number, x: number, y: number) => add(x, y),
    arcTo: (x1: number, y1: number) => add(x1, y1),
    arc: (x: number, y: number, r: number) => circle(x, y, r),
    ellipse: (x: number, y: number, rx: number, ry: number) => circle(x, y, rx, ry),
    rect: (x: number, y: number, w: number, h: number) => (add(x, y), add(x + w, y + h)),
    roundRect: (x: number, y: number, w: number, h: number) => (add(x, y), add(x + w, y + h)),
    fillRect: (x: number, y: number, w: number, h: number) => (add(x, y), add(x + w, y + h)),
    strokeRect: (x: number, y: number, w: number, h: number) => (add(x, y), add(x + w, y + h)),
    clearRect() {},
    fillText: (_s: string, x: number, y: number) => add(x, y),
    strokeText: (_s: string, x: number, y: number) => add(x, y),
    measureText: (s: string) => ({ width: s.length * 5 }),
    fill() {},
    stroke() {},
    clip() {},
    drawImage() {},
    setLineDash() {},
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  };
  return { ctx: ctx as CanvasRenderingContext2D, pts };
}

beforeAll(() => registerBuiltinAssets());

describe('asset registry', () => {
  it('has unique, valid ids and metadata for every asset', () => {
    const all = listAssets();
    expect(all.length).toBeGreaterThan(120);
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    for (const a of all) expect(validateAsset(a), a.id).toEqual([]);
    expect(assetDiagnostics().invalid).toEqual([]);
  });

  it('covers every art family', () => {
    for (const cat of ['product', 'character', 'staff', 'outfit', 'furniture', 'terrain', 'decoration', 'theme', 'location', 'ui'] as const) {
      expect(listAssets(cat).length, cat).toBeGreaterThan(0);
    }
  });

  it('every procedural drawing stays inside its declared box (plus padding)', () => {
    const tol = ART.padding + 1.5;
    for (const a of [...listAssets(), FALLBACK]) {
      const { ctx, pts } = recordingContext();
      a.draw!(ctx, a);
      expect(pts.length, a.id).toBeGreaterThan(0);
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.ART_BOUNDS) {
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - a.size.w, Math.max(...ys) - a.size.h].map((v) => +v.toFixed(1));
        if (b[0] < -tol || b[1] < -tol || b[2] > tol || b[3] > tol) console.log('BOUNDS', a.id, JSON.stringify(b), JSON.stringify(a.size));
        continue;
      }
      for (const [x, y] of pts) {
        expect(x, `${a.id} x`).toBeGreaterThanOrEqual(-tol);
        expect(x, `${a.id} x`).toBeLessThanOrEqual(a.size.w + tol);
        expect(y, `${a.id} y`).toBeGreaterThanOrEqual(-tol);
        expect(y, `${a.id} y`).toBeLessThanOrEqual(a.size.h + tol);
      }
    }
  });

  it('unknown ids resolve to the fallback and are reported', () => {
    expect(getAsset('product.does_not_exist').id).toBe(FALLBACK.id);
    expect(assetDiagnostics().missing).toContain('product.does_not_exist');
  });

  it('references no files: every asset is procedural (bundled PNGs only override)', () => {
    for (const a of listAssets()) {
      expect(typeof a.draw, a.id).toBe('function');
      expect(a.image ?? '', a.id).not.toMatch(/^https?:/);
    }
  });
});

describe('product art', () => {
  it('every product has its own artwork linked by id', () => {
    const drawn = new Set(productArtIds());
    for (const p of PRODUCTS) {
      const a = getAsset(`product.${p.id}`);
      expect(a.id, p.id).toBe(`product.${p.id}`);
      expect(a.ref).toBe(p.id);
      expect(drawn.has(p.id), `${p.id} uses the generic fallback art`).toBe(true);
    }
  });

  it('includes the 18 requested product families', () => {
    for (const id of ['sandwich', 'coffee', 'soda', 'water', 'crisps', 'candy', 'milk', 'bread', 'eggs', 'toilet_paper', 'laundry', 'soap', 'books', 'toys', 'headphones', 'perfume', 'pet_food', 'flowers']) expect(hasAsset(`product.${id}`), id).toBe(true);
  });
});

describe('characters', () => {
  it('every customer type maps to known archetypes and gets a deterministic look', () => {
    for (const c of CUSTOMER_TYPES) {
      const arch = TYPE_ARCHETYPES[c.id];
      expect(arch, c.id).toBeDefined();
      for (const a of arch) expect(ARCHETYPES[a]).toBeDefined();
      expect(customerAppearance(c.id, 17)).toEqual(customerAppearance(c.id, 17));
    }
  });

  it('a crowd shows all six archetypes', () => {
    const seen = new Set<string>();
    for (let id = 1; id < 400; id++) for (const c of CUSTOMER_TYPES) seen.add(customerAppearance(c.id, id).archetype);
    expect([...seen].sort()).toEqual(['gamer', 'senior', 'shopper', 'student', 'tourist', 'trendy']);
  });

  it('every staff role has its own uniform, and outfits keep role tools', () => {
    for (const s of STAFF) expect(STAFF_LOOKS[s.id], s.id).toBeDefined();
    for (const o of Object.keys(OUTFITS)) {
      expect(staffAppearance('cleaner', 1, o).accessories).toContain('mop');
      expect(staffAppearance('manager', 1, o).accessories).toContain('clipboard');
    }
  });

  it('an unknown outfit falls back to the standard uniform', () => {
    expect(staffAppearance('cashier', 4, 'no_such_outfit')).toEqual(staffAppearance('cashier', 4, null));
  });

  it('every outfit sold in the catalog exists, and Gems-only items never claim real money', () => {
    for (const p of PREMIUM_CATALOG) if (p.grant.kind === 'outfits') for (const o of p.grant.outfits) expect(OUTFITS[o], o).toBeDefined();
    for (const id of ['bundle_outfits_deluxe', 'cosmetic_cozy_autumn', 'cosmetic_ocean_breeze']) {
      const p = PREMIUM_CATALOG.find((x) => x.id === id)!;
      expect(p.realMoney).toBe(false);
      expect(p.devPrice).toBeUndefined();
    }
  });

  it('every animation state draws without throwing', () => {
    const states: PoseState[] = ['idle', 'walk', 'carry', 'browse', 'reach', 'queue', 'pay', 'work', 'restock', 'clean', 'celebrate'];
    const { ctx } = recordingContext();
    for (const state of states) for (const front of [true, false]) {
      expect(() => drawCharacter(ctx, 0, 0, staffAppearance('stocker', 2, null), { state, t: 0.3, front, right: !front, carrying: state === 'carry' })).not.toThrow();
      expect(Number.isFinite(poseMotion({ state, t: 0.3, front, right: true }).bob)).toBe(true);
    }
  });
});

describe('themes are cosmetic only', () => {
  it('every theme has a catalog product, a preview asset and no gameplay fields', () => {
    for (const id of Object.keys(SHOP_SKINS)) {
      expect(PREMIUM_CATALOG.some((p) => p.grant.kind === 'skin' && p.grant.skin === id), id).toBe(true);
      expect(hasAsset(`theme.${id}`), id).toBe(true);
    }
    expect(hasAsset('theme.default')).toBe(true);
    expect(Object.keys(SHOP_SKINS).sort()).toEqual(['cozy_autumn', 'golden_shelves', 'neon_nights', 'ocean_breeze']);
  });

  it('equipping any theme or outfit (and drawing characters) leaves the simulation identical', () => {
    const run = (skin: string | null, outfit: string | null, draw: boolean) => {
      const g = openGame(5, 500);
      g.state.monetization.equipped.skin = skin;
      g.state.monetization.equipped.outfit = outfit;
      const { ctx } = recordingContext();
      for (let s = 0; s < 120; s++) {
        g.runFor(1);
        if (draw) for (const c of g.world.customers) drawCharacter(ctx, 0, 0, customerAppearance(c.type, c.id), { state: 'walk', t: s, front: true, right: true });
      }
      return { money: g.state.player.money, sold: g.state.stats.itemsSold, served: g.state.stats.customersServed, xp: g.state.player.xp };
    };
    const base = run(null, null, false);
    for (const skin of Object.keys(SHOP_SKINS)) expect(run(skin, null, true), skin).toEqual(base);
    for (const outfit of Object.keys(OUTFITS)) expect(run(null, outfit, true), outfit).toEqual(base);
  });
});

describe('terrain and locations', () => {
  it('every gameplay location has an art set, including Countryside', () => {
    for (const l of LOCATIONS) expect(LOCATION_SETS[LOCATION_ART[l.id]], l.id).toBeDefined();
    expect(Object.keys(LOCATION_SETS).sort()).toEqual(['airport', 'beach', 'city', 'countryside', 'night_market', 'town']);
    expect(LOCATIONS.some((l) => l.id === 'countryside')).toBe(true);
  });

  it('terrain grids use known terrain, keep the walkway dry and cover every terrain family', () => {
    const used = new Set<string>();
    for (const set of Object.values(LOCATION_SETS)) {
      for (const S of [3, 7, 12]) {
        const grid = terrainGrid(set, S);
        expect(grid.length).toBe(groundMax(S) - GROUND_MIN);
        for (const row of grid) for (const id of row) {
          expect(TERRAIN[id], `${set.id}: ${id}`).toBeDefined();
          used.add(id);
        }
        // the pavement customers walk on (x ≈ −0.5) is never water
        for (let cy = GROUND_MIN; cy < groundMax(S); cy++) expect(set.terrainAt(-1, cy, S), set.id).not.toBe('water');
      }
    }
    for (const id of ['grass', 'pavement', 'road', 'water', 'sand', 'rock']) expect(used.has(id), id).toBe(true);
  });

  it('scenery never blocks the shop, the walking line or the road', () => {
    for (const set of Object.values(LOCATION_SETS)) {
      for (const S of [3, 5, 7, 9, 12]) {
        const placements = [...set.layout(S), ...seasonalProps(['halloween', 'winter', 'spring', 'summer'], S)];
        for (const p of placements) {
          const pts = p.kind === 'prop' || p.kind === 'plane' ? [[p.x, p.y]] : [[p.x0, p.y0], [p.x1, p.y1]];
          for (const [x, y] of pts) {
            const inShop = x > 0 && x < S && y > 0 && y < S;
            expect(inShop, `${set.id} ${S} ${JSON.stringify(p)}`).toBe(false);
            expect(x > -1.2 && x < 0.2 && y > -3 && y < S + 3, `${set.id} ${S} walkway ${JSON.stringify(p)}`).toBe(false);
            if (set.terrainAt(-3, Math.floor(y), S) === 'road') expect(x > -4 && x < -2.05, `${set.id} ${S} road ${JSON.stringify(p)}`).toBe(false);
          }
        }
      }
    }
    for (const p of stockroomAnnex()) if (p.kind === 'building') expect(p.y1).toBeLessThanOrEqual(0);
    expect(clearOfShop(2, 2, 5)).toBe(false);
    expect(clearOfShop(9, 2, 5)).toBe(true);
  });
});

describe('furniture metadata agrees with placement', () => {
  it('every placeable object has a furniture asset whose footprint matches the tiles it occupies', () => {
    for (const def of OBJECTS) {
      const a = getAsset(`furniture.${def.id}`);
      expect(a.id).toBe(`furniture.${def.id}`);
      expect(a.ref).toBe(def.id);
      expect(a.footprint).toEqual(FURNITURE_FOOTPRINT);
    }
    const g = openGame(3, 1e9);
    g.state.player.level = 50;
    g.shop.stage = EXPANSIONS.length - 1;
    g.shop.size = EXPANSIONS[g.shop.stage].size;
    g.onLayoutChanged();
    let checked = 0;
    for (const def of OBJECTS) {
      if (def.entitlement) continue;
      const spot = g.shopMgr.findSpot(def.id);
      if (!spot || !g.shopMgr.buy(def.id, spot.x, spot.y, spot.dir)) continue;
      const o = g.shop.objects[g.shop.objects.length - 1];
      let tiles = 0;
      for (let y = 0; y < g.shop.size; y++) for (let x = 0; x < g.shop.size; x++) if (g.world.grid.get(x, y)?.occupied === o.uid) tiles++;
      expect(tiles, def.id).toBe(FURNITURE_FOOTPRINT.w * FURNITURE_FOOTPRINT.h);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe('save compatibility', () => {
  it('a save with the new cosmetics round-trips, and unknown/unowned cosmetics are dropped safely', () => {
    const g = newGame(8);
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    g.state.monetization.entitlements.cosmetic_cozy_autumn = { source: 'gems', txId: 't1', test: false, at: T0 };
    g.state.monetization.entitlements.bundle_outfits_deluxe = { source: 'gems', txId: 't2', test: false, at: T0 };
    g.state.monetization.equipped.skin = 'cozy_autumn';
    g.state.monetization.equipped.outfit = 'space';
    expect(sm.save(g.state, T0)).toBe(true);
    const r = sm.load(T0);
    expect(r.state?.monetization.equipped).toEqual({ skin: 'cozy_autumn', outfit: 'space' });
    expect(Object.keys(r.state!.monetization.entitlements).sort()).toEqual(['bundle_outfits_deluxe', 'cosmetic_cozy_autumn']);
  });

  it('a save from before this update (no new products, old location list) still loads', () => {
    const g = newGame(9);
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    sm.save(g.state, T0);
    const r = sm.load(T0);
    expect(r.state).toBeTruthy();
    expect(r.state!.player.currentLocation).toBe('neighborhood');
  });
});
