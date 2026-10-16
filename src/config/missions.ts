/**
 * Daily and weekly missions. Each mission measures a real gameplay stat gained since the
 * mission was issued (see sim/checks.ts `statValue`). All numbers are balance values.
 */
export interface MissionTemplate {
  id: string;
  stat: string;
  /** Target = base + perLevel × player level (rounded). */
  base: number;
  perLevel: number;
  minLevel: number;
  /** Cash reward = moneyPerLevel × level × location cost multiplier. */
  moneyPerLevel: number;
  xp: number;
  gems: number;
}

export const MISSIONS = {
  dailyCount: 3,
  weeklyCount: 3,
  daily: [
    { id: 'd_serve', stat: 'customersServed', base: 20, perLevel: 5, minLevel: 1, moneyPerLevel: 40, xp: 15, gems: 3 },
    { id: 'd_sell', stat: 'itemsSold', base: 40, perLevel: 8, minLevel: 1, moneyPerLevel: 40, xp: 15, gems: 3 },
    { id: 'd_restock', stat: 'manualRestocks', base: 4, perLevel: 0.3, minLevel: 1, moneyPerLevel: 30, xp: 10, gems: 3 },
    { id: 'd_happy', stat: 'happyCustomers', base: 15, perLevel: 3, minLevel: 2, moneyPerLevel: 40, xp: 15, gems: 3 },
    { id: 'd_drinks', stat: 'sold:drinks', base: 10, perLevel: 3, minLevel: 4, moneyPerLevel: 35, xp: 15, gems: 3 },
    { id: 'd_snacks', stat: 'sold:snacks', base: 15, perLevel: 3, minLevel: 1, moneyPerLevel: 35, xp: 15, gems: 3 },
    { id: 'd_clean', stat: 'cleaned', base: 3, perLevel: 0.2, minLevel: 6, moneyPerLevel: 30, xp: 10, gems: 3 },
    { id: 'd_upgrade', stat: 'upgradesBought', base: 1, perLevel: 0.05, minLevel: 3, moneyPerLevel: 30, xp: 15, gems: 3 },
  ] as MissionTemplate[],
  weekly: [
    { id: 'w_serve', stat: 'customersServed', base: 200, perLevel: 40, minLevel: 1, moneyPerLevel: 250, xp: 80, gems: 20 },
    { id: 'w_revenue', stat: 'revenue', base: 2000, perLevel: 800, minLevel: 1, moneyPerLevel: 250, xp: 80, gems: 20 },
    { id: 'w_restock', stat: 'manualRestocks', base: 20, perLevel: 2, minLevel: 1, moneyPerLevel: 200, xp: 60, gems: 20 },
    { id: 'w_upgrades', stat: 'upgradesBought', base: 4, perLevel: 0.3, minLevel: 2, moneyPerLevel: 200, xp: 60, gems: 20 },
    { id: 'w_happy', stat: 'happyCustomers', base: 120, perLevel: 20, minLevel: 3, moneyPerLevel: 250, xp: 80, gems: 20 },
    { id: 'w_daily', stat: 'dailyMissionsClaimed', base: 5, perLevel: 0, minLevel: 1, moneyPerLevel: 300, xp: 100, gems: 25 },
  ] as MissionTemplate[],
};
