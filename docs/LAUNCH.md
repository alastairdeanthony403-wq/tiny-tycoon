# Tiny Tycoon — Launch readiness

This file records what is implemented, what still needs external setup, and the checklist for
publishing. **Nothing here has been released.** No developer account, store listing, payment
provider, ad network, analytics provider or backend is configured in this repository.

## 1. Status by system

| System | In the game | Live with real providers? |
|---|---|---|
| Core loop (customers, stock, checkout, staff, upgrades, expansions, locations, franchise) | Yes, data-driven (`src/config`) and unit-tested | n/a |
| Onboarding (12 guided steps, skip, "How to play", replayable tips) | Yes | n/a |
| Goals, side goals, **daily & weekly missions** | Yes | n/a — see §3 for the clock limitation |
| Achievements, milestones (free Gems) | Yes | n/a |
| Offline earnings (capped, collected once) | Yes | n/a |
| Saves (versioned, checksum, backup, migration, damaged-save quarantine) | Yes (browser `localStorage`) | No cloud sync |
| Cosmetic themes (Neon Nights, Golden Shelves), Gems, Premium Shop | Yes | Gem spending only |
| Real-money purchases | Adapter + controller + **test-only simulator** | **No** — needs StoreKit / Play Billing plugin and a verification backend ([MONETIZATION.md](MONETIZATION.md)) |
| Rewarded ads (optional sale-price boost) | Rules + adapter + **development simulator** | **No** — needs an ad network SDK via `window.TinyTycoonAds` |
| Analytics & crash reporting | Adapter, events, consent gate, error capture | **No** — no provider; events stay on the device |
| Notifications | Optional, permission asked only from Settings | Browser notifications only |

## 2. Build modes

| Command | Purchases | Ads | Analytics |
|---|---|---|---|
| `npm run dev` | Test store (labelled) | Simulator (labelled) | Console only |
| `VITE_SIMULATED_STORE=1 VITE_SIMULATED_ADS=1 npm run build` | Test store (labelled) | Simulator (labelled) | None |
| `npm run build` (production) | Unavailable unless a native billing bridge exists | Hidden unless a native ad bridge exists | Only if `window.TinyTycoonAnalytics` exists **and** the player opts in |

Simulated purchases are recorded with `test: true` and the simulator never runs in a production
build, so simulated entitlements cannot be mistaken for paid ones.

## 3. Known limitations (by design, documented honestly)

- **Local clock.** Daily/weekly missions and the ad daily cap use the device's UTC date. Moving
  the clock forward rolls missions early; moving it back never rerolls them. A server time source
  is needed to make this cheat-resistant.
- **Local saves are untrusted.** The checksum catches corruption and casual edits, not determined
  tampering. Real-money entitlements must be re-verified against the store/backend (restore).
- **Offline earnings** are capped (`ECONOMY.offline`) and exclude the temporary ad boost.

## 4. External setup still required

1. **Billing:** Apple / Google developer accounts, products created with the ids in
   `src/monetization/catalog.ts`, native plugin implementing `window.TinyTycoonBilling`, and the
   verification backend at `VITE_PURCHASE_VERIFY_URL` ([MONETIZATION.md §3–6](MONETIZATION.md)).
2. **Rewarded ads (optional):** choose a network (e.g. AdMob), implement `window.TinyTycoonAds`
   (`isReady`, `showRewarded` → `{ status, completionId }`), enable server-side verification so
   `completionId` is trusted, and complete consent (UMP/ATT) and child-directed settings.
3. **Analytics / crash reporting (optional):** implement `window.TinyTycoonAnalytics.track(name, props)`
   in the app shell, update the privacy policy, and keep the in-game opt-in (off by default).
4. **Cloud saves (optional):** not implemented; would need accounts plus a sync service.
5. **Native packaging:** wrap the web build (e.g. Capacitor) — app lifecycle (pause → save is
   already wired via `visibilitychange`/`pagehide`), icons/splash, and store-specific settings.

## 5. Store materials checklist

- [ ] App name, subtitle, short and long description
- [ ] App icon (1024×1024 for iOS; 512×512 for Play) — the repo only ships `public/icon.svg`
- [ ] Phone and tablet screenshots (portrait); optional preview video
- [ ] Privacy policy URL and support contact
- [ ] Age rating questionnaire (IARC / App Store); content declarations
- [ ] In-app purchase disclosure, and ads disclosure if ads are enabled
- [ ] Data-safety (Play) / privacy nutrition labels (App Store) matching the analytics/ads actually shipped
- [ ] Platform metadata: categories, keywords, pricing (free), territories

## 6. Pre-release QA checklist

- [ ] `npm test` and `npx tsc --noEmit` pass
- [ ] Fresh install: tutorial can be completed and skipped; no softlock without money
- [ ] Returning player: Continue, offline earnings once, missions keep progress across restarts
- [ ] New Game and Reset ask for confirmation
- [ ] Purchases in store sandbox: success, cancel, pending, refund, restore (real devices)
- [ ] Ads (if enabled): skip/fail give nothing; completion gives one boost; cap and cooldown
- [ ] Small (320×568) and large screens, portrait; safe areas; reduced motion; text sizes
- [ ] Long session (30+ min at ×5) without slowdown
- [ ] Unfamiliar playtesters — note where they get stuck
