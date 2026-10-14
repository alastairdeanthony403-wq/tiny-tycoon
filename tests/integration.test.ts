import { describe, it, expect } from 'vitest';
import { openGame, newGame } from './helpers';
import { findPath } from '../src/sim/pathfinding';
import { DOOR_TILE } from '../src/core/state';
import { ECONOMY } from '../src/config/economy';
import { Game } from '../src/sim/game';
import { createInitialState } from '../src/core/state';

describe('core loop', () => {
  it('closed shop gets no customers; opening starts the loop', () => {
    const g = newGame();
    g.runFor(30);
    expect(g.world.customers.length).toBe(0);
    g.shopMgr.openShop();
    g.runFor(30);
    expect(g.world.nextCustomerId - 1).toBeGreaterThan(0);
  });

  it('a customer completes a purchase and money is earned', () => {
    const g = openGame(7);
    const start = g.state.player.money;
    const sales: number[] = [];
    g.bus.on('sale', (s) => sales.push(s.amount));
    g.runFor(60);
    expect(sales.length).toBeGreaterThan(3);
    expect(g.state.player.money).toBeGreaterThan(start);
    expect(g.state.stats.itemsSold).toBeGreaterThan(sales.length - 1);
  });

  it('first 5 minutes: frequent rewards, several upgrades affordable, levels gained', () => {
    const g = openGame(11);
    let levelUps = 0;
    g.bus.on('levelUp', () => levelUps++);
    // Simple "active player": restocks and buys the cheapest useful things.
    for (let s = 0; s < 300; s++) {
      g.runFor(1);
      for (const o of g.shopMgr.displays()) if (g.inventory.status(o) !== 'ok') g.inventory.manualRestock(o.uid);
      for (const q of g.state.progression.activeQuests) if (q.completed) g.quests.claim(q.id);
      const shelf = g.shopMgr.displays()[0];
      if (shelf && g.shopMgr.upgradeCost(shelf) !== null && g.economy.canAfford(g.shopMgr.upgradeCost(shelf)!)) g.shopMgr.upgrade(shelf.uid);
    }
    expect(levelUps).toBeGreaterThanOrEqual(2);
    expect(g.state.stats.customersServed).toBeGreaterThan(30);
    expect(g.state.player.lifetimeRevenue).toBeGreaterThan(200);
  });
});

describe('customers never get stuck', () => {
  it('long soak: customers keep flowing and none exceed the stuck timeout', () => {
    const g = openGame(5, 1e6);
    g.state.player.level = 12;
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    for (let i = 0; i < 3; i++) {
      const spot = g.shopMgr.findSpot('shelf');
      if (spot) g.shopMgr.buy('shelf', spot.x, spot.y, spot.dir);
    }
    const spot = g.shopMgr.findSpot('checkout');
    expect(spot).not.toBeNull();
    g.shopMgr.buy('checkout', spot!.x, spot!.y, spot!.dir);
    g.employees.hire('cashier');
    g.employees.hire('stocker');
    g.debug.triggerRush();
    for (let m = 0; m < 10; m++) {
      g.runFor(60);
      for (const c of g.world.customers) expect(c.stateTime).toBeLessThanOrEqual(ECONOMY.customers.stuckTimeout + 1);
    }
    expect(g.state.stats.customersServed).toBeGreaterThan(100);
    expect(g.errors).toEqual([]);
  });
});

