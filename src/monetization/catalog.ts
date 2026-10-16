/**
 * Central, typed premium catalog. Internal product ids are stable forever once released:
 * they are stored in saves, ledgers and the backend. Store ids are configured per platform
 * in App Store Connect / Google Play Console (see docs/MONETIZATION.md).
 */

import { BOOSTERS, GEM_PERKS, BUNDLE_PRICE_SHARE, type BoosterId, type GemPerkId, type StyleSlot, type StoreEventDef } from '../config/store';

export type PremiumProductId =
  | GeneratedProductId
  | 'cosmetic_neon_nights'
  | 'cosmetic_golden_shelves'
  | 'cosmetic_cozy_autumn'
  | 'cosmetic_ocean_breeze'
  | 'bundle_staff_outfits'
  | 'bundle_outfits_deluxe'
  | 'bundle_seasonal_decorations'
  | 'gems_small'
  | 'gems_medium'
  | 'gems_large'
  | 'layout_slots_plus'
  | 'automation_basic';

export type PremiumCategory = 'upgrade' | 'booster' | 'cosmetic' | 'bundle' | 'exchange' | 'gems' | 'convenience';
export type PurchaseType = 'consumable' | 'non_consumable';

/** Instant resources and one-shot services sold in the Exchange. */
export type ResourceKind = 'cash_small' | 'cash_large' | 'xp' | 'stock' | 'staff_training' | 'expansion_permit' | 'offline_bonus';

export type Grant =
  | { kind: 'gems'; amount: number }
  | { kind: 'skin'; skin: 'neon_nights' | 'golden_shelves' | 'cozy_autumn' | 'ocean_breeze' }
  | { kind: 'outfits'; outfits: string[] }
  | { kind: 'decor'; objects: string[] }
  | { kind: 'layout_slots'; extra: number }
  | { kind: 'automation'; feature: 'auto_restock' }
  /** Permanent cosmetic style in one slot (staff accessory, display, checkout, sign, entrance). */
  | { kind: 'style'; slot: StyleSlot; style: string }
  /** One level of a permanent Gem upgrade. */
  | { kind: 'perk'; perk: GemPerkId }
  /** Starts (or extends) a timed booster. */
  | { kind: 'booster'; booster: BoosterId }
  | { kind: 'resource'; resource: ResourceKind }
  /** Several catalog items granted together, all or nothing. */
  | { kind: 'bundle'; items: PremiumProductId[] };

/** Unlock rules. Every listed condition must hold; the store shows each one with progress. */
export interface Requirements {
  level?: number;
  lifetimeRevenue?: number;
  /** Highest shop tier reached in any location (starter … flagship). */
  tier?: 'expanded' | 'super' | 'mega' | 'flagship';
  /** Number of franchises (prestiges) completed. */
  franchises?: number;
  /** An achievement that must be claimed. */
  achievement?: string;
  /** Only purchasable while this store event runs (owned items stay owned). */
  event?: StoreEventDef['id'];
}

export interface PremiumProduct {
  id: PremiumProductId;
  category: PremiumCategory;
  featured: boolean;
  type: PurchaseType;
  /** Platform store product ids. Placeholders until the apps are registered. */
  storeIds: { ios: string; android: string };
  grant: Grant;
  /** Gem price (for 'levels' items: the price of level 1; see GEM_PERKS for later levels). */
  gemPrice?: number;
  /** Can be bought with real money through the platform store. */
  realMoney: boolean;
  /** DEVELOPMENT ONLY sample price for the simulator. Production prices come from the store. */
  devPrice?: { amount: number; currency: string };
  /** Item lines shown under "Contents" (localization keys). */
  contents: string[];
  preview: { kind: 'skin' | 'outfit' | 'decor' | 'gems' | 'feature' | 'style' | 'perk' | 'booster' | 'resource' | 'bundle'; icon: string; swatch: string[] };
  /** 'once' = permanent, can't be owned twice; 'stackable' = consumable, can be bought repeatedly;
   * 'levels' = permanent upgrade bought one level at a time. */
  ownership: 'once' | 'stackable' | 'levels';
  /** Progression gates (balancing config). All must be met to buy; ownership is never taken away. */
  requires?: Requirements;
  /** Purchase limit for repeatable items (per UTC day). */
  limit?: { perDay: number };
}

