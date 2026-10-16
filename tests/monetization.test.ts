import { describe, it, expect, beforeEach } from 'vitest';
import { openGame, T0 } from './helpers';
import { Game } from '../src/sim/game';
import { SimulatedPurchaseAdapter } from '../src/monetization/simulatedAdapter';
import { SimulatedVerifier, RemoteVerifier } from '../src/monetization/verifier';
import { NativeBridgeAdapter } from '../src/monetization/nativeBridgeAdapter';
import { PurchaseController } from '../src/monetization/controller';
import { PREMIUM_CATALOG, PREMIUM_MAP } from '../src/monetization/catalog';
import { getSkin } from '../src/render/skins';
import { SaveManager, MemoryStore, migrate, validate } from '../src/save/saveManager';
import { createInitialState } from '../src/core/state';

const flush = () => new Promise((r) => setTimeout(r, 0));

function unlockThemes(g: Game): void {
  g.state.player.level = 15;
  g.state.player.lifetimeRevenue = 25000;
}

function setup() {
  const g = openGame(7, 1000);
  const adapter = new SimulatedPurchaseAdapter();
  const ctl = new PurchaseController(() => g, adapter, new SimulatedVerifier());
  unlockThemes(g);
  return { g, adapter, ctl };
}

describe('catalog', () => {
  it('has the required products with stable unique ids and store ids', () => {
    const ids = PREMIUM_CATALOG.map((p) => p.id).sort();
    expect(ids).toEqual(['automation_basic', 'bundle_outfits_deluxe', 'bundle_seasonal_decorations', 'bundle_staff_outfits', 'cosmetic_cozy_autumn', 'cosmetic_golden_shelves', 'cosmetic_neon_nights', 'cosmetic_ocean_breeze', 'gems_large', 'gems_medium', 'gems_small', 'layout_slots_plus']);
    const storeIds = PREMIUM_CATALOG.flatMap((p) => [p.storeIds.ios, p.storeIds.android]);
    expect(new Set(PREMIUM_CATALOG.map((p) => p.storeIds.ios)).size).toBe(PREMIUM_CATALOG.length);
    expect(storeIds.every((s) => /^com\.tinytycoon\.[a-z_]+$/.test(s))).toBe(true);
  });

  it('gem packs are consumable, everything else is permanent and reachable with Gems', () => {
    for (const p of PREMIUM_CATALOG) {
      if (p.category === 'gems') expect([p.type, p.ownership, p.gemPrice]).toEqual(['consumable', 'stackable', undefined]);
      else expect([p.type, p.ownership, typeof p.gemPrice]).toEqual(['non_consumable', 'once', 'number']);
    }
  });
});

