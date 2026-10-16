import { describe, it, expect, vi } from 'vitest';
import { Game } from '../src/sim/game';
import { createInitialState } from '../src/core/state';
import { SaveManager, MemoryStore, validateStore } from '../src/save/saveManager';
import { PREMIUM_CATALOG, PREMIUM_MAP, validateCatalog, bundleValue, BUNDLE_PRODUCTS } from '../src/monetization/catalog';
import type { PremiumProductId } from '../src/monetization/catalog';
import { BOOSTERS, GEM_PERKS, GEM_REWARDS, RESOURCES, BUNDLE_PRICE_SHARE } from '../src/config/store';
import { EXPANSIONS } from '../src/config/expansions';
import { STAFF_MAX_LEVEL } from '../src/config/staff';
import { xpForLevel } from '../src/config/economy';
import { openGame, newGame, T0 } from './helpers';

const DAY = 86_400_000;

/** A game with a movable clock (for daily limits and events). */
function clockGame(start = T0, seed = 42) {
  const clock = { now: start };
  const g = new Game(createInitialState(start, seed), { seed, now: () => clock.now });
  g.shopMgr.openShop();
  return { g, clock };
}

const rich = (g: Game, gems = 5000, level = 20) => {
  g.state.player.level = level;
  g.monetization.earnGems(gems, 'test');
};

describe('catalog data', () => {
  it('passes validation (ids, prices, ownership, bundle contents)', () => {
    expect(validateCatalog()).toEqual([]);
  });

  it('every store item is Gems-only; bundles cost less than their genuine individual total', () => {
    for (const p of PREMIUM_CATALOG.filter((x) => ['upgrade', 'booster', 'bundle'].includes(x.category) || x.id.startsWith('res_') || x.id.startsWith('style_') || x.id.startsWith('event_'))) {
      expect(p.realMoney, p.id).toBe(false);
      expect(p.devPrice, p.id).toBeUndefined();
    }
    for (const id of Object.keys(BUNDLE_PRODUCTS) as PremiumProductId[]) {
      const p = PREMIUM_MAP[id];
      const value = bundleValue(p)!;
      expect(value).toBe((p.grant as { items: string[] }).items.reduce((n, i) => n + PREMIUM_MAP[i as PremiumProductId].gemPrice!, 0));
      expect(p.gemPrice).toBe(Math.round(value * BUNDLE_PRICE_SHARE));
      expect(p.gemPrice!).toBeLessThan(value);
    }
  });

  it('validation catches bad data', () => {
    const bad = [{ ...PREMIUM_MAP.boost_revenue, id: 'boost_revenue' }, { ...PREMIUM_MAP.boost_revenue }, { ...PREMIUM_MAP.style_acc_bow, id: 'x', gemPrice: -1 }] as never;
    const errs = validateCatalog(bad);
    expect(errs.some((e) => e.includes('duplicate'))).toBe(true);
    expect(errs.some((e) => e.includes('bad gem price'))).toBe(true);
  });
});

