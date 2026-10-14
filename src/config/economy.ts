/**
 * CENTRAL BALANCE CONFIGURATION.
 * Every tunable economy number lives here (or in the sibling data files) so the
 * game can be balanced without touching gameplay code.
 */
export const ECONOMY = {
  startingCash: 50,
  maxMoney: 1e15,
  /** Simulation steps per second (fixed timestep). */
  tickRate: 20,

  customers: {
    /** Customers per second at the very start. */
    baseSpawnPerSec: 0.3,
    maxCustomersBase: 6,
    maxCustomersPerTile: 0.8,
    hardCap: 60,
    browseChance: 0.35,
    browseTime: [0.8, 2.0] as [number, number],
    takeTime: 0.55,
    waitForStockTime: 6,
    payAnimTime: 0.5,
    walkSpeed: 1.6, // tiles per second
    /** Seconds before an NPC in a single non-queue state is considered stuck. */
    stuckTimeout: 25,
    dirtChancePerTile: 0.006,
  },

  checkout: {
    secPerItem: 0.55,
    overhead: 0.6,
    ownerSpeed: 1,
    tapBoostSeconds: 0.35,
    /** Customers per queue tile (they stand half a tile apart). */
    slotsPerTile: 2,
  },

  restock: {
    /** Seconds per unit for passive (owner) restocking before upgrades. */
    passiveSecPerUnit: 2.6,
    manualCooldown: 6,
    stockerCarry: 6,
    stockerPickTime: 0.8,
    stockerFillTime: 0.8,
    lowStockRatio: 0.3,
  },

  satisfaction: {
    start: 72,
    ema: 0.08,
    outOfStockPenalty: 14,
    queueWaitPenalty: 28,
    dirtPenaltyPerSpot: 3,
    dirtPenaltyCap: 18,
    fastServiceBonus: 6,
    friendlyBonus: 6,
    appealCap: 18,
    angry: 8,
  },

  reputation: {
    /** Reputation points required for tiers 1..5. */
    tiers: [0, 40, 220, 900, 3200],
    gainHappy: 1,
    lossAngry: 1,
    spawnBonusPerTier: 0.12,
  },

  xp: {
    base: 25,
    exponent: 1.6,
    perItemSold: 1,
    perUpgrade: 6,
    perExpansion: 60,
    perHire: 25,
    perProductUnlock: 20,
    perClean: 1,
    levelMoneyReward: (level: number) => Math.round(30 * Math.pow(level, 1.9)),
    levelStarReward: (level: number) => (level % 5 === 0 ? 2 : level % 3 === 0 ? 1 : 0),
    celebrationSlowmo: 1.6,
  },

  wages: { intervalSec: 60 },

  offline: {
    baseEfficiency: 0.3,
    maxEfficiency: 0.65,
    baseCapHours: 2,
    maxCapHours: 12,
    minSecondsForPopup: 60,
    incomeWindowSec: 300,
    /** Fallback income/sec used before any income has been measured. */
    minimumRate: 0,
  },

  inactiveShopEfficiency: 0.5,

  events: {
    firstDelay: 150,
    intervalMin: 110,
    intervalMax: 220,
    offerTimeout: 20,
  },

  prestige: {
    minRunRevenue: 150000,
    minLevel: 12,
    starsDivisor: 12000,
    revenueBonusPerFranchise: 0.25,
  },

  shop: {
    sellRefund: 0.5,
    maxDirtBase: 4,
    maxDirtPerTile: 0.08,
  },

  achievementRevenueBonus: 0.01,
} as const;

/** Cost of the n-th purchase of something that starts at `base` and grows by `growth`. */
export function scaledCost(base: number, growth: number, n: number): number {
  return Math.round(base * Math.pow(growth, Math.max(0, n)));
}

export function xpForLevel(level: number): number {
  // XP needed to go from `level` to `level+1`.
  return Math.round(ECONOMY.xp.base * Math.pow(Math.max(1, level), ECONOMY.xp.exponent));
}
