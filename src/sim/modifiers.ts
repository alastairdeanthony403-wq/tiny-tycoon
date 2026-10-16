import type { Game } from './game';
import { ECONOMY } from '../config/economy';
import { UPGRADE_MAP } from '../config/upgrades';
import { PERK_MAP } from '../config/prestige';
import { EVENT_MAP } from '../config/events';
import { LOCATION_MAP } from '../config/locations';
import { OBJECT_MAP } from '../config/objects';
import { activeSeasons } from '../config/seasons';
import type { StoreManager } from './store';

/** Aggregates every multiplier from upgrades, perks, events, location and achievements. */
export class Modifiers {
  constructor(private game: Game) {}

  upgrade(id: string): number {
    return (this.game.state.globalUpgrades[id] ?? 0) * (UPGRADE_MAP[id]?.perLevel ?? 0);
  }

  perk(id: string): number {
    return (this.game.state.perks[id] ?? 0) * (PERK_MAP[id]?.perLevel ?? 0);
  }

  private eventEffect<K extends 'spawnMult' | 'priceMult' | 'costMult' | 'patienceMult'>(key: K): number {
    let m = 1;
    for (const e of this.game.state.events.active) {
      const v = EVENT_MAP[e.id]?.effects[key];
      if (typeof v === 'number') m *= v;
    }
    return m;
  }

  get location() {
    return LOCATION_MAP[this.game.shop.locationId] ?? LOCATION_MAP.neighborhood;
  }

  machinesOff(): boolean {
    return this.game.state.events.active.some((e) => EVENT_MAP[e.id]?.effects.machinesOff);
  }

  achievementBonus(): number {
    let n = 0;
    for (const a of Object.values(this.game.state.progression.achievements)) if (a.claimed) n++;
    return n * ECONOMY.achievementRevenueBonus;
  }

  franchiseBonus(): number {
    return this.game.state.player.prestigeCount * ECONOMY.prestige.revenueBonusPerFranchise;
  }

  /** Multiplier applied to sale prices. */
  priceMult(): number {
    return (
      (1 + this.upgrade('pricing')) *
      (1 + this.perk('revenue')) *
      (1 + this.franchiseBonus()) *
      (1 + this.achievementBonus()) *
      this.location.spendMult *
      this.eventEffect('priceMult') *
      (this.game.ads?.priceMult() ?? 1) *
      (this.game.store?.boostMult('price') ?? 1)
    );
  }

  costMult(): number {
    return this.eventEffect('costMult');
  }

  repTier(): number {
    return this.game.progression.repTier();
  }

  spawnMult(): number {
    const shop = this.game.shop;
    const sat = shop.satisfaction / 100;
    const variety = 0.8 + 0.1 * Math.min(6, this.game.inventory.distinctProductsOnDisplay());
    return (
      (1 + this.upgrade('marketing')) *
      (1 + (this.repTier() - 1) * ECONOMY.reputation.spawnBonusPerTier) *
      (0.75 + 0.5 * sat) *
      variety *
      this.location.trafficMult *
      (1 + this.perk('fame')) *
      this.eventEffect('spawnMult') *
      (this.game.store?.boostMult('spawn') ?? 1)
    );
  }

  patienceMult(): number {
    return (1 + this.upgrade('comfort')) * this.eventEffect('patienceMult') * (1 + this.managerBoost() * 0.5) * (1 + this.storePerk('patience'));
  }

  passiveRestockMult(): number {
    return 1 + this.upgrade('restock_speed');
  }

  capacityMult(): number {
    return (1 + this.upgrade('storage')) * (1 + this.storePerk('capacity'));
  }

  staffSpeedMult(): number {
    return (1 + this.perk('staff_training')) * (1 + this.managerBoost()) * (1 + this.storePerk('staff_speed')) * (this.game.store?.boostMult('staff_speed') ?? 1);
  }

  customerSpeedMult(): number {
    return 1 + this.perk('customer_speed');
  }

  stockerCarry(): number {
    return Math.round(ECONOMY.restock.stockerCarry * (1 + this.upgrade('smart_ordering')));
  }

  dirtMult(): number {
    return Math.max(0.1, 1 - this.upgrade('doormat'));
  }

  managerBoost(): number {
    let b = 0;
    for (const e of this.game.shop.staff) if (e.type === 'manager') b += 0.1 + 0.04 * (e.level - 1);
    return b;
  }

  appeal(): number {
    let a = 0;
    for (const o of this.game.shop.objects) a += OBJECT_MAP[o.kind]?.appeal ?? 0;
    return Math.min(ECONOMY.satisfaction.appealCap, a);
  }

  offlineEfficiency(): number {
    return Math.min(ECONOMY.offline.maxEfficiency, ECONOMY.offline.baseEfficiency + this.upgrade('night_shift') + this.perk('offline_office'));
  }

  offlineCapSeconds(): number {
    const hours = Math.min(ECONOMY.offline.maxCapHours, ECONOMY.offline.baseCapHours + (this.game.state.globalUpgrades.night_shift ?? 0) + (this.game.state.perks.offline_office ?? 0));
    return (hours + this.storePerk('offline_hours')) * 3600;
  }

  /** Gem upgrade bonus (Premium Store → Upgrades). */
  storePerk(effect: Parameters<StoreManager['perkBonus']>[0]): number {
    return this.game.store?.perkBonus(effect) ?? 0;
  }

  /** Checkout service speed multiplier from Gem upgrades. */
  checkoutSpeedMult(): number {
    return 1 + this.storePerk('checkout_speed');
  }

  /** Wage multiplier from Gem upgrades (never below half). */
  wageMult(): number {
    return Math.max(0.5, 1 - this.storePerk('wages'));
  }

  seasons() {
    return activeSeasons(new Date(this.game.now()), this.game.state.debug?.forcedSeason ?? null);
  }
}
