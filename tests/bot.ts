import type { Game } from '../src/sim/game';
import { openGame } from './helpers';
import { OBJECTS } from '../src/config/objects';
import { UPGRADES } from '../src/config/upgrades';
import { PRODUCTS } from '../src/config/products';
import { DEPARTMENTS } from '../src/config/departments';
import { STAFF } from '../src/config/staff';
import { LOCATIONS } from '../src/config/locations';

export interface BotSnapshot {
  min: number;
  level: number;
  revenue: number;
  stage: number;
  gemsEarned: number;
  gemsSpent: number;
  rate: number;
}

/**
 * The 'sensible player' bot from the balance test, reusable: each simulated second it restocks,
 * claims rewards, and buys the cheapest useful thing with cash. `everySecond` lets a scenario add
 * its own behaviour (e.g. spending Gems in the store).
 */
export function runBot(seed: number, minutes: number, everySecond?: (g: Game, s: number) => void): { g: Game; snaps: BotSnapshot[]; maxGap: number } {
  const g = openGame(seed);
  const snaps: BotSnapshot[] = [];
  let lastBuyAt = 0;
  let maxGap = 0;
  for (let s = 1; s <= minutes * 60; s++) {
    g.runFor(1);
    // UI-only tutorial steps a real player does by opening two menus
    if (s === 120) Object.assign(g.state.progression.flags, { viewedAchievements: true, viewedCosmetics: true });
    // during the tutorial a player taps a shelf to restock it when asked
    if (!g.state.progression.tutorialDone && s % 15 === 0) for (const o of g.shopMgr.displays()) if (g.inventory.manualRestock(o.uid)) break;
    for (const o of g.shopMgr.displays()) if (g.inventory.status(o) !== 'ok') g.inventory.manualRestock(o.uid);
    for (const q of [...g.state.progression.activeQuests]) if (q.completed) g.quests.claim(q.id);
    for (const a of Object.keys(g.state.progression.achievements)) g.achievements.claim(a);
    for (const kind of ['daily', 'weekly'] as const) for (const m of g.state.missions[kind]) if (m.completed && !m.claimed) g.missions.claim(kind, m.id);
    if (g.state.events.offer) g.events.acceptOffer();
    if (g.state.events.crate) g.events.collectCrate();
    for (const d of [...g.shop.dirt]) g.shopMgr.clean(d.x, d.y, true);
    everySecond?.(g, s);
    const opts: { cost: number; act: () => boolean }[] = [];
    for (const o of g.shop.objects) { const c = g.shopMgr.upgradeCost(o); if (c !== null) opts.push({ cost: c, act: () => g.shopMgr.upgrade(o.uid) }); }
    for (const u of UPGRADES) { const c = g.upgrades.cost(u.id); if (c !== null && g.state.player.level >= u.requiredLevel) opts.push({ cost: c, act: () => g.upgrades.buy(u.id) }); }
    for (const k of OBJECTS) { const chk = g.shopMgr.canBuy(k.id); if (chk.ok || chk.reason === 'money') { const sp = g.shopMgr.findSpot(k.id); if (sp && (k.category !== 'checkout' || g.employees.count('cashier') >= g.shopMgr.count('checkout') - 1)) opts.push({ cost: chk.cost * (k.category === 'decor' ? 2 : k.category === 'checkout' ? 0.5 : 1), act: () => !!g.shopMgr.buy(k.id, sp.x, sp.y, sp.dir) }); } }
    const ec = g.shopMgr.expansionCost(); if (ec !== null && g.shopMgr.canExpand().reason !== 'level' && !g.shop.construction) opts.push({ cost: ec * 0.35, act: () => g.shopMgr.expand() });
    for (const d of DEPARTMENTS) { const r = g.shopMgr.canUnlockDepartment(d.id); if (r.ok || r.reason === 'money') opts.push({ cost: g.shopMgr.departmentCost(d.id) * 0.6, act: () => g.shopMgr.unlockDepartment(d.id) }); }
    for (const p of PRODUCTS) { const r = g.progression.canUnlockProduct(p.id); if (r.ok || r.reason === 'money') opts.push({ cost: p.unlockCost, act: () => g.progression.unlockProduct(p.id) }); }
    for (const st of STAFF) { const r = g.employees.canHire(st.id); if (r.ok || r.reason === 'money') opts.push({ cost: g.employees.hireCost(st.id) * (st.id === 'cashier' && g.employees.count('cashier') < g.shopMgr.count('checkout') - 1 ? 0.2 : 1), act: () => !!g.employees.hire(st.id) }); }
    for (const l of LOCATIONS) { const r = g.locations.canUnlock(l.id); if (r.ok || r.reason === 'money') opts.push({ cost: l.unlockCost * 0.5, act: () => g.locations.unlock(l.id) }); }
    opts.sort((a, b) => a.cost - b.cost);
    if (opts[0] && opts[0].act()) { maxGap = Math.max(maxGap, s - lastBuyAt); lastBuyAt = s; }
    if (s % 300 === 0) {
      const m = g.state.monetization;
      snaps.push({ min: s / 60, level: g.state.player.level, revenue: Math.round(g.state.player.lifetimeRevenue), stage: g.shop.stage, gemsEarned: m.totals.earned, gemsSpent: m.totals.spent, rate: +g.economy.incomeRate().toFixed(1) });
    }
  }
  return { g, snaps, maxGap };
}
