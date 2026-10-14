import type { Game } from '../sim/game';
import type { PurchaseAdapter, PurchaseVerifier, StoreProduct, Transaction } from './types';
import { PREMIUM_CATALOG, PREMIUM_MAP, productByStoreId } from './catalog';
import type { PremiumProductId } from './catalog';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'offline' | 'error';

export type PurchaseOutcome =
  | { status: 'verified'; productId: PremiumProductId; test: boolean }
  | { status: 'pending'; productId: PremiumProductId }
  | { status: 'unverified'; productId: PremiumProductId; reason: string }
  | { status: 'cancelled'; productId: PremiumProductId }
  | { status: 'failed'; productId: PremiumProductId; reason: string }
  | { status: 'busy' | 'owned' | 'unavailable'; productId: PremiumProductId };

export interface StoreEvents {
  onChange?: () => void;
  onOutcome?: (o: PurchaseOutcome | { status: 'refunded'; productId: PremiumProductId }) => void;
}

/**
 * PurchaseController: the platform-independent purchase state machine.
 *   purchase() → [pending] → purchased (unverified) → verify → grant once → finish/ack/consume
 * Duplicates (callbacks, restores, relaunch deliveries) are absorbed by the game's
 * transaction-id idempotency record. Nothing is granted unless the verifier says ok.
 */
export class PurchaseController {
  status: StoreStatus = 'idle';
  products = new Map<string, StoreProduct>();
  lastError?: string;
  inFlight: PremiumProductId | null = null;
  private unlisten?: () => void;
  private platform: 'ios' | 'android';

  constructor(
    private game: () => Game,
    readonly adapter: PurchaseAdapter,
    private verifier: PurchaseVerifier,
    private events: StoreEvents = {},
  ) {
    this.platform = adapter.platform === 'android' ? 'android' : 'ios';
  }

  get testMode(): boolean {
    return this.adapter.platform === 'simulated';
  }

  storeIdOf(id: PremiumProductId): string {
    return PREMIUM_MAP[id].storeIds[this.platform];
  }

  priceOf(id: PremiumProductId): StoreProduct | undefined {
    return this.products.get(this.storeIdOf(id));
  }

  private changed(): void {
    this.events.onChange?.();
  }

  async init(): Promise<StoreStatus> {
    if (this.adapter.platform === 'unavailable') {
      this.status = 'unavailable';
      this.changed();
      return this.status;
    }
    this.status = 'loading';
    this.changed();
    try {
      const ok = await this.adapter.initialize();
      if (!ok) {
        this.status = 'unavailable';
        return this.status;
      }
      this.unlisten?.();
      this.unlisten = this.adapter.listenForPurchaseUpdates((tx) => void this.handle(tx));
      await this.loadProducts();
    } catch (e) {
      this.lastError = String(e);
      this.status = String(e).includes('offline') ? 'offline' : 'error';
    }
    this.changed();
    return this.status;
  }

  async loadProducts(): Promise<void> {
    this.status = 'loading';
    this.changed();
    try {
      const ids = PREMIUM_CATALOG.filter((p) => p.realMoney).map((p) => p.storeIds[this.platform]);
      const list = await this.adapter.getProducts(ids);
      this.products = new Map(list.map((p) => [p.storeId, p]));
      this.status = 'ready';
    } catch (e) {
      this.lastError = String(e);
      this.status = String(e).includes('offline') ? 'offline' : 'error';
    }
    this.changed();
  }

  /** Real-money purchase through the platform store (or the simulator in test mode). */
  async purchase(id: PremiumProductId): Promise<PurchaseOutcome> {
    const p = PREMIUM_MAP[id];
    const g = this.game();
    if (!p?.realMoney || this.status !== 'ready' || !this.priceOf(id)) return { status: 'unavailable', productId: id };
    if (p.ownership === 'once' && g.monetization.owns(id)) return { status: 'owned', productId: id };
    if (!g.monetization.requirements(id).met) return { status: 'unavailable', productId: id };
    if (this.inFlight) return { status: 'busy', productId: id };
    this.inFlight = id;
    this.changed();
    try {
      const tx = await this.adapter.purchase(this.storeIdOf(id));
      return await this.handle(tx);
    } catch (e) {
      return { status: 'failed', productId: id, reason: String(e) };
    } finally {
      this.inFlight = null;
      this.changed();
    }
  }

  /** Processes any transaction (from purchase(), updates, restores). Safe to call repeatedly. */
  async handle(tx: Transaction): Promise<PurchaseOutcome> {
    const p = productByStoreId(tx.storeId);
    const g = this.game();
    if (!p) return { status: 'failed', productId: 'gems_small', reason: 'unknown_product' };
    const id = p.id;
    let out: PurchaseOutcome;
    switch (tx.state) {
      case 'cancelled':
        out = { status: 'cancelled', productId: id };
        break;
      case 'failed':
        out = { status: 'failed', productId: id, reason: tx.error ?? 'failed' };
        break;
      case 'pending':
        g.monetization.markPending(tx.transactionId, id, 'pending');
        out = { status: 'pending', productId: id };
        break;
      case 'refunded':
        g.monetization.revoke(tx.transactionId, id);
        this.events.onOutcome?.({ status: 'refunded', productId: id });
        this.changed();
        return { status: 'failed', productId: id, reason: 'refunded' };
      case 'purchased':
      case 'verified': {
        const key = tx.originalTransactionId ?? tx.transactionId;
        if (g.state.monetization.processedTx.includes(key)) {
          // Duplicate delivery: already granted. Make sure the store knows we're done.
          await this.adapter.finishTransaction(tx, p.type === 'consumable').catch(() => {});
          return { status: 'verified', productId: id, test: tx.test };
        }
        g.monetization.markPending(key, id, 'purchased');
        const v = await this.verifier.verify(tx, id);
        if (!v.ok) {
          // Paid but not verified: keep it pending for a retry; never grant, never finish.
          out = { status: 'unverified', productId: id, reason: v.reason ?? 'unverified' };
          break;
        }
        g.monetization.grantVerifiedTransaction(key, id, v.test);
        await this.adapter.finishTransaction(tx, p.type === 'consumable').catch(() => {});
        out = { status: 'verified', productId: id, test: v.test };
        break;
      }
      default:
        out = { status: 'failed', productId: id, reason: 'unknown_state' };
    }
    this.events.onOutcome?.(out);
    this.changed();
    return out;
  }

  /** Restore non-consumables owned on this store account (new device / reinstall). */
  async restore(): Promise<{ restored: number; error?: string }> {
    if (this.status !== 'ready') return { restored: 0, error: this.status };
    try {
      const txs = await this.adapter.restorePurchases();
      let restored = 0;
      for (const tx of txs) {
        const before = this.game().state.monetization.processedTx.length;
        const r = await this.handle({ ...tx, state: tx.state === 'verified' ? 'verified' : 'purchased' });
        if (r.status === 'verified' && this.game().state.monetization.processedTx.length > before) restored++;
      }
      return { restored };
    } catch (e) {
      return { restored: 0, error: String(e) };
    }
  }

  dispose(): void {
    this.unlisten?.();
  }
}
