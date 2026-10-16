# Store, Gems and the progression economy

The Store opens from the 💎 balance in the HUD. It is where Gems are spent and where they come from. Everything in it is connected to real gameplay systems. Every item except the Gem packs can be bought with **earned** Gems, and nothing in it is needed to progress.

> **Real money:** nothing here is live. Real-money items still go through the existing purchase adapter. Development builds use a clearly labelled test store, and production shows them as unavailable until native billing and server verification exist (see [MONETIZATION.md](MONETIZATION.md)). Every item added in this round is **Gems-only** (`realMoney: false`).

## Currency

The currency is **Gems** (the existing name; no second premium currency was added).
- The balance is shown in the HUD, the store header (with cash next to it), every purchase confirmation, and reward toasts.
- Gems are kept as *earned* and *purchased*. Earned Gems are spent first.
- Every change goes through `MonetizationManager` (`earnGems`, `debitGems`, `refundGems`) and is written to the ledger.

**Earning Gems** (all through the same ledger; one-time rewards are keyed so they can be granted only once per save, even across reloads):

| Source | Gems | Rule |
|---|---|---|
| Daily missions | 3 each (3 a day) | existing; once per mission per day |
| Weekly missions | 20–25 each (3 a week) | existing |
| Achievements | 5 per Star | existing; once per achievement |
| Milestones | 15 each | existing |
| Level-up | 2 per level, +5 on every 5th level | new; key `level:N` |
| First time any shop reaches a tier | Expanded 10, Super 20, Mega 35, Flagship 60 | new; key `tier:<id>` |
| Franchise | 30 each | new; key `franchise:N` |
| Finishing the tutorial | 20 | new; not paid when the tutorial is skipped |
| Event gift | 10 per event | new; once per event, ever (claimed with a button) |
| Rewarded ads | — | unchanged: the optional ad gives a sale-price boost, only with a real provider |

## Store layout

| Tab | Contents |
|---|---|
| Home | Running events with their real end date and gift; recently unlocked items; recommendations (stock if shelves are low, the cheapest Gem upgrade, a permit before an expansion…); featured items; how to earn Gems |
| Upgrades | 7 permanent Gem upgrades (levelled) and the 8 existing cash upgrades (bought with cash, same system as the Upgrades tab) |
| Boosters | 3 timed boosters |
| Cosmetics | Themes (4), staff outfit packs (2), staff accessories (3), display styles (3), checkout skins (3), signage & lighting (3), entrances (5), decorations (seasonal pack, Franchise Fountain), event collections (5) |
| Bundles | 5 bundles |
| Exchange | Cash Bag, Cash Vault, Experience Book, Stock Delivery, Staff Training, Expansion Permit, Night Shift Bonus; layout slots and auto-restock |
| Gems | Gem packs (real money, test store only) and the list of free Gem sources |

**Cards** show:
- artwork, name and the item's real effect for this player right now;
- price, owned, equipped, level or time-left state;
- daily-limit count;
- for a locked item, the exact missing requirements (for example "🔒 Level 14 · Mega Store").

**Item details** add:
- the full effect with current → next values;
- bundle contents with each item's own price and the genuine saving;
- the requirement checklist with progress;
- a live "preview in shop" for themes, outfits and styles;
- equip and unequip.

**Purchase confirmation** shows the main benefit, the exact cost, the current balance and the balance afterwards. Buttons are guarded against double taps, and the purchase service refuses re-entrant calls.

**Feedback.** Every outcome gets its own message: success, not enough Gems, locked, already owned, already own part of a bundle, max level, daily limit, already holding a charge, nothing to do right now, real-money billing unavailable, failed (Gems returned), booster started and booster ended. A failed save is reported by the existing save-failure toast.

There are no countdown timers, fake scarcity or misleading sale badges. Event end dates come from the event calendar, and bundle savings are computed from real prices.

## Items and their real effects

**Gem upgrades.** Permanent; each level costs more. They apply through `Modifiers` in every shop.

