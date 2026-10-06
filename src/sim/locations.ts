import type { Game } from './game';
import { LOCATIONS, LOCATION_MAP } from '../config/locations';
import { createShop } from '../core/state';

/** LocationManager: unlocking and switching between shops. Inactive shops earn passively. */
export class LocationManager {
  constructor(private game: Game) {}

  list() {
    return LOCATIONS;
  }

  owned(id: string): boolean {
    return this.game.state.progression.unlockedLocations.includes(id);
  }

  canUnlock(id: string): { ok: boolean; reason?: string } {
    const def = LOCATION_MAP[id];
    const g = this.game;
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.owned(id)) return { ok: false, reason: 'owned' };
    if (g.state.player.level < def.requiredLevel) return { ok: false, reason: 'level' };
    if (g.progression.repTier() < def.requiredRepTier) return { ok: false, reason: 'reputation' };
    if (!g.economy.canAfford(def.unlockCost)) return { ok: false, reason: 'money' };
    return { ok: true };
  }

  unlock(id: string): boolean {
    if (!this.canUnlock(id).ok) return false;
    const g = this.game;
    if (!g.economy.spend(LOCATION_MAP[id].unlockCost, `location:${id}`)) return false;
    g.state.progression.unlockedLocations.push(id);
    g.state.shops[id] = createShop(id);
    for (const d of g.state.shops[id].departments) {
      // Starting departments grant their free products.
      if (d === 'drinks') g.progression.grantProduct('soda', false);
    }
    g.bus.emit('locationUnlocked', { id });
    g.analytics('location_unlocked', { id });
    return true;
  }

  switchTo(id: string): boolean {
    const g = this.game;
    if (!this.owned(id) || !g.state.shops[id] || g.state.player.currentLocation === id) return false;
    g.state.player.currentLocation = id;
    g.rebuildWorld();
    g.shopMgr.autoPlacePending();
    g.bus.emit('locationSwitched', { id });
    return true;
  }

  /** Passive income of all non-active shops per second. */
  passiveIncome(): number {
    const g = this.game;
    let s = 0;
    for (const id of g.state.progression.unlockedLocations) {
      if (id === g.state.player.currentLocation) continue;
      s += (g.state.shops[id]?.incomeRate ?? 0) * 0.5;
    }
    return s;
  }
}
