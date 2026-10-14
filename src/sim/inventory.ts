import type { Game } from './game';
import type { PlacedObject } from '../core/types';
import { OBJECT_MAP } from '../config/objects';
import { getProduct } from '../config/products';
import { ECONOMY } from '../config/economy';
import { STAFF_LEVEL_SPEED, TRAIT_MAP } from '../config/staff';

export type StockStatus = 'ok' | 'low' | 'out';

/** InventoryManager: stock levels, passive restocking, machine production, manual restock. */
export class InventoryManager {
  constructor(private game: Game) {}

  status(o: PlacedObject): StockStatus {
    const cap = this.game.shopMgr.capacity(o);
    if (o.stock <= 0) return 'out';
    if (o.stock / Math.max(1, cap) <= ECONOMY.restock.lowStockRatio) return 'low';
    return 'ok';
  }

  distinctProductsOnDisplay(): number {
    const s = new Set<string>();
    for (const o of this.game.shop.objects) if (o.productId && OBJECT_MAP[o.kind]?.category === 'display') s.add(o.productId);
    return s.size;
  }

  displayersFor(productId: string): PlacedObject[] {
    return this.game.shop.objects.filter((o) => o.productId === productId && OBJECT_MAP[o.kind]?.category === 'display');
  }

  /** Products currently on display (with or without stock). */
  productsOnDisplay(): string[] {
    const s = new Set<string>();
    for (const o of this.game.shop.objects) if (o.productId && OBJECT_MAP[o.kind]?.category === 'display') s.add(o.productId);
    return [...s];
  }

  isMachine(o: PlacedObject): boolean {
    return OBJECT_MAP[o.kind]?.display === 'machine';
  }

  /** Chef work multiplier at a machine (0.7 without a chef). */
  machineSpeed(o: PlacedObject): number {
    if (this.game.mods.machinesOff()) return 0;
    const tier = this.game.shopMgr.tierOf(o);
    let chef = 0.7;
    for (const e of this.game.world.employees) {
      if (e.type !== 'chef' || e.task.kind !== 'at_station' || e.task.uid !== o.uid) continue;
      const data = this.game.shop.staff.find((s) => s.id === e.id);
      if (!data) continue;
      chef = 1.6 * STAFF_LEVEL_SPEED[data.level - 1] * (TRAIT_MAP[data.trait]?.workMult ?? 1) * this.game.mods.staffSpeedMult();
    }
    return (tier.speed ?? 1) * chef;
  }

  canManualRestock(o: PlacedObject): boolean {
    if (OBJECT_MAP[o.kind]?.category !== 'display') return false;
    const until = this.game.world.manualCooldowns.get(o.uid) ?? 0;
    if (this.game.simTime < until) return false;
    if (this.isMachine(o)) return !this.game.mods.machinesOff() && o.stock < this.game.shopMgr.capacity(o);
    return o.stock < this.game.shopMgr.capacity(o);
  }

  cooldownLeft(o: PlacedObject): number {
    return Math.max(0, (this.game.world.manualCooldowns.get(o.uid) ?? 0) - this.game.simTime);
  }

  /** Player taps a displayer: shelves refill instantly, machines get a quick batch. */
  manualRestock(uid: number): boolean {
    const o = this.game.shopMgr.getObject(uid);
    if (!o || !this.canManualRestock(o)) return false;
    const cap = this.game.shopMgr.capacity(o);
    const before = o.stock;
    if (this.isMachine(o)) {
      o.stock = Math.min(cap, o.stock + 2);
      this.game.world.manualCooldowns.set(uid, this.game.simTime + 1.5);
    } else {
      o.stock = cap;
      this.game.world.manualCooldowns.set(uid, this.game.simTime + ECONOMY.restock.manualCooldown);
      this.game.state.stats.manualRestocks++;
    }
    this.game.world.lowStockNotified.delete(uid);
    this.game.bus.emit('restocked', { uid, x: o.x, y: o.y, amount: o.stock - before, manual: true });
    return true;
  }

  /** Adds stock delivered by a stocker. Returns units actually added. */
  deliver(uid: number, amount: number): number {
    const o = this.game.shopMgr.getObject(uid);
    if (!o) return 0;
    const cap = this.game.shopMgr.capacity(o);
    const add = Math.max(0, Math.min(amount, cap - o.stock));
    o.stock += add;
    if (add > 0) {
      this.game.world.lowStockNotified.delete(uid);
      this.game.bus.emit('restocked', { uid, x: o.x, y: o.y, amount: add, manual: false });
    }
    return add;
  }

  /** Customer takes one unit. */
  take(o: PlacedObject): boolean {
    if (o.stock <= 0) return false;
    o.stock--;
    const st = this.status(o);
    if (st !== 'ok' && !this.game.world.lowStockNotified.has(o.uid) && o.productId) {
      this.game.world.lowStockNotified.add(o.uid);
      this.game.bus.emit(st === 'out' ? 'outOfStock' : 'lowStock', { uid: o.uid, productId: o.productId });
    }
    return true;
  }

  tick(dt: number): void {
    const shop = this.game.shop;
    const passive = this.game.mods.passiveRestockMult();
    let allFull = true;
    let anyDisplay = false;
    for (const o of shop.objects) {
      const def = OBJECT_MAP[o.kind];
      if (def?.category !== 'display') continue;
      const p = getProduct(o.productId);
      if (!p) continue;
      anyDisplay = true;
      const cap = this.game.shopMgr.capacity(o);
      if (o.stock > cap) o.stock = cap;
      if (o.stock < cap) {
        allFull = false;
        const rate = def.display === 'machine' ? this.machineSpeed(o) / p.restockTime : passive / (ECONOMY.restock.passiveSecPerUnit * p.restockTime);
        o.progress += rate * dt;
        if (o.progress >= 1) {
          const n = Math.floor(o.progress);
          o.progress -= n;
          o.stock = Math.min(cap, o.stock + n);
          if (this.status(o) === 'ok') this.game.world.lowStockNotified.delete(o.uid);
        }
      } else o.progress = 0;
    }
    // "Fully Stocked" achievement: all displays full for 60 continuous seconds.
    const w = this.game.world;
    if (anyDisplay && allFull && shop.open) {
      w.fullStockTimer += dt;
      if (w.fullStockTimer >= 60) this.game.state.progression.flags.fullyStocked60 = true;
    } else w.fullStockTimer = 0;
  }
}