const sid = (id: string) => ({ ios: `com.tinytycoon.${id}`, android: `com.tinytycoon.${id}` });

export const PREMIUM_CATALOG: PremiumProduct[] = [
  {
    id: 'cosmetic_neon_nights',
    category: 'cosmetic',
    featured: true,
    type: 'non_consumable',
    storeIds: sid('cosmetic_neon_nights'),
    grant: { kind: 'skin', skin: 'neon_nights' },
    gemPrice: 150,
    realMoney: true,
    devPrice: { amount: 2.99, currency: 'GBP' },
    contents: ['premium.contents.neon_palette', 'premium.contents.neon_signs', 'premium.contents.neon_windows'],
    preview: { kind: 'skin', icon: '🌃', swatch: ['#1a1033', '#ff2bd6', '#00f0ff'] },
    ownership: 'once',
    requires: { level: 10, lifetimeRevenue: 2500 },
  },
  {
    // Permanent shop-theme cosmetic, Gems only (no real-money SKU). No gameplay effects.
    id: 'cosmetic_golden_shelves',
    category: 'cosmetic',
    featured: true,
    type: 'non_consumable',
    storeIds: sid('cosmetic_golden_shelves'),
    grant: { kind: 'skin', skin: 'golden_shelves' },
    gemPrice: 200,
    realMoney: false,
    contents: ['premium.contents.gold_shelves', 'premium.contents.gold_trim', 'premium.contents.gold_counters', 'premium.contents.gold_signage', 'premium.contents.gold_uniforms'],
    preview: { kind: 'skin', icon: '✨', swatch: ['#3b2412', '#c8891e', '#ffd166', '#fff3d6'] },
    ownership: 'once',
    requires: { level: 15, lifetimeRevenue: 25000 },
  },
  {
    // Shop theme, Gems only. Cosmetic: palettes, signage and falling leaves; no gameplay effects.
    id: 'cosmetic_cozy_autumn',
    category: 'cosmetic',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('cosmetic_cozy_autumn'),
    grant: { kind: 'skin', skin: 'cozy_autumn' },
    gemPrice: 120,
    realMoney: false,
    contents: ['premium.contents.autumn_palette', 'premium.contents.autumn_shelves', 'premium.contents.autumn_leaves'],
    preview: { kind: 'skin', icon: '🍂', swatch: ['#7f4f24', '#d68c45', '#f4d58d', '#a44a3f'] },
    ownership: 'once',
    requires: { level: 8, lifetimeRevenue: 8000 },
  },
  {
    // Shop theme, Gems only. Cosmetic: sea-glass palette, rope trims and drifting bubbles.
    id: 'cosmetic_ocean_breeze',
    category: 'cosmetic',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('cosmetic_ocean_breeze'),
    grant: { kind: 'skin', skin: 'ocean_breeze' },
    gemPrice: 120,
    realMoney: false,
    contents: ['premium.contents.ocean_palette', 'premium.contents.ocean_shelves', 'premium.contents.ocean_bubbles'],
    preview: { kind: 'skin', icon: '🌊', swatch: ['#e0fbfc', '#48cae4', '#0077b6', '#ffd6a5'] },
    ownership: 'once',
    requires: { level: 12, lifetimeRevenue: 40000 },
  },
  {
    id: 'bundle_staff_outfits',
    category: 'cosmetic',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('bundle_staff_outfits'),
    grant: { kind: 'outfits', outfits: ['smart', 'diner'] },
    gemPrice: 200,
    realMoney: true,
    devPrice: { amount: 1.99, currency: 'GBP' },
    contents: ['premium.contents.outfit_smart', 'premium.contents.outfit_diner'],
    preview: { kind: 'outfit', icon: '👔', swatch: ['#1d3557', '#ffd166', '#ff6b9a'] },
    ownership: 'once',
  },
  {
    // Second outfit pack, Gems only.
    id: 'bundle_outfits_deluxe',
    category: 'cosmetic',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('bundle_outfits_deluxe'),
    grant: { kind: 'outfits', outfits: ['barista', 'chef_whites', 'space', 'holiday'] },
    gemPrice: 250,
    realMoney: false,
    contents: ['premium.contents.outfit_barista', 'premium.contents.outfit_chef_whites', 'premium.contents.outfit_space', 'premium.contents.outfit_holiday'],
    preview: { kind: 'outfit', icon: '🧑‍🚀', swatch: ['#6f4e37', '#ffffff', '#3a86ff', '#d62828'] },
    ownership: 'once',
    requires: { level: 6 },
  },
  {
    id: 'bundle_seasonal_decorations',
    category: 'cosmetic',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('bundle_seasonal_decorations'),
    grant: { kind: 'decor', objects: ['snowman', 'pumpkin_lantern', 'fairy_lights'] },
    gemPrice: 200,
    realMoney: true,
    devPrice: { amount: 1.99, currency: 'GBP' },
    contents: ['premium.contents.snowman', 'premium.contents.pumpkin_lantern', 'premium.contents.fairy_lights'],
    preview: { kind: 'decor', icon: '🎄', swatch: ['#2a9d8f', '#f77f00', '#ffe066'] },
    ownership: 'once',
  },
  {
    id: 'gems_small',
    category: 'gems',
    featured: false,
    type: 'consumable',
    storeIds: sid('gems_small'),
    grant: { kind: 'gems', amount: 100 },
    realMoney: true,
    devPrice: { amount: 0.99, currency: 'GBP' },
    contents: ['premium.contents.gems_100'],
    preview: { kind: 'gems', icon: '💎', swatch: ['#a0e7ff'] },
    ownership: 'stackable',
  },
  {
    id: 'gems_medium',
    category: 'gems',
    featured: true,
    type: 'consumable',
    storeIds: sid('gems_medium'),
    grant: { kind: 'gems', amount: 550 },
    realMoney: true,
    devPrice: { amount: 4.99, currency: 'GBP' },
    contents: ['premium.contents.gems_550'],
    preview: { kind: 'gems', icon: '💎', swatch: ['#7bdff2'] },
    ownership: 'stackable',
  },
  {
    id: 'gems_large',
    category: 'gems',
    featured: false,
    type: 'consumable',
    storeIds: sid('gems_large'),
    grant: { kind: 'gems', amount: 1200 },
    realMoney: true,
    devPrice: { amount: 9.99, currency: 'GBP' },
    contents: ['premium.contents.gems_1200'],
    preview: { kind: 'gems', icon: '💎', swatch: ['#4cc9f0'] },
    ownership: 'stackable',
  },
  {
    id: 'layout_slots_plus',
    category: 'exchange',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('layout_slots_plus'),
    grant: { kind: 'layout_slots', extra: 3 },
    gemPrice: 300,
    realMoney: true,
    devPrice: { amount: 1.99, currency: 'GBP' },
    contents: ['premium.contents.layout_slots'],
    preview: { kind: 'feature', icon: '🗂️', swatch: ['#90be6d'] },
    ownership: 'once',
  },
  {
    id: 'automation_basic',
    category: 'exchange',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('automation_basic'),
    grant: { kind: 'automation', feature: 'auto_restock' },
    gemPrice: 500,
    realMoney: true,
    devPrice: { amount: 2.99, currency: 'GBP' },
    contents: ['premium.contents.auto_restock'],
    preview: { kind: 'feature', icon: '🤖', swatch: ['#4cc9f0'] },
    ownership: 'once',
  },
];


