import { describe, it, expect } from 'vitest';
import { ECONOMY, scaledCost, xpForLevel } from '../src/config/economy';
import { PRODUCTS, profitOf } from '../src/config/products';
import { newGame } from './helpers';

describe('economy formulas', () => {
  it('scaledCost grows geometrically and is never negative', () => {
    expect(scaledCost(20, 2, 0)).toBe(20);
    expect(scaledCost(20, 2, 3)).toBe(160);
    expect(scaledCost(20, 2, -5)).toBe(20);
  });

  it('xp requirement increases with level', () => {
    for (let l = 1; l < 30; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });

  it('every product has a positive profit; premium earns more per unit than cheap', () => {
    for (const p of PRODUCTS) expect(profitOf(p)).toBeGreaterThan(0);
    const cheap = PRODUCTS.filter((p) => p.rarity === 'common');
    const premium = PRODUCTS.filter((p) => p.rarity === 'premium');
    const avg = (xs: typeof PRODUCTS) => xs.reduce((s, p) => s + profitOf(p), 0) / xs.length;
    expect(avg(premium)).toBeGreaterThan(avg(cheap));
    const avgDemand = (xs: typeof PRODUCTS) => xs.reduce((s, p) => s + p.demand, 0) / xs.length;
    expect(avgDemand(cheap)).toBeGreaterThan(avgDemand(premium));
  });

  it('snack economy matches the design example (cost £2, sale £4)', () => {
    const crisps = PRODUCTS.find((p) => p.id === 'crisps')!;
    expect(crisps.cost).toBe(2);
    expect(crisps.price).toBe(4);
    expect(ECONOMY.startingCash).toBe(50);
  });
});

describe('EconomyManager transactions', () => {
  it('spending exactly all money works and leaves £0', () => {
    const g = newGame();
    g.state.player.money = 100;
    expect(g.economy.spend(100)).toBe(true);
    expect(g.state.player.money).toBe(0);
  });

  it('cannot spend at £0 and money never goes negative', () => {
    const g = newGame();
    g.state.player.money = 0;
    expect(g.economy.spend(1)).toBe(false);
    expect(g.state.player.money).toBe(0);
  });

  it('rejects invalid amounts', () => {
    const g = newGame();
    const m = g.state.player.money;
    expect(g.economy.spend(-50)).toBe(false);
    expect(g.economy.spend(NaN)).toBe(false);
    expect(g.economy.spend(Infinity)).toBe(false);
    expect(g.economy.earn(NaN)).toBe(0);
    expect(g.economy.earn(-10)).toBe(0);
    expect(g.state.player.money).toBe(m);
  });

  it('clamps money to the maximum (no overflow)', () => {
    const g = newGame();
    g.economy.earn(ECONOMY.maxMoney * 10);
    expect(g.state.player.money).toBe(ECONOMY.maxMoney);
    g.economy.earn(1e20);
    expect(Number.isFinite(g.state.player.money)).toBe(true);
  });

  it('a sale credits profit (price - cost) and tracks revenue', () => {
    const g = newGame();
    const before = g.state.player.money;
    const credited = g.economy.recordSale([{ productId: 'crisps', price: 4, cost: 2 }, { productId: 'crisps', price: 4, cost: 2 }], 0);
    expect(credited).toBe(4);
    expect(g.state.player.money).toBe(before + 4);
    expect(g.state.player.lifetimeRevenue).toBe(8);
    expect(g.state.stats.itemsSold).toBe(2);
    expect(g.state.stats.customersServed).toBe(1);
    expect(g.state.stats.soldByCategory.snacks).toBe(2);
  });

  it('pricing upgrade raises unit price; supplier discount lowers unit cost', () => {
    const g = newGame();
    const base = g.economy.unitPrice('crisps');
    g.state.globalUpgrades.pricing = 2;
    expect(g.economy.unitPrice('crisps')).toBeCloseTo(base * 1.16);
    const cost = g.economy.unitCost('crisps');
    g.state.player.level = 5;
    g.events.start('supplier_discount');
    expect(g.economy.unitCost('crisps')).toBeCloseTo(cost * 0.5);
  });

  it('wages never push money negative', () => {
    const g = newGame();
    g.shop.staff.push({ id: 1, type: 'stocker', name: 'A', level: 1, trait: 'fast' });
    g.state.player.money = 1;
    g.runFor(61);
    expect(g.state.player.money).toBeGreaterThanOrEqual(0);
  });
});
