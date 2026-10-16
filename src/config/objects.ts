import type { DisplayType } from './products';

export type ObjectCategory = 'display' | 'checkout' | 'decor';

export interface ObjectTier {
  /** Cost to upgrade INTO this tier (tier 0 cost is unused). */
  cost: number;
  capacity?: number;
  speed?: number;
  maxQueue?: number;
  /** Bonus to premium product sales from this displayer. */
  premiumBonus?: number;
}

export interface ObjectDef {
  id: string;
  category: ObjectCategory;
  icon: string;
  display?: DisplayType;
  /** Cost of the first purchase; later copies scale with costGrowth. */
  baseCost: number;
  costGrowth: number;
  requiredLevel: number;
  requiredDepartment?: string;
  maxCount: number;
  tiers: ObjectTier[];
  /** Decorations: satisfaction appeal points. */
  appeal?: number;
  needsAccess: boolean;
  color: string;
  /** Premium catalog product that must be owned to build this (cosmetic decor only). */
  entitlement?: string;
  /** Drawn as this registered billboard sprite (decorations from the store's collections). */
  sprite?: { id: string; size: number };
}

export const OBJECTS: ObjectDef[] = [
  {
    id: 'shelf', category: 'display', icon: '🗄️', display: 'shelf', baseCost: 20, costGrowth: 1.85, requiredLevel: 1, maxCount: 40, needsAccess: true, color: '#c98b52',
    tiers: [{ cost: 0, capacity: 10 }, { cost: 30, capacity: 15 }, { cost: 160, capacity: 25 }, { cost: 900, capacity: 40, premiumBonus: 0.05 }, { cost: 6000, capacity: 60, premiumBonus: 0.1 }],
  },
  {
    id: 'fridge', category: 'display', icon: '🧊', display: 'fridge', baseCost: 120, costGrowth: 1.9, requiredLevel: 2, requiredDepartment: 'drinks', maxCount: 20, needsAccess: true, color: '#9ad1f5',
    tiers: [{ cost: 0, capacity: 12 }, { cost: 90, capacity: 20 }, { cost: 250, capacity: 35 }, { cost: 1400, capacity: 55, premiumBonus: 0.05 }, { cost: 9000, capacity: 80, premiumBonus: 0.1 }],
  },
  {
    id: 'oven', category: 'display', icon: '🔥', display: 'machine', baseCost: 900, costGrowth: 2.2, requiredLevel: 5, requiredDepartment: 'bakery', maxCount: 6, needsAccess: true, color: '#d97b4a',
    tiers: [{ cost: 0, capacity: 8, speed: 1 }, { cost: 700, capacity: 12, speed: 1.4 }, { cost: 3000, capacity: 18, speed: 1.9 }, { cost: 12000, capacity: 26, speed: 2.6 }],
  },
  {
    id: 'coffee_machine', category: 'display', icon: '☕', display: 'machine', baseCost: 1800, costGrowth: 2.2, requiredLevel: 7, requiredDepartment: 'cafe', maxCount: 6, needsAccess: true, color: '#555b6e',
    tiers: [{ cost: 0, capacity: 10, speed: 1 }, { cost: 1500, capacity: 14, speed: 1.4 }, { cost: 6000, capacity: 20, speed: 1.9 }, { cost: 22000, capacity: 30, speed: 2.6 }],
  },
  {
    id: 'checkout', category: 'checkout', icon: '🛒', baseCost: 400, costGrowth: 2.6, requiredLevel: 3, maxCount: 6, needsAccess: true, color: '#7d8597',
    // Basic → Fast → Express → Premium
    tiers: [{ cost: 0, speed: 1, maxQueue: 4 }, { cost: 150, speed: 1.4, maxQueue: 5 }, { cost: 1200, speed: 1.9, maxQueue: 6 }, { cost: 9000, speed: 2.6, maxQueue: 8 }],
  },
  { id: 'plant', category: 'decor', icon: '🪴', baseCost: 60, costGrowth: 1.5, requiredLevel: 2, maxCount: 12, appeal: 2, needsAccess: false, color: '#52b788', tiers: [{ cost: 0 }] },
  { id: 'poster', category: 'decor', icon: '🖼️', baseCost: 90, costGrowth: 1.5, requiredLevel: 3, maxCount: 8, appeal: 2, needsAccess: false, color: '#ffafcc', tiers: [{ cost: 0 }] },
  { id: 'lamp', category: 'decor', icon: '💡', baseCost: 150, costGrowth: 1.5, requiredLevel: 4, maxCount: 8, appeal: 3, needsAccess: false, color: '#ffe066', tiers: [{ cost: 0 }] },
  { id: 'sign', category: 'decor', icon: '🪧', baseCost: 300, costGrowth: 1.6, requiredLevel: 5, maxCount: 4, appeal: 4, needsAccess: false, color: '#f4a261', tiers: [{ cost: 0 }] },
  { id: 'bench', category: 'decor', icon: '🪑', baseCost: 500, costGrowth: 1.6, requiredLevel: 6, maxCount: 6, appeal: 4, needsAccess: false, color: '#a47148', tiers: [{ cost: 0 }] },
  { id: 'statue', category: 'decor', icon: '🗿', baseCost: 4000, costGrowth: 1.8, requiredLevel: 10, maxCount: 3, appeal: 8, needsAccess: false, color: '#adb5bd', tiers: [{ cost: 0 }] },
  // Premium cosmetic decor (bundle_seasonal_decorations). Same appeal as a plant: no gameplay edge.
  { id: 'snowman', category: 'decor', icon: '⛄', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#ffffff', tiers: [{ cost: 0 }], entitlement: 'bundle_seasonal_decorations' },
  { id: 'pumpkin_lantern', category: 'decor', icon: '🎃', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#f77f00', tiers: [{ cost: 0 }], entitlement: 'bundle_seasonal_decorations' },
  // Store collections (events and late game). Same appeal as a plant: cosmetic only.
  { id: 'franchise_fountain', category: 'decor', icon: '⛲', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 2, appeal: 2, needsAccess: false, color: '#48cae4', tiers: [{ cost: 0 }], entitlement: 'decor_franchise_fountain', sprite: { id: 'deco.fountain', size: 0.85 } },
  { id: 'flower_bed', category: 'decor', icon: '🌷', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#ef476f', tiers: [{ cost: 0 }], entitlement: 'event_flower_bed', sprite: { id: 'deco.flower_bed', size: 1.3 } },
  { id: 'hay_bale', category: 'decor', icon: '🌾', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#e9c46a', tiers: [{ cost: 0 }], entitlement: 'event_hay_bale', sprite: { id: 'deco.hay_bale', size: 1.2 } },
  { id: 'snow_drift', category: 'decor', icon: '❄️', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#ffffff', tiers: [{ cost: 0 }], entitlement: 'event_snow_drift', sprite: { id: 'deco.snow_pile', size: 1.4 } },
  { id: 'paper_lantern', category: 'decor', icon: '🏮', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#e63946', tiers: [{ cost: 0 }], entitlement: 'event_lantern', sprite: { id: 'deco.lantern_post', size: 0.8 } },
  { id: 'beach_umbrella', category: 'decor', icon: '⛱️', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#ef476f', tiers: [{ cost: 0 }], entitlement: 'event_beach_umbrella', sprite: { id: 'deco.umbrella', size: 0.85 } },
  { id: 'fairy_lights', category: 'decor', icon: '✨', baseCost: 60, costGrowth: 1.5, requiredLevel: 1, maxCount: 4, appeal: 2, needsAccess: false, color: '#ffe066', tiers: [{ cost: 0 }], entitlement: 'bundle_seasonal_decorations' },
  { id: 'arcade', category: 'decor', icon: '🕹️', baseCost: 9000, costGrowth: 1.8, requiredLevel: 12, maxCount: 3, appeal: 10, needsAccess: false, color: '#7209b7', tiers: [{ cost: 0 }] },
];

export const OBJECT_MAP: Record<string, ObjectDef> = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));

export const CHECKOUT_TIER_KEYS = ['basic', 'fast', 'express', 'premium'];