describe('Gem currency', () => {
  it('deducts the exact price once, earned Gems first, and never goes negative', () => {
    const g = openGame(1);
    g.state.player.level = 5;
    const price = PREMIUM_MAP.boost_revenue.gemPrice!;
    g.monetization.earnGems(price + 30, 'test');
    g.state.monetization.gemsPurchased = price - 30;
    expect(g.store.purchase('boost_revenue')).toMatchObject({ ok: true });
    expect([g.state.monetization.gemsEarned, g.state.monetization.gemsPurchased]).toEqual([30, price - 30]);
    expect(g.store.purchase('boost_revenue')).toMatchObject({ ok: true });
    expect([g.state.monetization.gemsEarned, g.state.monetization.gemsPurchased]).toEqual([0, 0]);
    expect(g.store.purchase('boost_revenue')).toEqual({ ok: false, reason: 'insufficient' });
    expect(g.monetization.gems).toBe(0);
    expect(g.state.monetization.totals.spent).toBe(price * 2);
  });

  it('insufficient Gems: nothing changes', () => {
    const g = openGame(2);
    g.state.player.level = 10;
    g.monetization.earnGems(5, 'test');
    const money = g.state.player.money;
    expect(g.store.purchase('res_cash_small')).toEqual({ ok: false, reason: 'insufficient' });
    expect(g.state.player.money).toBe(money);
    expect(g.monetization.gems).toBe(5);
  });

  it('level-up rewards: correct amount, once per level, even after save/load and repeated events', () => {
    const g = openGame(3);
    const before = g.monetization.gems;
    g.bus.emit('levelUp', { level: 5, unlocks: [], reward: { money: 0, stars: 0 } });
    expect(g.monetization.gems - before).toBe(GEM_REWARDS.levelUp.perLevel + GEM_REWARDS.levelUp.bonusEvery5);
    g.bus.emit('levelUp', { level: 5, unlocks: [], reward: { money: 0, stars: 0 } });
    expect(g.monetization.gems - before).toBe(GEM_REWARDS.levelUp.perLevel + GEM_REWARDS.levelUp.bonusEvery5);
    const sm = new SaveManager(new MemoryStore());
    sm.save(g.state, T0);
    const g2 = new Game(sm.load(T0).state, { seed: 3, now: () => T0 });
    const b2 = g2.monetization.gems;
    g2.bus.emit('levelUp', { level: 5, unlocks: [], reward: { money: 0, stars: 0 } });
    expect(g2.monetization.gems).toBe(b2);
  });

  it('real level-ups pay Gems through the central ledger', () => {
    const g = openGame(4);
    const before = g.monetization.gems;
    g.progression.addXp(xpForLevel(1) + xpForLevel(2) + 1);
    expect(g.state.player.level).toBeGreaterThanOrEqual(3);
    expect(g.monetization.gems).toBeGreaterThan(before);
    expect(g.state.monetization.ledger.some((l) => l.source.startsWith('level_up:level:2'))).toBe(true);
  });

  it('tier, franchise and tutorial rewards; a skipped tutorial pays nothing', () => {
    const g = openGame(5);
    const b0 = g.monetization.gems;
    g.bus.emit('tierReached', { tier: 'super', stage: 4 });
    g.bus.emit('tierReached', { tier: 'super', stage: 4 });
    expect(g.monetization.gems - b0).toBe(GEM_REWARDS.tier.super);
    g.bus.emit('franchised', { stars: 1, count: 1 });
    expect(g.monetization.gems - b0).toBe(GEM_REWARDS.tier.super + GEM_REWARDS.franchise);
    const skip = openGame(6);
    const s0 = skip.monetization.gems;
    skip.quests.skipTutorial();
    expect(skip.monetization.gems).toBe(s0);
    skip.bus.emit('tutorialCompleted', { skipped: false });
    expect(skip.monetization.gems - s0).toBe(GEM_REWARDS.tutorial);
  });

  it('missions and achievements pay Gems once', () => {
    const g = openGame(7);
    const b0 = g.monetization.gems;
    const a = Object.keys(g.state.progression.achievements)[0] ?? 'first_sale';
    g.state.progression.achievements[a] = { unlocked: true, claimed: false };
    g.achievements.claim(a);
    const after = g.monetization.gems;
    expect(after).toBeGreaterThan(b0);
    g.achievements.claim(a);
    expect(g.monetization.gems).toBe(after);
  });
});