| Item | Per level | Max | Prices (Gems) | Where it acts |
|---|---|---|---|---|
| VIP Checkout Training | +8% checkout speed | 5 | 40, 70, 110, 160, 220 | `CheckoutManager.speed` (owner and cashiers) |
| Staff Academy | +6% staff speed | 5 | 50, 85, 130, 185, 250 | `Modifiers.staffSpeedMult` |
| Bigger Shelves | +10% display capacity | 5 | 40, 70, 110, 160, 220 | `Modifiers.capacityMult` |
| Loyalty Cards | +10% customer patience | 5 | 35, 60, 95, 140, 190 | `Modifiers.patienceMult` |
| Lean Operations | −5% wages (never below half) | 4 | 60, 100, 150, 210 | `EconomyManager.wagesPerMinute` |
| Night Manager | +1 h offline earning time | 4 | 50, 90, 140, 200 | `Modifiers.offlineCapSeconds` |
| Street Signs | +1 customer in the shop at once | 5 | 45, 80, 125, 180, 240 | `CustomerManager.maxCustomers` |

**Boosters.** Each one lasts a set amount of **active play time**. They count down with the simulation, so offline time and clock changes never use them up or extend them. Buying again while one is active adds time, up to a cap. Each is limited to **3 per UTC day**. Active boosters show as chips in the HUD and are announced when they end.

