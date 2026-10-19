import { describe, it, expect } from 'vitest';
import { MAPS, LOCATION_MAP_ID, LEGACY_WORLD_TILES, mapFor } from '../src/world/maps';
import { generateWorld, onRoad, validateMap, plotRect, plotOrigin, placementRect, overlaps, terrainAtWorld, artefactPos, PLOT_SIZE } from '../src/world/gen';
import { EXPANSIONS } from '../src/config/expansions';
import { LOCATIONS } from '../src/config/locations';
import { Camera } from '../src/render/iso';
import { CAMERA } from '../src/config/camera';
import { createInitialState } from '../src/core/state';
import { SAVE_VERSION } from '../src/core/types';
import { SaveManager, MemoryStore, migrate, validate } from '../src/save/saveManager';
import { Game } from '../src/sim/game';
import { newGame, T0 } from './helpers';

const maps = Object.values(MAPS);
const MAX_SHOP = Math.max(...EXPANSIONS.map((e) => e.size));

describe('world maps', () => {
  it('every map definition is valid', () => {
    for (const m of maps) expect(validateMap(m), m.id).toEqual([]);
  });

  it('every gameplay location has a map, and the six required environments exist', () => {
    for (const l of LOCATIONS) expect(MAPS[LOCATION_MAP_ID[l.id]], l.id).toBeDefined();
    for (const id of ['town', 'city', 'shopping', 'beach', 'night_market', 'countryside']) expect(MAPS[id as keyof typeof MAPS]).toBeDefined();
    expect(mapFor('nowhere').id).toBe('town');
  });

  it('worlds are far bigger than the old scenery ring around the shop', () => {
    for (const m of maps) {
      expect(m.size.w, m.id).toBeGreaterThan(LEGACY_WORLD_TILES * 2);
      expect(m.size.h, m.id).toBeGreaterThan(LEGACY_WORLD_TILES * 2);
    }
  });

  it('generation is deterministic', () => {
    for (const m of maps) {
      const a = generateWorld(m);
      // bypass the cache with a structurally identical copy
      const b = generateWorld({ ...m });
      expect(b).not.toBe(a);
      expect(b.terrain).toEqual(a.terrain);
      expect(b.placements).toEqual(a.placements);
    }
  });

  it('each map has its own landmark mix (not just a palette swap)', () => {
    const signature = (id: keyof typeof MAPS) => [...new Set(generateWorld(MAPS[id]).placements.map((p) => (p.kind === 'prop' ? p.id : p.kind === 'building' ? `b:${p.style}` : p.kind)))].sort().join();
    const sigs = maps.map((m) => signature(m.id));
    expect(new Set(sigs).size).toBe(maps.length);
  });

  it('required landmark categories exist', () => {
    const has = (id: keyof typeof MAPS, test: (p: ReturnType<typeof generateWorld>['placements'][number]) => boolean) => generateWorld(MAPS[id]).placements.some(test);
    const prop = (name: string) => (p: { kind: string; id?: string }) => p.kind === 'prop' && p.id === `deco.${name}`;
    const building = (style: string) => (p: { kind: string; style?: string }) => p.kind === 'building' && p.style === style;
    // Neighbourhood: park, bus stop, café, playground, noticeboard, fountain, mailboxes, bike racks, homes
    for (const t of [prop('bench'), prop('bus_stop'), building('cafe'), prop('swing_set'), prop('slide'), prop('noticeboard'), prop('fountain'), prop('mailbox'), prop('bike_rack'), building('house'), prop('streetlight')]) expect(has('town', t)).toBe(true);
    // Downtown: offices, plaza, subway, taxis, ad boards, food stalls
    for (const t of [building('office'), building('subway'), prop('subway_sign'), prop('taxi_sign'), prop('ad_board')]) expect(has('city', t)).toBe(true);
    expect(generateWorld(MAPS.city).placements.some((p) => p.kind === 'car' && p.taxi)).toBe(true);
    // Shopping District: storefronts, a plaza, deliveries (vans), construction
    for (const t of [building('storefront'), prop('fountain'), building('frame'), prop('barrier')]) expect(has('shopping', t)).toBe(true);
    expect(generateWorld(MAPS.shopping).placements.some((p) => p.kind === 'car' && p.van)).toBe(true);
    // Waterfront: water, sand, pier, boats; Night Market: stalls and lanterns; Countryside: fences, barn
    expect(generateWorld(MAPS.beach).terrain.includes('water')).toBe(true);
    expect(has('beach', prop('boat'))).toBe(true);
    expect(has('night_market', building('stall'))).toBe(true);
    expect(has('night_market', prop('lantern_post'))).toBe(true);
    expect(has('countryside', (p) => p.kind === 'fence')).toBe(true);
    expect(has('countryside', building('barn'))).toBe(true);
  });

  it('every map is filled (no large empty regions): each 16×16 chunk holds scenery or road', () => {
    for (const m of maps) {
      const w = generateWorld(m);
      for (let cy = 0; cy < w.h; cy += 16)
        for (let cx = 0; cx < w.w; cx += 16) {
          const chunk = { x0: cx, y0: cy, x1: cx + 16, y1: cy + 16 };
          const things = w.placements.filter((p) => overlaps(placementRect(p), chunk)).length;
          // roads and open water (the sea, ponds) are features too
          let road = 0;
          for (let y = cy; y < Math.min(w.h, cy + 16); y++) for (let x = cx; x < Math.min(w.w, cx + 16); x++) if ([m.road, 'water'].includes(terrainAtWorld(w, x, y))) road++;
          expect(things + road, `${m.id} chunk ${cx},${cy}`).toBeGreaterThan(0);
        }
    }
  });
});