/** Ids renamed before release → current id. Saves holding an old id are mapped on load. */
export const LEGACY_PRODUCT_IDS: Record<string, PremiumProductId> = { skin_golden_shelves: 'cosmetic_golden_shelves', skin_neon_nights: 'cosmetic_neon_nights' };

export function productByStoreId(storeId: string): PremiumProduct | undefined {
  return PREMIUM_CATALOG.find((p) => p.storeIds.ios === storeId || p.storeIds.android === storeId);
}

/** Free layout slots everyone gets; layout_slots_plus adds more. */
export const BASE_LAYOUT_SLOTS = 1;

/** Earned Gems granted per Star when claiming an achievement (keeps every item reachable without paying). */
export const EARNED_GEMS_PER_ACHIEVEMENT_STAR = 5;
export const EARNED_GEMS_PER_MILESTONE = 15;
export const MAX_GEMS = 10_000_000;

// ------------------------------------------------------------------------------------------
// Store items generated from the balance config (src/config/store.ts). All are Gems-only:
// no real-money SKU exists for them, so nothing here can charge real money.

export const RESOURCE_PRODUCTS = {
  res_cash_small: { resource: 'cash_small', price: 15, perDay: 3, level: 1, icon: '💷' },
  res_cash_large: { resource: 'cash_large', price: 70, perDay: 1, level: 8, icon: '💰' },
  res_xp: { resource: 'xp', price: 20, perDay: 2, level: 3, icon: '⭐' },
  res_stock: { resource: 'stock', price: 8, perDay: 6, level: 1, icon: '📦' },
  res_staff_training: { resource: 'staff_training', price: 30, perDay: 2, level: 5, icon: '🎓' },
  res_expansion_permit: { resource: 'expansion_permit', price: 30, perDay: 0, level: 4, icon: '📜' },
  res_offline_bonus: { resource: 'offline_bonus', price: 20, perDay: 0, level: 4, icon: '🌙' },
} as const satisfies Record<string, { resource: ResourceKind; price: number; perDay: number; level: number; icon: string }>;

