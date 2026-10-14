import type { Game } from './game';
import type { UnlockInfo } from '../core/bus';
import { ECONOMY, xpForLevel } from '../config/economy';
import { PRODUCTS, PRODUCT_MAP } from '../config/products';
import { DEPARTMENTS } from '../config/departments';
import { OBJECTS } from '../config/objects';
import { STAFF } from '../config/staff';
import { UPGRADES } from '../config/upgrades';
import { LOCATIONS } from '../config/locations';
import { CUSTOMER_TYPES } from '../config/customers';
import { EXPANSIONS } from '../config/expansions';

/** ProgressionManager: XP, levels, reputation tiers and product unlocking. */
export class ProgressionManager {
  constructor(private game: Game) {}

  xpToNext(): number {
    return xpForLevel(this.game.state.player.level);
  }

  addXp(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const p = this.game.state.player;
    p.xp += amount;
    this.game.bus.emit('xpGained', { amount });
    let guard = 0;
    while (p.xp >= xpForLevel(p.level) && guard++ < 50) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      const money = ECONOMY.xp.levelMoneyReward(p.level);
      const stars = ECONOMY.xp.levelStarReward(p.level);
      this.game.economy.earn(money, false);
      this.game.economy.addStars(stars);
      this.game.celebrate(ECONOMY.xp.celebrationSlowmo);
      this.game.bus.emit('levelUp', { level: p.level, unlocks: this.unlocksAt(p.level), reward: { money, stars } });
    }
  }

  /** What becomes available at a level (for the level-up reveal). */
  unlocksAt(level: number): UnlockInfo[] {
    const out: UnlockInfo[] = [];
    for (const p of PRODUCTS) if (p.requiredLevel === level && !p.season) out.push({ kind: 'product', id: p.id });
    for (const d of DEPARTMENTS) if (d.requiredLevel === level && d.cost > 0) out.push({ kind: 'department', id: d.id });
    for (const o of OBJECTS) if (o.requiredLevel === level && o.category === 'decor') out.push({ kind: 'decor', id: o.id });
    for (const o of OBJECTS) if (o.requiredLevel === level && o.category !== 'decor' && !o.requiredDepartment) out.push({ kind: 'feature', id: o.id });
    for (const s of STAFF) if (s.requiredLevel === level) out.push({ kind: 'staff', id: s.id });
    for (const u of UPGRADES) if (u.requiredLevel === level) out.push({ kind: 'upgrade', id: u.id });
    for (const l of LOCATIONS) if (l.requiredLevel === level && l.unlockCost > 0) out.push({ kind: 'location', id: l.id });
    for (const c of CUSTOMER_TYPES) if (c.requiredLevel === level && c.weight > 0 && level > 1) out.push({ kind: 'customer', id: c.id });
    if (EXPANSIONS.some((e) => e.requiredLevel === level && e.cost > 0)) out.push({ kind: 'feature', id: 'expansion' });
    return out;
  }

  // ------------------------------------------------------------ reputation

  repTier(): number {
    const r = this.game.state.player.reputation;
    const tiers = ECONOMY.reputation.tiers;
    let t = 1;
    for (let i = 0; i < tiers.length; i++) if (r >= tiers[i]) t = i + 1;
    return t;
  }

  repProgress(): { tier: number; into: number; need: number } {
    const tier = this.repTier();
    const tiers = ECONOMY.reputation.tiers;
    const floor = tiers[tier - 1] ?? 0;
    const next = tiers[tier];
    if (next === undefined) return { tier, into: 1, need: 1 };
    return { tier, into: this.game.state.player.reputation - floor, need: next - floor };
  }

  /** Reputation never drops below the floor of the tier already reached (light failure). */
  addReputation(n: number): void {
    const p = this.game.state.player;
    const before = this.repTier();
    const floor = ECONOMY.reputation.tiers[before - 1] ?? 0;
    p.reputation = Math.max(floor, p.reputation + n);
    const after = this.repTier();
    if (after !== before) this.game.bus.emit('reputationTier', { tier: after, up: after > before });
  }

  // -------------------------------------------------------------- products

  isProductAvailable(id: string): boolean {
    const p = PRODUCT_MAP[id];
    if (!p) return false;
    if (p.season) return this.game.mods.seasons().some((s) => s.products.includes(id));
    return this.game.state.progression.unlockedProducts.includes(id);
  }

  canUnlockProduct(id: string): { ok: boolean; reason?: string } {
    const p = PRODUCT_MAP[id];
    if (!p || p.season) return { ok: false, reason: 'unknown' };
    if (this.game.state.progression.unlockedProducts.includes(id)) return { ok: false, reason: 'owned' };
    if (this.game.state.player.level < p.requiredLevel) return { ok: false, reason: 'level' };
    if (!this.game.shop.departments.includes(p.department)) return { ok: false, reason: 'department' };
    if (!this.game.economy.canAfford(p.unlockCost)) return { ok: false, reason: 'money' };
    return { ok: true };
  }

  unlockProduct(id: string): boolean {
    if (!this.canUnlockProduct(id).ok) return false;
    if (!this.game.economy.spend(PRODUCT_MAP[id].unlockCost, `product:${id}`)) return false;
    return this.grantProduct(id, true);
  }

  /** Grants a product (free). Auto-assigns it to an empty compatible displayer when possible. */
  grantProduct(id: string, assign: boolean): boolean {
    const prog = this.game.state.progression;
    if (prog.unlockedProducts.includes(id) || !PRODUCT_MAP[id]) return false;
    prog.unlockedProducts.push(id);
    this.addXp(ECONOMY.xp.perProductUnlock);
    if (assign) this.autoAssign(id);
    this.game.bus.emit('productUnlocked', { id });
    this.game.analytics('product_unlocked', { id });
    return true;
  }

  /** Put a newly unlocked product on a displayer that duplicates another product. */
  private autoAssign(id: string): void {
    const g = this.game;
    const p = PRODUCT_MAP[id];
    const counts = new Map<string, number>();
    for (const o of g.shop.objects) if (o.productId) counts.set(o.productId, (counts.get(o.productId) ?? 0) + 1);
    const candidate = g.shop.objects.find((o) => o.productId && o.productId !== id && (counts.get(o.productId) ?? 0) > 1 && g.shopMgr.compatibleProducts(o.kind).includes(id) && PRODUCT_MAP[o.productId!]?.display === p.display);
    if (candidate) g.shopMgr.setProduct(candidate.uid, id);
  }

  /** Is there anything worthwhile to spend on right now? (anti-grind indicator) */
  affordableGoals(): number {
    const g = this.game;
    let n = 0;
    for (const u of UPGRADES) if (g.upgrades.canBuy(u.id).ok) n++;
    for (const o of g.shop.objects) {
      const c = g.shopMgr.upgradeCost(o);
      if (c !== null && g.economy.canAfford(c)) n++;
    }
    if (g.shopMgr.canExpand().ok) n++;
    return n;
  }
}
