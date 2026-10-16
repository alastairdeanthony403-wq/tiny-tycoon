/**
 * Quests are data-driven. A goal either measures a stat *gained since the quest started*
 * ("stat") or the current value of a named check ("check", see sim/checks.ts).
 */
export type Goal =
  | { type: 'stat'; stat: string; amount: number }
  | { type: 'check'; check: string; arg?: string; amount: number };

export interface Reward {
  money?: number;
  stars?: number;
  xp?: number;
  unlockProduct?: string;
}

/** Where the tutorial pointer should point while this quest is active. */
export type HintTarget = 'pauseMenu' | 'gems' | 'openSign' | 'shelf' | 'checkout' | 'build' | 'nav:shop' | 'nav:upgrades' | 'nav:products' | 'nav:staff' | 'nav:map' | 'expand';

export interface QuestDef {
  id: string;
  goal: Goal;
  reward: Reward;
  hint?: HintTarget;
  tutorial?: boolean;
}

export const MAIN_QUESTS: QuestDef[] = [
  { id: 'open_shop', goal: { type: 'check', check: 'shopOpen', amount: 1 }, reward: { xp: 5 }, hint: 'openSign', tutorial: true },
  { id: 'first_sale', goal: { type: 'stat', stat: 'itemsSold', amount: 1 }, reward: { money: 10, xp: 5 }, tutorial: true },
  { id: 'upgrade_shelf', goal: { type: 'check', check: 'maxObjectTier', arg: 'shelf', amount: 2 }, reward: { money: 30, xp: 10 }, hint: 'shelf', tutorial: true },
  { id: 'restock', goal: { type: 'stat', stat: 'manualRestocks', amount: 1 }, reward: { money: 20, xp: 5 }, hint: 'shelf', tutorial: true },
  { id: 'buy_shelf', goal: { type: 'check', check: 'objectCount', arg: 'shelf', amount: 2 }, reward: { money: 40, xp: 10 }, hint: 'build', tutorial: true },
  { id: 'unlock_product', goal: { type: 'check', check: 'productsUnlocked', amount: 2 }, reward: { money: 60, xp: 10 }, hint: 'nav:products', tutorial: true },
  { id: 'upgrade_checkout', goal: { type: 'check', check: 'maxObjectTier', arg: 'checkout', amount: 2 }, reward: { money: 100, xp: 15 }, hint: 'checkout', tutorial: true },
  { id: 'expand_1', goal: { type: 'check', check: 'stage', amount: 1 }, reward: { money: 150, xp: 20 }, hint: 'expand', tutorial: true },
  { id: 'drinks_dept', goal: { type: 'check', check: 'departments', amount: 2 }, reward: { money: 100, xp: 15 }, hint: 'nav:shop', tutorial: true },
  { id: 'hire_1', goal: { type: 'check', check: 'staffCount', amount: 1 }, reward: { money: 250, xp: 20 }, hint: 'nav:staff', tutorial: true },
  // Inserted in save v4 (MIGRATIONS[3] shifts older saves past these two steps).
  { id: 'view_achievements', goal: { type: 'check', check: 'flag', arg: 'viewedAchievements', amount: 1 }, reward: { money: 100, xp: 15 }, hint: 'pauseMenu', tutorial: true },
  { id: 'view_cosmetics', goal: { type: 'check', check: 'flag', arg: 'viewedCosmetics', amount: 1 }, reward: { money: 150, xp: 15 }, hint: 'gems', tutorial: true },
  { id: 'serve_25', goal: { type: 'stat', stat: 'customersServed', amount: 25 }, reward: { stars: 1, xp: 15 } },
  { id: 'revenue_1k', goal: { type: 'check', check: 'lifetimeRevenue', amount: 1000 }, reward: { unlockProduct: 'chocolate', xp: 20 } },
  { id: 'marketing_2', goal: { type: 'check', check: 'upgradeLevel', arg: 'marketing', amount: 2 }, reward: { money: 200, xp: 20 }, hint: 'nav:upgrades' },
  { id: 'decor_1', goal: { type: 'check', check: 'decorCount', amount: 1 }, reward: { money: 150, xp: 15 }, hint: 'build' },
  { id: 'second_checkout', goal: { type: 'check', check: 'objectCount', arg: 'checkout', amount: 2 }, reward: { money: 300, xp: 25 }, hint: 'build' },
  { id: 'serve_150', goal: { type: 'stat', stat: 'customersServed', amount: 150 }, reward: { stars: 1, xp: 30 } },
  { id: 'expand_2', goal: { type: 'check', check: 'stage', amount: 2 }, reward: { money: 600, xp: 40 }, hint: 'expand' },
  { id: 'bakery', goal: { type: 'check', check: 'departments', amount: 3 }, reward: { money: 800, xp: 40 }, hint: 'nav:shop' },
  { id: 'staff_3', goal: { type: 'check', check: 'staffCount', amount: 3 }, reward: { money: 1000, xp: 40 }, hint: 'nav:staff' },
  { id: 'revenue_10k', goal: { type: 'check', check: 'lifetimeRevenue', amount: 10000 }, reward: { stars: 2, xp: 60 } },
  { id: 'level_8', goal: { type: 'check', check: 'level', amount: 8 }, reward: { money: 2500, xp: 0 } },
  { id: 'cafe', goal: { type: 'check', check: 'departments', amount: 4 }, reward: { money: 3000, xp: 80 }, hint: 'nav:shop' },
  { id: 'expand_4', goal: { type: 'check', check: 'stage', amount: 4 }, reward: { stars: 2, xp: 100 }, hint: 'expand' },
  { id: 'rep_3', goal: { type: 'check', check: 'repTier', amount: 3 }, reward: { money: 8000, xp: 100 } },
  { id: 'location_2', goal: { type: 'check', check: 'locationsOwned', amount: 2 }, reward: { stars: 3, xp: 200 }, hint: 'nav:map' },
  { id: 'revenue_100k', goal: { type: 'check', check: 'lifetimeRevenue', amount: 100000 }, reward: { stars: 3, xp: 300 } },
  { id: 'franchise', goal: { type: 'check', check: 'prestigeCount', amount: 1 }, reward: { stars: 5, xp: 100 }, hint: 'nav:map' },
  { id: 'location_3', goal: { type: 'check', check: 'locationsOwned', amount: 3 }, reward: { stars: 5, xp: 500 }, hint: 'nav:map' },
  { id: 'empire', goal: { type: 'check', check: 'locationsOwned', amount: 5 }, reward: { stars: 15, xp: 1000 }, hint: 'nav:map' },
];

