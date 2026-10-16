import { it, expect } from 'vitest';
import type { Game } from '../src/sim/game';
import { runBot } from './bot';
import { PREMIUM_CATALOG } from '../src/monetization/catalog';
import type { PremiumProductId } from '../src/monetization/catalog';
import { GEM_PERKS } from '../src/config/store';

/**
 * Store economy simulation (seeded, reproducible). 60-minute runs of the balance bot:
 *  - free:    never spends Gems (Gem income by source; the free path's pace)
 *  - spender: spends every earned Gem (Revenue Boost when idle, cheapest Gem upgrade, Expansion Permit, Cash Bag)
 *  - payer:   the same plus one 1,200-Gem pack at the start
 * `npm test` runs one seed. STORE_REPORT=1 runs three seeds and prints the report in docs/STORE.md.
 */
function spendPolicy(g: Game): void {
  const s = g.store;
  const tryBuy = (id: PremiumProductId) => s.blocker(id) === null && (s.priceOf(id) ?? Infinity) <= g.monetization.gems && s.purchase(id).ok;
  if (s.boosterRemaining('revenue_boost') <= 0 && tryBuy('boost_revenue')) return;
  const perks = PREMIUM_CATALOG.filter((p) => p.grant.kind === 'perk' && s.blocker(p.id) === null).sort((a, b) => (s.priceOf(a.id) ?? 0) - (s.priceOf(b.id) ?? 0));
  if (perks[0] && tryBuy(perks[0].id)) return;
  if (g.shopMgr.nextExpansion() && tryBuy('res_expansion_permit')) return;
  tryBuy('res_cash_small');
}

const report = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.STORE_REPORT;

it('store economy: Gem income is meaningful, spending helps but never replaces playing', () => {
  const seeds = report ? [777, 123, 4242] : [777];
  const lines: string[] = [];
  const ratios = { spender: [] as number[], payer: [] as number[] };
  for (const seed of seeds) {
    const free = runBot(seed, 60);
    const spender = runBot(seed, 60, (g, sec) => sec % 5 === 0 && spendPolicy(g));
    const payer = runBot(seed, 60, (g, sec) => {
      if (sec === 1) g.monetization.grantVerifiedTransaction(`sim-pack-${seed}`, 'gems_large', true);
      if (sec % 5 === 0) spendPolicy(g);
    });
    const bySource: Record<string, number> = {};
    for (const l of free.g.state.monetization.ledger) if (l.kind === 'earn') bySource[l.source.split(':')[0]] = (bySource[l.source.split(':')[0]] ?? 0) + l.gems;
    const earned60 = free.g.state.monetization.totals.earned;
    const minutesTo = (gems: number) => free.snaps.find((x) => x.gemsEarned >= gems)?.min ?? null;
    lines.push(`== seed ${seed}: Gem income (free player, 60 min)`);
    lines.push(`total earned: ${earned60}  by source: ${JSON.stringify(bySource)}`);
    lines.push(`cumulative every 5 min: ${free.snaps.map((x) => x.gemsEarned).join(', ')}`);
    for (const [name, price] of [['Revenue Boost', 40], ['first Gem upgrade (Loyalty Cards)', GEM_PERKS.loyalty_card.prices[0]], ['Cozy Autumn theme', 120], ['Golden Shelves', 200], ['Auto-restock', 500]] as const) lines.push(`  time to earn ${name} (${price}): ${minutesTo(price) ?? '>60'} min`);
    for (const [k, run] of [['free', free], ['spender', spender], ['payer', payer]] as const) {
      const last = run.snaps[run.snaps.length - 1];
      lines.push(`  ${k}: level ${last.level}, revenue £${last.revenue}, stage ${last.stage}, income ${last.rate}/s, gems spent ${last.gemsSpent}, perks ${JSON.stringify(run.g.state.store.perks)}, max gap ${run.maxGap}s`);
    }
    const ratio = (a: typeof free) => a.snaps[a.snaps.length - 1].revenue / free.snaps[free.snaps.length - 1].revenue;
    ratios.spender.push(ratio(spender));
    ratios.payer.push(ratio(payer));
    lines.push(`  revenue vs free: spender ×${ratio(spender).toFixed(2)}, payer ×${ratio(payer).toFixed(2)}`);

    // Free path stays viable and Gems flow at a useful, bounded rate.
    expect(free.g.errors).toEqual([]);
    expect(free.g.state.player.level).toBeGreaterThanOrEqual(10);
    expect(free.maxGap).toBeLessThan(600);
    expect(earned60).toBeGreaterThanOrEqual(80);
    expect(earned60).toBeLessThanOrEqual(800);
    expect(minutesTo(40)).not.toBeNull();
    expect(spender.g.state.monetization.totals.spent).toBeGreaterThan(0);
    expect(spender.g.errors).toEqual([]);
    expect(payer.g.errors).toEqual([]);
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  lines.push(`== average revenue vs free over ${seeds.length} seed(s): spender ×${avg(ratios.spender).toFixed(2)}, payer ×${avg(ratios.payer).toFixed(2)}`);
  if (report) console.log(lines.join('\n'));
  // Spending helps; even a paying player stays within about ×2 of a free player after an hour.
  expect(avg(ratios.spender)).toBeLessThan(1.6);
  expect(avg(ratios.payer)).toBeLessThan(2);
}, 600000);
