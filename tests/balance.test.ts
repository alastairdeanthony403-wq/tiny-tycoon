import { it, expect } from 'vitest';
import { openGame } from './helpers';
import { OBJECTS } from '../src/config/objects';
import { UPGRADES } from '../src/config/upgrades';
import { PRODUCTS } from '../src/config/products';
import { DEPARTMENTS } from '../src/config/departments';
import { STAFF } from '../src/config/staff';
import { LOCATIONS } from '../src/config/locations';

/**
 * Balance regression: a simple 'sensible player' bot plays 60 minutes headlessly.
 * Run with BALANCE_REPORT=1 to print the pacing report.
 */
it('progression pacing stays healthy for a sensible player (60 min bot)', () => {
  const g = openGame(123);
  const log: string[] = [];
  let lastBuyAt = 0; let maxGap = 0;
  for (let s = 1; s <= 3600; s++) {
    g.runFor(1);
    for (const o of g.shopMgr.displays()) if (g.inventory.status(o) !== 'ok') g.inventory.manualRestock(o.uid);
    for (const q of [...g.state.progression.activeQuests]) if (q.completed) g.quests.claim(q.id);
    for (const a of Object.keys(g.state.progression.achievements)) g.achievements.claim(a);
    if (g.state.events.offer) g.events.acceptOffer();
    if (g.state.events.crate) g.events.collectCrate();
    for (const d of [...g.shop.dirt]) g.shopMgr.clean(d.x, d.y, true);
    // gather options
    const opts: { cost: number; act: () => boolean; name: string }[] = [];
    for (const o of g.shop.objects) { const c = g.shopMgr.upgradeCost(o); if (c !== null) opts.push({ cost: c, act: () => g.shopMgr.upgrade(o.uid), name: 'up:' + o.kind }); }
    for (const u of UPGRADES) { const c = g.upgrades.cost(u.id); if (c !== null && g.state.player.level >= u.requiredLevel) opts.push({ cost: c, act: () => g.upgrades.buy(u.id), name: 'g:' + u.id }); }
    for (const k of OBJECTS) { const chk = g.shopMgr.canBuy(k.id); if (chk.ok || chk.reason === 'money') { const sp = g.shopMgr.findSpot(k.id); if (sp && (k.category !== 'checkout' || g.employees.count('cashier') >= g.shopMgr.count('checkout') - 1)) opts.push({ cost: chk.cost * (k.category === 'decor' ? 2 : k.category === 'checkout' ? 0.5 : 1), act: () => !!g.shopMgr.buy(k.id, sp.x, sp.y, sp.dir), name: 'buy:' + k.id }); } }
    const ec = g.shopMgr.expansionCost(); if (ec !== null && g.shopMgr.canExpand().reason !== 'level' && !g.shop.construction) opts.push({ cost: ec * 0.35, act: () => g.shopMgr.expand(), name: 'expand' });
    for (const d of DEPARTMENTS) { const r = g.shopMgr.canUnlockDepartment(d.id); if (r.ok || r.reason === 'money') opts.push({ cost: g.shopMgr.departmentCost(d.id) * 0.6, act: () => g.shopMgr.unlockDepartment(d.id), name: 'dept:' + d.id }); }
    for (const p of PRODUCTS) { const r = g.progression.canUnlockProduct(p.id); if (r.ok || r.reason === 'money') opts.push({ cost: p.unlockCost, act: () => g.progression.unlockProduct(p.id), name: 'prod:' + p.id }); }
    for (const st of STAFF) { const r = g.employees.canHire(st.id); if (r.ok || r.reason === 'money') opts.push({ cost: g.employees.hireCost(st.id) * (st.id === 'cashier' && g.employees.count('cashier') < g.shopMgr.count('checkout') - 1 ? 0.2 : 1), act: () => !!g.employees.hire(st.id), name: 'hire:' + st.id }); }
    for (const l of LOCATIONS) { const r = g.locations.canUnlock(l.id); if (r.ok || r.reason === 'money') opts.push({ cost: l.unlockCost * 0.5, act: () => g.locations.unlock(l.id), name: 'loc:' + l.id }); }
    opts.sort((a, b) => a.cost - b.cost);
    const best = opts[0];
    if (best && best.act()) { maxGap = Math.max(maxGap, s - lastBuyAt); lastBuyAt = s; if (s < 600) log.push(`${s}s ${best.name}`); }
    if (s === 1800) {
      expect(g.shop.stage).toBeGreaterThanOrEqual(1); // visibly bigger after 30 minutes
    }
    if (s % 300 === 0) {
      log.push(`== ${s / 60}min lvl=${g.state.player.level} money=${Math.round(g.state.player.money)} rev=${Math.round(g.state.player.lifetimeRevenue)} stage=${g.shop.stage} size=${g.shop.size} objs=${g.shop.objects.length} staff=${g.shop.staff.length} served=${g.state.stats.customersServed} angry=${g.state.stats.angryCustomers} sat=${Math.round(g.shop.satisfaction)} rep=${g.progression.repTier()} rate=${g.economy.incomeRate().toFixed(1)}/s cust=${g.world.customers.length} q=${g.state.progression.mainQuestIndex} locs=${g.state.progression.unlockedLocations.length} errors=${g.errors.length}`);
    }
  }
  log.push('max gap between purchases: ' + maxGap + 's');
  if ((globalThis as any).process?.env?.BALANCE_REPORT) console.log(log.join('\n'));
  expect(g.errors).toEqual([]);
  expect(g.state.player.level).toBeGreaterThanOrEqual(10);
  expect(g.shop.stage).toBeGreaterThanOrEqual(2);
  expect(g.state.player.lifetimeRevenue).toBeGreaterThan(20000);
  expect(maxGap).toBeLessThan(600); // never 10 minutes without something to buy
}, 120000);
