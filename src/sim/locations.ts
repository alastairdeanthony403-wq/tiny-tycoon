import type { Game } from './game';
import { LOCATIONS, LOCATION_MAP } from '../config/locations';
import { createShop } from '../core/state';
import { mapFor, type PlotDef } from '../world/maps';

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

  // ---------------------------------------------------------------- plots

  /** Shop plots of a location's map, with whether the player may move there. */
  plots(id: string): { def: PlotDef; current: boolean; ok: boolean; reason?: string }[] {
    const shop = this.game.state.shops[id];
    return mapFor(id).plots.map((def, i) => {
      const current = shop ? shop.plotId === def.id : i === 0;
      const c = this.canChoosePlot(id, def.id);
      return { def, current, ok: c.ok, reason: c.reason };
    });
  }

  canChoosePlot(locationId: string, plotId: string): { ok: boolean; reason?: string } {
    const shop = this.game.state.shops[locationId];
    const plot = mapFor(locationId).plots.find((p) => p.id === plotId);
    if (!plot || !LOCATION_MAP[locationId]) return { ok: false, reason: 'unknown' };
    if (!shop || !this.owned(locationId)) return { ok: false, reason: 'not_owned' };
    if (shop.plotId === plotId) return { ok: false, reason: 'current' };
    if (shop.construction) return { ok: false, reason: 'building' };
    if (this.game.state.player.level < (plot.requiredLevel ?? 1)) return { ok: false, reason: 'level' };
    return { ok: true };
  }

  /**
   * Moves a shop to another plot of its map. Only the surroundings change: the shop keeps its
   * size, layout, stock, staff and progress. The UI asks for confirmation first.
   */
  choosePlot(locationId: string, plotId: string): boolean {
    if (!this.canChoosePlot(locationId, plotId).ok) return false;
    this.game.state.shops[locationId].plotId = plotId;
    this.game.bus.emit('plotChanged', { locationId, plotId });
    this.game.analytics('plot_changed', { location: locationId, plot: plotId });
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