describe('shop plots', () => {
  it('plots are reserved: nothing is generated on any plot, and plots never overlap', () => {
    for (const m of maps) {
      const w = generateWorld(m);
      const rects = m.plots.map((p) => plotRect(m, p));
      for (const r of rects) {
        expect(r.x1 - r.x0).toBeGreaterThanOrEqual(MAX_SHOP);
        expect(r.x0).toBeGreaterThanOrEqual(0);
        expect(r.x1).toBeLessThanOrEqual(m.size.w);
        expect(r.y1).toBeLessThanOrEqual(m.size.h);
        for (const p of w.placements) expect(overlaps(placementRect(p), r), `${m.id} ${JSON.stringify(p)}`).toBe(false);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
      expect(PLOT_SIZE.h).toBeGreaterThanOrEqual(MAX_SHOP + 2); // the stockroom annex fits too
    }
  });

  it('every plot keeps the customer street navigable: a road and a clear, dry pavement along the shop front', () => {
    for (const m of maps) {
      const w = generateWorld(m);
      for (const plot of m.plots) {
        const o = plotOrigin(m, plot);
        for (let y = o.y - 3; y < o.y + MAX_SHOP + 3; y++) {
          // customers walk at shop x = −0.5; the road is shop x ∈ [−4, −2)
          const walk = terrainAtWorld(w, o.x - 0.5, y + 0.5);
          expect(['water', 'rock'].includes(walk), `${m.id}/${plot.id} walk ${y}`).toBe(false);
          expect(terrainAtWorld(w, o.x - 3, y + 0.5), `${m.id}/${plot.id} road ${y}`).toBe(m.road);
        }
        const lane = { x0: o.x - 1.2, y0: o.y - 3, x1: o.x + 0.2, y1: o.y + MAX_SHOP + 3 };
        for (const p of w.placements) expect(overlaps(placementRect(p), lane), `${m.id}/${plot.id} lane ${JSON.stringify(p)}`).toBe(false);
      }
    }
  });

  it('new shops start on the map\'s first plot; plots can be chosen only when allowed, and moving keeps the shop', () => {
    const g = newGame();
    expect(g.shop.plotId).toBe('main_street');
    expect(g.locations.canChoosePlot('neighborhood', 'park_side')).toEqual({ ok: false, reason: 'level' });
    expect(g.locations.choosePlot('neighborhood', 'park_side')).toBe(false);
    g.state.player.level = 4;
    g.economy.earn(5000, false);
    const before = JSON.stringify({ ...g.shop, plotId: undefined });
    const money = g.state.player.money;
    let events = 0;
    g.bus.on('plotChanged', () => events++);
    expect(g.locations.choosePlot('neighborhood', 'park_side')).toBe(true);
    expect(g.shop.plotId).toBe('park_side');
    expect(events).toBe(1);
    // the shop itself (size, layout, stock, staff) and the player's money are untouched
    expect(JSON.stringify({ ...g.shop, plotId: undefined })).toBe(before);
    expect(g.state.player.money).toBe(money);
    expect(g.locations.canChoosePlot('neighborhood', 'park_side').reason).toBe('current');
    expect(g.locations.canChoosePlot('neighborhood', 'nope').reason).toBe('unknown');
    expect(g.locations.canChoosePlot('downtown', 'tower_row').reason).toBe('not_owned');
    // not while an expansion is being built
    g.shop.construction = { targetStage: 1, remaining: 5, duration: 5 };
    expect(g.locations.canChoosePlot('neighborhood', 'main_street').reason).toBe('building');
  });

  it('locked maps enforce their unlock rules; switching maps keeps every other shop as it was', () => {
    const g = newGame();
    expect(g.locations.canUnlock('shopping').ok).toBe(false);
    expect(g.locations.unlock('shopping')).toBe(false);
    g.debug.unlockAllLocations();
    const home = JSON.stringify(g.state.shops.neighborhood);
    expect(g.state.shops.shopping.plotId).toBe('retail_avenue');
    expect(g.locations.switchTo('shopping')).toBe(true);
    expect(g.locations.switchTo('neighborhood')).toBe(true);
    expect(JSON.stringify(g.state.shops.neighborhood)).toBe(home);
  });
});

describe('artefacts', () => {
  it('every artefact has a stable unique id, a registered visual, sits on its map and outside every plot', () => {
    const ids = maps.flatMap((m) => m.artefacts.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of maps) {
      expect(m.artefacts.length).toBeGreaterThanOrEqual(3);
      for (const a of m.artefacts) {
        const p = artefactPos(m, a);
        expect(p.x > 0 && p.y > 0 && p.x < m.size.w && p.y < m.size.h).toBe(true);
        for (const plot of m.plots) {
          const r = plotRect(m, plot);
          expect(p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1, `${a.id} in ${plot.id}`).toBe(false);
        }
        const w = generateWorld(m);
        expect(['water', 'rock'].includes(terrainAtWorld(w, p.x, p.y)) || onRoad(m, p.x, p.y), a.id).toBe(false);
        // never hidden under (or squeezed against) a building or prop
        for (const q of w.placements) expect(overlaps(placementRect(q), { x0: p.x - 0.5, y0: p.y - 0.5, x1: p.x + 0.5, y1: p.y + 0.5 }), `${a.id} ${JSON.stringify(q)}`).toBe(false);
        // modest rewards that supplement, not replace, progression (cash scaled to the map's stage of the game)
        const unlock = LOCATIONS.find((l) => LOCATION_MAP_ID[l.id] === m.id)?.unlockCost ?? 0;
        expect(a.reward.gems ?? 0, a.id).toBeLessThanOrEqual(15);
        expect(a.reward.cash ?? 0, a.id).toBeLessThanOrEqual(Math.max(1000, unlock * 0.02));
      }
    }
  });

  it('discovery pays once through the central systems and fails safely', () => {
    const g = newGame();
    const gems0 = g.monetization.gems;
    const r = g.exploration.discover('town_cart');
    expect(r).toEqual({ id: 'town_cart', gems: 10, cash: 0 });
    expect(g.monetization.gems).toBe(gems0 + 10);
    expect(g.state.monetization.ledger.some((e) => e.source.includes('artefact:town_cart'))).toBe(true);
    expect(g.exploration.discover('town_cart')).toBeNull();
    expect(g.monetization.gems).toBe(gems0 + 10);
    // cash goes through the economy
    const m0 = g.state.player.money;
    expect(g.exploration.discover('town_parcel')?.cash).toBe(250);
    expect(g.state.player.money).toBe(m0 + 250);
    // unknown ids and artefacts of other maps
    expect(g.exploration.discover('nope')).toBeNull();
    expect(g.exploration.discover('city_statue')).toBeNull();
    expect(g.state.exploration.found).toEqual(['town_cart', 'town_parcel']);
  });

  it('a tap near an artefact finds it (in shop coordinates, whatever the plot)', () => {
    const g = newGame();
    const [first] = g.exploration.positions();
    expect(g.exploration.near(first.x + 0.3, first.y - 0.2)?.id).toBe(first.def.id);
    expect(g.exploration.near(first.x + 5, first.y)).toBeNull();
    g.state.player.level = 10;
    g.locations.choosePlot('neighborhood', 'quiet_corner');
    const moved = g.exploration.positions().find((p) => p.def.id === first.def.id)!;
    expect(moved.x).not.toBe(first.x);
  });

  it('discoveries persist and are not paid again after a reload', () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    const g = newGame();
    g.exploration.discover('town_gnome');
    const gems = g.monetization.gems;
    saves.save(g.state, T0);
    const loaded = saves.load(T0).state;
    expect(loaded.exploration.found).toEqual(['town_gnome']);
    const g2 = new Game(loaded, { seed: 1, now: () => T0 });
    expect(g2.exploration.discover('town_gnome')).toBeNull();
    expect(g2.monetization.gems).toBe(gems);
    // even if the found list were lost, the Gem ledger key stops a second payout
    g2.state.exploration.found = [];
    expect(g2.exploration.discover('town_gnome')?.gems).toBe(0);
  });

  it('finding artefacts counts toward the explorer achievements', () => {
    const g = newGame();
    g.exploration.discover('town_sign');
    g.achievements.tick(1);
    expect(g.state.progression.achievements.curious?.unlocked).toBe(true);
  });
});

