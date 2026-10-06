/**
 * Seasonal content. Seasons are active between month/day ranges (inclusive) and can add
 * products, a theme, and limited-time quests without touching core code.
 */
export interface SeasonDef {
  id: string;
  icon: string;
  from: [number, number]; // [month 1-12, day]
  to: [number, number];
  products: string[];
  theme?: string;
  customerWeights?: Record<string, number>;
}

export const SEASONS: SeasonDef[] = [
  { id: 'halloween', icon: '🎃', from: [10, 15], to: [11, 2], products: ['pumpkin_pie'], theme: 'halloween', customerWeights: { child: 2 } },
  { id: 'winter', icon: '❄️', from: [12, 1], to: [1, 6], products: ['hot_cocoa'], theme: 'winter' },
  { id: 'spring', icon: '🌸', from: [3, 20], to: [4, 30], products: [], customerWeights: { foodie: 1.5 } },
  { id: 'summer', icon: '☀️', from: [6, 21], to: [8, 31], products: ['ice_lolly'], customerWeights: { tourist: 1, child: 1.5 } },
  { id: 'back_to_school', icon: '🎒', from: [8, 25], to: [9, 15], products: [], customerWeights: { student: 2.5 } },
];

function dayKey(m: number, d: number): number {
  return m * 100 + d;
}

export function activeSeasons(date: Date, forced?: string | null): SeasonDef[] {
  if (forced) return SEASONS.filter((s) => s.id === forced);
  const k = dayKey(date.getMonth() + 1, date.getDate());
  return SEASONS.filter((s) => {
    const a = dayKey(s.from[0], s.from[1]);
    const b = dayKey(s.to[0], s.to[1]);
    return a <= b ? k >= a && k <= b : k >= a || k <= b;
  });
}