describe('Gems (earned) and atomic spending', () => {
  it('claiming achievements earns Gems recorded as earned', () => {
    const g = openGame(2);
    g.runFor(60);
    g.achievements.evaluate();
    g.achievements.claim('first_sale');
    expect(g.state.monetization.gemsEarned).toBeGreaterThan(0);
    expect(g.state.monetization.gemsPurchased).toBe(0);
    expect(g.state.monetization.ledger.some((l) => l.kind === 'earn' && l.source === 'achievement:first_sale')).toBe(true);
  });

  it('buying with earned Gems deducts once, grants once, and auto-equips', () => {
    const g = openGame(1);
    unlockThemes(g);
    g.monetization.earnGems(500, 'test');
    expect(g.monetization.buyWithGems('cosmetic_neon_nights')).toEqual({ ok: true });
    expect(g.monetization.gems).toBe(350);
    expect(g.monetization.owns('cosmetic_neon_nights')).toBe(true);
    expect(g.state.monetization.equipped.skin).toBe('neon_nights');
    // Repeated taps: second purchase refused as owned, balance unchanged.
    for (let i = 0; i < 5; i++) expect(g.monetization.buyWithGems('cosmetic_neon_nights')).toEqual({ ok: false, reason: 'owned' });
    expect(g.monetization.gems).toBe(350);
  });

  it('insufficient Gems is rejected without side effects', () => {
    const g = openGame(1);
    g.monetization.earnGems(10, 'test');
    const before = JSON.stringify(g.state.monetization);
    expect(g.monetization.buyWithGems('automation_basic')).toEqual({ ok: false, reason: 'insufficient' });
    expect(JSON.stringify(g.state.monetization)).toBe(before);
  });

  it('gem packs cannot be bought with Gems; invalid amounts are ignored', () => {
    const g = openGame(1);
    g.monetization.earnGems(5000, 'test');
    expect(g.monetization.buyWithGems('gems_large')).toEqual({ ok: false, reason: 'not_for_gems' });
    expect(g.monetization.earnGems(-5, 'x')).toBe(0);
    expect(g.monetization.earnGems(1.5, 'x')).toBe(0);
    expect(g.monetization.earnGems(Number.MAX_SAFE_INTEGER + 2, 'x')).toBe(0);
    expect(g.monetization.gems).toBe(5000);
  });

  it('spends earned Gems before purchased ones and never goes negative', () => {
    const g = openGame(1);
    g.monetization.earnGems(100, 'test');
    g.monetization.grantVerifiedTransaction('T1', 'gems_small', true); // +100 purchased
    g.monetization.buyWithGems('bundle_staff_outfits'); // 200
    expect(g.state.monetization.gemsEarned).toBe(0);
    expect(g.state.monetization.gemsPurchased).toBe(0);
    unlockThemes(g);
    expect(g.monetization.buyWithGems('cosmetic_golden_shelves')).toEqual({ ok: false, reason: 'insufficient' });
  });
});

