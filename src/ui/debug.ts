import type { AppApi } from './api';
import { el, toggle } from './dom';
import { GAME_SPEEDS } from '../sim/game';
import { EVENTS } from '../config/events';
import { SEASONS } from '../config/seasons';
import type { PurchaseController } from '../monetization/controller';
import { SimulatedPurchaseAdapter } from '../monetization/simulatedAdapter';
import type { SimScenario } from '../monetization/simulatedAdapter';
import { productByStoreId } from '../monetization/catalog';

/** Developer panel. Only constructed in development builds (import.meta.env.DEV). */
export class DebugPanel {
  el: HTMLElement;
  private info: HTMLElement;

  constructor(private app: AppApi, hooks: { resetSave: () => void; store: () => PurchaseController }) {
    const d = () => this.app.game.debug;
    const b = (label: string, fn: () => void) => el('button', { class: 'btn btn-small', onclick: () => { fn(); this.app.sfx('click'); } }, label);
    this.info = el('pre', { class: 'debug-info' });
    const sim = () => {
      const a = hooks.store().adapter;
      return a instanceof SimulatedPurchaseAdapter ? a : null;
    };
    const scen = el('select', { 'aria-label': 'Test store scenario' }) as HTMLSelectElement;
    for (const sc of ['success', 'cancel', 'fail', 'pending', 'interrupted', 'verify_fail', 'duplicate'] as SimScenario[]) scen.append(el('option', { value: sc }, sc));
    scen.addEventListener('change', () => { const a = sim(); if (a) a.scenario = scen.value as SimScenario; });
    const storeRow = el('div', { class: 'row wrap' }, scen,
      b('+500💎 earned', () => d().addGems(500)),
      b('Resolve pending ✓', () => sim()?.resolvePending(true)),
      b('Decline pending ✗', () => sim()?.resolvePending(false)),
      b('Refund last IAP', () => {
        const ledger = this.app.game.state.monetization.ledger;
        const last = [...ledger].reverse().find((l) => (l.kind === 'purchase' || (l.kind === 'entitlement' && l.source === 'iap')) && l.txId);
        const p = last?.productId ? productByStoreId(`com.tinytycoon.${last.productId}`) : undefined;
        if (last?.txId && p) sim()?.refund({ transactionId: last.txId, storeId: p.storeIds.ios });
      }),
      b('Toggle offline', () => { const a = sim(); if (a) { a.online = !a.online; void hooks.store().init(); } }),
    );
    const speeds = el('div', { class: 'row' }, ...GAME_SPEEDS.map((s) => b(`${s}x`, () => d().setSpeed(s))));
    const events = el('div', { class: 'row wrap' }, ...EVENTS.map((e) => b(e.icon, () => d().triggerEvent(e.id))));
    const seasons = el('div', { class: 'row wrap' }, b('no season', () => d().forceSeason(null)), ...SEASONS.map((s) => b(s.icon, () => d().forceSeason(s.id))));
    this.el = el(
      'div',
      { class: 'debug-panel hidden' },
      el('h3', {}, '🐞 Debug'),
      el(
        'div',
        { class: 'row wrap' },
        b('+£10K', () => d().addMoney(10000)),
        b('+£1M', () => d().addMoney(1e6)),
        b('+10🌟', () => d().addStars(10)),
        b('+Level', () => d().addXp()),
        b('Unlock products', () => d().unlockAllProducts()),
        b('Unlock locations', () => d().unlockAllLocations()),
        b('Spawn 5', () => d().spawnCustomers(5)),
        b('Rush Hour', () => d().triggerRush()),
        b('Complete quest', () => d().completeQuest()),
        b('Upgrade shop', () => d().upgradeShop()),
        b('Reset shop', () => d().resetShop()),
        b('Reset save', () => hooks.resetSave()),
      ),
      el('div', {}, 'Speed'),
      speeds,
      el('div', {}, 'Events'),
      events,
      el('div', {}, 'Test store (simulated, no real money)'),
      storeRow,
      el('div', {}, 'Season'),
      seasons,
      this.info,
    );
  }

  toggle(): void {
    toggle(this.el, 'hidden', !this.el.classList.contains('hidden'));
  }

  update(fps: number): void {
    if (this.el.classList.contains('hidden')) return;
    const g = this.app.game;
    const w = g.world;
    this.info.textContent = `fps ${fps.toFixed(0)} · speed ${g.speed}x · sim ${g.simTime.toFixed(0)}s
customers ${w.customers.length}/${g.customers.maxCustomers()} · staff ${w.employees.length}
spawn/s ${g.customers.spawnRate().toFixed(2)} · income/s ${g.economy.incomeRate().toFixed(2)}
paths cache hit ${w.paths.hits} miss ${w.paths.misses}
errors ${g.errors.length}${g.errors.length ? '\n' + g.errors.slice(-3).join('\n') : ''}`;
  }
}