export const BOOSTER_PRODUCTS = {
  boost_revenue: { booster: 'revenue_boost', price: 40, level: 2, perDay: 3 },
  boost_rush: { booster: 'customer_rush', price: 25, level: 3, perDay: 3 },
  boost_staff: { booster: 'staff_boost', price: 25, level: 5, perDay: 3 },
} as const satisfies Record<string, { booster: BoosterId; price: number; level: number; perDay: number }>;

export const STYLE_PRODUCTS = {
  style_acc_scarf: { slot: 'accessory', style: 'scarf', price: 40, requires: { level: 2 }, icon: '🧣', swatch: ['#e63946', '#f1faee'] },
  style_acc_shades: { slot: 'accessory', style: 'shades', price: 40, requires: { level: 4 }, icon: '🕶️', swatch: ['#2b2d42', '#4cc9f0'] },
  style_acc_bow: { slot: 'accessory', style: 'bow', price: 40, requires: { level: 6 }, icon: '🎀', swatch: ['#ff70a6', '#ffd6e0'] },
  style_display_pastel: { slot: 'display', style: 'pastel', price: 60, requires: { level: 5 }, icon: '🧁', swatch: ['#ffd6e0', '#cdb4db', '#bde0fe'] },
  style_display_rustic: { slot: 'display', style: 'rustic', price: 60, requires: { level: 8 }, icon: '🪵', swatch: ['#7f5539', '#b08968', '#e6ccb2'] },
  style_display_chrome: { slot: 'display', style: 'chrome', price: 90, requires: { level: 12 }, icon: '🪞', swatch: ['#adb5bd', '#e9ecef', '#4cc9f0'] },
  style_checkout_mint: { slot: 'checkout', style: 'mint', price: 50, requires: { level: 4 }, icon: '🧾', swatch: ['#95d5b2', '#d8f3dc'] },
  style_checkout_arcade: { slot: 'checkout', style: 'arcade', price: 70, requires: { level: 9 }, icon: '🕹️', swatch: ['#7209b7', '#f72585', '#4cc9f0'] },
  style_checkout_marble: { slot: 'checkout', style: 'marble', price: 100, requires: { level: 14, tier: 'mega' }, icon: '🏛️', swatch: ['#f8f9fa', '#adb5bd', '#ffd166'] },
  style_sign_wood: { slot: 'sign', style: 'wood', price: 50, requires: { level: 3 }, icon: '🪧', swatch: ['#7f5539', '#ffe8d6'] },
  style_sign_marquee: { slot: 'sign', style: 'marquee', price: 80, requires: { level: 10 }, icon: '💡', swatch: ['#2b2d42', '#ffd166', '#fff3b0'] },
  style_sign_neon_pink: { slot: 'sign', style: 'neon_pink', price: 80, requires: { level: 12 }, icon: '🌸', swatch: ['#ff70a6', '#4cc9f0'] },
  style_entrance_garden: { slot: 'entrance', style: 'garden', price: 70, requires: { level: 6 }, icon: '🌷', swatch: ['#52b788', '#ffd6a5'] },
  style_entrance_seaside: { slot: 'entrance', style: 'seaside', price: 70, requires: { level: 9 }, icon: '⚓', swatch: ['#48cae4', '#f8f9fa'] },
  style_entrance_red_carpet: { slot: 'entrance', style: 'red_carpet', price: 110, requires: { level: 13 }, icon: '🎬', swatch: ['#c1121f', '#ffd166'] },
  style_entrance_flagship: { slot: 'entrance', style: 'flagship', price: 150, requires: { tier: 'flagship' }, icon: '🏰', swatch: ['#3b2412', '#ffd166'] },
  style_entrance_franchise: { slot: 'entrance', style: 'franchise', price: 150, requires: { franchises: 1 }, icon: '🏅', swatch: ['#1d3557', '#ffd166'] },
} as const satisfies Record<string, { slot: StyleSlot; style: string; price: number; requires: Requirements; icon: string; swatch: readonly string[] }>;

