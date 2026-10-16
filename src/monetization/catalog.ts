/**
 * Central, typed premium catalog. Internal product ids are stable forever once released:
 * they are stored in saves, ledgers and the backend. Store ids are configured per platform
 * in App Store Connect / Google Play Console (see docs/MONETIZATION.md).
 */

export type PremiumProductId =
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

export type PremiumCategory = 'cosmetic' | 'gems' | 'convenience';
export type PurchaseType = 'consumable' | 'non_consumable';

export type Grant =
  | { kind: 'gems'; amount: number }
  | { kind: 'skin'; skin: 'neon_nights' | 'golden_shelves' | 'cozy_autumn' | 'ocean_breeze' }
  | { kind: 'outfits'; outfits: string[] }
  | { kind: 'decor'; objects: string[] }
  | { kind: 'layout_slots'; extra: number }
  | { kind: 'automation'; feature: 'auto_restock' };

export interface PremiumProduct {
  id: PremiumProductId;
  category: PremiumCategory;
  featured: boolean;
  type: PurchaseType;
  /** Platform store product ids. Placeholders until the apps are registered. */
  storeIds: { ios: string; android: string };
  grant: Grant;
  /** Permanent items may also be unlocked with Gems (earned or purchased). */
  gemPrice?: number;
  /** Can be bought with real money through the platform store. */
  realMoney: boolean;
  /** DEVELOPMENT ONLY sample price for the simulator. Production prices come from the store. */
  devPrice?: { amount: number; currency: string };
  /** Item lines shown under "Contents" (localization keys). */
  contents: string[];
  preview: { kind: 'skin' | 'outfit' | 'decor' | 'gems' | 'feature'; icon: string; swatch: string[] };
  /** 'once' = permanent, can't be owned twice. 'stackable' = consumable, can be bought repeatedly. */
  ownership: 'once' | 'stackable';
  /** Progression gates (balancing config). All must be met to buy; ownership is never taken away. */
  requires?: { level?: number; lifetimeRevenue?: number };
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
    category: 'convenience',
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
    category: 'convenience',
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

export const PREMIUM_MAP: Record<PremiumProductId, PremiumProduct> = Object.fromEntries(PREMIUM_CATALOG.map((p) => [p.id, p])) as Record<PremiumProductId, PremiumProduct>;

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
