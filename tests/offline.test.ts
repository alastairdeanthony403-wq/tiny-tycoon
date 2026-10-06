import { describe, it, expect } from 'vitest';
import { computeOffline } from '../src/sim/offline';
import { ECONOMY } from '../src/config/economy';
import { newGame, T0 } from './helpers';

const H = 3600 * 1000;

describe('computeOffline', () => {
  it('pays rate × efficiency × time', () => {
    const r = computeOffline({ lastSave: 0, now: H, ratePerSec: 10, efficiency: 0.3, capSeconds: 7200 });
    expect(r.seconds).toBe(3600);
    expect(r.amount).toBe(10800);
  });

  it('caps very large offline durations', () => {
    const r = computeOffline({ lastSave: 0, now: 1000 * H, ratePerSec: 10, efficiency: 0.5, capSeconds: 7200 });
    expect(r.seconds).toBe(7200);
    expect(r.amount).toBe(36000);
  });

  it('gives nothing when the system clock moved backwards', () => {
    expect(computeOffline({ lastSave: H, now: 0, ratePerSec: 10, efficiency: 0.5, capSeconds: 7200 })).toEqual({ seconds: 0, amount: 0 });
  });

  it('handles garbage input safely', () => {
    expect(computeOffline({ lastSave: NaN, now: H, ratePerSec: 10, efficiency: 0.5, capSeconds: 7200 }).amount).toBe(0);
    expect(computeOffline({ lastSave: 0, now: H, ratePerSec: -5, efficiency: 0.5, capSeconds: 7200 }).amount).toBe(0);
    expect(computeOffline({ lastSave: 0, now: H, ratePerSec: 10, efficiency: 50, capSeconds: 3600 }).amount).toBe(36000);
  });

  it('offline income is weaker than active play', () => {
    expect(ECONOMY.offline.baseEfficiency).toBeLessThan(1);
    expect(ECONOMY.offline.maxEfficiency).toBeLessThan(1);
  });
});

describe('OfflineManager', () => {
  it('computes once, can be claimed only once, and moves the timestamp', () => {
    const g = newGame();
    g.shop.incomeRate = 5;
    g.state.timestamps.lastSave = T0;
    const res = g.offline.compute(T0 + H);
    expect(res).not.toBeNull();
    expect(res!.amount).toBeGreaterThan(0);
    expect(g.state.timestamps.lastSave).toBe(T0 + H);
    // Recomputing immediately gives nothing new (no re-use of the same window).
    expect(g.offline.compute(T0 + H)).toBeNull();
    const before = g.state.player.money;
    const paid = g.offline.claim();
    expect(paid).toBe(res!.amount);
    expect(g.state.player.money).toBe(before + paid);
    expect(g.offline.claim()).toBe(0);
  });

  it('ignores short absences', () => {
    const g = newGame();
    g.shop.incomeRate = 5;
    expect(g.offline.compute(T0 + 10_000)).toBeNull();
  });

  it('night shift upgrades raise efficiency and cap', () => {
    const g = newGame();
    const e0 = g.mods.offlineEfficiency();
    const c0 = g.mods.offlineCapSeconds();
    g.state.globalUpgrades.night_shift = 3;
    expect(g.mods.offlineEfficiency()).toBeGreaterThan(e0);
    expect(g.mods.offlineCapSeconds()).toBeGreaterThan(c0);
    g.state.globalUpgrades.night_shift = 999;
    expect(g.mods.offlineEfficiency()).toBeLessThanOrEqual(ECONOMY.offline.maxEfficiency);
    expect(g.mods.offlineCapSeconds()).toBeLessThanOrEqual(ECONOMY.offline.maxCapHours * 3600);
  });
});