/** Decorations from events and late-game collections (placeable decor objects, same appeal as a plant). */
export const DECOR_PRODUCTS = {
  decor_franchise_fountain: { object: 'franchise_fountain', price: 200, requires: { franchises: 1 }, icon: '⛲' },
  event_flower_bed: { object: 'flower_bed', price: 30, requires: { event: 'grand_opening' }, icon: '🌷' },
  event_hay_bale: { object: 'hay_bale', price: 60, requires: { event: 'autumn_market' }, icon: '🌾' },
  event_snow_drift: { object: 'snow_drift', price: 60, requires: { event: 'winter_village' }, icon: '❄️' },
  event_lantern: { object: 'paper_lantern', price: 60, requires: { event: 'neon_festival' }, icon: '🏮' },
  event_beach_umbrella: { object: 'beach_umbrella', price: 60, requires: { event: 'ocean_week' }, icon: '⛱️' },
} as const satisfies Record<string, { object: string; price: number; requires: Requirements; icon: string }>;

export const BUNDLE_PRODUCTS = {
  bundle_starter: { items: ['res_cash_small', 'res_stock', 'style_acc_scarf'], requires: {}, icon: '🎁', featured: true },
  bundle_busy_shop: { items: ['res_stock', 'boost_staff', 'boost_rush'], requires: { level: 5 }, icon: '🏃', featured: false },
  bundle_expansion: { items: ['res_expansion_permit', 'res_cash_large'], requires: { level: 8 }, icon: '🏗️', featured: false },
  bundle_style_autumn: { items: ['cosmetic_cozy_autumn', 'style_display_rustic', 'style_acc_scarf'], requires: {}, icon: '🍂', featured: true },
  bundle_tycoon: { items: ['cosmetic_golden_shelves', 'style_checkout_marble', 'style_sign_marquee', 'style_entrance_red_carpet', 'res_cash_large'], requires: { level: 15 }, icon: '👑', featured: false },
} as const satisfies Record<string, { items: readonly string[]; requires: Requirements; icon: string; featured: boolean }>;