describe('purchase state machine (simulated store, test-only)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(async () => {
    s = setup();
    await s.ctl.init();
  });

  it('loads localized prices from the store adapter, marked as test mode', () => {
    expect(s.ctl.status).toBe('ready');
    expect(s.ctl.testMode).toBe(true);
    expect(s.ctl.priceOf('gems_small')?.displayPrice).toBe('£0.99');
  });

  it('successful verified transaction grants Gems once and finishes it', async () => {
    const r = await s.ctl.purchase('gems_medium');
    expect(r).toEqual({ status: 'verified', productId: 'gems_medium', test: true });
    expect(s.g.state.monetization.gemsPurchased).toBe(550);
    expect(s.adapter.finished.length).toBe(1);
    const entry = s.g.state.monetization.ledger.slice(-1)[0];
    expect(entry).toMatchObject({ kind: 'purchase', gems: 550, test: true, source: 'iap_simulated' });
  });

  it('consumables can be bought again; permanent items cannot', async () => {
    await s.ctl.purchase('gems_small');
    await s.ctl.purchase('gems_small');
    expect(s.g.state.monetization.gemsPurchased).toBe(200);
    await s.ctl.purchase('bundle_staff_outfits');
    expect(await s.ctl.purchase('bundle_staff_outfits')).toEqual({ status: 'owned', productId: 'bundle_staff_outfits' });
  });

  it('rapid repeated taps start only one transaction', async () => {
    s.adapter.latency = 5;
    const results = await Promise.all([s.ctl.purchase('gems_small'), s.ctl.purchase('gems_small'), s.ctl.purchase('gems_small')]);
    expect(results.filter((r) => r.status === 'verified').length).toBe(1);
    expect(results.filter((r) => r.status === 'busy').length).toBe(2);
    expect(s.g.state.monetization.gemsPurchased).toBe(100);
  });

  it('duplicate transaction notifications grant only once', async () => {
    s.adapter.scenario = 'duplicate';
    await s.ctl.purchase('gems_large');
    await flush();
    await flush();
    expect(s.g.state.monetization.gemsPurchased).toBe(1200);
  });

  it('cancelled purchase changes nothing', async () => {
    s.adapter.scenario = 'cancel';
    const before = JSON.stringify(s.g.state.monetization);
    expect(await s.ctl.purchase('cosmetic_neon_nights')).toEqual({ status: 'cancelled', productId: 'cosmetic_neon_nights' });
    expect(JSON.stringify(s.g.state.monetization)).toBe(before);
  });

  it('failed purchase changes nothing and the store stays usable', async () => {
    s.adapter.scenario = 'fail';
    expect((await s.ctl.purchase('gems_small')).status).toBe('failed');
    expect(s.g.monetization.gems).toBe(0);
    s.adapter.scenario = 'success';
    expect((await s.ctl.purchase('gems_small')).status).toBe('verified');
  });

  it('pending purchase grants nothing until approved, then grants once', async () => {
    s.adapter.scenario = 'pending';
    expect((await s.ctl.purchase('cosmetic_neon_nights')).status).toBe('pending');
    expect(s.g.monetization.owns('cosmetic_neon_nights')).toBe(false);
    expect(s.g.state.monetization.pending.length).toBe(1);
    s.adapter.resolvePending(true);
    await flush();
    expect(s.g.monetization.owns('cosmetic_neon_nights')).toBe(true);
    expect(s.g.state.monetization.pending.length).toBe(0);
  });

  it('declined pending purchase grants nothing', async () => {
    s.adapter.scenario = 'pending';
    await s.ctl.purchase('gems_small');
    s.adapter.resolvePending(false);
    await flush();
    expect(s.g.monetization.gems).toBe(0);
  });

  it('interrupted purchase is delivered later through the update listener', async () => {
    s.adapter.scenario = 'interrupted';
    expect((await s.ctl.purchase('gems_small')).status).toBe('failed');
    expect(s.g.monetization.gems).toBe(0);
    s.adapter.resolvePending(true); // app relaunch: store re-delivers the paid transaction
    await flush();
    expect(s.g.state.monetization.gemsPurchased).toBe(100);
  });

  it('a transaction that fails verification is never granted or finished', async () => {
    s.adapter.scenario = 'verify_fail';
    const r = await s.ctl.purchase('gems_large');
    expect(r.status).toBe('unverified');
    expect(s.g.monetization.gems).toBe(0);
    expect(s.adapter.finished.length).toBe(0);
    expect(s.g.state.monetization.pending[0]?.state).toBe('purchased');
  });

  it('restore re-grants non-consumables on a fresh install, idempotently', async () => {
    await s.ctl.purchase('cosmetic_neon_nights');
    await s.ctl.purchase('gems_small');
    // New device: fresh save, same store account.
    const g2 = openGame(9);
    const ctl2 = new PurchaseController(() => g2, s.adapter, new SimulatedVerifier());
    await ctl2.init();
    expect((await ctl2.restore()).restored).toBe(1);
    expect(g2.monetization.owns('cosmetic_neon_nights')).toBe(true);
    expect(g2.monetization.gems).toBe(0); // consumables are not restorable
    expect((await ctl2.restore()).restored).toBe(0);
  });

  it('refund revokes the entitlement and unequips it; refunded Gems are clawed back (not below zero)', async () => {
    await s.ctl.purchase('cosmetic_neon_nights');
    const ent = s.g.state.monetization.entitlements.cosmetic_neon_nights;
    s.adapter.refund({ transactionId: ent.txId, storeId: 'com.tinytycoon.cosmetic_neon_nights' });
    await flush();
    expect(s.g.monetization.owns('cosmetic_neon_nights')).toBe(false);
    expect(s.g.state.monetization.equipped.skin).toBeNull();
    await s.ctl.purchase('gems_small');
    const gemTx = s.g.state.monetization.ledger.filter((l) => l.kind === "purchase").slice(-1)[0].txId!;
    s.g.monetization.earnGems(400, 'x');
    unlockThemes(s.g);
    expect(s.g.monetization.buyWithGems('cosmetic_golden_shelves')).toEqual({ ok: true }); // spends 200: earned first
    s.adapter.refund({ transactionId: gemTx, storeId: 'com.tinytycoon.gems_small' });
    await flush();
    expect(s.g.state.monetization.gemsPurchased).toBe(0);
    expect(s.g.monetization.gems).toBeGreaterThanOrEqual(0);
    expect(s.g.monetization.owns('cosmetic_golden_shelves')).toBe(true); // gem-bought items stay
  });

  it('offline store reports offline and refuses purchases', async () => {
    const t = setup();
    t.adapter.online = false;
    await t.ctl.init();
    expect(t.ctl.status).toBe('offline');
    expect((await t.ctl.purchase('gems_small')).status).toBe('unavailable');
  });
});

