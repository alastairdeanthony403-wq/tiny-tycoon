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
import { MAPS, LOCATION_MAP_ID } from '../src/world/maps';
import { generateWorld } from '../src/world/gen';
import { stockroomAnnex } from '../src/render/world';
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
  it('every gameplay location has a world map and a thumbnail, including Countryside', () => {
    for (const l of LOCATIONS) {
      expect(MAPS[LOCATION_MAP_ID[l.id]], l.id).toBeDefined();
      expect(hasAsset(`location.${LOCATION_MAP_ID[l.id]}`), l.id).toBe(true);
    }
    expect(LOCATIONS.some((l) => l.id === 'countryside')).toBe(true);
  });

  it('world terrain uses known terrain and covers every terrain family', () => {
    const used = new Set<string>();
    for (const map of Object.values(MAPS)) for (const id of generateWorld(map).terrain) used.add(id);
    for (const id of used) expect(TERRAIN[id], id).toBeDefined();
    for (const id of ['grass', 'pavement', 'road', 'water', 'sand', 'rock']) expect(used.has(id), id).toBe(true);
  });

  it('the stockroom annex stays behind the shop', () => {
    for (const p of stockroomAnnex()) if (p.kind === 'building') expect(p.y1).toBeLessThanOrEqual(0);
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
    expect(r.state?.monetization.equipped).toMatchObject({ skin: 'cozy_autumn', outfit: 'space' });
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

// ---------------------------------------------------------------- bundled art files

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { sheetDefs, sheetSize, animsFor, frameRect, renderFrame, pickFrame, SHEET, frameCount, SHEET_COLS } from '../src/assets/sheets';
import { imageFits, TEXTURE_CELL } from '../src/assets/images';
import { customerSheetId, staffSheet, LOOKS } from '../src/assets/characters';

const assetDir = (sub: string) => new URL(`../src/assets/${sub}/`, import.meta.url);
/** Width/height from a PNG's IHDR chunk. */
function pngSize(file: URL): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const pngs = (sub: string) => (existsSync(assetDir(sub)) ? readdirSync(assetDir(sub)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : []);

describe('bundled art files', () => {
  it('every character look has a sprite sheet file of the exact layout size', () => {
    const defs = sheetDefs();
    expect(defs.length).toBe(6 * 3 * LOOKS + 5 * LOOKS);
    for (const d of defs) {
      const f = new URL(`${d.id}.png`, assetDir('sheets'));
      expect(existsSync(f), d.id).toBe(true);
      expect(pngSize(f), d.id).toEqual(sheetSize(d.kind));
    }
    expect(pngs('sheets').sort()).toEqual(defs.map((d) => d.id).sort());
  });

  it('every frame of every sheet fits its cell (nothing is clipped)', () => {
    const tol = 0.5;
    for (const d of sheetDefs()) {
      animsFor(d.kind).forEach((a, ai) => {
        for (const front of [true, false])
          for (let f = 0; f < a.frames; f++) {
            const { ctx, pts } = recordingContext();
            renderFrame(ctx, d, ai, front, f);
            for (const [x, y] of pts) {
              expect(x >= -tol && x <= SHEET.w + tol && y >= -tol && y <= SHEET.h + tol, `${d.id} ${a.name} ${front} ${f}: ${x},${y}`).toBe(true);
            }
          }
      });
    }
  });

  it('sheet frames tile the file without overlap', () => {
    for (const kind of ['customer', 'staff'] as const) {
      const seen = new Set<string>();
      const size = sheetSize(kind);
      animsFor(kind).forEach((a, ai) => {
        for (const front of [true, false])
          for (let f = 0; f < a.frames; f++) {
            const r = frameRect(kind, ai, front, f);
            expect(r.x + r.w).toBeLessThanOrEqual(size.w);
            expect(r.y + r.h).toBeLessThanOrEqual(size.h);
            const k = `${r.x},${r.y}`;
            expect(seen.has(k)).toBe(false);
            seen.add(k);
          }
      });
      expect(seen.size).toBe(frameCount(kind));
      expect(size.w).toBe(SHEET_COLS * SHEET.w * SHEET.scale);
    }
  });

  it('every live customer and standard-uniform staff member maps to an existing sheet and frame', () => {
    const ids = new Set(sheetDefs().map((d) => d.id));
    for (const c of CUSTOMER_TYPES) {
      for (let id = 1; id < 60; id++) {
        const a = customerAppearance(c.id, id);
        if (c.id === 'celebrity') expect(a.sheet).toBeNull();
        else expect(ids.has(a.sheet!), `${c.id} ${id}`).toBe(true);
      }
    }
    for (const s of STAFF) {
      expect(ids.has(staffSheet(s.id, 3, null)!), s.id).toBe(true);
      expect(staffSheet(s.id, 3, 'space')).toBeNull();
    }
    expect(ids.has(customerSheetId('student', 0, 0))).toBe(true);
    for (const st of ['idle', 'walk', 'browse', 'reach', 'queue', 'pay', 'celebrate'] as const) for (const t of [0, 0.13, 1.7, 99]) expect(pickFrame('customer', st, false, t), st).not.toBeNull();
    for (const st of ['idle', 'walk', 'work', 'restock', 'clean'] as const) for (const carry of [false, true]) expect(pickFrame('staff', st, carry, 5.5), st).not.toBeNull();
  });

  it('every billboard/thumbnail asset has a sprite file that fits its box, and no file is orphaned', () => {
    const files = new Set(pngs('images'));
    const ids = new Set(listAssets().map((a) => a.id));
    for (const f of files) expect(ids.has(f), `orphan images/${f}.png`).toBe(true);
    for (const a of listAssets()) {
      expect(files.has(a.id), `missing images/${a.id}.png`).toBe(true);
      const s = pngSize(new URL(`${a.id}.png`, assetDir('images')));
      expect(imageFits(a, s.w, s.h), `${a.id} ${s.w}×${s.h}`).toBe(true);
    }
  });

  it('every terrain type has a texture file', () => {
    expect(pngs('textures').sort()).toEqual(Object.keys(TERRAIN).sort());
    for (const id of Object.keys(TERRAIN)) expect(pngSize(new URL(`${id}.png`, assetDir('textures')))).toEqual({ w: TEXTURE_CELL * 2, h: TEXTURE_CELL * 2 });
  });

  it('the manifest lists exactly the files on disk', () => {
    const m = JSON.parse(readFileSync(new URL('../src/assets/manifest.json', import.meta.url), 'utf8'));
    expect(m.images.map((x: { id: string }) => x.id).sort()).toEqual(pngs('images').sort());
    expect(m.sheets.map((x: { id: string }) => x.id).sort()).toEqual(pngs('sheets').sort());
    expect(m.textures.map((x: { id: string }) => x.id).sort()).toEqual(pngs('textures').sort());
  });
});
