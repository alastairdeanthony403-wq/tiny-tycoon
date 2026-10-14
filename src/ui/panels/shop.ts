import { Panel } from '../panel';
import type { AppApi } from '../api';
import { el, setText } from '../dom';
import { UpgradeButton, card, iconBox, sectionTitle, statPreview, tag, ProgressBar } from '../components';
import { OBJECTS, OBJECT_MAP } from '../../config/objects';
import { DEPARTMENTS } from '../../config/departments';
import { THEMES } from '../../config/cosmetics';
import { EXPANSIONS } from '../../config/expansions';
import { formatMoney } from '../../core/format';
import { t } from '../../core/i18n';

export class ShopPanel extends Panel {
  constructor(private app: AppApi) {
    super('shop', t('nav.shop'), '🏪');
  }

  private get g() {
    return this.app.game;
  }

  protected structureKey(): string {
    const g = this.g;
    const s = g.shop;
    return [s.locationId, s.stage, !!s.construction, s.departments.join(), s.pendingPlacements.length, g.state.player.level, g.state.cosmetics.unlockedThemes.join(), g.state.cosmetics.theme, g.mods.seasons().map((x) => x.id).join()].join('|');
  }

  protected build(add: (fn: () => void) => void): Node[] {
    const g = this.g;
    const out: Node[] = [];
    out.push(this.statsCard(add));

    // ---- Expansion (the biggest visual reward)
    const next = g.shopMgr.nextExpansion();
    if (g.shop.construction) {
      const bar = new ProgressBar('build');
      add(() => {
        const c = g.shop.construction;
        if (c) bar.set(1 - c.remaining / c.duration, t('shop.constructing'));
      });
      out.push(card('expand-card', iconBox('🚧'), el('div', { class: 'card-main' }, el('b', {}, t('shop.constructing_title', { size: `${EXPANSIONS[g.shop.construction.targetStage].size}×${EXPANSIONS[g.shop.construction.targetStage].size}` })), bar.el)));
    } else if (next) {
      const btn = new UpgradeButton({
        key: 'expand',
        tut: 'expand',
        label: () => t('shop.expand_btn'),
        cost: () => g.shopMgr.expansionCost(),
        can: () => g.shopMgr.canExpand(),
        onBuy: () => {
          const c = g.shopMgr.expansionCost() ?? 0;
          const ok = g.shopMgr.expand();
          if (ok) {
            this.app.spendFeedback(c);
            this.app.openPanel(null);
          }
          return ok;
        },
      });
      add(() => btn.update());
      out.push(
        card(
          'expand-card highlight',
          iconBox('🏗️'),
          el('div', { class: 'card-main' }, el('b', {}, t('shop.expand_title')), statPreview(t('shop.size'), `${g.shop.size}×${g.shop.size}`, `${next.size}×${next.size}`), el('small', {}, t('shop.expand_desc', { tiles: next.size * next.size - g.shop.size * g.shop.size })), next.requiredLevel > g.state.player.level ? tag(`🔒 ${t('reason.level_n', { n: next.requiredLevel })}`, 'locked') : null),
          btn.el,
        ),
      );
    } else out.push(card('expand-card', iconBox('🏰'), el('div', { class: 'card-main' }, el('b', {}, t('shop.max_size')))));

    // ---- Free items waiting for a spot
    if (g.shop.pendingPlacements.length) {
      out.push(sectionTitle(t('shop.pending'), '🎁'));
      g.shop.pendingPlacements.forEach((p, i) => {
        const def = OBJECT_MAP[p.kind];
        out.push(card('', iconBox(def.icon), el('div', { class: 'card-main' }, el('b', {}, t(`object.${p.kind}`)), el('small', {}, t('shop.pending_desc'))), el('button', { class: 'btn btn-buy affordable', onclick: () => this.app.startPlacement({ kind: p.kind, mode: 'pending', index: i }) }, t('shop.place'))));
      });
    }

    // ---- Build
    out.push(sectionTitle(t('shop.build'), '🔨'));
    for (const def of OBJECTS.filter((o) => o.category !== 'decor')) out.push(this.buildCard(def.id, add));
    out.push(sectionTitle(t('shop.decor'), '🪴'));
    out.push(el('p', { class: 'hint' }, t('shop.decor_hint')));
    for (const def of OBJECTS.filter((o) => o.category === 'decor')) out.push(this.buildCard(def.id, add));

    // ---- Departments
    out.push(sectionTitle(t('shop.departments'), '🏬'));
    for (const d of DEPARTMENTS) {
      if (d.cost === 0) continue;
      const owned = g.shop.departments.includes(d.id);
      if (owned) {
        out.push(card('owned', iconBox(d.icon), el('div', { class: 'card-main' }, el('b', {}, t(`dept.${d.id}`)), el('small', {}, t(`dept.${d.id}.desc`))), tag(`✓ ${t('ui.owned')}`, 'good')));
        continue;
      }
      const btn = new UpgradeButton({
        key: `dept-${d.id}`,
        tut: `dept-${d.id}`,
        label: () => t('shop.unlock'),
        cost: () => g.shopMgr.departmentCost(d.id),
        can: () => g.shopMgr.canUnlockDepartment(d.id),
        onBuy: () => {
          const c = g.shopMgr.departmentCost(d.id);
          const ok = g.shopMgr.unlockDepartment(d.id);
          if (ok) this.app.spendFeedback(c);
          return ok;
        },
      });
      add(() => btn.update());
      const reqs: Node[] = [];
      if (g.state.player.level < d.requiredLevel) reqs.push(tag(`🔒 ${t('reason.level_n', { n: d.requiredLevel })}`, 'locked'));
      if (g.shop.stage < d.requiredStage) reqs.push(tag(`🔒 ${t('reason.size_n', { n: EXPANSIONS[d.requiredStage].size })}`, 'locked'));
      out.push(card('', iconBox(d.icon), el('div', { class: 'card-main' }, el('b', {}, t(`dept.${d.id}`)), el('small', {}, t(`dept.${d.id}.desc`)), el('div', { class: 'tags' }, ...reqs)), btn.el));
    }

    // ---- Cosmetics
    out.push(sectionTitle(t('shop.style'), '🎨'));
    out.push(el('p', { class: 'hint' }, t('shop.style_hint')));
    const grid = el('div', { class: 'theme-grid' });
    for (const th of THEMES) {
      const avail = g.prestige.themeAvailable(th.id);
      const active = g.state.cosmetics.theme === th.id;
      const b = el(
        'button',
        {
          class: `theme-btn ${active ? 'active' : ''} ${avail ? '' : 'locked'}`,
          'aria-pressed': String(active),
          onclick: () => {
            if (avail) {
              g.prestige.setTheme(th.id);
              this.app.sfx('pop');
            } else if (g.prestige.buyTheme(th.id)) {
              g.prestige.setTheme(th.id);
              this.app.sfx('upgrade');
              this.app.toast(t('toast.theme_unlocked', { name: t(`theme.${th.id}`) }), th.icon, 'gold');
            } else this.app.sfx('error');
            this.refresh(true);
          },
        },
        el('span', { class: 'theme-swatch', style: { background: `linear-gradient(135deg, ${th.floorA} 50%, ${th.wall} 50%)` } }),
        el('span', {}, `${th.icon} ${t(`theme.${th.id}`)}`),
        el('small', {}, active ? t('ui.active') : avail ? t('ui.use') : `🌟 ${th.starCost}`),
      );
      grid.append(b);
    }
    out.push(grid);
    return out;
  }

