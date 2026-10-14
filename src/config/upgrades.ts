export type UpgradeCategory = 'attraction' | 'profit' | 'satisfaction' | 'capacity' | 'speed' | 'automation' | 'offline';

export interface UpgradeDef {
  id: string;
  category: UpgradeCategory;
  icon: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  requiredLevel: number;
  /** Effect added per level (interpretation depends on the id). */
  perLevel: number;
}

/** Company-wide upgrades (purchased from the Upgrades tab). Object upgrades live in objects.ts. */
export const UPGRADES: UpgradeDef[] = [
  { id: 'marketing', category: 'attraction', icon: '📣', baseCost: 80, costGrowth: 1.75, maxLevel: 20, requiredLevel: 2, perLevel: 0.12 },
  { id: 'pricing', category: 'profit', icon: '🏷️', baseCost: 120, costGrowth: 1.8, maxLevel: 20, requiredLevel: 3, perLevel: 0.08 },
  { id: 'comfort', category: 'satisfaction', icon: '🎵', baseCost: 100, costGrowth: 1.7, maxLevel: 15, requiredLevel: 2, perLevel: 0.12 },
  { id: 'restock_speed', category: 'speed', icon: '🚚', baseCost: 60, costGrowth: 1.7, maxLevel: 15, requiredLevel: 1, perLevel: 0.25 },
  { id: 'storage', category: 'capacity', icon: '📦', baseCost: 150, costGrowth: 1.9, maxLevel: 10, requiredLevel: 4, perLevel: 0.15 },
  { id: 'smart_ordering', category: 'automation', icon: '🤖', baseCost: 900, costGrowth: 2.0, maxLevel: 8, requiredLevel: 6, perLevel: 0.2 },
  { id: 'night_shift', category: 'offline', icon: '🌙', baseCost: 500, costGrowth: 2.1, maxLevel: 7, requiredLevel: 4, perLevel: 0.05 },
  { id: 'doormat', category: 'satisfaction', icon: '🧽', baseCost: 400, costGrowth: 1.9, maxLevel: 5, requiredLevel: 6, perLevel: 0.15 },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
