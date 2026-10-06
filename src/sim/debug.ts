import type { Game } from './game';
import { PRODUCTS } from '../config/products';
import { LOCATIONS } from '../config/locations';
import { DEPARTMENTS } from '../config/departments';
import { createShop } from '../core/state';
import { xpForLevel } from '../config/economy';

/** Developer tools. Only exposed in development builds by the UI. */
export class DebugTools {
  constructor(private game: Game) {}

  addMoney(n = 10000): void {
    this.game.economy.earn(n, false);
  }

  addStars(n = 10): void {
    this.game.economy.addStars(n);
  }

  addXp(n?: number): void {
    this.game.progression.addXp(n ?? xpForLevel(this.game.state.player.level));
  }

  unlockAllProducts(): void {
    for (const d of DEPARTMENTS) if (!this.game.shop.departments.includes(d.id)) this.game.shop.departments.push(d.id);
    for (const p of PRODUCTS) if (!p.season) this.game.progression.grantProduct(p.id, false);
    this.game.onLayoutChanged();
  }

  unlockAllLocations(): void {
    const st = this.game.state;
    for (const l of LOCATIONS) {
      if (!st.progression.unlockedLocations.includes(l.id)) {
        st.progression.unlockedLocations.push(l.id);
        st.shops[l.id] = createShop(l.id);
      }
    }
  }

  spawnCustomers(n = 5): void {
    for (let i = 0; i < n; i++) this.game.customers.spawn();
  }

  triggerRush(): void {
    this.game.events.start('rush_hour');
  }

  triggerEvent(id: string): void {
    this.game.events.start(id);
  }

  completeQuest(): void {
    const q = this.game.state.progression.activeQuests[0];
    if (q) {
      q.completed = true;
      this.game.quests.claim(q.id);
    }
  }

  upgradeShop(): void {
    this.game.economy.earn(1e7, false);
    while (this.game.state.player.level < 25 && this.game.shopMgr.nextExpansion() && this.game.state.player.level < this.game.shopMgr.nextExpansion()!.requiredLevel) this.addXp();
    if (this.game.shopMgr.expand()) this.game.shopMgr.completeExpansion();
  }

  resetShop(): void {
    const st = this.game.state;
    st.shops[st.player.currentLocation] = createShop(st.player.currentLocation);
    st.shops[st.player.currentLocation].open = true;
    this.game.rebuildWorld();
  }

  setSpeed(s: number): void {
    this.game.setSpeed(s);
  }

  forceSeason(id: string | null): void {
    this.game.state.debug = { ...(this.game.state.debug ?? {}), forcedSeason: id };
  }
}