describe('verification boundary', () => {
  it('without a native bridge, the store is unavailable and never sells', async () => {
    const g = openGame(1);
    const ctl = new PurchaseController(() => g, new NativeBridgeAdapter(undefined), new RemoteVerifier(undefined, () => 'p'));
    await ctl.init();
    expect(ctl.status).toBe('unavailable');
    expect((await ctl.purchase('gems_small')).status).toBe('unavailable');
  });

  it('remote verifier refuses when no backend is configured and rejects test transactions', async () => {
    const v = new RemoteVerifier(undefined, () => 'p');
    expect(v.available).toBe(false);
    expect((await v.verify({ transactionId: 'x', storeId: 's', state: 'purchased', receipt: 'r', test: false, at: 0 }, 'gems_small')).ok).toBe(false);
    const v2 = new RemoteVerifier('https://example.invalid/verify', () => 'p', (async () => ({ ok: true, json: async () => ({ verified: true }) })) as unknown as typeof fetch);
    expect((await v2.verify({ transactionId: 'x', storeId: 's', state: 'purchased', receipt: 'r', test: true, at: 0 }, 'gems_small')).ok).toBe(false);
    expect((await v2.verify({ transactionId: 'x', storeId: 's', state: 'purchased', receipt: 'r', test: false, at: 0 }, 'gems_small')).ok).toBe(true);
  });

  it('simulated verifier rejects real (non-test) transactions', async () => {
    const r = await new SimulatedVerifier().verify({ transactionId: 'x', storeId: 's', state: 'purchased', receipt: 'SIMULATED:x:s', test: false, at: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('cosmetics, decor and convenience', () => {
  it('equip requires ownership; outfits and skins switch', () => {
    const g = openGame(1);
    expect(g.monetization.equipSkin('neon_nights')).toBe(false);
    g.monetization.earnGems(1000, 't');
    g.monetization.buyWithGems('bundle_staff_outfits');
    expect(g.state.monetization.equipped.outfit).toBe('smart');
    expect(g.monetization.equipOutfit('diner')).toBe(true);
    expect(g.monetization.equipOutfit(null)).toBe(true);
    expect(g.monetization.equipOutfit('astronaut')).toBe(false);
  });

  it('seasonal decor can only be built when the bundle is owned', () => {
    const g = openGame(1, 1000);
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    expect(g.shopMgr.canBuy('snowman')).toMatchObject({ ok: false, reason: 'not_owned' });
    g.monetization.earnGems(200, 't');
    g.monetization.buyWithGems('bundle_seasonal_decorations');
    expect(g.shopMgr.canBuy('snowman').ok).toBe(true);
    const spot = g.shopMgr.findSpot('snowman')!;
    expect(g.shopMgr.buy('snowman', spot.x, spot.y)).not.toBeNull();
  });

  it('layout slots: 1 free, +3 with the upgrade; layouts restore positions atomically', () => {
    const g = openGame(1, 5000);
    g.state.player.level = 5;
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    expect(g.monetization.layoutSlotCount()).toBe(1);
    expect(g.monetization.saveLayout(1)).toBe(false);
    expect(g.monetization.saveLayout(0)).toBe(true);
    const shelf = g.shopMgr.displays()[0];
    const orig = { x: shelf.x, y: shelf.y };
    const spot = g.shopMgr.findSpot('shelf', shelf.uid)!;
    g.shopMgr.move(shelf.uid, spot.x, spot.y, spot.dir);
    expect(g.monetization.loadLayout(0)).toEqual({ ok: true });
    expect({ x: shelf.x, y: shelf.y }).toEqual(orig);
    g.monetization.earnGems(300, 't');
    g.monetization.buyWithGems('layout_slots_plus');
    expect(g.monetization.layoutSlotCount()).toBe(4);
    expect(g.monetization.saveLayout(3)).toBe(true);
  });

  it('an invalid saved layout is refused and nothing moves', () => {
    const g = openGame(1);
    const before = JSON.stringify(g.shop.objects);
    const co = g.shopMgr.checkouts()[0];
    expect(g.shopMgr.applyLayout([{ uid: co.uid, x: 0, y: 1, dir: 1 }]).ok).toBe(false); // onto the door
    expect(JSON.stringify(g.shop.objects)).toBe(before);
  });

  it('auto-restock only works when owned and enabled, and does not count toward restock goals', () => {
    const g = openGame(1);
    expect(g.monetization.setAutoRestock(true)).toBe(false);
    g.monetization.earnGems(500, 't');
    g.monetization.buyWithGems('automation_basic');
    const shelf = g.shopMgr.displays()[0];
    shelf.stock = 0;
    g.runFor(1);
    expect(shelf.stock).toBe(g.shopMgr.capacity(shelf));
    expect(g.state.stats.manualRestocks).toBe(0);
    g.monetization.setAutoRestock(false);
    shelf.stock = 0;
    g.runFor(7);
    expect(shelf.stock).toBeLessThan(g.shopMgr.capacity(shelf));
  });
});

describe('persistence and migration', () => {
  it('ownership, Gems, equipped items, layouts and entitlements survive save/load', async () => {
    const { g, ctl } = setup();
    await ctl.init();
    g.monetization.earnGems(700, 't');
    g.monetization.buyWithGems('cosmetic_neon_nights');
    await ctl.purchase('gems_small');
    g.monetization.saveLayout(0);
    const sm = new SaveManager(new MemoryStore());
    sm.save(g.state, T0);
    const g2 = new Game(sm.load(T0).state, { seed: 1, now: () => T0 });
    expect(g2.state.monetization).toEqual(g.state.monetization);
    expect(g2.monetization.buyWithGems('cosmetic_neon_nights')).toEqual({ ok: false, reason: 'owned' });
    expect(g2.monetization.grantVerifiedTransaction(g.state.monetization.processedTx[0], 'gems_small', true)).toBe(false);
  });

  it('a v2 save migrates without losing progress', () => {
    const old: any = createInitialState(T0, 1);
    old.version = 2;
    delete old.monetization;
    old.player.money = 1234;
    old.player.level = 7;
    const s = validate(migrate(old), T0);
    expect(s.player.money).toBe(1234);
    expect(s.player.level).toBe(7);
    expect(s.monetization.gemsEarned).toBe(0);
    expect(s.monetization.entitlements).toEqual({});
  });

  it('tampered monetization data is sanitised', () => {
    const raw: any = createInitialState(T0, 1);
    raw.monetization.gemsEarned = -50;
    raw.monetization.gemsPurchased = 1e30;
    raw.monetization.entitlements = { not_a_product: { txId: 'x' }, cosmetic_neon_nights: { txId: 5 } };
    const s = validate(raw, T0);
    expect(s.monetization.gemsEarned).toBe(0);
    expect(s.monetization.gemsPurchased).toBe(0);
    expect(s.monetization.entitlements).toEqual({});
    expect(PREMIUM_MAP.cosmetic_neon_nights).toBeDefined();
  });
});

describe('Golden Shelves cosmetic (Gems only, progression-gated)', () => {
  const ID = 'cosmetic_golden_shelves' as const;

  it('is a 200-Gem, level 15 / £25,000 permanent cosmetic with no real-money SKU', () => {
    const p = PREMIUM_MAP[ID];
    expect(p).toMatchObject({ gemPrice: 200, realMoney: false, ownership: 'once', type: 'non_consumable', category: 'cosmetic' });
    expect(p.requires).toEqual({ level: 15, lifetimeRevenue: 25000 });
    expect(p.grant).toEqual({ kind: 'skin', skin: 'golden_shelves' });
    const skin = getSkin('golden_shelves')!;
    expect(skin.effect).toBe('golden');
    expect(skin.shelf && skin.checkout && skin.sign && skin.uniform && skin.displayTrim).toBeTruthy();
  });

  it('stays locked below either requirement and unlocks when both are met', () => {
    const g = openGame(1);
    g.monetization.earnGems(1000, 't');
    g.state.player.level = 14;
    g.state.player.lifetimeRevenue = 1_000_000;
    expect(g.monetization.requirements(ID)).toMatchObject({ met: false, level: { need: 15, have: 14, met: false }, lifetimeRevenue: { met: true } });
    expect(g.monetization.buyWithGems(ID)).toEqual({ ok: false, reason: 'locked' });
    g.state.player.level = 40;
    g.state.player.lifetimeRevenue = 24_999;
    expect(g.monetization.requirements(ID)).toMatchObject({ met: false, level: { met: true }, lifetimeRevenue: { need: 25000, have: 24999, met: false } });
    expect(g.monetization.buyWithGems(ID)).toEqual({ ok: false, reason: 'locked' });
    expect(g.monetization.gems).toBe(1000);
    expect(g.monetization.owns(ID)).toBe(false);
    unlockThemes(g);
    expect(g.monetization.requirements(ID).met).toBe(true);
    expect(g.monetization.buyWithGems(ID)).toEqual({ ok: true });
  });

  it('deducts exactly 200 Gems once; rapid repeated taps never duplicate', () => {
    const g = openGame(1);
    unlockThemes(g);
    g.monetization.earnGems(450, 't');
    const results = Array.from({ length: 10 }, () => g.monetization.buyWithGems(ID));
    expect(results[0]).toEqual({ ok: true });
    expect(results.slice(1).every((r) => !r.ok && r.reason === 'owned')).toBe(true);
    expect(g.monetization.gems).toBe(250);
    expect(g.state.monetization.ledger.filter((l) => l.kind === 'spend' && l.productId === ID)).toHaveLength(1);
    expect(g.state.monetization.equipped.skin).toBe('golden_shelves');
  });

  it('insufficient Gems leaves the balance and ownership unchanged', () => {
    const g = openGame(1);
    unlockThemes(g);
    g.monetization.earnGems(199, 't');
    const before = JSON.stringify(g.state.monetization);
    expect(g.monetization.buyWithGems(ID)).toEqual({ ok: false, reason: 'insufficient' });
    expect(JSON.stringify(g.state.monetization)).toBe(before);
    expect(g.monetization.gems).toBe(199);
  });

  it('cannot be bought with real money through the store controller', async () => {
    const s = setup();
    await s.ctl.init();
    unlockThemes(s.g);
    expect((await s.ctl.purchase(ID)).status).toBe('unavailable');
    expect(s.g.monetization.owns(ID)).toBe(false);
  });

  it('equip / unequip and switching with Neon Nights', () => {
    const g = openGame(1);
    unlockThemes(g);
    expect(g.monetization.equipSkin('golden_shelves')).toBe(false); // not owned
    g.monetization.earnGems(1000, 't');
    g.monetization.buyWithGems('cosmetic_neon_nights');
    expect(g.state.monetization.equipped.skin).toBe('neon_nights');
    g.monetization.buyWithGems(ID); // a skin is already equipped: buying does not override it
    expect(g.state.monetization.equipped.skin).toBe('neon_nights');
    expect(g.monetization.equipSkin('golden_shelves')).toBe(true);
    expect(getSkin(g.state.monetization.equipped.skin)!.palette.wall).toBe('#3b2412');
    expect(g.monetization.equipSkin('neon_nights')).toBe(true);
    expect(getSkin(g.state.monetization.equipped.skin)!.effect).toBe('neon');
    expect(g.monetization.equipSkin(null)).toBe(true);
    expect(getSkin(g.state.monetization.equipped.skin)).toBeNull(); // default theme restored
    expect(g.monetization.owns(ID) && g.monetization.owns('cosmetic_neon_nights')).toBe(true);
  });

  it('ownership and equipped theme survive a save/reload', () => {
    const g = openGame(1);
    unlockThemes(g);
    g.monetization.earnGems(300, 't');
    g.monetization.buyWithGems(ID);
    const sm = new SaveManager(new MemoryStore());
    sm.save(g.state, T0);
    const g2 = new Game(sm.load(T0).state, { seed: 1, now: () => T0 });
    expect(g2.monetization.owns(ID)).toBe(true);
    expect(g2.state.monetization.equipped.skin).toBe('golden_shelves');
    expect(g2.monetization.gems).toBe(100);
    expect(g2.monetization.buyWithGems(ID)).toEqual({ ok: false, reason: 'owned' });
  });

  it('saves using the earlier test id skin_golden_shelves are mapped to the new id', () => {
    const raw: any = JSON.parse(JSON.stringify(createInitialState(T0, 1)));
    raw.monetization.entitlements = { skin_golden_shelves: { source: 'gems', txId: 'gems:1', test: false, at: T0 } };
    raw.monetization.equipped.skin = 'golden_shelves';
    const st = validate(raw, T0);
    expect(Object.keys(st.monetization.entitlements)).toEqual([ID]);
    expect(st.monetization.equipped.skin).toBe('golden_shelves');
  });

  it('is purely cosmetic: income and customer simulation are identical with it equipped', () => {
    const run = (equip: boolean) => {
      const g = openGame(9, 500);
      unlockThemes(g);
      g.monetization.earnGems(200, 't');
      if (equip) g.monetization.buyWithGems(ID);
      g.runFor(300);
      // Owning a theme may unlock (unclaimed) cosmetic achievements; everything that drives play must match.
      const { monetization, progression, ...rest } = g.state as any;
      const { achievements, ...prog } = progression;
      return JSON.stringify({ rest, prog });
    };
    expect(run(true)).toBe(run(false));
  });
});

describe('Neon Nights cosmetic (progression-gated)', () => {
  it('costs 150 Gems and needs level 10 and £2,500 lifetime revenue; legacy id migrates', async () => {
    const p = PREMIUM_MAP.cosmetic_neon_nights;
    expect([p.gemPrice, p.requires]).toEqual([150, { level: 10, lifetimeRevenue: 2500 }]);
    const g = openGame(1);
    g.monetization.earnGems(150, 't');
    g.state.player.level = 10;
    expect(g.monetization.buyWithGems('cosmetic_neon_nights')).toEqual({ ok: false, reason: 'locked' });
    g.state.player.level = 9;
    g.state.player.lifetimeRevenue = 2500;
    expect(g.monetization.buyWithGems('cosmetic_neon_nights')).toEqual({ ok: false, reason: 'locked' });
    // The simulated real-money route is gated too.
    const adapter = new SimulatedPurchaseAdapter();
    const ctl = new PurchaseController(() => g, adapter, new SimulatedVerifier());
    await ctl.init();
    expect((await ctl.purchase('cosmetic_neon_nights')).status).toBe('unavailable');
    g.state.player.level = 10;
    expect(g.monetization.buyWithGems('cosmetic_neon_nights')).toEqual({ ok: true });
    expect(g.monetization.gems).toBe(0);
    const raw: any = JSON.parse(JSON.stringify(createInitialState(T0, 1)));
    raw.monetization.entitlements = { skin_neon_nights: { source: 'iap', txId: 'T9', test: true, at: T0 } };
    expect(Object.keys(validate(raw, T0).monetization.entitlements)).toEqual(['cosmetic_neon_nights']);
  });
});
