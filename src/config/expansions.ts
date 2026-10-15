export interface ExpansionDef {
  size: number;
  cost: number;
  requiredLevel: number;
  /** Construction time in seconds. */
  buildTime: number;
  /** Lifetime revenue needed before this stage can be bought (tier milestones; see shopTiers.ts). */
  requiredRevenue?: number;
}

/** Shop stages. Index 0 is the starting tiny shop. Expansion adds real floor tiles. */
export const EXPANSIONS: ExpansionDef[] = [
  { size: 3, cost: 0, requiredLevel: 1, buildTime: 0 },
  { size: 4, cost: 400, requiredLevel: 2, buildTime: 3 },
  { size: 5, cost: 1500, requiredLevel: 4, buildTime: 3.5 },
  { size: 6, cost: 4000, requiredLevel: 6, buildTime: 4 },
  { size: 7, cost: 10000, requiredLevel: 8, buildTime: 4, requiredRevenue: 15000 },
  { size: 8, cost: 25000, requiredLevel: 10, buildTime: 4.5 },
  { size: 9, cost: 60000, requiredLevel: 12, buildTime: 4.5, requiredRevenue: 100000 },
  { size: 10, cost: 140000, requiredLevel: 14, buildTime: 5 },
  { size: 11, cost: 320000, requiredLevel: 16, buildTime: 5, requiredRevenue: 600000 },
  { size: 12, cost: 750000, requiredLevel: 18, buildTime: 5.5 },
];

export const SHOP_LEVEL_NAMES = ['tiny', 'small', 'cosy', 'neat', 'busy', 'big', 'grand', 'huge', 'mega', 'super'];
