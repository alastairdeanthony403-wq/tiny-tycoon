import type { Game } from './game';
import { UPGRADES, UPGRADE_MAP } from '../config/upgrades';
import { ECONOMY, scaledCost } from '../config/economy';

/** UpgradeManager: company-wide upgrades (marketing, pricing, comfort, ...). */
export class UpgradeManager {
  constructor(private game: Game) {}

  level(id: string): number {
    return this.game.state.globalUpgrades[id] ?? 0;
  }

  cost(id: string): number | null {
    const def = UPGRADE_MAP[id];
    if (!def) return null;
    const lvl = this.level(id);
    if (lvl >= def.maxLevel) return null;
    return scaledCost(def.baseCost, def.costGrowth, lvl);
  }

  canBuy(id: string): { ok: boolean; reason?: string } {
    const def = UPGRADE_MAP[id];
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.game.state.player.level < def.requiredLevel) return { ok: false, reason: 'level' };
    const c = this.cost(id);
    if (c === null) return { ok: false, reason: 'max' };
    if (!this.game.economy.canAfford(c)) return { ok: false, reason: 'money' };
    return { ok: true };
  }

  buy(id: string): boolean {
    if (!this.canBuy(id).ok) return false;
    const c = this.cost(id)!;
    if (!this.game.economy.spend(c, `upgrade:${id}`)) return false;
    this.game.state.globalUpgrades[id] = this.level(id) + 1;
    this.game.state.stats.upgradesBought++;
    this.game.progression.addXp(ECONOMY.xp.perUpgrade);
    this.game.bus.emit('upgradePurchased', { id, level: this.level(id) });
    this.game.analytics('upgrade_purchased', { id, level: this.level(id) });
    return true;
  }

  /** Human-readable before → after preview of an upgrade's effect. */
  preview(id: string): { current: number; next: number; unit: '%' | 'h' } {
    const def = UPGRADE_MAP[id];
    const lvl = this.level(id);
    if (id === 'night_shift') return { current: Math.round((ECONOMY.offline.baseEfficiency + lvl * def.perLevel) * 100), next: Math.round((ECONOMY.offline.baseEfficiency + (lvl + 1) * def.perLevel) * 100), unit: '%' };
    return { current: Math.round(lvl * def.perLevel * 100), next: Math.round((lvl + 1) * def.perLevel * 100), unit: '%' };
  }

  list() {
    return UPGRADES;
  }
}
