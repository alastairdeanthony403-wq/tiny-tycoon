import type { Game } from './game';
import type { Dir, Entitlement, MonetizationState, SavedLayout } from '../core/types';
import { PREMIUM_MAP, PREMIUM_CATALOG, BASE_LAYOUT_SLOTS, MAX_GEMS } from '../monetization/catalog';
import type { PremiumProduct, PremiumProductId } from '../monetization/catalog';
import { OBJECT_MAP } from '../config/objects';

export type GemSpendResult = { ok: true } | { ok: false; reason: 'unknown' | 'owned' | 'not_for_gems' | 'insufficient' | 'busy' };

const LEDGER_CAP = 200;

const isGemAmount = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_GEMS;

/**
 * MonetizationManager (synchronous, deterministic, unit-tested).
 * Owns Gems, the ledger, entitlements and equipped cosmetics. All grants are idempotent
 * by transaction id, and every spend is validate → deduct → grant in one synchronous step.
 * NOTE: this client-side record is NOT a secure source of truth for real money; production
 * grants must come from a verified server (see docs/MONETIZATION.md).
 */
export class MonetizationManager {
  private spending = false;

  constructor(private game: Game) {}

  /** Drop equipped cosmetics/features the player no longer owns (refunds, edited saves). */
  sanitize(): void {
    const st = this.state;
    if (st.equipped.skin && !this.ownedSkins().includes(st.equipped.skin)) st.equipped.skin = null;
    if (st.equipped.outfit && !this.ownedOutfits().includes(st.equipped.outfit)) st.equipped.outfit = null;
    if (st.automation.autoRestock && !this.owns('automation_basic')) st.automation.autoRestock = false;
  }

  get state(): MonetizationState {
    return this.game.state.monetization;
  }

  get gems(): number {
    return this.state.gemsEarned + this.state.gemsPurchased;
  }

  owns(id: PremiumProductId | string): boolean {
    return !!this.state.entitlements[id];
  }

  ownsTestOnly(id: string): boolean {
    return !!this.state.entitlements[id]?.test;
  }

  private ledger(entry: Omit<import('../core/types').LedgerEntry, 'id' | 'at'>): void {
    const st = this.state;
    st.ledger.push({ ...entry, id: `L${st.nextLedgerId++}`, at: this.game.now() });
    if (st.ledger.length > LEDGER_CAP) st.ledger.splice(0, st.ledger.length - LEDGER_CAP);
  }

  /** Earned Gems from gameplay (achievements, milestones). */
  earnGems(amount: number, source: string): number {
    if (!isGemAmount(amount) || amount === 0) return 0;
    const add = Math.min(amount, MAX_GEMS - this.gems);
    if (add <= 0) return 0;
    this.state.gemsEarned += add;
    this.state.totals.earned += add;
    this.ledger({ kind: 'earn', gems: add, source, test: false });
    this.game.bus.emit('gemsChanged', { delta: add, reason: source });
    return add;
  }

  /** Spend Gems on a permanent item. Atomic: validate, deduct once, grant once. */
  buyWithGems(id: PremiumProductId): GemSpendResult {
    const p = PREMIUM_MAP[id];
    if (!p) return { ok: false, reason: 'unknown' };
    if (this.spending) return { ok: false, reason: 'busy' };
    if (p.ownership === 'once' && this.owns(id)) return { ok: false, reason: 'owned' };
    const price = p.gemPrice;
    if (price === undefined || !isGemAmount(price) || price === 0) return { ok: false, reason: 'not_for_gems' };
    if (this.gems < price) return { ok: false, reason: 'insufficient' };
    this.spending = true;
    try {
      const st = this.state;
      // Spend earned Gems first, purchased Gems last (purchased never expire).
      const fromEarned = Math.min(st.gemsEarned, price);
      const fromPurchased = price - fromEarned;
      st.gemsEarned -= fromEarned;
      st.gemsPurchased -= fromPurchased;
      st.totals.spent += price;
      const txId = `gems-${id}-${this.game.now()}-${st.nextLedgerId}`;
      this.ledger({ kind: 'spend', gems: -price, productId: id, txId, source: 'gem_purchase', test: false });
      this.grantEntitlement(p, { source: 'gems', txId, test: false, at: this.game.now() });
      this.game.bus.emit('gemsChanged', { delta: -price, reason: id });
      return { ok: true };
    } finally {
      this.spending = false;
    }
  }

