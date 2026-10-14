/** Head Office perks: permanent upgrades bought with Stars. They survive franchising. */
export interface PerkDef {
  id: string;
  icon: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  perLevel: number;
}

export const PERKS: PerkDef[] = [
  { id: 'start_cash', icon: '💷', baseCost: 3, costGrowth: 1.6, maxLevel: 10, perLevel: 150 },
  { id: 'revenue', icon: '📈', baseCost: 5, costGrowth: 1.5, maxLevel: 20, perLevel: 0.1 },
  { id: 'customer_speed', icon: '👟', baseCost: 4, costGrowth: 1.6, maxLevel: 5, perLevel: 0.06 },
  { id: 'staff_training', icon: '🎓', baseCost: 5, costGrowth: 1.7, maxLevel: 8, perLevel: 0.08 },
  { id: 'offline_office', icon: '🌙', baseCost: 4, costGrowth: 1.7, maxLevel: 7, perLevel: 0.05 },
  { id: 'starter_pack', icon: '🎒', baseCost: 8, costGrowth: 2.5, maxLevel: 3, perLevel: 1 },
  { id: 'fame', icon: '📸', baseCost: 6, costGrowth: 2, maxLevel: 4, perLevel: 0.1 },
];

export const PERK_MAP: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
