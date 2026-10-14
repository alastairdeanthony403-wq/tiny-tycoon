import type { Game } from './game';
import { OBJECT_MAP } from '../config/objects';
import { PRODUCT_MAP } from '../config/products';

/**
 * Named, data-addressable checks used by quests, achievements and milestones.
 * Each returns a number compared against a target. Adding a check = adding a line here.
 */
export const CHECKS: Record<string, (g: Game, arg?: string) => number> = {
  shopOpen: (g) => (g.shop.open ? 1 : 0),
  maxObjectTier: (g, kind) => g.shop.objects.filter((o) => o.kind === kind).reduce((m, o) => Math.max(m, o.tier + 1), 0),
  objectCount: (g, kind) => g.shop.objects.filter((o) => o.kind === kind).length,
  decorCount: (g) => g.shop.objects.filter((o) => OBJECT_MAP[o.kind]?.category === 'decor').length,
  productsUnlocked: (g) => g.state.progression.unlockedProducts.length,
  premiumUnlocked: (g) => g.state.progression.unlockedProducts.filter((p) => PRODUCT_MAP[p]?.rarity !== 'common').length,
  departments: (g) => g.shop.departments.length,
  stage: (g) => Math.max(...Object.values(g.state.shops).map((s) => s.stage)),
  staffCount: (g) => Object.values(g.state.shops).reduce((n, s) => n + s.staff.length, 0),
  staffEverHired: (g) => g.state.stats.staffEverHired,
  lifetimeRevenue: (g) => g.state.player.lifetimeRevenue,
  lifetimeCustomers: (g) => g.state.player.lifetimeCustomers,
  upgradeLevel: (g, id) => (id ? g.state.globalUpgrades[id] ?? 0 : 0),
  level: (g) => g.state.player.level,
  repTier: (g) => g.progression.repTier(),
  locationsOwned: (g) => g.state.progression.unlockedLocations.length,
  prestigeCount: (g) => g.state.player.prestigeCount,
  flag: (g, f) => (f && g.state.progression.flags[f] ? 1 : 0),
  stat: (g, s) => statValue(g, s ?? ''),
};

export function statValue(g: Game, stat: string): number {
  if (stat.startsWith('sold:')) return g.state.stats.soldByCategory[stat.slice(5)] ?? 0;
  const v = (g.state.stats as unknown as Record<string, unknown>)[stat];
  return typeof v === 'number' ? v : 0;
}

export function runCheck(g: Game, check: string, arg?: string): number {
  const fn = CHECKS[check];
  if (!fn) {
    g.log('checks', `unknown check ${check}`);
    return 0;
  }
  return fn(g, arg);
}
