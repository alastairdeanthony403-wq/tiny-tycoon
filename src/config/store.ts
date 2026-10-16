/**
 * STORE BALANCE CONFIGURATION (Gem prices, booster strengths, perk levels, Gem rewards).
 * Every number the store uses lives here, so the store can be rebalanced without touching
 * gameplay or UI code. See docs/STORE.md for the balance report these values came from.
 */

/** Timed boosters. Durations are in active play seconds (the same clock as the simulation),
 * so changing the device clock or staying offline never uses them up or extends them. */
export type BoosterId = 'revenue_boost' | 'customer_rush' | 'staff_boost';
export interface BoosterDef {
  id: BoosterId;
  icon: string;
  /** What the booster multiplies. */
  effect: 'price' | 'spawn' | 'staff_speed';
  mult: number;
  seconds: number;
  /** Buying again while active extends the timer up to this many seconds. */
  maxStackSeconds: number;
}

export const BOOSTERS: Record<BoosterId, BoosterDef> = {
  revenue_boost: { id: 'revenue_boost', icon: '💰', effect: 'price', mult: 1.5, seconds: 600, maxStackSeconds: 3600 },
  customer_rush: { id: 'customer_rush', icon: '🚶', effect: 'spawn', mult: 1.6, seconds: 300, maxStackSeconds: 1800 },
  staff_boost: { id: 'staff_boost', icon: '⚡', effect: 'staff_speed', mult: 1.5, seconds: 600, maxStackSeconds: 3600 },
};

/** Permanent Gem upgrades (levels). Each level adds `perLevel` to its effect. */
export type GemPerkId = 'vip_checkout' | 'staff_academy' | 'big_warehouse' | 'loyalty_card' | 'lean_operations' | 'night_manager' | 'street_signs';
export interface GemPerkDef {
  id: GemPerkId;
  icon: string;
  effect: 'checkout_speed' | 'staff_speed' | 'capacity' | 'patience' | 'wages' | 'offline_hours' | 'max_customers';
  perLevel: number;
  /** Gem price of level 1, 2, 3… (length = max level). */
  prices: number[];
  requiredLevel: number;
}

export const GEM_PERKS: Record<GemPerkId, GemPerkDef> = {
  vip_checkout: { id: 'vip_checkout', icon: '🧾', effect: 'checkout_speed', perLevel: 0.08, prices: [40, 70, 110, 160, 220], requiredLevel: 3 },
  staff_academy: { id: 'staff_academy', icon: '🎓', effect: 'staff_speed', perLevel: 0.06, prices: [50, 85, 130, 185, 250], requiredLevel: 5 },
  big_warehouse: { id: 'big_warehouse', icon: '🏗️', effect: 'capacity', perLevel: 0.1, prices: [40, 70, 110, 160, 220], requiredLevel: 4 },
  loyalty_card: { id: 'loyalty_card', icon: '💳', effect: 'patience', perLevel: 0.1, prices: [35, 60, 95, 140, 190], requiredLevel: 2 },
  lean_operations: { id: 'lean_operations', icon: '📉', effect: 'wages', perLevel: 0.05, prices: [60, 100, 150, 210], requiredLevel: 6 },
  night_manager: { id: 'night_manager', icon: '🌙', effect: 'offline_hours', perLevel: 1, prices: [50, 90, 140, 200], requiredLevel: 4 },
  street_signs: { id: 'street_signs', icon: '🪧', effect: 'max_customers', perLevel: 1, prices: [45, 80, 125, 180, 240], requiredLevel: 3 },
};

/** Instant resource packages and one-shot services. */
export const RESOURCES = {
  /** Cash packs pay this many seconds of the shop's current measured income, never less than the floor. */
  cashSmall: { seconds: 600, floorPerLevel: 30 },
  cashLarge: { seconds: 3600, floorPerLevel: 150 },
  /** Experience pack: this share of the XP needed for the current level (never more than one level-up). */
  xpShare: 0.5,
  /** Expansion Permit: discount on the next expansion's cash price. */
  expansionDiscount: 0.25,
  /** Offline Bonus: multiplier on the next offline collection (offline time caps still apply first). */
  offlineMultiplier: 2,
  /** At most this many unused charges of each kind can be held. */
  maxCharges: 1,
};

/** Cosmetic style slots beyond the shop theme and staff outfits. */
export type StyleSlot = 'accessory' | 'display' | 'checkout' | 'sign' | 'entrance';
export const STYLE_SLOTS: StyleSlot[] = ['accessory', 'display', 'checkout', 'sign', 'entrance'];

/** One-time Gem rewards (each key is granted at most once per save). */
export const GEM_REWARDS = {
  /** Reaching player level n pays perLevel, plus bonusEvery5 on multiples of 5. */
  levelUp: { perLevel: 2, bonusEvery5: 5 },
  /** First time any shop reaches a tier. */
  tier: { expanded: 10, super: 20, mega: 35, flagship: 60 } as Record<string, number>,
  /** Each franchise (prestige). */
  franchise: 30,
  /** Finishing the guided tutorial (not when it is skipped). */
  tutorial: 20,
  /** First visit to the store during an event. */
  eventGift: 10,
};

/** Events: optional cosmetic collections on a real yearly calendar (UTC month/day, inclusive),
 * or relative to when the save was created. */
export interface StoreEventDef {
  id: 'autumn_market' | 'winter_village' | 'neon_festival' | 'ocean_week' | 'grand_opening';
  icon: string;
  from?: [number, number];
  to?: [number, number];
  /** Days after the save was created (for the Grand Opening). */
  firstDays?: number;
}

export const STORE_EVENTS: StoreEventDef[] = [
  { id: 'grand_opening', icon: '🎉', firstDays: 7 },
  { id: 'autumn_market', icon: '🍂', from: [10, 1], to: [11, 15] },
  { id: 'winter_village', icon: '❄️', from: [12, 1], to: [1, 6] },
  { id: 'neon_festival', icon: '🌃', from: [2, 1], to: [2, 21] },
  { id: 'ocean_week', icon: '🌊', from: [7, 1], to: [7, 14] },
];

/** Bundles cost this share of the genuine sum of their contents' individual Gem prices. */
export const BUNDLE_PRICE_SHARE = 0.8;

/** Spending at or above this many Gems always asks for confirmation (every Gem purchase does today). */
export const CONFIRM_ABOVE_GEMS = 0;
