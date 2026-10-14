import type { PurchaseAdapter, StoreProduct, Transaction } from './types';
import { PREMIUM_CATALOG, productByStoreId } from './catalog';

/**
 * TEST-ONLY purchase adapter. No money moves, nothing talks to Apple or Google.
 * Every transaction it produces has `test: true`, a `SIM-` id and a `SIMULATED:` receipt,
 * which production verifiers reject. The UI shows a permanent "Test store" banner while it's active.
 *
 * `scenario` decides what the next purchase does, so every state can be exercised:
 *   success | cancel | fail | pending | interrupted | verify_fail | duplicate
 */
export type SimScenario = 'success' | 'cancel' | 'fail' | 'pending' | 'interrupted' | 'verify_fail' | 'duplicate';

export class SimulatedPurchaseAdapter implements PurchaseAdapter {
  readonly platform = 'simulated' as const;
  scenario: SimScenario = 'success';
  /** Simulated network latency in ms (0 in unit tests). */
  latency = 0;
  online = true;
  private listeners = new Set<(tx: Transaction) => void>();
  private owned = new Map<string, Transaction>(); // storeId -> tx (non-consumables)
  private pendingTx = new Map<string, Transaction>();
  private seq = 0;
  readonly finished: string[] = [];
  readonly locale: string;

  constructor(locale = 'en-GB') {
    this.locale = locale;
  }

  private wait(): Promise<void> {
    return this.latency ? new Promise((r) => setTimeout(r, this.latency)) : Promise.resolve();
  }

  private tx(storeId: string, state: Transaction['state'], error?: string): Transaction {
    const id = `SIM-${Date.now().toString(36)}-${++this.seq}`;
    return { transactionId: id, storeId, state, receipt: `SIMULATED:${id}:${storeId}`, test: true, at: Date.now(), error };
  }

  async initialize(): Promise<boolean> {
    await this.wait();
    return true;
  }

  async getProducts(storeIds: string[]): Promise<StoreProduct[]> {
    await this.wait();
    if (!this.online) throw new Error('offline');
    const out: StoreProduct[] = [];
    for (const id of storeIds) {
      const p = productByStoreId(id);
      if (!p?.devPrice) continue;
      const fmt = new Intl.NumberFormat(this.locale, { style: 'currency', currency: p.devPrice.currency });
      out.push({ storeId: id, displayPrice: fmt.format(p.devPrice.amount), currencyCode: p.devPrice.currency, priceMicros: Math.round(p.devPrice.amount * 1e6) });
    }
    return out;
  }

  async purchase(storeId: string): Promise<Transaction> {
    await this.wait();
    if (!this.online) return this.tx(storeId, 'failed', 'offline');
    if (!productByStoreId(storeId)) return this.tx(storeId, 'failed', 'unknown_product');
    switch (this.scenario) {
      case 'cancel':
        return this.tx(storeId, 'cancelled');
      case 'fail':
        return this.tx(storeId, 'failed', 'payment_declined');
      case 'pending': {
        const t = this.tx(storeId, 'pending');
        this.pendingTx.set(t.transactionId, t);
        return t;
      }
      case 'interrupted': {
        // App "closed" mid-purchase: the result is only delivered later through the update listener.
        const t = this.tx(storeId, 'purchased');
        this.pendingTx.set(t.transactionId, t);
        return { ...t, state: 'failed', error: 'interrupted' };
      }
      case 'verify_fail': {
        const t = this.tx(storeId, 'purchased');
        return { ...t, receipt: 'SIMULATED:TAMPERED' };
      }
      case 'duplicate': {
        const t = this.tx(storeId, 'purchased');
        this.remember(t);
        // The store re-delivers the same transaction twice more.
        queueMicrotask(() => {
          this.emit(t);
          this.emit(t);
        });
        return t;
      }
      default: {
        const t = this.tx(storeId, 'purchased');
        this.remember(t);
        return t;
      }
    }
  }

  private remember(t: Transaction): void {
    const p = productByStoreId(t.storeId);
    if (p?.type === 'non_consumable') this.owned.set(t.storeId, t);
  }

  private emit(t: Transaction): void {
    for (const l of this.listeners) l({ ...t });
  }

  // ---- simulator controls (debug panel / tests) ----

  /** Completes every pending or interrupted transaction (e.g. parent approved, app relaunched). */
  resolvePending(approve = true): number {
    let n = 0;
    for (const [id, t] of this.pendingTx) {
      this.pendingTx.delete(id);
      const done: Transaction = { ...t, state: approve ? 'purchased' : 'failed', error: approve ? undefined : 'declined', at: Date.now() };
      if (approve) this.remember(done);
      this.emit(done);
      n++;
    }
    return n;
  }

  /** Simulates the store refunding/revoking a transaction. */
  refund(tx: { transactionId: string; storeId: string }): void {
    this.owned.delete(tx.storeId);
    this.emit({ transactionId: tx.transactionId, storeId: tx.storeId, state: 'refunded', receipt: `SIMULATED:${tx.transactionId}:${tx.storeId}`, test: true, at: Date.now() });
  }

  /** Forget local state, as a reinstall on a new device would (store ownership survives). */
  ownedStoreIds(): string[] {
    return [...this.owned.keys()];
  }

  async restorePurchases(): Promise<Transaction[]> {
    await this.wait();
    if (!this.online) throw new Error('offline');
    return [...this.owned.values()].map((t) => ({ ...t, originalTransactionId: t.transactionId }));
  }

  async getEntitlements(): Promise<Transaction[]> {
    return this.restorePurchases();
  }

  listenForPurchaseUpdates(cb: (tx: Transaction) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async finishTransaction(tx: Transaction): Promise<void> {
    this.finished.push(tx.transactionId);
  }

  /** All store ids the simulator sells (used to seed getProducts). */
  static storeIds(platform: 'ios' | 'android' = 'ios'): string[] {
    return PREMIUM_CATALOG.filter((p) => p.realMoney).map((p) => p.storeIds[platform]);
  }
}
