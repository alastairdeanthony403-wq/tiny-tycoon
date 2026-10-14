/**
 * Central, typed premium catalog. Internal product ids are stable forever once released:
 * they are stored in saves, ledgers and the backend. Store ids are configured per platform
 * in App Store Connect / Google Play Console (see docs/MONETIZATION.md).
 */

export type PremiumProductId =
  | 'skin_neon_nights'
  | 'skin_golden_shelves'
  | 'bundle_staff_outfits'
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
  | { kind: 'skin'; skin: 'neon_nights' | 'golden_shelves' }
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
}

const sid = (id: string) => ({ ios: `com.tinytycoon.${id}`, android: `com.tinytycoon.${id}` });

export const PREMIUM_CATALOG: PremiumProduct[] = [
  {
    id: 'skin_neon_nights',
    category: 'cosmetic',
    featured: true,
    type: 'non_consumable',
    storeIds: sid('skin_neon_nights'),
    grant: { kind: 'skin', skin: 'neon_nights' },
    gemPrice: 400,
    realMoney: true,
    devPrice: { amount: 2.99, currency: 'GBP' },
    contents: ['premium.contents.neon_palette', 'premium.contents.neon_signs', 'premium.contents.neon_windows'],
    preview: { kind: 'skin', icon: '🌃', swatch: ['#1a1033', '#ff2bd6', '#00f0ff'] },
    ownership: 'once',
  },
  {
    id: 'skin_golden_shelves',
    category: 'cosmetic',
    featured: false,
    type: 'non_consumable',
    storeIds: sid('skin_golden_shelves'),
    grant: { kind: 'skin', skin: 'golden_shelves' },
    gemPrice: 250,
    realMoney: true,
    devPrice: { amount: 1.99, currency: 'GBP' },
    contents: ['premium.contents.gold_shelves', 'premium.contents.gold_sparkle'],
    preview: { kind: 'skin', icon: '✨', swatch: ['#ffd166', '#ff9f1c', '#fff3c4'] },
    ownership: 'once',
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

export function productByStoreId(storeId: string): PremiumProduct | undefined {
  return PREMIUM_CATALOG.find((p) => p.storeIds.ios === storeId || p.storeIds.android === storeId);
}

/** Free layout slots everyone gets; layout_slots_plus adds more. */
export const BASE_LAYOUT_SLOTS = 1;

/** Earned Gems granted per Star when claiming an achievement (keeps every item reachable without paying). */
export const EARNED_GEMS_PER_ACHIEVEMENT_STAR = 5;
export const EARNED_GEMS_PER_MILESTONE = 15;
export const MAX_GEMS = 10_000_000;