describe('save migration', () => {
  it('a v4 save gains a plot, Shop Lock and an empty discovery list without losing progress', () => {
    const old: any = createInitialState(T0, 3);
    old.version = 4;
    old.player.level = 9;
    old.player.money = 12345;
    old.shops.neighborhood.stage = 3;
    old.shops.neighborhood.size = EXPANSIONS[3].size;
    delete old.shops.neighborhood.plotId;
    delete old.settings.cameraLock;
    delete old.settings.cameraAutoUnlock;
    delete old.exploration;
    const s = validate(migrate(old), T0);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.shops.neighborhood.plotId).toBe('main_street');
    expect(s.shops.neighborhood.stage).toBe(3);
    expect(s.player.level).toBe(9);
    expect(s.player.money).toBe(12345);
    expect(s.settings.cameraLock).toBe(true);
    expect(s.settings.cameraAutoUnlock).toBe(true);
    expect(s.exploration.found).toEqual([]);
  });

  it('invalid plot ids and unknown artefacts fall back safely; the shop is never reset', () => {
    const st: any = createInitialState(T0, 3);
    st.shops.neighborhood.plotId = 'demolished_plot';
    st.shops.neighborhood.objects.push({ uid: 99, kind: 'shelf', x: 1, y: 2, dir: 1, tier: 0, productId: 'crisps', stock: 3, progress: 0 });
    st.exploration = { found: ['town_gnome', 'bogus', 'town_gnome', 42] };
    const s = validate(st, T0);
    expect(s.shops.neighborhood.plotId).toBe('main_street');
    expect(s.shops.neighborhood.objects.some((o) => o.uid === 99)).toBe(true);
    expect(s.exploration.found).toEqual(['town_gnome']);
  });
});