type GeneratedProductId =
  | `perk_${GemPerkId}`
  | keyof typeof BOOSTER_PRODUCTS
  | keyof typeof RESOURCE_PRODUCTS
  | keyof typeof STYLE_PRODUCTS
  | keyof typeof DECOR_PRODUCTS
  | keyof typeof BUNDLE_PRODUCTS;

function generatedProducts(): PremiumProduct[] {
  const base = (id: string, category: PremiumCategory, grant: Grant, gemPrice: number, preview: PremiumProduct['preview'], ownership: PremiumProduct['ownership'], requires?: Requirements, extra: Partial<PremiumProduct> = {}): PremiumProduct => ({
    id: id as PremiumProductId,
    category,
    featured: false,
    type: ownership === 'stackable' ? 'consumable' : 'non_consumable',
    storeIds: sid(id),
    grant,
    gemPrice,
    realMoney: false,
    contents: [],
    preview,
    ownership,
    requires,
    ...extra,
  });
  const out: PremiumProduct[] = [];
  for (const def of Object.values(GEM_PERKS)) out.push(base(`perk_${def.id}`, 'upgrade', { kind: 'perk', perk: def.id }, def.prices[0], { kind: 'perk', icon: def.icon, swatch: ['#ffe8a3', '#ffb703'] }, 'levels', { level: def.requiredLevel }));
  for (const [id, b] of Object.entries(BOOSTER_PRODUCTS)) out.push(base(id, 'booster', { kind: 'booster', booster: b.booster }, b.price, { kind: 'booster', icon: BOOSTERS[b.booster].icon, swatch: ['#ffd6a5', '#ff9f1c'] }, 'stackable', { level: b.level }, { limit: { perDay: b.perDay } }));
  for (const [id, r] of Object.entries(RESOURCE_PRODUCTS)) out.push(base(id, 'exchange', { kind: 'resource', resource: r.resource }, r.price, { kind: 'resource', icon: r.icon, swatch: ['#caf0f8', '#90e0ef'] }, 'stackable', { level: r.level }, r.perDay ? { limit: { perDay: r.perDay } } : {}));
  for (const [id, st] of Object.entries(STYLE_PRODUCTS)) out.push(base(id, 'cosmetic', { kind: 'style', slot: st.slot, style: st.style }, st.price, { kind: 'style', icon: st.icon, swatch: [...st.swatch] }, 'once', { ...st.requires }));
  for (const [id, d] of Object.entries(DECOR_PRODUCTS)) out.push(base(id, 'cosmetic', { kind: 'decor', objects: [d.object] }, d.price, { kind: 'decor', icon: d.icon, swatch: ['#d8f3dc', '#95d5b2'] }, 'once', { ...d.requires }));
  const priced = new Map<string, number>([...PREMIUM_CATALOG, ...out].map((p) => [p.id, p.gemPrice ?? 0]));
  for (const [id, b] of Object.entries(BUNDLE_PRODUCTS)) {
    const value = b.items.reduce((n, i) => n + (priced.get(i) ?? 0), 0);
    out.push(base(id, 'bundle', { kind: 'bundle', items: [...b.items] as PremiumProductId[] }, Math.round(value * BUNDLE_PRICE_SHARE), { kind: 'bundle', icon: b.icon, swatch: ['#ffc6ff', '#bdb2ff'] }, 'once', { ...b.requires }, { featured: b.featured }));
  }
  return out;
}