describe('employees', () => {
  it('a stocker walks to storage and restocks an empty shelf', () => {
    const g = openGame(3, 5000);
    g.state.player.level = 3;
    expect(g.employees.hire('stocker')).not.toBeNull();
    g.shop.open = false;
    const shelf = g.shopMgr.displays()[0];
    shelf.stock = 0;
    let delivered = false;
    g.bus.on('restocked', (e) => {
      if (!e.manual && e.uid === shelf.uid) delivered = true;
    });
    // Disable passive restock to isolate the stocker.
    g.inventory.tick = () => {};
    g.runFor(20);
    expect(delivered).toBe(true);
    expect(shelf.stock).toBeGreaterThan(0);
  });

  it('a cashier opens a second checkout', () => {
    const g = openGame(3, 50000);
    g.state.player.level = 5;
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    const spot = g.shopMgr.findSpot('checkout')!;
    const co = g.shopMgr.buy('checkout', spot.x, spot.y, spot.dir)!;
    expect(g.checkout.isOpen(co.uid)).toBe(false);
    g.employees.hire('cashier');
    expect(g.checkout.isOpen(co.uid)).toBe(true);
    g.runFor(15);
    expect(g.world.checkouts.get(co.uid)!.cashierPresent).toBe(true);
    expect(g.checkout.speed(co.uid)).toBeGreaterThan(1);
  });

  it('removing an employee mid-task releases claims and keeps the sim healthy', () => {
    const g = openGame(3, 5000);
    g.state.player.level = 3;
    const e = g.employees.hire('stocker')!;
    g.shopMgr.displays()[0].stock = 0;
    g.runFor(1.5);
    expect([...g.world.claims.values()]).toContain(e.id);
    g.employees.fire(e.id);
    expect([...g.world.claims.values()]).not.toContain(e.id);
    g.runFor(10);
    expect(g.errors).toEqual([]);
  });

  it('cleaners clean dirt', () => {
    const g = openGame(3, 50000);
    g.state.player.level = 6;
    g.employees.hire('cleaner');
    g.shop.dirt.push({ x: 1, y: 1 }, { x: 0, y: 2 });
    g.runFor(20);
    expect(g.state.stats.cleaned).toBeGreaterThanOrEqual(2);
  });

  it('employee levels raise speed and respect the max level', () => {
    const g = openGame(3, 1e9);
    g.state.player.level = 3;
    const e = g.employees.hire('cashier')!;
    const s1 = g.employees.speedOf(e);
    expect(g.employees.levelUp(e.id)).toBe(true);
    expect(g.employees.speedOf(e)).toBeGreaterThan(s1);
    while (g.employees.levelUp(e.id));
    expect(g.employees.levelUpCost(e)).toBeNull();
  });
});

describe('building & expansion', () => {
  it('expansion adds walkable tiles and navigation reaches them', () => {
    const g = openGame(1, 10000);
    g.state.player.level = 3;
    expect(findPath(g.world.grid, DOOR_TILE, { x: 3, y: 3 })).toBeNull();
    expect(g.shopMgr.expand()).toBe(true);
    expect(g.shop.construction).toBeDefined();
    g.runFor(5);
    expect(g.shop.size).toBe(4);
    expect(g.world.grid.size).toBe(4);
    expect(findPath(g.world.grid, DOOR_TILE, { x: 3, y: 3 })).not.toBeNull();
  });

  it('expanding while NPCs move does not break them', () => {
    const g = openGame(9, 10000);
    g.state.player.level = 3;
    g.runFor(20);
    expect(g.world.customers.length).toBeGreaterThan(0);
    g.shopMgr.expand();
    g.runFor(60);
    expect(g.errors).toEqual([]);
    expect(g.state.stats.customersServed).toBeGreaterThan(0);
  });

  it('rejects placements that block the door or overlap', () => {
    const g = openGame(1, 10000);
    expect(g.shopMgr.canPlace('shelf', 2, 0).ok).toBe(false); // occupied
    expect(g.shopMgr.canPlace('shelf', 0, 1).ok).toBe(false); // door
    expect(g.shopMgr.canPlace('shelf', 1, 0).ok).toBe(false); // stockroom
    expect(g.shopMgr.canPlace('shelf', 9, 9).reason).toBe('out_of_bounds');
    // (1,1) is the only tile linking the door to the rest of the tiny shop.
    expect(g.shopMgr.canPlace('plant', 1, 1).ok).toBe(false);
  });

  it('buying a shelf places a stocked displayer; upgrading raises capacity', () => {
    const g = openGame(1, 10000);
    g.state.player.level = 5;
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    const spot = g.shopMgr.findSpot('shelf')!;
    const s = g.shopMgr.buy('shelf', spot.x, spot.y, spot.dir)!;
    expect(s).toBeTruthy();
    expect(s.stock).toBe(g.shopMgr.capacity(s));
    const cap = g.shopMgr.capacity(s);
    expect(g.shopMgr.upgrade(s.uid)).toBe(true);
    expect(g.shopMgr.capacity(s)).toBeGreaterThan(cap);
  });

  it('cannot sell the last checkout or last display', () => {
    const g = openGame(1, 10000);
    const co = g.shopMgr.checkouts()[0];
    expect(g.shopMgr.sell(co.uid)).toBe(false);
    expect(g.shopMgr.sell(g.shopMgr.displays()[0].uid)).toBe(false);
  });

  it('departments grant a free object and products', () => {
    const g = openGame(1, 10000);
    g.state.player.level = 3;
    g.shopMgr.expand();
    g.shopMgr.completeExpansion();
    expect(g.shopMgr.unlockDepartment('drinks')).toBe(true);
    expect(g.state.progression.unlockedProducts).toContain('soda');
    expect(g.shop.objects.some((o) => o.kind === 'fridge' && o.productId === 'soda') || g.shop.pendingPlacements.length > 0).toBe(true);
  });
});