describe('store purchases', () => {
  it('valid purchase, invalid id, locked item, owned cosmetic and duplicate attempts', () => {
    const g = openGame(8);
    g.monetization.earnGems(1000, 'test');
    g.state.player.level = 3;
    expect(g.store.purchase('nope' as PremiumProductId)).toEqual({ ok: false, reason: 'unknown' });
    expect(g.store.purchase('style_checkout_marble')).toEqual({ ok: false, reason: 'locked' });
    expect(g.store.purchase('style_sign_wood')).toMatchObject({ ok: true });
    expect(g.monetization.owns('style_sign_wood')).toBe(true);
    const gems = g.monetization.gems;
    expect(g.store.purchase('style_sign_wood')).toEqual({ ok: false, reason: 'owned' });
    expect(g.monetization.buyWithGems('style_sign_wood')).toEqual({ ok: false, reason: 'owned' });
    expect(g.monetization.gems).toBe(gems);
    expect(g.state.monetization.equipped.sign).toBe('wood');
  });

  it('a purchase in progress blocks a second one (re-entrancy)', () => {
    const g = openGame(9);
    rich(g);
    let inner: unknown;
    g.bus.on('boosterStarted', () => {
      inner = g.store.purchase('boost_revenue');
    });
    expect(g.store.purchase('boost_revenue')).toMatchObject({ ok: true });
    expect(inner).toEqual({ ok: false, reason: 'busy' });
  });

  it('bundles grant every item exactly once and can only be bought once', () => {
    const g = openGame(10);
    rich(g, 1000, 9);
    g.shopMgr.displays()[0].stock = 0;
    const money = g.state.player.money;
    const gems = g.monetization.gems;
    expect(g.store.purchase('bundle_starter')).toMatchObject({ ok: true });
    expect(g.monetization.gems).toBe(gems - PREMIUM_MAP.bundle_starter.gemPrice!);
    expect(g.state.player.money).toBeGreaterThan(money);
    expect(g.shopMgr.displays()[0].stock).toBe(g.shopMgr.capacity(g.shopMgr.displays()[0]));
    expect(g.monetization.owns('style_acc_scarf')).toBe(true);
    expect(g.monetization.owns('bundle_starter')).toBe(true);
    expect(g.store.purchase('bundle_starter')).toEqual({ ok: false, reason: 'owned' });
  });

  it('a bundle whose unique item is already owned is refused (never sold twice)', () => {
    const g = openGame(11);
    rich(g, 2000, 10);
    g.state.player.lifetimeRevenue = 1e6;
    expect(g.store.purchase('style_acc_scarf')).toMatchObject({ ok: true });
    const gems = g.monetization.gems;
    expect(g.store.purchase('bundle_style_autumn')).toEqual({ ok: false, reason: 'owned_part' });
    expect(g.monetization.gems).toBe(gems);
  });

  it('atomic failure: if granting throws midway, every change is undone and the Gems come back', () => {
    const g = openGame(12);
    rich(g, 1000, 9);
    g.shopMgr.displays()[0].stock = 0;
    const money = g.state.player.money;
    const gems = g.monetization.gems;
    const spy = vi.spyOn(g.monetization, 'grantOwned').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(g.store.purchase('bundle_starter')).toEqual({ ok: false, reason: 'failed' });
    spy.mockRestore();
    expect(g.monetization.gems).toBe(gems);
    expect(g.state.player.money).toBe(money);
    expect(g.shopMgr.displays()[0].stock).toBe(0);
    expect(g.monetization.owns('style_acc_scarf')).toBe(false);
    expect(g.monetization.owns('bundle_starter')).toBe(false);
    expect(g.state.monetization.totals.spent).toBe(0);
  });

  it('daily limits reset on the next UTC day', () => {
    const { g, clock } = clockGame();
    rich(g);
    for (let i = 0; i < 3; i++) expect(g.store.purchase('res_cash_small')).toMatchObject({ ok: true });
    expect(g.store.purchase('res_cash_small')).toEqual({ ok: false, reason: 'daily_limit' });
    clock.now += DAY;
    expect(g.store.purchase('res_cash_small')).toMatchObject({ ok: true });
    expect(g.state.store.purchases.res_cash_small.total).toBe(4);
  });

  it('items with nothing to do are refused instead of wasting Gems', () => {
    const g = openGame(13);
    rich(g);
    for (const o of g.shopMgr.displays()) o.stock = g.shopMgr.capacity(o);
    expect(g.store.purchase('res_stock')).toEqual({ ok: false, reason: 'nothing_to_do' });
    expect(g.store.purchase('res_staff_training')).toEqual({ ok: false, reason: 'nothing_to_do' });
  });

  it('store state survives save/load, and corrupt store data is repaired', () => {
    const g = openGame(14);
    rich(g);
    g.store.purchase('perk_vip_checkout');
    g.store.purchase('boost_staff');
    g.store.purchase('res_offline_bonus');
    g.store.purchase('style_acc_bow');
    const sm = new SaveManager(new MemoryStore());
    expect(sm.save(g.state, T0)).toBe(true);
    const st = sm.load(T0).state;
    expect(st.store.perks.vip_checkout).toBe(1);
    expect(st.store.boosters.staff_boost).toBeCloseTo(BOOSTERS.staff_boost.seconds);
    expect(st.store.charges.offlineBonus).toBe(1);
    expect(st.monetization.equipped.accessory).toBe('bow');
    const bad = validateStore({ perks: { vip_checkout: 99, nope: 3 }, boosters: { revenue_boost: 1e9, nope: 5 }, charges: { expansionPermit: 7 }, claims: ['a', 'a', 5], purchases: { fake: {} } });
    expect(bad.perks).toEqual({ vip_checkout: GEM_PERKS.vip_checkout.prices.length });
    expect(bad.boosters).toEqual({ revenue_boost: BOOSTERS.revenue_boost.maxStackSeconds });
    expect(bad.charges).toEqual({ expansionPermit: RESOURCES.maxCharges, offlineBonus: 0 });
    expect(bad.claims).toEqual(['a']);
    expect(bad.purchases).toEqual({});
    expect(validateStore(undefined)).toEqual(validateStore({}));
  });

  it('an older save without store data loads with defaults', () => {
    const g = newGame(15);
    const raw = JSON.parse(JSON.stringify(g.state));
    delete raw.store;
    delete raw.monetization.equipped.sign;
    const sm = new SaveManager(new MemoryStore());
    sm.save(raw, T0);
    const st = sm.load(T0).state;
    expect(st.store).toEqual(validateStore(undefined));
    expect(st.monetization.equipped.sign).toBeNull();
  });
});

