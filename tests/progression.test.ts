import { describe, it, expect } from 'vitest';
import { xpForLevel, ECONOMY } from '../src/config/economy';
import { newGame } from './helpers';

describe('XP and levels', () => {
  it('levels up when XP threshold reached, carrying over remainder and paying rewards', () => {
    const g = newGame();
    const events: number[] = [];
    g.bus.on('levelUp', (e) => events.push(e.level));
    const money = g.state.player.money;
    g.progression.addXp(xpForLevel(1) + 3);
    expect(g.state.player.level).toBe(2);
    expect(g.state.player.xp).toBe(3);
    expect(events).toEqual([2]);
    expect(g.state.player.money).toBe(money + ECONOMY.xp.levelMoneyReward(2));
  });

  it('handles multiple level-ups from one big XP grant', () => {
    const g = newGame();
    g.progression.addXp(xpForLevel(1) + xpForLevel(2) + xpForLevel(3));
    expect(g.state.player.level).toBe(4);
    expect(g.state.player.xp).toBe(0);
  });

  it('ignores invalid XP', () => {
    const g = newGame();
    g.progression.addXp(-5);
    g.progression.addXp(NaN);
    expect(g.state.player.xp).toBe(0);
  });

  it('level-up lists newly unlocked content', () => {
    const g = newGame();
    const u = g.progression.unlocksAt(5);
    expect(u.some((x) => x.kind === 'department' && x.id === 'bakery')).toBe(true);
  });
});

describe('reputation', () => {
  it('tiers increase and never drop below the reached tier floor', () => {
    const g = newGame();
    expect(g.progression.repTier()).toBe(1);
    g.progression.addReputation(ECONOMY.reputation.tiers[1]);
    expect(g.progression.repTier()).toBe(2);
    g.progression.addReputation(-1000);
    expect(g.progression.repTier()).toBe(2);
    expect(g.state.player.reputation).toBe(ECONOMY.reputation.tiers[1]);
  });
});

describe('products', () => {
  it('unlocking requires level, department and money, and is idempotent', () => {
    const g = newGame();
    expect(g.progression.canUnlockProduct('candy').reason).toBe('level');
    g.state.player.level = 2;
    g.state.player.money = 0;
    expect(g.progression.canUnlockProduct('candy').reason).toBe('money');
    g.state.player.money = 1000;
    expect(g.progression.unlockProduct('candy')).toBe(true);
    const m = g.state.player.money;
    expect(g.progression.unlockProduct('candy')).toBe(false);
    expect(g.state.player.money).toBe(m);
    expect(g.progression.canUnlockProduct('soda').reason).toBe('department');
  });

  it('seasonal products are only available in season', () => {
    const g = newGame();
    expect(g.progression.isProductAvailable('pumpkin_pie')).toBe(false);
    g.debug.forceSeason('halloween');
    expect(g.progression.isProductAvailable('pumpkin_pie')).toBe(true);
  });
});
