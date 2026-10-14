import type { PurchaseAdapter, StoreProduct, Transaction } from './types';

/**
 * Bridge to the native billing layer of the packaged iOS/Android app.
 *
 * The web game cannot call StoreKit or Google Play Billing itself. When the game is wrapped
 * (e.g. Capacitor), a small native plugin must expose `window.TinyTycoonBilling` implementing
 * NativeBillingBridge below — StoreKit 2 on iOS, Play Billing Library 7+ on Android.
 * See docs/MONETIZATION.md for the exact native responsibilities.
 *
 * In a browser (or before the plugin exists) this adapter reports itself unavailable and
 * refuses every purchase. It never fakes a result.
 */
export interface NativeBillingBridge {
  platform: 'ios' | 'android';
  initialize(): Promise<boolean>;
  getProducts(storeIds: string[]): Promise<StoreProduct[]>;
  purchase(storeId: string, appAccountToken?: string): Promise<Transaction>;
  restorePurchases(): Promise<Transaction[]>;
  getEntitlements(): Promise<Transaction[]>;
  addListener(cb: (tx: Transaction) => void): () => void;
  finishTransaction(transactionId: string, consumable: boolean): Promise<void>;
}

declare global {
  interface Window {
    TinyTycoonBilling?: NativeBillingBridge;
  }
}

export class NativeBridgeAdapter implements PurchaseAdapter {
  private bridge?: NativeBillingBridge;

  constructor(bridge?: NativeBillingBridge) {
    this.bridge = bridge ?? (typeof window !== 'undefined' ? window.TinyTycoonBilling : undefined);
  }

  get platform() {
    return this.bridge?.platform ?? ('unavailable' as const);
  }

  get unavailableReason(): string | undefined {
    return this.bridge ? undefined : 'native_billing_missing';
  }

  private need(): NativeBillingBridge {
    if (!this.bridge) throw new Error('native_billing_missing');
    return this.bridge;
  }

  async initialize(): Promise<boolean> {
    return this.bridge ? this.bridge.initialize() : false;
  }

  async getProducts(storeIds: string[]): Promise<StoreProduct[]> {
    return this.need().getProducts(storeIds);
  }

  async purchase(storeId: string): Promise<Transaction> {
    if (!this.bridge) return { transactionId: '', storeId, state: 'failed', receipt: '', test: false, at: Date.now(), error: 'native_billing_missing' };
    const tx = await this.bridge.purchase(storeId);
    return { ...tx, test: false }; // a native transaction is never a test-mode simulator transaction
  }

  async restorePurchases(): Promise<Transaction[]> {
    return (await this.need().restorePurchases()).map((t) => ({ ...t, test: false }));
  }

  async getEntitlements(): Promise<Transaction[]> {
    return (await this.need().getEntitlements()).map((t) => ({ ...t, test: false }));
  }

  listenForPurchaseUpdates(cb: (tx: Transaction) => void): () => void {
    return this.bridge ? this.bridge.addListener((t) => cb({ ...t, test: false })) : () => {};
  }

  async finishTransaction(tx: Transaction, consumable: boolean): Promise<void> {
    await this.need().finishTransaction(tx.transactionId, consumable);
  }
}