describe('real gameplay effects', () => {
  it('Gem upgrades change the actual values they describe', () => {
    const g = openGame(16);
    rich(g);
    const before = { checkout: g.mods.checkoutSpeedMult(), staff: g.mods.staffSpeedMult(), cap: g.mods.capacityMult(), pat: g.mods.patienceMult(), offline: g.mods.offlineCapSeconds(), cust: g.customers.maxCustomers() };
    for (const id of ['perk_vip_checkout', 'perk_staff_academy', 'perk_big_warehouse', 'perk_loyalty_card', 'perk_night_manager', 'perk_street_signs'] as PremiumProductId[]) expect(g.store.purchase(id)).toMatchObject({ ok: true });
    expect(g.mods.checkoutSpeedMult()).toBeCloseTo(before.checkout * (1 + GEM_PERKS.vip_checkout.perLevel));
    expect(g.mods.staffSpeedMult()).toBeCloseTo(before.staff * (1 + GEM_PERKS.staff_academy.perLevel));
    expect(g.mods.capacityMult()).toBeCloseTo(before.cap * (1 + GEM_PERKS.big_warehouse.perLevel));
    expect(g.mods.patienceMult()).toBeCloseTo(before.pat * (1 + GEM_PERKS.loyalty_card.perLevel));
    expect(g.mods.offlineCapSeconds()).toBe(before.offline + 3600);
    expect(g.customers.maxCustomers()).toBe(before.cust + 1);
    expect(g.store.priceOf('perk_vip_checkout')).toBe(GEM_PERKS.vip_checkout.prices[1]);
  });

  it('lean operations lowers wages; perks stop at max level', () => {
    const g = openGame(17);
    rich(g, 100000);
    g.economy.earn(1e6, false);
    g.employees.hire('cashier');
    const w0 = g.economy.wagesPerMinute();
    expect(w0).toBeGreaterThan(0);
    for (let i = 0; i < GEM_PERKS.lean_operations.prices.length; i++) expect(g.store.purchase('perk_lean_operations')).toMatchObject({ ok: true });
    expect(g.store.purchase('perk_lean_operations')).toEqual({ ok: false, reason: 'max_level' });
    expect(g.economy.wagesPerMinute()).toBe(Math.round(w0 * (1 - 4 * GEM_PERKS.lean_operations.perLevel)));
  });

  it('boosters multiply the right value and expire after their play time; buying again extends up to the cap', () => {
    const g = openGame(18);
    rich(g);
    const price0 = g.mods.priceMult();
    const spawn0 = g.mods.spawnMult();
    expect(g.store.purchase('boost_revenue')).toMatchObject({ ok: true });
    expect(g.mods.priceMult()).toBeCloseTo(price0 * BOOSTERS.revenue_boost.mult);
    expect(g.store.purchase('boost_rush')).toMatchObject({ ok: true });
    expect(g.mods.spawnMult() / spawn0).toBeGreaterThan(1.5);
    const ended: string[] = [];
    g.bus.on('boosterEnded', (e) => ended.push(e.id));
    g.runFor(BOOSTERS.customer_rush.seconds + 1);
    expect(ended).toContain('customer_rush');
    expect(g.store.boosterRemaining('customer_rush')).toBe(0);
    expect(g.store.boosterRemaining('revenue_boost')).toBeGreaterThan(0);
    g.runFor(BOOSTERS.revenue_boost.seconds);
    expect(g.store.boosterRemaining('revenue_boost')).toBe(0);
    expect(g.mods.priceMult()).toBeCloseTo(price0, 5);
    // daily limit (one already bought today) …
    expect(g.store.purchase('boost_revenue')).toMatchObject({ ok: true });
    expect(g.store.purchase('boost_revenue')).toMatchObject({ ok: true });
    expect(g.store.purchase('boost_revenue')).toEqual({ ok: false, reason: 'daily_limit' });
    expect(g.store.boosterRemaining('revenue_boost')).toBe(2 * BOOSTERS.revenue_boost.seconds);
    // … and the stacking cap
    g.state.store.boosters.revenue_boost = BOOSTERS.revenue_boost.maxStackSeconds - 10;
    g.state.store.purchases.boost_rush = { total: 0, day: '', today: 0 };
    g.state.store.boosters.customer_rush = BOOSTERS.customer_rush.maxStackSeconds - 10;
    expect(g.store.purchase('boost_rush')).toMatchObject({ ok: true });
    expect(g.store.boosterRemaining('customer_rush')).toBe(BOOSTERS.customer_rush.maxStackSeconds);
  });

  it('Expansion Permit takes 25% off the next expansion once, and never bypasses requirements', () => {
    const g = openGame(19);
    rich(g, 1000, 1);
    g.state.player.level = 4;
    const full = g.shopMgr.expansionCost()!;
    expect(g.store.purchase('res_expansion_permit')).toMatchObject({ ok: true });
    expect(g.store.purchase('res_expansion_permit')).toEqual({ ok: false, reason: 'charge_held' });
    expect(g.shopMgr.expansionCost()).toBe(Math.round(full * (1 - RESOURCES.expansionDiscount)));
    g.economy.earn(1e6, false);
    // level requirement of the stage after next still applies
    g.state.player.level = 1;
    expect(g.shopMgr.canExpand()).toEqual({ ok: false, reason: 'level' });
    g.state.player.level = 4;
    const money = g.state.player.money;
    expect(g.shopMgr.expand()).toBe(true);
    expect(money - g.state.player.money).toBe(Math.round(full * (1 - RESOURCES.expansionDiscount)));
    expect(g.state.store.charges.expansionPermit).toBe(0);
    g.runFor(EXPANSIONS[1].buildTime + 1);
    expect(g.shopMgr.expansionCost()).toBe(Math.round(EXPANSIONS[2].cost * g.mods.location.costMult));
  });

  it('Offline Bonus doubles the next (already capped) offline collection once', () => {
    const g = openGame(20);
    rich(g);
    g.store.purchase('res_offline_bonus');
    g.state.pendingOffline = { seconds: 600, amount: 1000, claimed: false };
    const m0 = g.state.player.money;
    expect(g.offline.claim()).toBe(2000);
    expect(g.state.player.money - m0).toBe(2000);
    g.state.pendingOffline = { seconds: 600, amount: 1000, claimed: false };
    expect(g.offline.claim()).toBe(1000);
  });

  it('cash, XP, stock and staff training grant exactly what the store shows', () => {
    const g = openGame(21);
    rich(g, 5000, 9);
    g.economy.earn(1e5, false);
    const cash = g.store.cashAmount('cash_small');
    const m0 = g.state.player.money;
    g.store.purchase('res_cash_small');
    expect(g.state.player.money - m0).toBe(cash);
    const xp = g.store.xpAmount();
    const x0 = g.state.player.xp;
    const l0 = g.state.player.level;
    g.store.purchase('res_xp');
    expect(g.state.player.level > l0 || g.state.player.xp - x0 === xp).toBe(true);
    g.employees.hire('stocker');
    const e = g.store.trainingTarget()!;
    const lv = e.level;
    g.store.purchase('res_staff_training');
    expect(e.level).toBe(lv + 1);
    while (g.store.trainingTarget()) g.state.shops[g.shop.locationId].staff.forEach((s) => (s.level = STAFF_MAX_LEVEL));
    expect(g.store.purchase('res_staff_training')).toEqual({ ok: false, reason: 'nothing_to_do' });
  });

  it('cosmetics never change the simulation', () => {
    const run = (setup: (g: Game) => void) => {
      const g = openGame(22, 500);
      g.monetization.earnGems(5000, 'test');
      g.state.player.level = 20;
      setup(g);
      g.runFor(120);
      return { money: Math.round(g.state.player.money), sold: g.state.stats.itemsSold, served: g.state.stats.customersServed };
    };
    const base = run((g) => g.store.purchase('style_acc_scarf'));
    const styled = run((g) => {
      for (const id of ['style_acc_scarf', 'style_display_chrome', 'style_checkout_arcade', 'style_sign_marquee', 'style_entrance_red_carpet'] as PremiumProductId[]) g.store.purchase(id);
    });
    expect(styled.sold).toBe(base.sold);
    expect(styled.served).toBe(base.served);
  });
});