describe('camera lock', () => {
  const cam = () => {
    const c = new Camera();
    c.panLimit = 4;
    c.panBounds = { x0: -30, y0: -30, x1: 30, y1: 30 };
    c.zoom = 1;
    return c;
  };

  it('starts locked; small pans stay locked, a deliberate drag past the limit enters Free Explore', () => {
    const c = cam();
    const modes: string[] = [];
    c.onMode = (m) => modes.push(m);
    expect(c.mode).toBe('locked');
    c.beginGesture();
    c.pan(-20, 0);
    expect(c.mode).toBe('locked');
    c.pan(-2000, 0);
    expect(c.mode).toBe('free');
    expect(c.locked).toBe(false);
    expect(modes).toEqual(['free']);
    // free: the camera can roam far beyond the shop and stays where it was put
    c.pan(-5000, -3000);
    const far = { x: c.panX, y: c.panY };
    expect(Math.hypot(far.x, far.y)).toBeGreaterThan(10);
    c.update(1);
    expect({ x: c.panX, y: c.panY }).toEqual(far);
  });

  it('auto-unlock can be turned off (the lock then just limits panning)', () => {
    const c = cam();
    c.autoUnlock = false;
    c.pan(-100000, 0);
    expect(c.mode).toBe('locked');
    expect(Math.abs(c.panX)).toBeLessThanOrEqual(4);
  });

  it('Return to Shop works from anywhere: clears pan and zoom, glides back, then locks', () => {
    const c = cam();
    c.setMode('free');
    c.pan(-8000, 4000);
    c.zoomBy(0.3);
    c.tx = 4000;
    c.ty = -900;
    c.snap();
    c.returnToShop();
    expect([c.panX, c.panY, c.userZoom]).toEqual([0, 0, 1]);
    expect(c.mode).toBe('returning');
    expect(c.locked).toBe(true); // the toggle shows "on" straight away
    c.tx = 0;
    c.ty = 0;
    c.tzoom = 1;
    for (let i = 0; i < 60 && c.mode === 'returning'; i++) c.update(1 / 30);
    expect(c.mode).toBe('locked');
    expect(Math.hypot(c.x, c.y)).toBeLessThan(2);
  });

  it('an interrupted return leaves a valid, locked camera', () => {
    const c = cam();
    c.setMode('free');
    c.pan(-3000, 0);
    c.returnToShop();
    c.pan(30, 0); // player grabs the view mid-glide
    expect(c.mode).toBe('locked');
    expect(Math.abs(c.panX)).toBeLessThanOrEqual(4);
    expect(Number.isFinite(c.x) && Number.isFinite(c.zoom)).toBe(true);
  });

  it('toggle reflects the real state; locking clamps zoom and pan back into lock limits', () => {
    const c = cam();
    c.setLocked(false);
    expect(c.mode).toBe('free');
    c.zoomBy(0.1);
    expect(c.userZoom).toBe(CAMERA.freeMinZoom);
    c.setLocked(true);
    expect(c.locked).toBe(true);
    expect(c.userZoom).toBe(1);
    c.zoomBy(0.1);
    expect(c.userZoom).toBe(CAMERA.minZoom);
  });

  it('reduced motion returns instantly; rotation and zoom keep working while locked', () => {
    const c = cam();
    c.reduced = true;
    c.setMode('free');
    c.returnToShop();
    expect(c.mode).toBe('locked');
    c.rotateBy(90);
    c.zoomBy(1.5);
    expect(c.tyaw).toBe(CAMERA.defaultYaw + 90);
    expect(c.userZoom).toBe(1.5);
    expect(c.mode).toBe('locked');
  });
});