/** Gem price of the next purchase of an item (levels items get dearer per level). */
export function gemPriceFor(p: PremiumProduct, currentLevel = 0): number | undefined {
  if (p.grant.kind === 'perk') return GEM_PERKS[p.grant.perk].prices[currentLevel];
  return p.gemPrice;
}

/** Genuine sum of a bundle's contents bought separately (null when something can't be bought separately with Gems). */
export function bundleValue(p: PremiumProduct): number | null {
  if (p.grant.kind !== 'bundle') return null;
  let n = 0;
  for (const id of p.grant.items) {
    const item = PREMIUM_MAP[id];
    if (!item?.gemPrice) return null;
    n += item.gemPrice;
  }
  return n;
}

/** Development-time catalog checks (run by the tests and once at start-up in dev builds). */
export function validateCatalog(catalog: PremiumProduct[] = PREMIUM_CATALOG): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const p of catalog) {
    if (ids.has(p.id)) errs.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (!/^[a-z0-9_]+$/.test(p.id)) errs.push(`bad id ${p.id}`);
    if (p.gemPrice !== undefined && (!Number.isSafeInteger(p.gemPrice) || p.gemPrice <= 0)) errs.push(`${p.id}: bad gem price`);
    if (p.category !== 'gems' && !p.gemPrice) errs.push(`${p.id}: everything except Gem packs must be reachable with earned Gems`);
    if (p.ownership === 'stackable' && p.grant.kind !== 'gems' && p.grant.kind !== 'booster' && p.grant.kind !== 'resource') errs.push(`${p.id}: only Gems, boosters and resources are repeatable`);
    if (p.ownership === 'levels' && p.grant.kind !== 'perk') errs.push(`${p.id}: only perks have levels`);
    if (p.grant.kind === 'perk') {
      const def = GEM_PERKS[p.grant.perk];
      if (!def || def.prices.some((x, i) => !Number.isSafeInteger(x) || x <= 0 || (i > 0 && x < def.prices[i - 1]))) errs.push(`${p.id}: perk prices must be positive and non-decreasing`);
    }
    if (p.grant.kind === 'booster' && !BOOSTERS[p.grant.booster]) errs.push(`${p.id}: unknown booster`);
    if (p.limit && (!Number.isInteger(p.limit.perDay) || p.limit.perDay < 1)) errs.push(`${p.id}: bad limit`);
    if (p.grant.kind === 'bundle') {
      if (p.realMoney) errs.push(`${p.id}: bundles are Gems-only until real billing exists`);
      const value = bundleValue(p);
      if (value === null) errs.push(`${p.id}: every bundle item must have its own Gem price`);
      else if ((p.gemPrice ?? 0) > value) errs.push(`${p.id}: bundle costs more than its contents`);
      for (const i of p.grant.items) {
        const item = catalog.find((x) => x.id === i);
        if (!item) errs.push(`${p.id}: unknown item ${i}`);
        else if (item.grant.kind === 'bundle' || item.grant.kind === 'gems' || item.ownership === 'levels' || (item.grant.kind === 'resource' && item.grant.resource === 'xp')) errs.push(`${p.id}: ${i} can't be inside a bundle`);
      }
      if (new Set(p.grant.items.filter((i) => catalog.find((x) => x.id === i)?.ownership === 'once')).size !== p.grant.items.filter((i) => catalog.find((x) => x.id === i)?.ownership === 'once').length) errs.push(`${p.id}: duplicate unique item`);
    }
  }
  return errs;
}

PREMIUM_CATALOG.push(...generatedProducts());

// Generated items are appended last: they read the constants above.
export const PREMIUM_MAP: Record<PremiumProductId, PremiumProduct> = Object.fromEntries(PREMIUM_CATALOG.map((p) => [p.id, p])) as Record<PremiumProductId, PremiumProduct>;