  private buildCard(kind: string, add: (fn: () => void) => void): HTMLElement {
    const g = this.g;
    const def = OBJECT_MAP[kind];
    const locked = g.state.player.level < def.requiredLevel || (def.requiredDepartment && !g.shop.departments.includes(def.requiredDepartment));
    const count = el('small', { class: 'count' });
    const btn = new UpgradeButton({
      key: `build-${kind}`,
      tut: `build-${kind}`,
      label: () => t('shop.buy'),
      cost: () => (g.shopMgr.count(kind) >= def.maxCount ? null : g.shopMgr.objectCost(kind)),
      can: () => {
        const c = g.shopMgr.canBuy(kind);
        if (!c.ok) return c;
        return g.shopMgr.findSpot(kind) ? c : { ok: false, reason: 'no_space' };
      },
      onBuy: () => {
        this.app.startPlacement({ kind, mode: 'buy' });
        return true;
      },
    });
    add(() => {
      btn.update();
      setText(count, `${g.shopMgr.count(kind)}/${def.maxCount}`);
    });
    const tier = def.tiers[0];
    const info: string[] = [];
    if (tier.capacity) info.push(t('stat.capacity_n', { n: tier.capacity }));
    if (def.category === 'checkout') info.push(t('stat.queue_n', { n: tier.maxQueue ?? 4 }));
    if (def.appeal) info.push(t('stat.appeal_n', { n: def.appeal }));
    const reqs: Node[] = [];
    if (g.state.player.level < def.requiredLevel) reqs.push(tag(`🔒 ${t('reason.level_n', { n: def.requiredLevel })}`, 'locked'));
    if (def.requiredDepartment && !g.shop.departments.includes(def.requiredDepartment)) reqs.push(tag(`🔒 ${t(`dept.${def.requiredDepartment}`)}`, 'locked'));
    return card(locked ? 'locked-card' : '', iconBox(def.icon), el('div', { class: 'card-main' }, el('b', {}, t(`object.${kind}`), ' ', count), el('small', {}, t(`object.${kind}.desc`)), el('div', { class: 'tags' }, ...info.map((i) => tag(i)), ...reqs)), btn.el);
  }

