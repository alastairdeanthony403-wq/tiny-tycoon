import { describe, it, expect } from 'vitest';
import { openGame, T0 } from './helpers';
import { SaveManager, MemoryStore } from '../src/save/saveManager';
import { Game } from '../src/sim/game';
import { ECONOMY } from '../src/config/economy';
import { guarded } from '../src/ui/dom';

describe('economy numbers shown to the player match the simulation', () => {
  it('income rate equals real sales profit per second', () => {
    const g = openGame(21, 0);
    g.runFor(30); // warm up
    let credited = 0;
    g.bus.on('sale', (e) => (credited += e.amount));
    const start = g.simTime;
    g.runFor(300); // exactly the rolling window
    const actual = credited / (g.simTime - start);
    expect(actual).toBeGreaterThan(0);
    expect(g.economy.incomeRate()).toBeGreaterThan(actual * 0.85);
    expect(g.economy.incomeRate()).toBeLessThan(actual * 1.15);
  });

  it('income rate is non-zero within the first seconds of trading', () => {
    const g = openGame(3);
    g.runFor(9);
    if (g.state.stats.customersServed > 0) expect(g.economy.incomeRate()).toBeGreaterThan(0);
  });

  it('net income subtracts wages', () => {
    const g = openGame(1, 1000);
    g.state.player.level = 3;
    g.employees.hire('stocker');
    expect(g.economy.netIncomeRate()).toBeCloseTo(g.economy.incomeRate() - g.economy.wagesPerMinute() / 60);
  });

  it('cash never goes negative even with wages and no income', () => {
    const g = openGame(1, 400);
    g.state.player.level = 3;
    g.employees.hire('stocker');
    g.shop.open = false;
    g.runFor(600);
    expect(g.state.player.money).toBeGreaterThanOrEqual(0);
  });
});

describe('upgrades deliver their advertised effect', () => {
  it('marketing +12% per level raises spawn rate by that factor', () => {
    const g = openGame(1);
    const before = g.customers.spawnRate();
    g.state.globalUpgrades.marketing = 1;
    expect(g.customers.spawnRate() / before).toBeCloseTo(1.12, 2);
  });

  it('bigger shelves (+15%) raise capacity', () => {
    const g = openGame(1);
    const shelf = g.shopMgr.displays()[0];
    const before = g.shopMgr.capacity(shelf);
    g.state.globalUpgrades.storage = 2;
    expect(g.shopMgr.capacity(shelf)).toBe(Math.round(before * 1.3));
  });

  it('comfy music raises customer patience', () => {
    const g = openGame(1);
    const a = g.mods.patienceMult();
    g.state.globalUpgrades.comfort = 1;
    expect(g.mods.patienceMult() / a).toBeCloseTo(1.12, 2);
  });

  it('fast deliveries restock shelves faster', () => {
    const run = (lvl: number) => {
      const g = openGame(1);
      g.shop.open = false;
      g.state.globalUpgrades.restock_speed = lvl;
      const s = g.shopMgr.displays()[0];
      s.stock = 0;
      g.runFor(10);
      return s.stock;
    };
    expect(run(4)).toBeGreaterThan(run(0));
  });

  it('checkout upgrade speeds up service as previewed', () => {
    const g = openGame(1, 1000);
    const co = g.shopMgr.checkouts()[0];
    const s1 = g.checkout.speed(co.uid);
    g.shopMgr.upgrade(co.uid);
    expect(g.checkout.speed(co.uid) / s1).toBeCloseTo(1.4, 5);
  });
});

describe('purchases are atomic', () => {
  it('a successful purchase deducts exactly once and applies once', () => {
    const g = openGame(1);
    g.state.player.money = 100;
    const shelf = g.shopMgr.displays()[0];
    const cost = g.shopMgr.upgradeCost(shelf)!;
    expect(g.shopMgr.upgrade(shelf.uid)).toBe(true);
    expect(g.state.player.money).toBe(100 - cost);
    expect(shelf.tier).toBe(1);
  });

  it('a failed purchase changes nothing', () => {
    const g = openGame(1);
    g.state.player.money = 1;
    const shelf = g.shopMgr.displays()[0];
    const before = JSON.stringify(g.state);
    expect(g.shopMgr.upgrade(shelf.uid)).toBe(false);
    expect(g.upgrades.buy('marketing')).toBe(false);
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('UI action guard ignores rapid repeat taps', () => {
    let n = 0;
    const tap = guarded('test-buy', () => n++);
    tap();
    tap();
    tap();
    expect(n).toBe(1);
  });
});

describe('achievements', () => {
  it('track real gameplay counters and claim exactly once', () => {
    const g = openGame(2);
    g.runFor(60);
    g.achievements.evaluate();
    expect(g.state.player.lifetimeCustomers).toBe(g.state.stats.customersServed);
    expect(g.state.progression.achievements.first_sale?.unlocked).toBe(true);
    const stars = g.state.player.stars;
    const price = g.mods.priceMult();
    expect(g.achievements.claim('first_sale')).toBe(true);
    expect(g.state.player.stars).toBe(stars + 1);
    expect(g.mods.priceMult()).toBeCloseTo(price * (1 + ECONOMY.achievementRevenueBonus), 5);
    for (let i = 0; i < 5; i++) expect(g.achievements.claim('first_sale')).toBe(false);
    expect(g.state.player.stars).toBe(stars + 1);
  });

  it('cannot claim an achievement that is not unlocked', () => {
    const g = openGame(2);
    expect(g.achievements.claim('millionaire')).toBe(false);
    expect(g.state.player.stars).toBe(0);
  });
});

describe('persistence', () => {
  it('cash, XP, layout, upgrades, stock, staff, claims and settings survive a reload', () => {
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    const g = openGame(4, 5000);
    g.state.player.level = 3;
    g.runFor(40);
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    const spot = g.shopMgr.findSpot('shelf')!;
    g.shopMgr.buy('shelf', spot.x, spot.y, spot.dir);
    g.shopMgr.upgrade(g.shopMgr.displays()[0].uid);
    g.upgrades.buy('marketing');
    g.employees.hire('stocker');
    g.achievements.evaluate();
    g.achievements.claim('first_sale');
    g.state.settings.musicEnabled = false;
    g.state.settings.sfxVolume = 0.3;
    g.state.settings.reduceFlashing = true;
    sm.save(g.state, T0);
    const g2 = new Game(sm.load(T0).state, { seed: 4, now: () => T0 });
    const s1 = g.state;
    const s2 = g2.state;
    expect(s2.player.money).toBeCloseTo(s1.player.money);
    expect(s2.player.xp).toBe(s1.player.xp);
    expect(s2.player.level).toBe(s1.player.level);
    expect(s2.shops.neighborhood.objects).toEqual(s1.shops.neighborhood.objects);
    expect(s2.shops.neighborhood.size).toBe(4);
    expect(s2.globalUpgrades).toEqual(s1.globalUpgrades);
    expect(s2.shops.neighborhood.staff.map((e) => e.type)).toEqual(['stocker']);
    expect(s2.progression.achievements.first_sale).toEqual({ unlocked: true, claimed: true });
    expect(g2.achievements.claim('first_sale')).toBe(false);
    expect(s2.settings.musicEnabled).toBe(false);
    expect(s2.settings.sfxVolume).toBe(0.3);
    expect(s2.settings.reduceFlashing).toBe(true);
    // Income keeps flowing after the reload.
    const served = s2.stats.customersServed;
    g2.runFor(60);
    expect(g2.state.stats.customersServed).toBeGreaterThan(served);
    expect(g2.errors).toEqual([]);
  });
});
