import type { Game } from './game';
import { ECONOMY } from '../config/economy';
import { getProduct } from '../config/products';
import { STAFF_MAP, TRAIT_MAP } from '../config/staff';

/**
 * EconomyManager: the only place money changes. Every transaction is validated
 * (finite, non-negative, affordable) so money can never go negative or overflow.
 */
export class EconomyManager {
  private bucketAcc = 0;
  private bucketTime = 0;
  private shopBucket = 0;
  private wageTimer = 0;

  constructor(private game: Game) {}

  get money(): number {
    return this.game.state.player.money;
  }

  canAfford(cost: number): boolean {
    return Number.isFinite(cost) && cost >= 0 && this.game.state.player.money >= cost;
  }

  /** Attempts to spend; returns false (and emits purchaseFailed) when not affordable. */
  spend(cost: number, reason = 'purchase'): boolean {
    if (!Number.isFinite(cost) || cost < 0) {
      this.game.log('economy', `invalid cost ${cost} for ${reason}`);
      return false;
    }
    if (this.game.state.player.money < cost) {
      this.game.bus.emit('purchaseFailed', { reason: 'insufficient_funds' });
      return false;
    }
    this.game.state.player.money = Math.max(0, this.game.state.player.money - cost);
    if (cost > 0) this.game.bus.emit('moneySpent', { amount: cost });
    return true;
  }

  /** Adds money (clamped). `tracked` amounts count toward the income rate. */
  earn(amount: number, tracked = true): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const p = this.game.state.player;
    const before = p.money;
    p.money = Math.min(ECONOMY.maxMoney, p.money + amount);
    const gained = p.money - before;
    if (tracked) {
      this.bucketAcc += gained;
      this.shopBucket += gained;
    }
    return gained;
  }

  addStars(n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this.game.state.player.stars = Math.min(1e9, this.game.state.player.stars + Math.floor(n));
  }

  spendStars(n: number): boolean {
    if (!Number.isFinite(n) || n < 0 || this.game.state.player.stars < n) return false;
    this.game.state.player.stars -= n;
    return true;
  }

  /** Sale price of one unit after all multipliers. */
  unitPrice(productId: string): number {
    const p = getProduct(productId);
    if (!p) return 0;
    return p.price * this.game.mods.priceMult();
  }

  unitCost(productId: string): number {
    const p = getProduct(productId);
    if (!p) return 0;
    return p.cost * this.game.mods.costMult();
  }

  unitProfit(productId: string): number {
    return Math.max(0, this.unitPrice(productId) - this.unitCost(productId));
  }

  /** Records a completed checkout. Returns money credited. */
  recordSale(items: { productId: string; price: number; cost: number }[], tip: number): number {
    let gross = 0;
    let profit = 0;
    const st = this.game.state;
    for (const it of items) {
      gross += it.price;
      profit += Math.max(0, it.price - it.cost);
      const cat = getProduct(it.productId)?.category ?? 'other';
      st.stats.soldByCategory[cat] = (st.stats.soldByCategory[cat] ?? 0) + 1;
    }
    profit += tip;
    st.player.lifetimeRevenue += gross;
    st.player.runRevenue += gross;
    st.player.lifetimeProductsSold += items.length;
    st.player.lifetimeCustomers += 1;
    st.stats.itemsSold += items.length;
    st.stats.customersServed += 1;
    st.stats.revenue += gross;
    return this.earn(profit);
  }

  wagesPerMinute(): number {
    let w = 0;
    for (const e of this.game.shop.staff) {
      const def = STAFF_MAP[e.type];
      if (!def) continue;
      w += def.salary * (1 + 0.25 * (e.level - 1)) * (TRAIT_MAP[e.trait]?.salaryMult ?? 1);
    }
    return Math.round(w);
  }

  /** Average measured income per second over the rolling window. */
  incomeRate(): number {
    const b = this.game.state.incomeBuckets;
    if (!b.length) return this.game.shop.incomeRate;
    const sum = b.reduce((a, c) => a + c, 0);
    return sum / (b.length * 10);
  }

  tick(dt: number): void {
    const st = this.game.state;
    // Income buckets (10s) for offline rate calculation.
    this.bucketTime += dt;
    if (this.bucketTime >= 10) {
      this.bucketTime -= 10;
      st.incomeBuckets.push(this.bucketAcc);
      const maxBuckets = ECONOMY.offline.incomeWindowSec / 10;
      while (st.incomeBuckets.length > maxBuckets) st.incomeBuckets.shift();
      const shop = this.game.shop;
      shop.incomeRate = shop.incomeRate * 0.7 + (this.shopBucket / 10) * 0.3;
      this.bucketAcc = 0;
      this.shopBucket = 0;
    }
    // Wages: charged once per interval. Never pushes money below zero.
    if (this.game.shop.staff.length) {
      this.wageTimer += dt;
      if (this.wageTimer >= ECONOMY.wages.intervalSec) {
        this.wageTimer -= ECONOMY.wages.intervalSec;
        const w = this.wagesPerMinute() * (ECONOMY.wages.intervalSec / 60);
        st.player.money = Math.max(0, st.player.money - Math.min(st.player.money, w));
      }
    }
    // Inactive shops earn passively at a reduced rate.
    for (const id of st.progression.unlockedLocations) {
      if (id === st.player.currentLocation) continue;
      const s = st.shops[id];
      if (s && s.incomeRate > 0) this.earn(s.incomeRate * ECONOMY.inactiveShopEfficiency * dt, false);
    }
  }
}
