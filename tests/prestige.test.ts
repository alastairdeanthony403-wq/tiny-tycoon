import { describe, it, expect } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import { newGame } from './helpers';

describe('franchise / prestige', () => {
  it('is locked until level and run revenue requirements are met', () => {
    const g = newGame();
    expect(g.prestige.canFranchise().ok).toBe(false);
    g.state.player.level = ECONOMY.prestige.minLevel;
    g.state.player.runRevenue = ECONOMY.prestige.minRunRevenue - 1;
    expect(g.prestige.canFranchise().reason).toBe('revenue');
    expect(g.prestige.franchise()).toBe(false);
  });

  it('star reward grows with revenue (sub-linearly)', () => {
    const g = newGame();
    const a = g.prestige.starsForFranchise(ECONOMY.prestige.minRunRevenue);
    const b = g.prestige.starsForFranchise(ECONOMY.prestige.minRunRevenue * 4);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(a * 4);
    expect(g.prestige.starsForFranchise(0)).toBe(0);
  });

  it('resets the run but keeps stars, perks, achievements and lifetime stats', () => {
    const g = newGame();
    g.state.player.level = 15;
    g.state.player.runRevenue = 500000;
    g.state.player.lifetimeRevenue = 600000;
    g.state.player.money = 99999;
    g.state.perks.revenue = 2;
    g.state.globalUpgrades.marketing = 5;
    g.state.progression.achievements.first_sale = { unlocked: true, claimed: true };
    const stars = g.prestige.starsForFranchise();
    expect(g.prestige.franchise()).toBe(true);
    expect(g.state.player.prestigeCount).toBe(1);
    expect(g.state.player.stars).toBe(stars);
    expect(g.state.player.level).toBe(1);
    expect(g.state.player.money).toBe(ECONOMY.startingCash);
    expect(g.state.globalUpgrades.marketing).toBeUndefined();
    expect(g.state.perks.revenue).toBe(2);
    expect(g.state.player.lifetimeRevenue).toBe(600000);
    expect(g.state.progression.achievements.first_sale.claimed).toBe(true);
    expect(g.shop.size).toBe(3);
    expect(g.state.progression.tutorialDone).toBe(true);
    // Permanent bonus applies to prices.
    expect(g.mods.franchiseBonus()).toBeCloseTo(ECONOMY.prestige.revenueBonusPerFranchise);
  });

  it('perks cost stars and apply start cash on the next run', () => {
    const g = newGame();
    g.state.player.stars = 100;
    expect(g.prestige.buyPerk('start_cash')).toBe(true);
    expect(g.state.player.stars).toBeLessThan(100);
    g.state.player.level = 15;
    g.state.player.runRevenue = 200000;
    g.prestige.franchise();
    expect(g.state.player.money).toBe(ECONOMY.startingCash + 150);
  });

  it('cannot buy perks or themes without stars', () => {
    const g = newGame();
    g.state.player.stars = 0;
    expect(g.prestige.buyPerk('revenue')).toBe(false);
    expect(g.prestige.buyTheme('neon')).toBe(false);
    expect(g.state.player.stars).toBe(0);
  });
});