/** Templates for endlessly generated side quests (scaled by player level). */
export interface SideQuestTemplate {
  id: string;
  stat: string;
  base: number;
  perLevel: number;
  minLevel: number;
  rewardMoneyPerLevel: number;
}

export const SIDE_QUEST_TEMPLATES: SideQuestTemplate[] = [
  { id: 'side_serve', stat: 'customersServed', base: 15, perLevel: 4, minLevel: 3, rewardMoneyPerLevel: 60 },
  { id: 'side_sell', stat: 'itemsSold', base: 30, perLevel: 6, minLevel: 3, rewardMoneyPerLevel: 60 },
  { id: 'side_sell_snacks', stat: 'sold:snacks', base: 15, perLevel: 3, minLevel: 3, rewardMoneyPerLevel: 50 },
  { id: 'side_sell_drinks', stat: 'sold:drinks', base: 12, perLevel: 3, minLevel: 3, rewardMoneyPerLevel: 50 },
  { id: 'side_sell_bakery', stat: 'sold:bakery', base: 10, perLevel: 2, minLevel: 6, rewardMoneyPerLevel: 70 },
  { id: 'side_sell_cafe', stat: 'sold:cafe', base: 10, perLevel: 2, minLevel: 8, rewardMoneyPerLevel: 70 },
  { id: 'side_restock', stat: 'manualRestocks', base: 3, perLevel: 0.3, minLevel: 3, rewardMoneyPerLevel: 40 },
  { id: 'side_clean', stat: 'cleaned', base: 3, perLevel: 0.3, minLevel: 6, rewardMoneyPerLevel: 40 },
  { id: 'side_happy', stat: 'happyCustomers', base: 10, perLevel: 3, minLevel: 4, rewardMoneyPerLevel: 60 },
];