| Item | Effect | Time | Cap | Gems |
|---|---|---|---|---|
| Revenue Boost | sale prices ×1.5 (multiplies with the optional rewarded-ad boost if both run) | 10 min | 60 min | 40 |
| Customer Rush | customers arrive ×1.6 as often, and up to 1.6× as many can shop at once (doesn't stack with rush hour) | 5 min | 30 min | 25 |
| Staff Productivity | staff work ×1.5 faster | 10 min | 60 min | 25 |

**Exchange.** One-shot items. Before buying, the exact amount for this player is shown.

| Item | Effect | Gems | Limit |
|---|---|---|---|
| Cash Bag | 10 min of measured income, at least £30 × level | 15 | 3/day |
| Cash Vault | 60 min of measured income, at least £150 × level | 70 | 1/day (level 8) |
| Experience Book | half of the current level's XP | 20 | 2/day |
| Stock Delivery | fills every display in the current shop (not machines during a power cut) | 8 | 6/day |
| Staff Training | the lowest-level employee goes up one level | 30 | 2/day |
| Expansion Permit | the next expansion costs 25% less cash (requirements unchanged) | 30 | hold 1 |
| Night Shift Bonus | the next offline collection ×2 (the offline time cap still applies first) | 20 | hold 1 |

Items that would do nothing right now are refused before any Gems are taken: every display full, no staff to train, no expansion left, or a charge already held.

**Cosmetics.** Each one is visual only, and a test checks the simulation is identical with every style equipped. A style overrides the theme for its slot only.
- **Accessories:** scarf, shades or bow on every staff member.
- **Displays:** pastel, rustic or chrome.
- **Checkouts:** mint, arcade or marble.
- **Signage & lighting:** wood, marquee or pink neon.
- **Entrances:** a doormat plus a pair of props by the door. Garden, seaside and red carpet unlock by level; Flagship needs the Tycoon Flagship tier and Franchise needs one franchise.
- **Late game:** the Franchise Fountain (needs one franchise).
- **Event collections:** a decoration each for Grand Opening, Autumn Market, Winter Village, Neon Festival and Ocean Week.

All decorations have the same appeal as the cash-bought plant.

**Bundles.** Each bundle can be bought once. Its price is 80% of the genuine sum of its items' own Gem prices, and the detail view shows that sum. A bundle whose unique item is already owned is refused ("already own part of this bundle") instead of selling the item twice. Bundles need everything their contents need.

| Bundle | Contents | Price |
|---|---|---|
| New Shop Starter Pack | Cash Bag, Stock Delivery, Cosy Scarves | 50 |
| Busy Shop Pack | Stock Delivery, Staff Productivity, Customer Rush | 46 |
| Store Expansion Pack | Expansion Permit, Cash Vault | 80 |
| Autumn Style Pack | Cozy Autumn theme, Rustic Displays, Cosy Scarves | 176 |
| Tycoon Collection | Golden Shelves, Marble Checkouts, Marquee Lights, Red Carpet Entrance, Cash Vault | 448 |

## Events

Events are configured in `STORE_EVENTS` (`src/config/store.ts`):
- **Grand Opening:** the first 7 days after the save was created.
- **Autumn Market:** 1 Oct – 15 Nov.
- **Winter Village:** 1 Dec – 6 Jan (wraps the year end).
- **Neon Festival:** 1 – 21 Feb.
- **Ocean Week:** 1 – 14 Jul.

All dates are UTC. While an event runs, the store shows its real end date, its decoration can be bought (and stays owned afterwards), and its gift can be claimed once. Events only offer cosmetics; nothing needed for progression is time-limited.

**Clock changes.** Like missions, events read the device clock; there is no trusted server time. Moving the clock can open an event early, but each gift is once per event per save. A clock set before the save's creation date never counts as the Grand Opening.

## Purchase service (`src/sim/store.ts`)

`StoreManager.purchase(id)` is the single path for Gem purchases. `MonetizationManager.buyWithGems` delegates to it. The steps:
1. **Resolve:** look the item up by its stable id (unknown → `unknown`).
2. **Re-entrancy:** a purchase already in progress → `busy`.
3. **Ownership:** a unique item already owned → `owned`; a bundle with an owned unique item → `owned_part`.
4. **Requirements:** level, lifetime revenue, best tier, franchises, achievement, running event → `locked`. A bundle merges its contents' requirements.
5. **Limits:** `max_level`, `daily_limit`, `charge_held`, and `nothing_to_do` for items with no effect right now.
6. **Price:** for levelled upgrades, the price of the next level.
7. **Affordability:** → `insufficient`.
8. **Deduct once:** `debitGems` takes earned Gems first, then purchased ones, and writes a ledger entry.
9. **Grant:** each change records an undo step. If anything throws, every undo runs in reverse, the Gems are refunded through the ledger, and the result is `failed`. A partly granted bundle is impossible.
10. **Record:** daily purchase counts; the `storePurchased` event; analytics (`currency_spent`, `store_purchase_succeeded` or `store_purchase_failed`, `booster_activated`).
11. **UI:** saves immediately and shows feedback.

Analytics names are `store_opened`, `store_category_selected`, `store_item_viewed`, `currency_earned`, `currency_spent`, `store_purchase_succeeded`, `store_purchase_failed`, `booster_activated` and `cosmetic_equipped`, plus the existing `rewarded_ad_completed`. They go through the existing consent-gated analytics, carry only item ids and amounts, and are dropped when consent is off.

## Saves

Store state is saved in `state.store` and validated by `validateStore`:
- **Gem upgrade levels:** clamped to the maximum.
- **Booster time left:** clamped to the cap.
- **Daily purchase counts.**
- **Held charges:** clamped to 1.
- **One-time reward keys:** de-duplicated.
- **Seen items.**

Unknown ids are dropped. Ownership stays in `monetization.entitlements` (as before), and the equipped styles live in `monetization.equipped`. Older saves without these fields load with defaults, and equipped items the player no longer owns are unequipped. All of this uses the existing versioned save with checksum, backup and recovery. Catalogue data is never saved.

## Balance report (seeded simulation)

`tests/store_balance.test.ts` runs the 60-minute balance bot in three ways:
- **free:** never spends Gems;
- **spender:** spends every earned Gem on a Revenue Boost when none is running, the cheapest Gem upgrade, a permit, or Cash Bags;
- **payer:** the same, plus one 1,200-Gem pack at the start.

`npm test` runs one seed. `STORE_REPORT=1 npx vitest run tests/store_balance.test.ts` runs three seeds (777, 123 and 4242) and prints the following.

**Free player, first 60 minutes:**
- **Gems earned:** 355, 355 and 292. Sources (seed 777): achievements 165, milestones 75, missions 49, level-ups 36, tutorial 20, tier 10.
- **First hour is front-loaded:** most of it comes from one-time achievements and milestones. After that, steady income is roughly 9 a day from daily missions, about 65 a week from weekly missions, plus level, tier and franchise rewards.
- **Time to afford:**

  | Item | Time |
  |---|---|
  | Revenue Boost (40) | 5 min |
  | first Gem upgrade (35) | 5 min |
  | a theme (120) | 10 min |
  | Golden Shelves (200) | 25 min |
  | Auto-restock (500) | over 60 min (several days of missions) |

**Progress at 60 minutes:**

| Seed | Free | Spender | Payer | Revenue vs free |
|---|---|---|---|---|
| 777 | L14, stage 3, £49.4K | L15, stage 4, £73.7K | L15, stage 4, £74.5K | ×1.49 / ×1.51 |
| 123 | L14, stage 3, £51.7K | L15, stage 4, £78.4K | L15, stage 4, £76.3K | ×1.52 / ×1.48 |
| 4242 | L14, stage 3, £44.8K | L15, stage 4, £69.2K | L16, stage 4, £74.7K | ×1.55 / ×1.67 |

**Averages:** spender ×1.52, payer ×1.55. The free player never goes 10 minutes without something to buy. The test asserts the free path's pace, a Gem income of 80–800 in the first hour, and average revenue below ×1.6 for spenders and ×2 for payers.

**Reading the numbers:**
- **Spending Gems helps a lot early.** About one level and one expansion ahead after an hour, and lifetime revenue +50%. That revenue figure counts boosted gross sales directly.
- **Paying more barely changes the outcome.** In the first hour, a 1,200-Gem pack adds almost nothing over spending earned Gems, because cash, level and revenue requirements still gate expansions and Gem upgrades give modest percentages. There is no pay-to-win runaway.
- **Where the boost comes from.** Separate runs found Revenue Boosts to be the biggest lever (×1.31 with 3 boosts). Expansion Permits and Cash Bags help mostly by making the next expansion come sooner, which compounds. Gem upgrades bought in the first hour were within noise (×0.98).
- **Tuning already applied.** In the first version, a 20-Gem Revenue Boost with no daily limit ran almost continuously (×1.60 for spenders). It was raised to 40 Gems and limited to 3 a day, the other boosters to 25 Gems, and the Cash Bag's per-level minimum was halved.
- **Inflation risks to watch.** Cash Bags and Vaults pay a share of *measured* income, so they scale with the economy instead of inflating it, and daily limits cap them. Revenue Boosts are the item most able to trivialise early play; they are capped at 3 a day. Gem upgrades stack across all shops, so check their late-game value against franchise bonuses before raising maximum levels.
- **Limits of this evidence.** It is a one-hour bot simulation, not live player data. Revenue in a multi-day session hasn't been simulated. Tune again with real analytics before launch.

## How to…

- **Add a product:** add it to the right table in `src/monetization/catalog.ts`: `RESOURCE_PRODUCTS`, `BOOSTER_PRODUCTS`, `STYLE_PRODUCTS`, `DECOR_PRODUCTS` or `BUNDLE_PRODUCTS`. Gem upgrades come from `GEM_PERKS` in `src/config/store.ts`. Then add `premium.<id>.name`, `.desc` and `.long` to `src/locales/en.ts`; the localization test lists anything missing. `validateCatalog()` runs in the tests and at start-up in dev builds. It rejects duplicate ids, bad prices, repeatable non-consumables, bundles that cost more than their contents, and bundle items that can't be bundled.
- **Set prices:** Gem prices are in those tables and in `GEM_PERKS.prices`. Bundle prices are derived (`BUNDLE_PRICE_SHARE`). Real-money prices always come from the platform store; `devPrice` is a development sample only.
- **Configure rewards:** edit `GEM_REWARDS` (level, tier, franchise, tutorial, event gift). Mission and achievement rewards stay in their own config files.
- **Adjust balance:** booster strength, duration and caps are in `BOOSTERS`; Gem upgrade effects in `GEM_PERKS`; resource formulas in `RESOURCES`; events in `STORE_EVENTS`. Re-run `STORE_REPORT=1 npx vitest run tests/store_balance.test.ts` and compare with the table above.
- **Add a cosmetic style:** add the visual data to `src/render/styles.ts`, then a `STYLE_PRODUCTS` entry with its slot.
- **Add an event:** add it to `STORE_EVENTS` and add a `DECOR_PRODUCTS` item with `requires: { event: '<id>' }`. Event decorations need a decor object in `config/objects.ts` with a `sprite`, and `npm run art:export` for its thumbnail.

## Known limitations

- **Client-side record.** Gems and entitlements live on the device, as before. Until a server exists, this record is not a secure source of truth for paid items (see MONETIZATION.md).
- **Clock-based limits.** Daily limits and events use the device clock. Changing the clock can reset a daily limit early, but every Gem purchase still costs Gems, and one-time gifts and rewards are keyed so they can't repeat.
- **Untested balance.** Late-game balance (multi-day play, franchises) is reasoned from the config, not simulated.
- **Rewarded ads.** They still give only the existing sale-price boost, not Gems.