  /**
   * Applies a VERIFIED store transaction exactly once. Returns false for duplicates
   * (repeated callbacks, restores of already-granted purchases).
   */
  grantVerifiedTransaction(txId: string, id: PremiumProductId, test: boolean): boolean {
    const p = PREMIUM_MAP[id];
    if (!p || !txId) return false;
    const st = this.state;
    if (st.processedTx.includes(txId)) return false;
    st.pending = st.pending.filter((x) => x.txId !== txId);
    if (p.grant.kind === 'gems') {
      if (!isGemAmount(p.grant.amount)) return false;
      const add = Math.min(p.grant.amount, MAX_GEMS - this.gems);
      st.gemsPurchased += add;
      st.totals.purchased += add;
      st.processedTx.push(txId);
      this.ledger({ kind: 'purchase', gems: add, productId: id, txId, source: test ? 'iap_simulated' : 'iap', test });
      this.game.bus.emit('gemsChanged', { delta: add, reason: id });
      this.game.bus.emit('premiumGranted', { productId: id, test });
      return true;
    }
    st.processedTx.push(txId);
    if (this.owns(id)) return false; // already owned (e.g. bought with Gems earlier): nothing to add
    this.grantEntitlement(p, { source: 'iap', txId, test, at: this.game.now() });
    return true;
  }

  private grantEntitlement(p: PremiumProduct, e: Entitlement): void {
    this.state.entitlements[p.id] = e;
    this.ledger({ kind: 'entitlement', gems: 0, productId: p.id, txId: e.txId, source: e.source, test: e.test });
    // First cosmetic unlocks are auto-equipped so the purchase is immediately visible.
    if (p.grant.kind === 'skin' && !this.state.equipped.skin) this.state.equipped.skin = p.grant.skin;
    if (p.grant.kind === 'outfits' && !this.state.equipped.outfit) this.state.equipped.outfit = p.grant.outfits[0];
    if (p.grant.kind === 'automation') this.state.automation.autoRestock = true;
    this.game.bus.emit('premiumGranted', { productId: p.id, test: e.test });
  }

  /** Store refund / revocation. Removes entitlements; claws back unspent purchased Gems (never below zero). */
  revoke(txId: string, id: PremiumProductId): void {
    const p = PREMIUM_MAP[id];
    const st = this.state;
    if (!p) return;
    const key = `revoke:${txId}`;
    if (st.processedTx.includes(key)) return; // idempotent
    st.processedTx.push(key);
    st.pending = st.pending.filter((x) => x.txId !== txId);
    if (p.grant.kind === 'gems') {
      if (!st.processedTx.includes(txId)) return; // never granted
      const take = Math.min(st.gemsPurchased, p.grant.amount);
      st.gemsPurchased -= take;
      st.totals.revoked += take;
      this.ledger({ kind: 'revoke', gems: -take, productId: id, txId, source: 'refund', test: false });
      this.game.bus.emit('gemsChanged', { delta: -take, reason: 'refund' });
    } else {
      const ent = st.entitlements[id];
      if (!ent || ent.txId !== txId) return; // gem-bought or other copies are unaffected
      delete st.entitlements[id];
      this.ledger({ kind: 'revoke', gems: 0, productId: id, txId, source: 'refund', test: ent.test });
      this.unequipRevoked(p);
    }
    this.game.bus.emit('premiumRevoked', { productId: id });
  }

  private unequipRevoked(p: PremiumProduct): void {
    const eq = this.state.equipped;
    if (p.grant.kind === 'skin' && eq.skin === p.grant.skin) eq.skin = null;
    if (p.grant.kind === 'outfits' && eq.outfit && p.grant.outfits.includes(eq.outfit)) eq.outfit = null;
    if (p.grant.kind === 'automation') this.state.automation.autoRestock = false;
  }

