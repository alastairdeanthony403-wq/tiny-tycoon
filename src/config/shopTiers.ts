import { EXPANSIONS } from './expansions';

/**
 * Named shop tiers. They group the existing physical expansion stages (src/config/expansions.ts —
 * each stage really grows the floor grid), so no progress is duplicated. Entering a tier changes
 * real limits (checkouts, decorations) and the building itself (wall height, trims, pillars,
 * lights, floor finish, signage). Staff capacity already grows with every stage.
 */
export interface ShopTierDef {
  id: 'starter' | 'expanded' | 'super' | 'mega' | 'flagship';
  icon: string;
  /** First expansion stage that belongs to this tier. */
  firstStage: number;
  /** Interior wall height in px. */
  wallH: number;
  /** Maximum checkouts in this tier (never above the object's own maximum). */
  checkoutCap: number;
  /** Decoration limits = object maximum × this (rounded up). */
  decorCapMult: number;
  /** Building details unlocked at this tier (each one is drawn by the renderer). */
  features: string[];
}

export const SHOP_TIERS: ShopTierDef[] = [
  { id: 'starter', icon: '🏪', firstStage: 0, wallH: 46, checkoutCap: 2, decorCapMult: 0.5, features: ['windows'] },
  { id: 'expanded', icon: '🏬', firstStage: 2, wallH: 50, checkoutCap: 3, decorCapMult: 0.75, features: ['baseboard', 'wide_door'] },
  { id: 'super', icon: '🛒', firstStage: 4, wallH: 54, checkoutCap: 4, decorCapMult: 1, features: ['wall_band', 'pillars', 'tiled_floor'] },
  { id: 'mega', icon: '🏢', firstStage: 6, wallH: 58, checkoutCap: 5, decorCapMult: 1, features: ['wall_lights', 'floor_border'] },
  { id: 'flagship', icon: '👑', firstStage: 8, wallH: 64, checkoutCap: 6, decorCapMult: 1.25, features: ['gold_cornice', 'marble_inlay', 'grand_sign'] },
];

export function tierIndexOfStage(stage: number): number {
  let idx = 0;
  for (let i = 0; i < SHOP_TIERS.length; i++) if (stage >= SHOP_TIERS[i].firstStage) idx = i;
  return idx;
}

export function tierOfStage(stage: number): ShopTierDef {
  return SHOP_TIERS[tierIndexOfStage(stage)];
}

/** All building features active at a stage (features accumulate across tiers). */
export function featuresAtStage(stage: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= tierIndexOfStage(stage); i++) for (const f of SHOP_TIERS[i].features) out.add(f);
  return out;
}

/** The stage at which the next tier starts (null at the last tier). */
export function nextTierStage(stage: number): number | null {
  const next = SHOP_TIERS[tierIndexOfStage(stage) + 1];
  return next && next.firstStage < EXPANSIONS.length ? next.firstStage : null;
}
