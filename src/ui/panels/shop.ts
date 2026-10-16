import { Panel } from '../panel';
import type { AppApi } from '../api';
import { el, setText, guarded } from '../dom';
import { UpgradeButton, card, iconBox, artIcon, sectionTitle, statPreview, tag, ProgressBar } from '../components';
import { OBJECTS, OBJECT_MAP } from '../../config/objects';
import { DEPARTMENTS } from '../../config/departments';
import { THEMES } from '../../config/cosmetics';
import { EXPANSIONS } from '../../config/expansions';
import { formatMoney } from '../../core/format';
import { DOOR_TILE, STOCKROOM_TILE } from '../../core/state';
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
    return [s.locationId, JSON.stringify(g.state.monetization.entitlements), g.monetization.layouts().map((l) => l?.at ?? 0).join(), s.stage, !!s.construction, s.departments.join(), s.pendingPlacements.length, g.state.player.level, g.state.cosmetics.unlockedThemes.join(), g.state.cosmetics.theme, g.mods.seasons().map((x) => x.id).join()].join('|');
  }

  protected build(add: (fn: () => void) => void): Node[] {
    const g = this.g;
    const out: Node[] = [];
    out.push(this.statsCard(add));

    // ---- Expansion (the biggest visual reward): current tier, next expansion, requirements, preview
    out.push(...this.expansionSection(add));

    // ---- Free items waiting for a spot
    if (g.shop.pendingPlacements.length) {
      out.push(sectionTitle(t('shop.pending'), '🎁'));
      g.shop.pendingPlacements.forEach((p, i) => {
        const def = OBJECT_MAP[p.kind];
        out.push(card('', artIcon(`furniture.${p.kind}`, def.icon), el('div', { class: 'card-main' }, el('b', {}, t(`object.${p.kind}`)), el('small', {}, t('shop.pending_desc'))), el('button', { class: 'btn btn-buy affordable', onclick: () => this.app.startPlacement({ kind: p.kind, mode: 'pending', index: i }) }, t('shop.place'))));
      });
    }

    // ---- Build
    out.push(sectionTitle(t('shop.build'), '🔨'));
    for (const def of OBJECTS.filter((o) => o.category !== 'decor')) out.push(this.buildCard(def.id, add));
    out.push(sectionTitle(t('shop.decor'), '🪴'));
    out.push(el('p', { class: 'hint' }, t('shop.decor_hint')));
    for (const def of OBJECTS.filter((o) => o.category === 'decor' && !o.entitlement)) out.push(this.buildCard(def.id, add));
    const premiumDecor = OBJECTS.filter((o) => o.entitlement);
    if (premiumDecor.some((o) => g.monetization.owns(o.entitlement!))) for (const def of premiumDecor) out.push(this.buildCard(def.id, add));
    else out.push(card('premium-teaser', iconBox('🎄'), el('div', { class: 'card-main' }, el('b', {}, t('premium.bundle_seasonal_decorations.name')), el('small', {}, t('shop.premium_decor_hint'))), el('button', { class: 'btn btn-small', onclick: () => this.app.openPremium('cosmetic') }, `💎 ${t('shop.see_store')}`)));

    // ---- Saved layouts (1 free slot; layout_slots_plus adds more)
    out.push(sectionTitle(t('layout.title'), '🗂️'));
    out.push(el('p', { class: 'hint' }, t('layout.hint')));
    g.monetization.layouts().forEach((l, i) => {
      const load = el('button', { class: 'btn btn-small', disabled: !l, onclick: guarded(`layout-load-${i}`, () => {
        const r = g.monetization.loadLayout(i);
        if (r.ok) { this.app.sfx('pop'); this.app.toast(t('layout.loaded', { n: i + 1 }), '🗂️', 'good'); this.app.saveNow(); }
        else { this.app.sfx('error'); this.app.toast(t(`layout.err.${r.reason ?? 'blocks_path'}`), '✗', 'bad'); }
      }) }, t('layout.load'));
      const save = el('button', { class: 'btn btn-small btn-ghost', onclick: guarded(`layout-save-${i}`, () => {
        const doSave = () => { g.monetization.saveLayout(i); this.app.sfx('pop'); this.app.toast(t('layout.saved', { n: i + 1 }), '💾', 'good'); this.app.saveNow(); this.refresh(true); };
        if (l) this.app.confirm({ icon: '🗂️', title: t('layout.overwrite_title', { n: i + 1 }), text: t('layout.overwrite_text'), okLabel: t('layout.save'), onOk: doSave });
        else doSave();
      }) }, t('layout.save'));
      out.push(card('layout-card', iconBox('🗂️'), el('div', { class: 'card-main' }, el('b', {}, t('layout.slot', { n: i + 1 })), el('small', {}, l ? t('layout.slot_info', { n: l.objects.length, size: `${l.size}×${l.size}` }) : t('layout.empty'))), el('div', { class: 'col' }, save, load)));
    });
    if (!g.monetization.owns('layout_slots_plus')) out.push(el('button', { class: 'btn btn-ghost btn-small', onclick: () => this.app.openPremium('convenience') }, `💎 ${t('layout.more_slots')}`));

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
    return card(locked ? 'locked-card' : '', artIcon(`furniture.${kind}`, def.icon), el('div', { class: 'card-main' }, el('b', {}, t(`object.${kind}`), ' ', count), el('small', {}, t(`object.${kind}.desc`)), el('div', { class: 'tags' }, ...info.map((i) => tag(i)), ...reqs)), btn.el);
  }

  private expansionSection(add: (fn: () => void) => void): Node[] {
    const g = this.g;
    const out: Node[] = [];
    const cur = g.shopMgr.layoutStats();
    const tierName = t(`tier.${cur.tier.id}`);
    out.push(sectionTitle(t('shop.expansion_title'), '🏗️'));
    // Current tier: real numbers from the simulation.
    out.push(
      card(
        'tier-card',
        iconBox(cur.tier.icon),
        el(
          'div',
          { class: 'card-main' },
          el('b', {}, `${tierName} · ${cur.size}×${cur.size}`),
          el(
            'div',
            { class: 'tier-stats' },
            tag(`⬜ ${t('shop.stat_area', { n: cur.area })}`),
            tag(`🗄️ ${t('shop.stat_displays', { n: cur.displays, cap: cur.displayCapacity })}`),
            tag(`🛒 ${t('shop.stat_checkouts', { n: g.shopMgr.count('checkout'), cap: cur.checkoutCap })}`),
            tag(`🧑‍💼 ${t('shop.stat_staff', { n: g.shop.staff.length, cap: cur.staffCap })}`),
            tag(`🪴 ${t('shop.stat_decor', { cap: cur.decorCap })}`),
          ),
        ),
      ),
    );
    const next = g.shopMgr.nextExpansion();
    if (g.shop.construction) {
      const bar = new ProgressBar('build');
      add(() => {
        const c = g.shop.construction;
        if (c) bar.set(1 - c.remaining / c.duration, t('shop.constructing'));
      });
      out.push(card('expand-card', iconBox('🚧'), el('div', { class: 'card-main' }, el('b', {}, t('shop.constructing_title', { size: `${EXPANSIONS[g.shop.construction.targetStage].size}×${EXPANSIONS[g.shop.construction.targetStage].size}` })), bar.el)));
      return out;
    }
    if (!next) {
      out.push(card('expand-card', iconBox('🏰'), el('div', { class: 'card-main' }, el('b', {}, t('shop.max_size')))));
      return out;
    }
    const stage = g.shop.stage + 1;
    const nx = g.shopMgr.layoutStats(stage);
    const newTier = nx.tier.id !== cur.tier.id;
    const p = g.state.player;
    const reqs: HTMLElement[] = [];
    const reqRow = (label: string, have: number, need: number, fmt: (n: number) => string) => {
      const bar = new ProgressBar('req');
      bar.set(Math.min(1, have / need), `${fmt(Math.min(have, need))} / ${fmt(need)}`);
      return el('div', { class: `req-row ${have >= need ? 'met' : 'unmet'}` }, el('span', {}, `${have >= need ? '✓' : '✗'} ${label}`), bar.el);
    };
    reqs.push(reqRow(t('shop.req_level', { n: next.requiredLevel }), p.level, next.requiredLevel, (n) => String(n)));
    if (next.requiredRevenue) reqs.push(reqRow(t('shop.req_revenue', { n: formatMoney(next.requiredRevenue) }), p.lifetimeRevenue, next.requiredRevenue, formatMoney));
    const gains = [
      t('shop.gain_tiles', { n: nx.area - cur.area }),
      nx.staffCap > cur.staffCap ? t('shop.gain_staff', { n: nx.staffCap - cur.staffCap }) : null,
      nx.checkoutCap > cur.checkoutCap ? t('shop.gain_checkouts', { n: nx.checkoutCap }) : null,
      nx.decorCap > cur.decorCap ? t('shop.gain_decor', { n: nx.decorCap - cur.decorCap }) : null,
      ...(newTier ? nx.tier.features.map((f) => t(`feat.${f}`)) : []),
    ].filter(Boolean) as string[];
    const btn = new UpgradeButton({
      key: 'expand',
      tut: 'expand',
      label: () => t('shop.expand_btn'),
      cost: () => g.shopMgr.expansionCost(),
      can: () => g.shopMgr.canExpand(),
      onBuy: () => {
        this.app.expandShop();
        return true;
      },
    });
    add(() => btn.update());
    const reason = g.shopMgr.canExpand();
    out.push(
      card(
        'expand-card highlight',
        iconBox(newTier ? nx.tier.icon : '🏗️'),
        el(
          'div',
          { class: 'card-main' },
          el('b', {}, newTier ? t('shop.next_tier', { name: t(`tier.${nx.tier.id}`) }) : t('shop.expand_title')),
          statPreview(t('shop.size'), `${cur.size}×${cur.size}`, `${nx.size}×${nx.size}`),
          this.planPreview(cur.size, nx.size),
          el('div', { class: 'reqs' }, ...reqs),
          el('ul', { class: 'gains' }, ...gains.map((x) => el('li', {}, x))),
          !reason.ok && reason.reason !== 'money' ? tag(`🔒 ${t(`reason.${reason.reason}`, { n: next.requiredLevel })}`, 'locked') : null,
        ),
        btn.el,
      ),
    );
    return out;
  }

  /** Top-down plan of the real layout: today's floor, the new floor, objects, door and stockroom. */
  private planPreview(cur: number, next: number): HTMLCanvasElement {
    const g = this.g;
    const px = 112;
    const c = el('canvas', { class: 'plan-preview', width: px * 2, height: px * 2, role: 'img', 'aria-label': t('shop.plan_alt', { from: `${cur}×${cur}`, to: `${next}×${next}` }) }) as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.scale(2, 2);
    const cell = (px - 8) / next;
    const o = 4;
    ctx.fillStyle = 'rgba(255,214,10,0.25)';
    ctx.fillRect(o, o, next * cell, next * cell);
    ctx.strokeStyle = '#e09b00';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(o, o, next * cell, next * cell);
    ctx.setLineDash([]);
    ctx.fillStyle = '#f6e7cb';
    ctx.fillRect(o, o, cur * cell, cur * cell);
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(o, o, cur * cell, cur * cell);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < next; i++) {
      ctx.beginPath();
      ctx.moveTo(o + i * cell, o);
      ctx.lineTo(o + i * cell, o + next * cell);
      ctx.moveTo(o, o + i * cell);
      ctx.lineTo(o + next * cell, o + i * cell);
      ctx.stroke();
    }
    const colors: Record<string, string> = { display: '#c98b52', checkout: '#7d8597', decor: '#52b788' };
    for (const ob of g.shop.objects) {
      const def = OBJECT_MAP[ob.kind];
      ctx.fillStyle = colors[def?.category ?? 'decor'] ?? '#999';
      ctx.fillRect(o + ob.x * cell + cell * 0.15, o + ob.y * cell + cell * 0.15, cell * 0.7, cell * 0.7);
    }
    // door (west wall) and stockroom (north wall)
    ctx.fillStyle = '#2bb673';
    ctx.fillRect(o - 3, o + DOOR_TILE.y * cell + cell * 0.2, 4, cell * 0.6);
    ctx.fillStyle = '#2b2d42';
    ctx.fillRect(o + STOCKROOM_TILE.x * cell + cell * 0.2, o - 3, cell * 0.6, 4);
    return c;
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
