/**
 * Platform-independent purchase contract. The UI and game logic only ever talk to a
 * PurchaseAdapter; StoreKit (iOS), Google Play Billing (Android) and the test-only
 * simulator are interchangeable implementations behind it.
 */

export type Platform = 'ios' | 'android' | 'simulated' | 'unavailable';

/** Explicit purchase outcomes (see docs/MONETIZATION.md for the state machine). */
export type TransactionState =
  | 'pending' // awaiting parental approval / deferred payment / slow card
  | 'purchased' // the store says paid, but WE have not verified it yet ("purchased but not yet verified")
  | 'verified' // verified by a trusted verifier; only now may anything be granted
  | 'cancelled'
  | 'failed'
  | 'refunded'; // refunded or revoked by the store

export interface StoreProduct {
  /** Platform store product id (e.g. com.tinytycoon.gems_small). */
  storeId: string;
  /** Localized, store-formatted price string. Never computed by the game in production. */
  displayPrice: string;
  currencyCode: string;
  /** Price in micros as supplied by the store (for sorting/analytics only). */
  priceMicros: number;
}

export interface Transaction {
  /** Store transaction id (Apple transactionId / Google orderId or purchaseToken). Idempotency key. */
  transactionId: string;
  storeId: string;
  state: TransactionState;
  /** Opaque proof for the verifier (JWS from StoreKit 2, purchaseToken from Play). */
  receipt: string;
  /** For restores/renewals: the original purchase this transaction belongs to. */
  originalTransactionId?: string;
  error?: string;
  /** True only for simulated transactions. Never true for a real store transaction. */
  test: boolean;
  at: number;
}

export interface PurchaseAdapter {
  readonly platform: Platform;
  /** Human-readable reason when the adapter cannot sell anything right now. */
  readonly unavailableReason?: string;
  initialize(): Promise<boolean>;
  getProducts(storeIds: string[]): Promise<StoreProduct[]>;
  /** Starts the platform purchase sheet. Resolves with the immediate result. */
  purchase(storeId: string): Promise<Transaction>;
  /** Re-delivers owned non-consumable purchases (restore). */
  restorePurchases(): Promise<Transaction[]>;
  /** Currently owned non-consumables according to the store. */
  getEntitlements(): Promise<Transaction[]>;
  /** Transactions that arrive outside a purchase() call: deferred, interrupted, refunds, duplicates. */
  listenForPurchaseUpdates(cb: (tx: Transaction) => void): () => void;
  /** Tell the store we processed it (StoreKit finish() / Play acknowledge or consume). */
  finishTransaction(tx: Transaction, consumable: boolean): Promise<void>;
}

export interface VerificationResult {
  ok: boolean;
  /** Why verification failed or could not run (network, not configured, invalid receipt...). */
  reason?: string;
  /** Verified as a simulated/test transaction. */
  test: boolean;
}

/** Trusted verification boundary. In production this MUST be a server you control. */
export interface PurchaseVerifier {
  readonly available: boolean;
  verify(tx: Transaction, productId: string): Promise<VerificationResult>;
}
