# Tiny Tycoon — Monetization architecture & integration guide

> **Status:** the in-game store, Gems, cosmetics, entitlements and the purchase state machine are
> implemented and tested against a **test-only simulated store**. **No real-money purchase path is
> live.** StoreKit (iOS), Google Play Billing (Android) and the verification backend still have to be
> built, configured and sandbox-tested (see "What still needs to be done").

## 1. Architecture

```
UI (src/ui/premiumShop.ts)            ← never knows which platform is active
        │
PurchaseController (src/monetization/controller.ts)   ← state machine, idempotency, outcomes
        │                         │
PurchaseAdapter (types.ts)    PurchaseVerifier (types.ts)
 ├─ SimulatedPurchaseAdapter   ├─ SimulatedVerifier  (accepts only test transactions)
 └─ NativeBridgeAdapter ──►    └─ RemoteVerifier     (POSTs to YOUR backend; not deployed yet)
      window.TinyTycoonBilling  (native plugin: StoreKit 2 / Play Billing)
        │
MonetizationManager (src/sim/monetization.ts)  ← Gems, ledger, entitlements, equip, layouts (sync, unit-tested)
        │
Save file (src/save/saveManager.ts, version 3) ← local cache of entitlements; NOT the production source of truth
```

Adapter selection (`src/main.ts › createStoreBackend`):

| Situation | Adapter | Verifier | What the player sees |
|---|---|---|---|
| Packaged app exposing `window.TinyTycoonBilling` | `NativeBridgeAdapter` | `RemoteVerifier(VITE_PURCHASE_VERIFY_URL)` | Real store prices; purchases granted only after the backend verifies |
| `npm run dev` or build with `VITE_SIMULATED_STORE=1` | `SimulatedPurchaseAdapter` | `SimulatedVerifier` | Permanent striped **TEST STORE** banner, "Test buy" / "Simulate purchase" buttons |
| Any other build (e.g. a plain web deploy) | `NativeBridgeAdapter` (no bridge) | — | "Real-money purchases aren't available"; Gem unlocks still work |

### Purchase state machine

```
purchase() ─► cancelled ──────────────► nothing changes
          ├─► failed ─────────────────► nothing changes (interrupted payments arrive later via updates)
          ├─► pending ──(approved)──► purchased ─► verify ─┬─ ok ─► grant once ─► finish (ack/consume)
          │            └(declined)─► failed                 └─ fail ─► stays "purchased, unverified": not granted, not finished, retried
          └─► purchased ─────────────────────────────────► (same as above)
updates listener ─► refunded/revoked ─► revoke entitlement / claw back unspent purchased Gems (never below 0)
```

* **Idempotency:** every grant is keyed by the store transaction id (`processedTx`). Duplicate callbacks,
  relaunch re-deliveries and restores are no-ops. Refunds are keyed `revoke:<txId>`.
* **One purchase at a time:** the controller refuses new real-money purchases while one is in flight;
  Gem spends are synchronous (validate → deduct → grant) and guarded against re-entry and double taps.
* **Never granted without verification.** A transaction that fails verification is not finished, so the
  store will re-deliver it and verification is retried.

## 2. Catalog (`src/monetization/catalog.ts`)