  private statsCard(add: (fn: () => void) => void): HTMLElement {
    const g = this.g;
    const v = () => el('span');
    const rows = { cash: v(), profit: v(), wages: v(), net: v(), lifetime: v(), sat: v(), rep: v(), cust: v(), appeal: v() };
    add(() => {
      const perMin = (n: number) => `${n < 0 ? '−' : ''}${formatMoney(Math.abs(n))}${t('ui.per_min')}`;
      setText(rows.cash, formatMoney(g.state.player.money));
      setText(rows.profit, perMin(g.economy.incomeRate() * 60));
      setText(rows.wages, perMin(-g.economy.wagesPerMinute()));
      setText(rows.net, perMin(g.economy.netIncomeRate() * 60));
      setText(rows.lifetime, formatMoney(g.state.player.lifetimeRevenue));
      const sat = Math.round(g.shop.satisfaction);
      setText(rows.sat, `${sat >= 75 ? '😊' : sat >= 50 ? '🙂' : '😟'} ${sat}%`);
      const tier = g.progression.repTier();
      setText(rows.rep, `${'★'.repeat(tier)}${'☆'.repeat(5 - tier)} ${t(`rep.${tier}`)}`);
      setText(rows.cust, `${g.world.customers.length} / ${g.customers.maxCustomers()}`);
      setText(rows.appeal, `+${g.mods.appeal()}`);
    });
    const row = (label: string, val: HTMLElement, tip?: string) => el('div', { class: 'stat-row', title: tip }, el('span', {}, label), val);
    return card(
      'stats-card',
      el(
        'div',
        { class: 'stat-grid' },
        row(t('stat.cash'), rows.cash, t('stat.cash_tip')),
        row(t('stat.lifetime_revenue'), rows.lifetime, t('stat.lifetime_tip')),
        row(t('stat.sales_profit'), rows.profit, t('stat.sales_profit_tip')),
        row(t('stat.wages'), rows.wages),
        row(t('stat.net_profit'), rows.net, t('stat.net_tip')),
        row(t('stat.customers'), rows.cust),
        row(t('stat.satisfaction'), rows.sat),
        row(t('stat.reputation'), rows.rep),
        row(t('stat.appeal'), rows.appeal),
      ),
    );
  }
}
