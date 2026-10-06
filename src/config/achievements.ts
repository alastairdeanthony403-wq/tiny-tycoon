export interface AchievementDef {
  id: string;
  icon: string;
  check: string;
  arg?: string;
  target: number;
  stars: number;
  title?: string;
  unlockTheme?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_sale', icon: '🪙', check: 'lifetimeCustomers', target: 1, stars: 1 },
  { id: 'busy_day', icon: '🏃', check: 'lifetimeCustomers', target: 100, stars: 2, unlockTheme: 'candy' },
  { id: 'crowd_pleaser', icon: '🎉', check: 'lifetimeCustomers', target: 1000, stars: 5, title: 'crowd_pleaser' },
  { id: 'big_spender', icon: '💰', check: 'lifetimeRevenue', target: 10000, stars: 3 },
  { id: 'millionaire', icon: '🤑', check: 'lifetimeRevenue', target: 1000000, stars: 10, title: 'millionaire' },
  { id: 'fully_stocked', icon: '📦', check: 'flag', arg: 'fullyStocked60', target: 1, stars: 3 },
  { id: 'speed_demon', icon: '⚡', check: 'flag', arg: 'perfectRush', target: 1, stars: 4, title: 'speed_demon' },
  { id: 'first_hire', icon: '🤝', check: 'staffEverHired', target: 1, stars: 1 },
  { id: 'dream_team', icon: '👥', check: 'staffCount', target: 8, stars: 4 },
  { id: 'expander', icon: '🏗️', check: 'stage', target: 5, stars: 4 },
  { id: 'collector', icon: '🛍️', check: 'productsUnlocked', target: 10, stars: 4 },
  { id: 'spotless', icon: '🧼', check: 'stat', arg: 'cleaned', target: 100, stars: 2 },
  { id: 'lucky_find', icon: '🎁', check: 'stat', arg: 'cratesCollected', target: 10, stars: 3 },
  { id: 'decorator', icon: '🪴', check: 'decorCount', target: 8, stars: 3, unlockTheme: 'jungle' },
  { id: 'five_star', icon: '🌟', check: 'repTier', target: 5, stars: 8, title: 'legend' },
  { id: 'franchisee', icon: '🏢', check: 'prestigeCount', target: 1, stars: 5, unlockTheme: 'neon' },
  { id: 'retail_empire', icon: '👑', check: 'locationsOwned', target: 5, stars: 15, title: 'tycoon' },
];

export interface MilestoneDef {
  id: string;
  icon: string;
  check: string;
  arg?: string;
  target: number;
  money: number;
}

export const MILESTONES: MilestoneDef[] = [
  { id: 'first_1k', icon: '💷', check: 'lifetimeRevenue', target: 1000, money: 50 },
  { id: 'first_100_customers', icon: '🧍', check: 'lifetimeCustomers', target: 100, money: 75 },
  { id: 'first_employee', icon: '🧑‍💼', check: 'staffEverHired', target: 1, money: 0 },
  { id: 'first_expansion', icon: '🏗️', check: 'stage', target: 1, money: 0 },
  { id: 'first_premium', icon: '💎', check: 'premiumUnlocked', target: 1, money: 500 },
  { id: 'first_location', icon: '🗺️', check: 'locationsOwned', target: 2, money: 0 },
  { id: 'first_franchise', icon: '🏢', check: 'prestigeCount', target: 1, money: 0 },
  { id: 'first_100k', icon: '🏦', check: 'lifetimeRevenue', target: 100000, money: 0 },
];