Internal ids are permanent once released (they're in saves, ledgers and the backend).
`LEGACY_PRODUCT_IDS` maps pre-release ids found in saves (`skin_golden_shelves` → `cosmetic_golden_shelves`, `skin_neon_nights` → `cosmetic_neon_nights`) when a save is loaded.

Products may declare `requires: { level?, lifetimeRevenue? }`. `MonetizationManager.requirements(id)` reports each gate, `buyWithGems` refuses with `locked` until all are met, and the Premium Shop lists unmet requirements with the player's progress. Shop themes are defined as data in `src/render/skins.ts` (palette, shelf, display trim, checkout, sign, uniform, effect), so further themes only need a skin entry plus a catalog entry.

| Internal id | Type | Grant | Gem price | Dev sample price* | Store id (iOS = Android) |
|---|---|---|---|---|---|
| cosmetic_neon_nights | non-consumable | Neon Nights shop theme. Requires level 10 and £2,500 lifetime revenue | 150 | £2.99 | com.tinytycoon.cosmetic_neon_nights |
| cosmetic_golden_shelves | non-consumable | Golden Shelves shop theme (gold shelf frames, display trim, checkout accents, signage, uniforms). Requires level 15 and £25,000 lifetime revenue | 200 | — (Gems only, `realMoney: false`; not sold through the app stores) | com.tinytycoon.cosmetic_golden_shelves (reserved, not registered) |
| cosmetic_cozy_autumn | non-consumable | Cozy Autumn shop theme (russet/oak palette, autumn sign and uniforms, drifting leaves). Requires level 8 and £8,000 lifetime revenue | 120 | — (Gems only, `realMoney: false`) | com.tinytycoon.cosmetic_cozy_autumn (reserved, not registered) |
| cosmetic_ocean_breeze | non-consumable | Ocean Breeze shop theme (sea-glass palette, seaside sign and uniforms, floor caustics). Requires level 12 and £40,000 lifetime revenue | 120 | — (Gems only, `realMoney: false`) | com.tinytycoon.cosmetic_ocean_breeze (reserved, not registered) |
| bundle_staff_outfits | non-consumable | Smart Suits + Retro Diner outfits | 200 | £1.99 | com.tinytycoon.bundle_staff_outfits |
| bundle_outfits_deluxe | non-consumable | Barista, Chef Whites, Space Explorer and Holiday outfits. Requires level 6 | 250 | — (Gems only, `realMoney: false`) | com.tinytycoon.bundle_outfits_deluxe (reserved, not registered) |
| bundle_seasonal_decorations | non-consumable | Snowman, pumpkin lantern, fairy lights (placeable decor) | 200 | £1.99 | com.tinytycoon.bundle_seasonal_decorations |
| gems_small | consumable | 100 Gems | — | £0.99 | com.tinytycoon.gems_small |
| gems_medium | consumable | 550 Gems | — | £4.99 | com.tinytycoon.gems_medium |
| gems_large | consumable | 1,200 Gems | — | £9.99 | com.tinytycoon.gems_large |
| layout_slots_plus | non-consumable | +3 saved layout slots (1 → 4 per location) | 300 | £1.99 | com.tinytycoon.layout_slots_plus |
| automation_basic | non-consumable | Auto-restock assistant (refills *empty* displays, toggleable) | 500 | £2.99 | com.tinytycoon.automation_basic |

\* `devPrice` is used **only** by the simulator. Production prices and currency formatting must come from
StoreKit `Product.displayPrice` / Play `ProductDetails.getOneTimePurchaseOfferDetails().getFormattedPrice()`.
Store ids are placeholders: replace `com.tinytycoon` with the real bundle id / application id before
creating the products in the consoles.

**Fairness rules implemented:** everything except Gem packs can also be unlocked with **earned** Gems
(5 per achievement Star, 15 per milestone). Cosmetics are visual only (premium decor has the same appeal
as a plant). Auto-restock duplicates what a free Stocker does and doesn't count toward goals. No loot
boxes, timers, fake discounts or urgency. "Permanent cosmetic inventory capacity" was **not** implemented:
the game has no inventory limit, and adding one only to sell its removal would be artificial friction.

## 3. iOS — StoreKit 2 (to be implemented)

The game is a Vite web app; the intended packaging is **Capacitor** (WKWebView). Add a small native plugin
(Swift) that implements the `NativeBillingBridge` contract in `src/monetization/nativeBridgeAdapter.ts`
and exposes it as `window.TinyTycoonBilling`.

Native responsibilities:
1. `getProducts` → `Product.products(for: ids)`; return `displayPrice`, `priceFormatStyle.currencyCode`, price in micros.
2. `purchase` → `product.purchase(options: [.appAccountToken(playerUUID)])`; map
   `.success(.verified(tx))` → `purchased` (send `jwsRepresentation` as `receipt`),
   `.success(.unverified)` → `failed`, `.pending` → `pending`, `.userCancelled` → `cancelled`.
3. Listen to `Transaction.updates` from app launch and forward every transaction (deferred/Ask to Buy,
   interrupted purchases, refunds where `revocationDate != nil` → `refunded`).
4. `restorePurchases` → `AppStore.sync()` then iterate `Transaction.currentEntitlements`.
5. `finishTransaction` → `transaction.finish()` **only after** the game reports a successful grant.
6. Consumables are idempotent by `transaction.id` on the server; never grant twice.

Test in the **Xcode StoreKit configuration file** first, then **App Store Connect Sandbox** testers,
then TestFlight. Never ship the simulator: it is only reachable in dev or with `VITE_SIMULATED_STORE=1`.

## 4. Android — Google Play Billing (to be implemented)

Implement the same bridge in Kotlin with the **current Google Play Billing Library** (v7 or newer —
check Google's required minimum at release time).

1. `BillingClient.newBuilder(context).setListener(purchasesUpdatedListener).enablePendingPurchases(...)`.
2. `getProducts` → `queryProductDetailsAsync` (type `INAPP`); return the formatted price and currency.
3. `purchase` → `launchBillingFlow` with `setObfuscatedAccountId(playerId)`.
4. `PurchasesUpdatedListener`: `PURCHASED` → `purchased` (receipt = `purchaseToken`), `PENDING` → `pending`,
   `USER_CANCELED` → `cancelled`, other codes → `failed`.
5. On every app start: `queryPurchasesAsync(INAPP)` to recover purchases made while the app was closed.
6. `finishTransaction`: consumables → `consumeAsync`; non-consumables → `acknowledgePurchase`
   (purchases not acknowledged within 3 days are refunded by Google). Only after a verified grant.
7. Handle duplicate listener callbacks: the game's idempotency key is the purchase token / order id.

Test with **license testers** on the **internal testing track**; use test cards for pending/declined flows.

## 5. Backend (required for production — does not exist yet)

A client-side save file is **not** a secure source of truth for real money. Build a service with a
transactional database (e.g. Postgres) before release. Responsibilities:

* `POST /purchases/verify` `{ playerId, productId, storeId, transactionId, receipt }` → `{ verified, grants }`
  * iOS: validate the JWS signature chain or call the App Store Server API (*Get Transaction Info*).
  * Android: call the Google Play Developer API `purchases.products.get` with the purchase token.
  * Insert into `transactions(transaction_id PRIMARY KEY, player_id, product_id, platform, state, …)`
    in the same DB transaction as the grant → exactly-once grants.
* `GET /players/{id}/entitlements` → authoritative entitlements + Gem balance (earned/purchased).
* `POST /players/{id}/gems/spend` → server-side atomic spend for Gem-priced items.
* Refunds/revocations: subscribe to **App Store Server Notifications V2** (REFUND, REVOKE) and Google
  **Real-time developer notifications** + the Voided Purchases API; revoke entitlements and record the clawback.
* Reconciliation job comparing store records with the DB; support tooling for recovery.
* Credentials (App Store Connect API key, Google service account) live only on the server.

The client already calls this boundary through `RemoteVerifier` when `VITE_PURCHASE_VERIFY_URL` is set,
and refuses to grant anything when it is not.

## 6. Developer-console setup still required

* App Store Connect: app record, bundle id, Paid Apps agreement, banking/tax, each in-app purchase
  (consumable / non-consumable) with localized names, review screenshot and notes, sandbox testers.
* Google Play Console: app, merchant account, each in-app product (managed product), license testers,
  internal testing track, RTDN Pub/Sub topic, service account with financial data permission.
* Replace placeholder store ids; configure `VITE_PURCHASE_VERIFY_URL`.

## 7. Compliance checklist (before submission)

* Digital goods use Apple / Google billing only (regional alternative-payment rules reviewed separately).
* Product contents and real prices shown before purchase (implemented); no randomized paid rewards (none exist).
* Restore Purchases button (implemented) — required by Apple for non-consumables.
* App Review access: purchases reachable from the 💎 HUD button; provide review notes.
* Privacy labels / Data safety form (purchase history, player id), age rating, parental controls
  (Ask to Buy → pending flow is handled), consumer-protection & refund wording per region.

## 8. Tests

* `tests/monetization.test.ts` — catalog, earned-Gem spending, insufficient balance, rapid taps,
  duplicate notifications, cancel/fail/pending/interrupted/verification failure, restore, refunds,
  layouts, auto-restock, persistence and v2 → v3 migration (all against the simulator).
* Browser QA (Playwright) drove the store UI at 390×844 and 320×568 with the test store build.
* **Not tested:** anything native (StoreKit, Play Billing), the backend, real sandbox transactions.

## 9. Optional rewarded ads

- Rules: `src/sim/ads.ts` (config in `src/config/ads.ts`): +50% sale prices for 5 minutes, max 4/day
  (UTC), 30-minute cooldown, each `completionId` rewarded once, excluded from offline earnings.
- Adapter: `src/ads/` — `RewardedAdProvider` with `NoAdProvider` (production default: offer hidden),
  `SimulatedAdProvider` (dev / `VITE_SIMULATED_ADS=1`, labelled "Development simulation"), and
  `NativeAdBridgeProvider` (`window.TinyTycoonAds`). The reward is granted only for a provider-confirmed
  completion; skipped/failed/unavailable ads grant nothing and never block play.
- Not live: no ad network is integrated. See [LAUNCH.md](LAUNCH.md).