describe('progression-aware availability', () => {
  it('requirements report exact progress: level, tier, franchise, event', () => {
    const { g, clock } = clockGame(Date.UTC(2026, 5, 1));
    g.state.player.level = 3;
    expect(g.store.requirementRows('style_checkout_marble')).toEqual([
      { key: 'level', need: 14, have: 3, met: false },
      { key: 'tier', need: 'mega', have: 'starter', met: false },
    ]);
    expect(g.store.unlocked('style_entrance_franchise')).toBe(false);
    g.state.player.prestigeCount = 1;
    expect(g.store.unlocked('style_entrance_franchise')).toBe(true);
    // Ocean Week: 1–14 July (UTC)
    expect(g.store.unlocked('event_beach_umbrella')).toBe(false);
    clock.now = Date.UTC(2026, 6, 3);
    expect(g.store.unlocked('event_beach_umbrella')).toBe(true);
    expect(new Date(g.store.eventEnds(g.store.activeEvents().find((e) => e.id === 'ocean_week')!)!).toISOString().slice(0, 10)).toBe('2026-07-14');
    clock.now = Date.UTC(2026, 6, 15);
    expect(g.store.unlocked('event_beach_umbrella')).toBe(false);
  });

  it('events wrap the year end; the Grand Opening runs for the first week; gifts are once per event', () => {
    const { g, clock } = clockGame(Date.UTC(2026, 11, 30));
    const ids = () => g.store.activeEvents().map((e) => e.id);
    expect(ids()).toEqual(['grand_opening', 'winter_village']);
    clock.now = Date.UTC(2027, 0, 5);
    expect(ids()).toEqual(['grand_opening', 'winter_village']);
    clock.now = Date.UTC(2027, 0, 7);
    expect(ids()).toEqual([]);
    clock.now = Date.UTC(2026, 11, 30);
    const b0 = g.monetization.gems;
    expect(g.store.claimEventGift('winter_village')).toBe(GEM_REWARDS.eventGift);
    expect(g.store.claimEventGift('winter_village')).toBe(0);
    clock.now = Date.UTC(2027, 11, 30); // next year's run: still once
    expect(g.store.claimEventGift('winter_village')).toBe(0);
    expect(g.monetization.gems - b0).toBe(GEM_REWARDS.eventGift);
    // a clock set before the save existed never counts as the Grand Opening
    clock.now = Date.UTC(2026, 11, 1);
    expect(ids()).toEqual(['winter_village']);
  });

  it('bundles need everything their contents need', () => {
    const g = openGame(23);
    g.monetization.earnGems(5000, 'test');
    g.state.player.level = 20;
    expect(g.store.requirementRows('bundle_style_autumn').map((r) => r.key)).toContain('lifetimeRevenue');
    expect(g.store.purchase('bundle_style_autumn')).toEqual({ ok: false, reason: 'locked' });
    g.state.player.lifetimeRevenue = 1e6;
    expect(g.store.purchase('bundle_style_autumn')).toMatchObject({ ok: true });
    expect(g.state.monetization.equipped.skin).toBe('cozy_autumn');
  });

  it('newly unlocked items are listed until seen', () => {
    const g = openGame(24);
    g.state.player.level = 6;
    const fresh = g.store.newlyUnlocked();
    expect(fresh.length).toBeGreaterThan(0);
    g.store.markSeen(fresh);
    expect(g.store.newlyUnlocked()).toEqual([]);
  });
});

describe('regression', () => {
  it('the simulation stays deterministic with store systems present', () => {
    const run = () => {
      const g = openGame(31, 200);
      g.runFor(180);
      return [g.state.player.money, g.state.stats.itemsSold, g.state.stats.customersServed];
    };
    expect(run()).toEqual(run());
  });
});