describe('edge cases & anti-exploit', () => {
  it('player has exactly enough money for an upgrade', () => {
    const g = openGame(1);
    const shelf = g.shopMgr.displays()[0];
    g.state.player.money = g.shopMgr.upgradeCost(shelf)!;
    expect(g.shopMgr.upgrade(shelf.uid)).toBe(true);
    expect(g.state.player.money).toBe(0);
  });

  it('rapid taps on an unaffordable/unavailable upgrade change nothing', () => {
    const g = openGame(1);
    g.state.player.money = 5;
    const shelf = g.shopMgr.displays()[0];
    for (let i = 0; i < 20; i++) g.shopMgr.upgrade(shelf.uid);
    expect(shelf.tier).toBe(0);
    expect(g.state.player.money).toBe(5);
    for (let i = 0; i < 20; i++) g.upgrades.buy('smart_ordering');
    expect(g.state.player.money).toBe(5);
  });

  it('inventory reaches 0 and maximum safely', () => {
    const g = openGame(1);
    const shelf = g.shopMgr.displays()[0];
    shelf.stock = 1;
    expect(g.inventory.take(shelf)).toBe(true);
    expect(g.inventory.take(shelf)).toBe(false);
    expect(shelf.stock).toBe(0);
    expect(g.inventory.status(shelf)).toBe('out');
    expect(g.inventory.deliver(shelf.uid, 9999)).toBe(g.shopMgr.capacity(shelf));
    expect(g.inventory.deliver(shelf.uid, 5)).toBe(0);
  });

  it('manual restock has a cooldown', () => {
    const g = openGame(1);
    const shelf = g.shopMgr.displays()[0];
    shelf.stock = 0;
    expect(g.inventory.manualRestock(shelf.uid)).toBe(true);
    shelf.stock = 0;
    expect(g.inventory.manualRestock(shelf.uid)).toBe(false);
    g.runFor(ECONOMY.restock.manualCooldown + 0.1);
    shelf.stock = 0;
    expect(g.inventory.manualRestock(shelf.uid)).toBe(true);
  });

  it('full queues make customers wait instead of overlapping', () => {
    const g = openGame(2);
    const co = g.shopMgr.checkouts()[0];
    const max = g.checkout.maxQueue(co.uid);
    for (let i = 0; i < max + 3; i++) {
      const c = g.customers.spawn('regular')!;
      c.basket.push({ productId: 'crisps', price: 0, cost: 0 });
      c.wants = [];
      c.state = 'to_queue';
      c.pos = { x: 1.5, y: 1.5 };
      c.path = [];
    }
    g.runFor(0.2);
    expect(g.world.checkouts.get(co.uid)!.queue.length).toBeLessThanOrEqual(max);
    expect(g.world.customers.some((c) => c.state === 'wait_queue' || c.angry)).toBe(true);
  });

  it('quest rewards cannot be claimed twice', () => {
    const g = newGame();
    g.shopMgr.openShop();
    g.quests.evaluate();
    const q = g.state.progression.activeQuests[0];
    expect(q.completed).toBe(true);
    expect(g.quests.claim(q.id)).toBe(true);
    expect(g.quests.claim(q.id)).toBe(false);
  });

  it('achievements pay stars once', () => {
    const g = openGame(1);
    g.state.player.lifetimeCustomers = 1;
    g.achievements.evaluate();
    expect(g.achievements.claim('first_sale')).toBe(true);
    const s = g.state.player.stars;
    expect(g.achievements.claim('first_sale')).toBe(false);
    expect(g.state.player.stars).toBe(s);
  });

  it('mystery crate can only be collected once', () => {
    const g = openGame(1);
    g.events.spawnCrate();
    expect(g.events.collectCrate()).toBe(true);
    expect(g.events.collectCrate()).toBe(false);
  });

  it('game speed does not change timestamps and stays deterministic', () => {
    const a = openGame(4);
    const b = openGame(4);
    b.setSpeed(10);
    b.celebrate = () => {}; // level-up slow-mo is intentional; exclude it here
    for (let i = 0; i < 100; i++) b.update(0.1); // 10s real × 10 = 100s sim
    a.runFor(100);
    expect(b.simTime).toBeCloseTo(a.simTime, 0);
    expect(b.state.timestamps.lastSave).toBe(a.state.timestamps.lastSave);
  });

  it('frame rate does not change economy (fixed timestep)', () => {
    const a = openGame(8);
    const b = openGame(8);
    for (let i = 0; i < 60 * 30; i++) a.update(1 / 60);
    for (let i = 0; i < 144 * 30; i++) b.update(1 / 144);
    expect(Math.abs(a.simTime - b.simTime)).toBeLessThan(0.1);
    expect(Math.abs(a.state.stats.itemsSold - b.state.stats.itemsSold)).toBeLessThanOrEqual(2);
  });

  it('a broken customer is isolated and removed', () => {
    const g = openGame(1);
    const c = g.customers.spawn('regular')!;
    (c as any).pos = null;
    g.runFor(1);
    expect(g.world.customers.includes(c)).toBe(false);
    g.errors.length = 0;
    g.runFor(30);
    expect(g.errors).toEqual([]);
    expect(g.state.stats.customersServed + g.world.customers.length).toBeGreaterThan(0);
  });

  it('events: rush hour scores served/lost and pays a bonus', () => {
    const g = openGame(6, 1000);
    g.state.player.level = 4;
    let summary: any;
    g.bus.on('eventEnded', (e) => (summary = e.summary));
    g.events.start('rush_hour');
    g.runFor(50);
    expect(summary).toBeDefined();
    expect(summary.served).toBeGreaterThan(0);
  });

  it('locations unlock and switching keeps both shops', () => {
    const g = openGame(1, 1e6);
    g.state.player.level = 10;
    g.state.player.reputation = 1000;
    expect(g.locations.unlock('downtown')).toBe(true);
    expect(g.locations.switchTo('downtown')).toBe(true);
    expect(g.shop.locationId).toBe('downtown');
    expect(g.shop.size).toBeGreaterThan(3);
    g.runFor(30);
    expect(g.errors).toEqual([]);
    g.state.shops.neighborhood.incomeRate = 10;
    const m = g.state.player.money;
    g.runFor(10);
    expect(g.state.player.money).toBeGreaterThan(m);
  });

  it('new game from a fresh state boots without errors', () => {
    const g = new Game(createInitialState(0, 1), { seed: 1, now: () => 0 });
    g.runFor(5);
    expect(g.errors).toEqual([]);
  });
});