  markPending(txId: string, productId: PremiumProductId, state: 'pending' | 'purchased'): void {
    const st = this.state;
    if (st.processedTx.includes(txId)) return;
    const existing = st.pending.find((x) => x.txId === txId);
    if (existing) existing.state = state;
    else st.pending.push({ txId, productId, state, at: this.game.now() });
  }

  clearPending(txId: string): void {
    this.state.pending = this.state.pending.filter((x) => x.txId !== txId);
  }

  // ------------------------------------------------------------- cosmetics

  ownedSkins(): string[] {
    return PREMIUM_CATALOG.filter((p) => p.grant.kind === 'skin' && this.owns(p.id)).map((p) => (p.grant as { skin: string }).skin);
  }

  ownedOutfits(): string[] {
    const out: string[] = [];
    for (const p of PREMIUM_CATALOG) if (p.grant.kind === 'outfits' && this.owns(p.id)) out.push(...p.grant.outfits);
    return out;
  }

  /** Equip (or pass null to remove). Ownership is verified first. */
  equipSkin(skin: string | null): boolean {
    if (skin !== null && !this.ownedSkins().includes(skin)) return false;
    this.state.equipped.skin = skin;
    this.game.bus.emit('stateChanged', { reason: 'skin' });
    return true;
  }

  equipOutfit(outfit: string | null): boolean {
    if (outfit !== null && !this.ownedOutfits().includes(outfit)) return false;
    this.state.equipped.outfit = outfit;
    this.game.bus.emit('stateChanged', { reason: 'outfit' });
    return true;
  }

  /** Premium decor object kinds the player may build. */
  decorAllowed(kind: string): boolean {
    const ent = OBJECT_MAP[kind]?.entitlement;
    return !ent || this.owns(ent);
  }

  // --------------------------------------------------------- convenience

  layoutSlotCount(): number {
    let n = BASE_LAYOUT_SLOTS;
    for (const p of PREMIUM_CATALOG) if (p.grant.kind === 'layout_slots' && this.owns(p.id)) n += p.grant.extra;
    return n;
  }

  layouts(): (SavedLayout | null)[] {
    const id = this.game.shop.locationId;
    const list = this.state.layouts[id] ?? [];
    const n = this.layoutSlotCount();
    return Array.from({ length: n }, (_, i) => list[i] ?? null);
  }

  saveLayout(slot: number, name?: string): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.layoutSlotCount()) return false;
    const shop = this.game.shop;
    const list = (this.state.layouts[shop.locationId] ??= []);
    list[slot] = {
      name: name ?? `Layout ${slot + 1}`,
      size: shop.size,
      objects: shop.objects.map((o) => ({ uid: o.uid, kind: o.kind, x: o.x, y: o.y, dir: o.dir as Dir })),
      at: this.game.now(),
    };
    return true;
  }

  /** Moves current objects to their saved spots. Atomic: the whole layout applies or nothing changes. */
  loadLayout(slot: number): { ok: boolean; reason?: string } {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.layoutSlotCount()) return { ok: false, reason: 'locked' };
    const saved = this.layouts()[slot];
    if (!saved) return { ok: false, reason: 'empty' };
    return this.game.shopMgr.applyLayout(saved.objects);
  }

  autoRestockActive(): boolean {
    return this.owns('automation_basic') && this.state.automation.autoRestock;
  }

  setAutoRestock(on: boolean): boolean {
    if (on && !this.owns('automation_basic')) return false;
    this.state.automation.autoRestock = on;
    return true;
  }

  /** Auto-restock assistant: uses the same manual restock (and cooldown) a player could tap. */
  tick(): void {
    if (!this.autoRestockActive() || !this.game.shop.open) return;
    for (const o of this.game.shopMgr.displays()) {
      if (this.game.inventory.status(o) === 'out' && this.game.inventory.canManualRestock(o)) this.game.inventory.manualRestock(o.uid, true);
    }
  }
}
