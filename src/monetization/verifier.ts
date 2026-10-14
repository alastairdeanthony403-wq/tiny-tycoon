import type { PurchaseVerifier, Transaction, VerificationResult } from './types';

/**
 * Accepts ONLY transactions produced by SimulatedPurchaseAdapter, and marks them test.
 * It must never be wired up when a real store adapter is in use.
 */
export class SimulatedVerifier implements PurchaseVerifier {
  readonly available = true;
  async verify(tx: Transaction): Promise<VerificationResult> {
    if (!tx.test) return { ok: false, test: false, reason: 'simulated_verifier_rejects_real_transactions' };
    const ok = tx.receipt === `SIMULATED:${tx.originalTransactionId ?? tx.transactionId}:${tx.storeId}` || tx.receipt === `SIMULATED:${tx.transactionId}:${tx.storeId}`;
    return ok ? { ok: true, test: true } : { ok: false, test: true, reason: 'invalid_receipt' };
  }
}

/**
 * Production verifier: posts the store proof to YOUR backend, which verifies it with Apple
 * (App Store Server API / signed JWS) or Google (Play Developer API purchases.products.get),
 * records it idempotently and returns the grant. The endpoint does not exist yet — it must be
 * built and deployed (docs/MONETIZATION.md §Backend). Without a URL, nothing is ever granted.
 */
export class RemoteVerifier implements PurchaseVerifier {
  constructor(
    private url: string | undefined,
    private playerId: () => string,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  get available(): boolean {
    return !!this.url;
  }

  async verify(tx: Transaction, productId: string): Promise<VerificationResult> {
    if (!this.url) return { ok: false, test: false, reason: 'verification_backend_not_configured' };
    if (tx.test) return { ok: false, test: true, reason: 'test_transaction_rejected' };
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId(), productId, storeId: tx.storeId, transactionId: tx.transactionId, receipt: tx.receipt }),
      });
      if (!res.ok) return { ok: false, test: false, reason: `http_${res.status}` };
      const body = (await res.json()) as { verified?: boolean; reason?: string };
      return body.verified === true ? { ok: true, test: false } : { ok: false, test: false, reason: body.reason ?? 'rejected' };
    } catch {
      return { ok: false, test: false, reason: 'network' };
    }
  }
}
