import type { AppApi } from './api';
import type { PurchaseController, PurchaseOutcome } from '../monetization/controller';
import { PREMIUM_CATALOG, PREMIUM_MAP, bundleValue } from '../monetization/catalog';
import type { PremiumProduct, PremiumProductId } from '../monetization/catalog';
import type { Renderer } from '../render/renderer';
import { el, clear, guarded, toggle, setText } from './dom';
import { card, tag } from './components';
import { drawObject } from '../render/sprites';
import { drawCharacter } from '../assets/art/characters';
import { staffAppearance } from '../assets/characters';
import { setView, view } from '../render/iso';
import { formatNumber, formatMoney, formatDuration } from '../core/format';
import { getSkin } from '../render/skins';
import { styledSkin, ACCESSORY_STYLES } from '../render/styles';
import { BOOSTERS, GEM_PERKS, GEM_REWARDS, RESOURCES, STORE_EVENTS, type StyleSlot } from '../config/store';
import { UPGRADES } from '../config/upgrades';
import { ACHIEVEMENTS } from '../config/achievements';
import type { StoreFailReason, RequirementRow } from '../sim/store';
import { t } from '../core/i18n';

export type StoreTab = 'featured' | 'upgrade' | 'booster' | 'cosmetic' | 'bundle' | 'exchange' | 'gems';
const TABS: { id: StoreTab; icon: string }[] = [
  { id: 'featured', icon: '⭐' },
  { id: 'upgrade', icon: '⬆️' },
  { id: 'booster', icon: '⚡' },
  { id: 'cosmetic', icon: '🎨' },
  { id: 'bundle', icon: '🎁' },
  { id: 'exchange', icon: '🔁' },
  { id: 'gems', icon: '💎' },
];

/** Cosmetic sub-sections, in display order. */
const COSMETIC_GROUPS: { id: string; match: (p: PremiumProduct) => boolean }[] = [
  { id: 'themes', match: (p) => p.grant.kind === 'skin' },
  { id: 'outfits', match: (p) => p.grant.kind === 'outfits' },
  { id: 'accessory', match: (p) => p.grant.kind === 'style' && p.grant.slot === 'accessory' },
  { id: 'display', match: (p) => p.grant.kind === 'style' && p.grant.slot === 'display' },
  { id: 'checkout', match: (p) => p.grant.kind === 'style' && p.grant.slot === 'checkout' },
  { id: 'sign', match: (p) => p.grant.kind === 'style' && p.grant.slot === 'sign' },
  { id: 'entrance', match: (p) => p.grant.kind === 'style' && p.grant.slot === 'entrance' },
  { id: 'decor', match: (p) => p.grant.kind === 'decor' && !p.requires?.event },
  { id: 'events', match: (p) => p.grant.kind === 'decor' && !!p.requires?.event },
];

/** Whole minutes as "10 min", otherwise the usual duration format. */
const mins = (s: number) => (s >= 60 && s % 60 === 0 ? t('store.unit.minutes', { n: s / 60 }) : formatDuration(s));
const dateFmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * The store. Pure UI: every purchase goes through StoreManager (Gems) or the PurchaseController
 * (platform store); ownership, prices, requirements and effects are read from the game.
 * No countdown pressure, fake discounts or fake scarcity: dates shown come from the event config,
 * and bundle savings are computed from the real individual prices.
 */
export class PremiumShop {
  el: HTMLElement;
  private body: HTMLElement;
  private tab: StoreTab = 'featured';
  private detail: PremiumProductId | null = null;
  private busyMsg: string | null = null;
  private previewBar: HTMLElement;

  constructor(private app: AppApi, private store: () => PurchaseController, private renderer: Renderer) {
    this.body = el('div', { class: 'ps-body' });
    this.el = el('div', { class: 'overlay premium hidden' }, el('div', { class: 'menu premium-menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('premium.title') }, this.body));
    this.previewBar = el('div', { class: 'placement-bar preview-bar hidden', role: 'toolbar' });
  }

  get open(): boolean {
    return !this.el.classList.contains('hidden');
  }

  show(tab: StoreTab | 'convenience' = 'featured', productId?: string): void {
    this.tab = tab === 'convenience' ? 'exchange' : tab;
    this.detail = productId && PREMIUM_MAP[productId as PremiumProductId] ? (productId as PremiumProductId) : null;
    toggle(this.el, 'hidden', false);
    this.app.game.analytics('store_opened', { tab: this.tab });
    const s = this.store();
    if (s.status === 'idle' || s.status === 'error' || s.status === 'offline') void s.init();
    this.render();
  }

  close(): void {
    toggle(this.el, 'hidden', true);
    this.detail = null;
  }

  private get g() {
    return this.app.game;
  }

  /** Called by the controller on any state change and by game events. */
  render(): void {
    if (!this.open) return;
    const scroll = (this.body.querySelector('.ps-scroll') as HTMLElement | null)?.scrollTop ?? 0;
    clear(this.body);
    this.body.append(this.header());
    if (this.store().testMode) this.body.append(el('div', { class: 'test-banner', role: 'note' }, `🧪 ${t('premium.test_banner')}`));
    const statusNote = this.statusNote();
    if (statusNote) this.body.append(statusNote);
    const flags = this.g.state.progression.flags;
    if (!flags.viewedCosmetics && (this.tab === 'cosmetic' || this.tab === 'featured' || (this.detail && PREMIUM_MAP[this.detail].category === 'cosmetic'))) flags.viewedCosmetics = true;
    if (this.detail) {
      this.body.append(this.detailView(PREMIUM_MAP[this.detail]));
    } else {
      this.body.append(this.tabs());
      const list = el('div', { class: 'ps-scroll' });
      this.fillTab(list);
      this.body.append(list);
      list.scrollTop = scroll;
      this.body.append(this.footer());
    }
  }

  private fillTab(list: HTMLElement): void {
    const items = (pred: (p: PremiumProduct) => boolean) => PREMIUM_CATALOG.filter(pred);
    const section = (key: string, ps: PremiumProduct[], note?: string) => {
      if (!ps.length) return;
      list.append(el('h3', { class: 'ps-section' }, t(key)));
      if (note) list.append(el('p', { class: 'hint' }, note));
      for (const p of ps) list.append(this.productCard(p));
    };
    switch (this.tab) {
      case 'featured':
        this.homePage(list);
        break;
      case 'upgrade':
        section('store.section.gem_upgrades', items((p) => p.category === 'upgrade'), t('store.gem_upgrades_note'));
        list.append(el('h3', { class: 'ps-section' }, t('store.section.cash_upgrades')), el('p', { class: 'hint' }, t('store.cash_upgrades_note')));
        for (const u of UPGRADES) list.append(this.cashUpgradeCard(u.id));
        break;
      case 'booster':
        list.append(el('p', { class: 'hint' }, t('store.boosters_note')));
        section('store.section.boosters', items((p) => p.category === 'booster'));
        break;
      case 'cosmetic': {
        list.append(this.themeLine());
        for (const grp of COSMETIC_GROUPS) section(`store.group.${grp.id}`, items((p) => p.category === 'cosmetic' && grp.match(p)));
        break;
      }
      case 'bundle':
        list.append(el('p', { class: 'hint' }, t('store.bundles_note')));
        section('store.section.bundles', items((p) => p.category === 'bundle'));
        break;
      case 'exchange':
        section('store.section.resources', items((p) => p.category === 'exchange' && p.grant.kind === 'resource'), t('store.exchange_note'));
        section('store.section.convenience', items((p) => p.category === 'exchange' && p.grant.kind !== 'resource'));
        break;
      case 'gems':
        list.append(this.earnBox());
        section('store.section.gem_packs', items((p) => p.category === 'gems'));
        list.append(el('p', { class: 'hint' }, t('premium.gems_note')));
        break;
    }
  }

  private homePage(list: HTMLElement): void {
    const store = this.g.store;
    // Events running now (dates from the event calendar), each with its one-time Gem gift.
    for (const e of store.activeEvents()) {
      const ends = store.eventEnds(e);
      const claimable = store.eventGiftClaimable(e);
      list.append(
        el(
          'div',
          { class: 'ps-event' },
          el('span', { class: 'ps-event-icon', 'aria-hidden': 'true' }, e.icon),
          el('div', { class: 'card-main' }, el('b', {}, t(`store.event.${e.id}`)), el('small', {}, t(`store.event.${e.id}.desc`)), ends ? el('small', { class: 'hint' }, t('store.event_until', { date: dateFmt(ends) })) : null),
          claimable
            ? el('button', { class: 'btn btn-small btn-primary', 'data-gift': e.id, onclick: guarded(`gift-${e.id}`, () => { const n = store.claimEventGift(e.id); if (n) { this.app.sfx('coin'); this.app.toast(t('store.gift_claimed', { n }), '💎', 'gold'); this.app.saveNow(); } this.render(); }) }, `🎁 ${t('store.claim_gift', { n: GEM_REWARDS.eventGift })}`)
            : el('button', { class: 'btn btn-small', onclick: () => { this.tab = 'cosmetic'; this.render(); } }, t('store.see_collection')),
        ),
      );
    }
    const fresh = store.newlyUnlocked();
    if (fresh.length) {
      list.append(el('h3', { class: 'ps-section' }, `🔓 ${t('store.section.new')}`));
      for (const id of fresh.slice(0, 4)) list.append(this.productCard(PREMIUM_MAP[id]));
      // Seen once shown; they drop off the list next time.
      store.markSeen(fresh.slice(0, 4));
    }
    const rec = store.recommended();
    if (rec.length) {
      list.append(el('h3', { class: 'ps-section' }, `💡 ${t('store.section.recommended')}`));
      for (const id of rec) list.append(this.productCard(PREMIUM_MAP[id]));
    }
    list.append(el('h3', { class: 'ps-section' }, `⭐ ${t('store.section.featured')}`));
    list.append(this.themeLine());
    for (const p of PREMIUM_CATALOG.filter((x) => x.featured)) list.append(this.productCard(p));
    list.append(this.earnBox());
  }

  /** Where Gems come from (all through the same ledger). */
  private earnBox(): HTMLElement {
    const r = GEM_REWARDS;
    const rows = [
      t('store.earn.missions'),
      t('store.earn.achievements'),
      t('store.earn.level', { n: r.levelUp.perLevel, bonus: r.levelUp.bonusEvery5 }),
      t('store.earn.tiers', { list: Object.entries(r.tier).map(([k, v]) => `${t(`tier.${k}`)} ${v}`).join(', ') }),
      t('store.earn.franchise', { n: r.franchise }),
      t('store.earn.tutorial', { n: r.tutorial }),
      t('store.earn.events', { n: r.eventGift }),
    ];
    return el('div', { class: 'ps-earn' }, el('b', {}, `💎 ${t('store.earn.title')}`), el('ul', {}, ...rows.map((x) => el('li', {}, x))));
  }

  private header(): HTMLElement {
    const m = this.g.monetization;
    const st = this.g.state.monetization;
    return el(
      'div',
      { class: 'ps-head' },
      this.detail ? el('button', { class: 'btn btn-ghost btn-small', onclick: () => { this.detail = null; this.render(); } }, `← ${t('ui.back')}`) : el('h2', {}, `🛍️ ${t('premium.title')}`),
      el(
        'div',
        { class: 'ps-balances' },
        el('div', { class: 'ps-balance', title: t('premium.balance_tip', { earned: st.gemsEarned, purchased: st.gemsPurchased }), 'aria-label': t('store.gems_balance', { n: formatNumber(m.gems) }) }, el('b', { class: 'ps-gems' }, `💎 ${formatNumber(m.gems)}`), el('small', {}, t('store.gems_label'))),
        el('div', { class: 'ps-balance cash', 'aria-label': t('store.cash_balance', { amount: formatMoney(this.g.state.player.money) }) }, el('b', { class: 'ps-cash' }, formatMoney(this.g.state.player.money)), el('small', {}, t('store.cash_label'))),
      ),
      el('button', { class: 'insp-close', 'aria-label': t('ui.close'), onclick: () => this.close() }, '✕'),
    );
  }

  private statusNote(): HTMLElement | null {
    const s = this.store();
    const pending = this.g.state.monetization.pending;
    const notes: HTMLElement[] = [];
    if (this.tab === 'gems' || (this.detail && PREMIUM_MAP[this.detail].realMoney)) {
      if (s.status === 'loading') notes.push(el('div', { class: 'ps-status loading' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), t('premium.loading')));
      if (s.status === 'unavailable') notes.push(el('div', { class: 'ps-status' }, `🔌 ${t('premium.unavailable')}`));
      if (s.status === 'offline') notes.push(el('div', { class: 'ps-status' }, `📡 ${t('premium.offline')}`, el('button', { class: 'btn btn-small', onclick: () => void s.init() }, t('premium.retry'))));
      if (s.status === 'error') notes.push(el('div', { class: 'ps-status bad' }, `⚠ ${t('premium.error')}`, el('button', { class: 'btn btn-small', onclick: () => void s.init() }, t('premium.retry'))));
    }
    if (pending.length) notes.push(el('div', { class: 'ps-status' }, `⏳ ${t('premium.pending_n', { n: pending.length })}`));
    if (this.busyMsg) notes.push(el('div', { class: 'ps-status loading' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), this.busyMsg));
    return notes.length ? el('div', { class: 'ps-notes' }, ...notes) : null;
  }

  private tabs(): HTMLElement {
    return el(
      'div',
      { class: 'ps-tabs', role: 'tablist' },
      ...TABS.map((tb) =>
        el(
          'button',
          {
            class: `ps-tab ${this.tab === tb.id ? 'active' : ''}`,
            role: 'tab',
            'data-store-tab': tb.id,
            'aria-selected': String(this.tab === tb.id),
            onclick: () => {
              this.tab = tb.id;
              this.g.analytics('store_category_selected', { tab: tb.id });
              this.render();
            },
          },
          `${tb.icon} ${t(`store.tab.${tb.id}`)}`,
        ),
      ),
    );
  }

  private footer(): HTMLElement {
    const s = this.store();
    return el(
      'div',
      { class: 'ps-foot' },
      el(
        'button',
        {
          class: 'btn btn-ghost btn-small',
          disabled: s.status !== 'ready',
          onclick: guarded('restore', async () => {
            this.busyMsg = t('premium.restoring');
            this.render();
            const r = await s.restore();
            this.busyMsg = null;
            this.app.toast(r.error ? t('premium.restore_failed') : t('premium.restored_n', { n: r.restored }), r.error ? '⚠' : '♻️', r.error ? 'bad' : 'good');
            this.render();
          }),
        },
        `♻️ ${t('premium.restore')}`,
      ),
      el('small', { class: 'hint' }, t('premium.footer_note')),
    );
  }

  // ------------------------------------------------------------------ text helpers

  private name(p: PremiumProduct): string {
    return t(`premium.${p.id}.name`);
  }

  /** "Reach level 8 (you're level 5)" etc. */
  private requirementText(r: RequirementRow): string {
    switch (r.key) {
      case 'level':
        return t('premium.req.level', { need: r.need, have: r.have });
      case 'lifetimeRevenue':
        return t('premium.req.revenue', { need: formatMoney(r.need as number), have: formatMoney(r.have as number) });
      case 'tier':
        return t('store.req.tier', { tier: t(`tier.${r.need}`), have: t(`tier.${r.have}`) });
      case 'franchises':
        return t('store.req.franchises', { need: r.need, have: r.have });
      case 'achievement':
        return t('store.req.achievement', { name: ACHIEVEMENTS.some((a) => a.id === r.need) ? t(`ach.${r.need}`) : String(r.need) });
      case 'event': {
        const e = STORE_EVENTS.find((x) => x.id === r.need);
        const when = e?.from && e.to ? t('store.event_dates', { from: dateFmt(Date.UTC(2001, e.from[0] - 1, e.from[1])), to: dateFmt(Date.UTC(2001, e.to[0] - 1, e.to[1])) }) : t('store.event_first_week');
        return t('store.req.event', { event: t(`store.event.${r.need}`), when });
      }
    }
  }

  private shortRequirement(r: RequirementRow): string {
    switch (r.key) {
      case 'level':
        return t('reason.level_n', { n: r.need });
      case 'lifetimeRevenue':
        return t('premium.req.revenue_short', { amount: formatMoney(r.need as number) });
      case 'tier':
        return t(`tier.${r.need}`);
      case 'franchises':
        return t('store.req.franchises_short', { n: r.need });
      case 'achievement':
        return t(`ach.${r.need}`);
      case 'event':
        return t(`store.event.${r.need}`);
    }
  }

  /** What the item does, with the real numbers for this player right now. */
  private effectLines(p: PremiumProduct): string[] {
    const g = this.g;
    const s = g.store;
    const gr = p.grant;
    switch (gr.kind) {
      case 'perk': {
        const def = GEM_PERKS[gr.perk];
        const lv = s.perkLevel(gr.perk);
        const fmt = (n: number) => (def.effect === 'offline_hours' ? t('store.unit.hours', { n }) : def.effect === 'max_customers' ? t('store.unit.customers', { n }) : `${Math.round(n * 100)}%`);
        const lines = [t(`store.perk.${gr.perk}.effect`), t('store.level_of', { lv, max: def.prices.length }) + ` · ${t('store.now')}: ${def.effect === 'wages' ? '−' : '+'}${fmt(lv * def.perLevel)}`];
        if (lv < def.prices.length) lines.push(`${t('store.next')}: ${def.effect === 'wages' ? '−' : '+'}${fmt((lv + 1) * def.perLevel)}`);
        return lines;
      }
      case 'booster': {
        const def = BOOSTERS[gr.booster];
        const left = s.boosterRemaining(gr.booster);
        const lines = [t(`store.booster.${gr.booster}.effect`, { mult: def.mult, time: mins(def.seconds) }), t('store.booster_clock')];
        if (left > 0) lines.push(t('store.booster_active', { time: formatDuration(Math.ceil(left)), max: mins(def.maxStackSeconds) }));
        return lines;
      }
      case 'resource':
        switch (gr.resource) {
          case 'cash_small':
          case 'cash_large':
            return [t('store.res.cash', { amount: formatMoney(s.cashAmount(gr.resource)), mins: Math.round((gr.resource === 'cash_small' ? RESOURCES.cashSmall.seconds : RESOURCES.cashLarge.seconds) / 60) })];
          case 'xp':
            return [t('store.res.xp', { n: formatNumber(s.xpAmount()) })];
          case 'stock': {
            const n = g.shopMgr.displays().filter((o) => o.stock < g.shopMgr.capacity(o)).length;
            return [t('store.res.stock', { n })];
          }
          case 'staff_training': {
            const e = s.trainingTarget();
            return [e ? t('store.res.training', { role: t(`staff.${e.type}`), name: e.name, from: e.level, to: e.level + 1 }) : t('store.res.training_none')];
          }
          case 'expansion_permit': {
            const next = g.shopMgr.nextExpansion();
            if (!next) return [t('store.res.permit_none')];
            const full = Math.round(next.cost * g.mods.location.costMult);
            return [t('store.res.permit', { pct: Math.round(RESOURCES.expansionDiscount * 100), from: formatMoney(full), to: formatMoney(Math.round(full * (1 - RESOURCES.expansionDiscount))) }), g.state.store.charges.expansionPermit ? t('store.charge_ready') : ''].filter(Boolean);
          }
          case 'offline_bonus':
            return [t('store.res.offline', { mult: RESOURCES.offlineMultiplier }), g.state.store.charges.offlineBonus ? t('store.charge_ready') : ''].filter(Boolean);
        }
        return [];
      default:
        return [];
    }
  }

  // ------------------------------------------------------------------ cards

  private stateTag(p: PremiumProduct): HTMLElement | null {
    const g = this.g;
    const m = g.monetization;
    const tags: (HTMLElement | null)[] = [];
    if (g.state.monetization.pending.some((x) => x.productId === p.id)) tags.push(tag(`⏳ ${t('premium.state.pending')}`, 'warn'));
    if (p.grant.kind === 'perk') {
      const lv = g.store.perkLevel(p.grant.perk);
      const max = GEM_PERKS[p.grant.perk].prices.length;
      tags.push(tag(lv >= max ? `✓ ${t('store.state.max')}` : t('store.level_of', { lv, max }), lv >= max ? 'good' : 'lv'));
    }
    if (p.grant.kind === 'booster') {
      const left = g.store.boosterRemaining(p.grant.booster);
      if (left > 0) tags.push(tag(`⚡ ${t('store.state.active', { time: formatDuration(Math.ceil(left)) })}`, 'good'));
    }
    if (p.limit) tags.push(tag(t('store.state.today', { n: g.store.boughtToday(p.id), max: p.limit.perDay }), g.store.boughtToday(p.id) >= p.limit.perDay ? 'locked' : ''));
    if (p.ownership === 'once' && m.owns(p.id)) {
      tags.push(tag(`✓ ${t('premium.state.owned')}`, 'good'));
      if (this.isEquipped(p)) tags.push(tag(`★ ${t(p.grant.kind === 'automation' ? 'premium.state.on' : 'premium.state.equipped')}`, 'lv'));
      if (m.ownsTestOnly(p.id)) tags.push(tag(`🧪 ${t('premium.state.test')}`, 'special'));
    }
    const shown = tags.filter(Boolean) as HTMLElement[];
    return shown.length ? el('span', { class: 'tags' }, ...shown) : null;
  }

  private isEquipped(p: PremiumProduct): boolean {
    const eq = this.g.state.monetization.equipped;
    const gr = p.grant;
    if (gr.kind === 'skin') return eq.skin === gr.skin;
    if (gr.kind === 'outfits') return !!eq.outfit && gr.outfits.includes(eq.outfit);
    if (gr.kind === 'style') return eq[gr.slot] === gr.style;
    if (gr.kind === 'automation') return this.g.monetization.autoRestockActive();
    return false;
  }

  /** "🔒 Level 15 · £25K revenue" — exactly which requirements are still missing. */
  private lockTag(p: PremiumProduct): HTMLElement | null {
    const missing = this.g.store.requirementRows(p.id).filter((r) => !r.met);
    if (!missing.length) return null;
    return tag(`🔒 ${missing.map((r) => this.shortRequirement(r)).join(' · ')}`, 'locked');
  }

  private requirementsBlock(p: PremiumProduct): HTMLElement | null {
    const rows = this.g.store.requirementRows(p.id);
    if (!rows.length) return null;
    const met = rows.every((r) => r.met);
    return el('div', { class: `ps-reqs ${met ? 'all-met' : ''}` }, el('b', {}, met ? t('premium.req.unlocked') : t('premium.req.title')), el('ul', {}, ...rows.map((r) => el('li', { class: r.met ? 'met' : 'unmet' }, `${r.met ? '✓' : '✗'} ${this.requirementText(r)}`))));
  }

  private themeLine(): HTMLElement {
    const skin = this.g.state.monetization.equipped.skin;
    const owner = PREMIUM_CATALOG.find((x) => x.grant.kind === 'skin' && x.grant.skin === skin);
    return el('p', { class: 'hint ps-theme-line' }, owner ? t('premium.theme_current', { name: this.name(owner) }) : t('premium.theme_none'));
  }

  private priceLine(p: PremiumProduct): string {
    const s = this.store();
    const parts: string[] = [];
    const gems = this.g.store.priceOf(p.id);
    if (gems) parts.push(`💎 ${formatNumber(gems)}`);
    if (p.realMoney) parts.push(s.priceOf(p.id)?.displayPrice ?? t('premium.price_unavailable'));
    return parts.join(` ${t('premium.or')} `);
  }

  private productCard(p: PremiumProduct): HTMLElement {
    const owned = p.ownership === 'once' && this.g.monetization.owns(p.id);
    const block = this.g.store.blocker(p.id);
    const short = this.effectLines(p)[0];
    const c = card(
      `ps-card ${owned ? 'owned' : ''}`,
      el('div', { class: 'ps-thumb', style: { background: `linear-gradient(135deg, ${p.preview.swatch.join(', ')})` }, 'aria-hidden': 'true' }, p.preview.icon),
      el(
        'div',
        { class: 'card-main' },
        el('b', {}, this.name(p)),
        el('small', {}, short ?? t(`premium.${p.id}.desc`)),
        owned || block === 'max_level' ? null : el('div', { class: 'ps-price' }, this.priceLine(p)),
        this.stateTag(p),
        owned ? null : this.lockTag(p),
        block && block !== 'locked' && block !== 'owned' ? el('small', { class: 'ps-why' }, this.whyText(p, block)) : null,
      ),
      el('span', { class: 'ps-chevron', 'aria-hidden': 'true' }, '›'),
    );
    c.setAttribute('role', 'button');
    c.setAttribute('data-item', p.id);
    c.tabIndex = 0;
    const open = () => {
      this.detail = p.id;
      this.g.analytics('store_item_viewed', { item: p.id });
      this.app.sfx('click');
      this.render();
    };
    c.addEventListener('click', open);
    c.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && open());
    return c;
  }

  /** Cash upgrades from the existing upgrade system, bought with cash right here. */
  private cashUpgradeCard(id: string): HTMLElement {
    const g = this.g;
    const def = UPGRADES.find((u) => u.id === id)!;
    const lv = g.upgrades.level(id);
    const cost = g.upgrades.cost(id);
    const can = g.upgrades.canBuy(id);
    const pv = g.upgrades.preview(id);
    const locked = can.reason === 'level';
    const btn = el(
      'button',
      {
        class: `btn btn-buy ${can.ok ? 'affordable' : 'cant'}`,
        'data-cash-upgrade': id,
        'aria-disabled': String(!can.ok),
        disabled: cost === null,
        onclick: guarded(`cash-${id}`, () => {
          if (g.upgrades.buy(id)) {
            this.app.sfx('upgrade');
            this.app.toast(t('store.cash_upgrade_done', { name: t(`upg.${id}`), lv: g.upgrades.level(id) }), def.icon, 'good');
            this.app.saveNow();
          } else {
            this.app.sfx('error');
            this.app.toast(t(locked ? 'store.why.locked_level' : 'store.not_enough_cash'), '⚠', 'bad');
          }
          this.render();
        }),
      },
      el('span', { class: 'ub-label' }, cost === null ? t('store.state.max') : locked ? `🔒 ${t('reason.level_n', { n: def.requiredLevel })}` : t('store.buy')),
      cost === null ? null : el('span', { class: 'ub-price' }, formatMoney(cost)),
    );
    return card(
      locked ? 'locked-card' : '',
      el('div', { class: 'ps-thumb cash', 'aria-hidden': 'true' }, def.icon),
      el('div', { class: 'card-main' }, el('b', {}, t(`upg.${id}`), ' ', tag(t('store.level_of', { lv, max: def.maxLevel }), 'lv')), el('small', {}, t(`upg.${id}.desc`)), cost !== null ? el('small', { class: 'ps-next' }, `${t('store.now')}: ${pv.current}${pv.unit} → ${t('store.next')}: ${pv.next}${pv.unit}`) : null),
      btn,
    );
  }

  // ----------------------------------------------------------------- detail

  private detailView(p: PremiumProduct): HTMLElement {
    const g = this.g;
    const m = g.monetization;
    const s = this.store();
    const owned = p.ownership === 'once' && m.owns(p.id);
    const out = el('div', { class: 'ps-scroll ps-detail' });
    out.append(el('div', { class: 'ps-hero', style: { background: `linear-gradient(135deg, ${p.preview.swatch.join(', ')})` } }, this.previewCanvas(p) ?? el('span', { class: 'ps-hero-icon' }, p.preview.icon)));
    out.append(el('h3', {}, this.name(p)), el('p', {}, t(`premium.${p.id}.long`)));
    const effects = this.effectLines(p);
    if (effects.length) out.append(el('div', { class: 'ps-effect' }, el('b', {}, t('store.effect')), el('ul', {}, ...effects.map((x) => el('li', {}, x)))));
    if (p.grant.kind === 'bundle') out.append(this.bundleContents(p));
    else if (p.contents.length) out.append(el('div', { class: 'ps-contents' }, el('b', {}, t('premium.contents')), el('ul', {}, ...p.contents.map((k) => el('li', {}, t(k))))));
    out.append(el('p', { class: 'hint' }, t(p.grant.kind === 'gems' ? 'premium.type.consumable' : p.ownership === 'stackable' ? 'store.type.consumable' : p.ownership === 'levels' ? 'store.type.levels' : 'premium.type.permanent')));
    if (p.limit) out.append(el('p', { class: 'hint' }, t('store.limit_note', { n: p.limit.perDay, today: g.store.boughtToday(p.id) })));
    const st = this.stateTag(p);
    if (st) out.append(st);
    if (!owned) {
      const req = this.requirementsBlock(p);
      if (req) out.append(req);
    }
    const actions = el('div', { class: 'ps-actions' });
    // Live preview on the actual shop (themes, outfits, styles).
    if (p.grant.kind === 'skin' || p.grant.kind === 'outfits' || p.grant.kind === 'style') actions.append(el('button', { class: 'btn btn-ghost', 'data-preview': p.id, onclick: () => this.startPreview(p) }, `👀 ${t('premium.preview_in_shop')}`));
    if (owned) this.ownedActions(p, actions);
    else {
      const block = g.store.blocker(p.id);
      const price = g.store.priceOf(p.id);
      if (price && p.grant.kind !== 'gems') {
        const enough = m.gems >= price;
        const ok = enough && !block;
        actions.append(
          el(
            'button',
            { class: `btn btn-buy ${ok ? 'affordable' : 'cant'}`, 'data-buy': `gems-${p.id}`, 'aria-disabled': String(!ok), disabled: block === 'max_level', onclick: () => this.confirmGems(p) },
            el('span', { class: 'ub-label' }, block === 'locked' ? `🔒 ${t('premium.locked')}` : block ? t(`store.why.${block}`) : p.ownership === 'levels' ? t('store.buy_level') : p.ownership === 'stackable' ? t('store.buy_with_gems') : t('premium.buy_with_gems')),
            el('span', { class: 'ub-price' }, `💎 ${formatNumber(price)}`),
            enough || block ? null : el('span', { class: 'ub-need' }, t('hud.need_more', { amount: `💎 ${formatNumber(price - m.gems)}` })),
          ),
        );
      }
      if (p.realMoney) {
        const rp = s.priceOf(p.id);
        const busy = s.inFlight === p.id;
        actions.append(
          el(
            'button',
            { class: `btn btn-buy ${rp && s.status === 'ready' ? 'affordable gold' : 'cant'}`, 'data-buy': `money-${p.id}`, disabled: !rp || s.status !== 'ready' || !!s.inFlight, onclick: () => this.confirmMoney(p) },
            el('span', { class: 'ub-label' }, busy ? t('premium.processing') : s.testMode ? t('premium.buy_test') : t('premium.buy')),
            el('span', { class: 'ub-price' }, rp?.displayPrice ?? t('premium.price_unavailable')),
          ),
        );
        if (s.status === 'unavailable') actions.append(el('p', { class: 'hint' }, t('store.billing_unavailable')));
      }
    }
    out.append(actions);
    return out;
  }

  /** Every bundle item with its own price; savings are computed from those real prices. */
  private bundleContents(p: PremiumProduct): HTMLElement {
    if (p.grant.kind !== 'bundle') return el('div');
    const value = bundleValue(p);
    const rows = p.grant.items.map((id) => {
      const item = PREMIUM_MAP[id];
      const owned = item.ownership === 'once' && this.g.monetization.owns(id);
      return el('li', {}, `${item.preview.icon} ${this.name(item)} — 💎 ${item.gemPrice}`, owned ? el('span', { class: 'tag bad' }, t('store.already_owned')) : null);
    });
    const save = value !== null && p.gemPrice ? value - p.gemPrice : 0;
    return el(
      'div',
      { class: 'ps-contents' },
      el('b', {}, t('premium.contents')),
      el('ul', {}, ...rows),
      value !== null && save > 0 ? el('p', { class: 'ps-value' }, t('store.bundle_value', { value: formatNumber(value), price: formatNumber(p.gemPrice!), save: formatNumber(save) })) : null,
      this.g.store.blocker(p.id) === 'owned_part' ? el('p', { class: 'hint bad' }, t('store.bundle_owned_part')) : null,
    );
  }

  private ownedActions(p: PremiumProduct, actions: HTMLElement): void {
    const g = this.g;
    const m = g.monetization;
    const gr = p.grant;
    if (gr.kind === 'skin') {
      const on = g.state.monetization.equipped.skin === gr.skin;
      actions.append(el('button', { class: `btn ${on ? 'btn-ghost' : 'btn-primary'}`, 'data-equip': p.id, onclick: () => { if (m.equipSkin(on ? null : gr.skin)) g.analytics('cosmetic_equipped', { skin: on ? null : gr.skin }); this.app.sfx('pop'); this.app.saveNow(); this.render(); } }, on ? t('premium.unequip') : t('premium.equip')));
    } else if (gr.kind === 'outfits') {
      const row = el('div', { class: 'product-picker', role: 'radiogroup', 'aria-label': t('premium.outfit') });
      for (const o of [null, ...gr.outfits]) {
        const on = g.state.monetization.equipped.outfit === o;
        row.append(el('button', { class: `chip ${on ? 'active' : ''}`, role: 'radio', 'aria-checked': String(on), onclick: () => { if (m.equipOutfit(o)) g.analytics('cosmetic_equipped', { outfit: o }); this.app.sfx('pop'); this.app.saveNow(); this.render(); } }, t(`premium.outfit.${o ?? 'standard'}`)));
      }
      actions.append(row);
    } else if (gr.kind === 'style') {
      const on = g.state.monetization.equipped[gr.slot] === gr.style;
      actions.append(el('button', { class: `btn ${on ? 'btn-ghost' : 'btn-primary'}`, 'data-equip': p.id, onclick: () => { g.store.equipStyle(gr.slot, on ? null : gr.style); this.app.sfx('pop'); this.app.saveNow(); this.render(); } }, on ? t('premium.unequip') : t('premium.equip')));
    } else if (gr.kind === 'automation') {
      const on = m.autoRestockActive();
      actions.append(el('button', { class: `btn ${on ? 'btn-ghost' : 'btn-primary'}`, onclick: () => { m.setAutoRestock(!on); this.app.sfx('pop'); this.render(); } }, on ? t('premium.turn_off') : t('premium.turn_on')));
    } else if (gr.kind === 'decor') {
      actions.append(el('button', { class: 'btn btn-primary', onclick: () => { this.close(); this.app.openPanel('shop'); } }, `🪴 ${t('premium.place_decor')}`));
    } else if (gr.kind === 'layout_slots') {
      actions.append(el('button', { class: 'btn btn-primary', onclick: () => { this.close(); this.app.openPanel('shop'); } }, `🗂️ ${t('premium.open_layouts')}`));
    }
  }

  /** Small canvas preview drawn with the real game sprites (themes, styles, decor, outfits). */
  private previewCanvas(p: PremiumProduct): HTMLCanvasElement | null {
    const gr = p.grant;
    if (gr.kind !== 'decor' && gr.kind !== 'outfits' && gr.kind !== 'skin' && gr.kind !== 'style') return null;
    if (gr.kind === 'style' && gr.slot === 'entrance') return null;
    const c = el('canvas', { class: 'ps-canvas', width: 480, height: 200, 'aria-label': this.name(p) }) as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    // Previews always use the classic camera angle, whatever the shop camera is doing.
    const prevView = { ...view };
    setView(0, 30, 0, 0);
    try {
      ctx.scale(2, 2);
      if (gr.kind === 'skin' || (gr.kind === 'style' && gr.slot !== 'accessory')) {
        // Mini scene: shelf, shelf, checkout and a cashier, with the theme or style applied.
        const base = gr.kind === 'skin' ? getSkin(gr.skin) : getSkin(this.g.state.monetization.equipped.skin);
        const skin = gr.kind === 'style' ? styledSkin(base, { [gr.slot]: gr.style }) : base;
        const pal = (gr.kind === 'skin' ? base?.palette : null) ?? { floorA: '#f6e7cb', floorB: '#eed9b4' };
        ctx.save();
        ctx.translate(120, 30);
        const floor = [pal.floorA, pal.floorB];
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 3; x++) {
            const a = { x: (x - y) * 32, y: (x + y) * 16 };
            ctx.fillStyle = floor[(x + y) % 2];
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(a.x + 32, a.y + 16);
            ctx.lineTo(a.x, a.y + 32);
            ctx.lineTo(a.x - 32, a.y + 16);
            ctx.closePath();
            ctx.fill();
          }
        const info = { stockRatio: 1, time: 1, skin, sparkle: false };
        drawObject(ctx, { uid: 1, kind: 'shelf', x: 0, y: 0, dir: 1, tier: 1, productId: 'crisps', stock: 10, progress: 0 }, info);
        drawObject(ctx, { uid: 2, kind: 'shelf', x: 1, y: 0, dir: 1, tier: 2, productId: 'candy', stock: 10, progress: 0 }, info);
        drawObject(ctx, { uid: 3, kind: 'checkout', x: 2, y: 1, dir: 2, tier: 0, stock: 0, progress: 0 }, info);
        drawCharacter(ctx, 0, 62, { ...staffAppearance('cashier', 3, null, gr.kind === 'skin' ? base?.uniform : undefined), scale: 1.15 }, { state: 'idle', t: 0, front: true, right: false });
        ctx.restore();
        if (gr.kind === 'style' && gr.slot === 'sign' && skin?.sign) {
          const sg = skin.sign;
          ctx.save();
          if (sg.glow) {
            ctx.shadowColor = sg.glow;
            ctx.shadowBlur = 12;
          }
          ctx.fillStyle = sg.fill;
          ctx.fillRect(30, 12, 70, 20);
          ctx.restore();
          ctx.strokeStyle = sg.border;
          ctx.lineWidth = 2;
          ctx.strokeRect(30, 12, 70, 20);
          ctx.fillStyle = sg.text;
          ctx.font = '900 10px Nunito, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(t('premium.title'), 65, 23);
        }
      } else if (gr.kind === 'style') {
        // accessory: worn by three different roles
        ['cashier', 'stocker', 'manager'].forEach((role, i) => {
          const look = staffAppearance(role, i + 1, null);
          look.accessories.push(ACCESSORY_STYLES[gr.style]);
          drawCharacter(ctx, 60 + i * 60, 92, { ...look, scale: 1.8 }, { state: 'idle', t: 0, front: true, right: i % 2 === 0 });
        });
      } else if (gr.kind === 'decor') {
        gr.objects.forEach((kind, i) => {
          ctx.save();
          ctx.translate(gr.objects.length === 1 ? 120 : 60 + i * 60, 30);
          drawObject(ctx, { uid: i, kind, x: 0, y: 0, dir: 1, tier: 0, stock: 0, progress: 0 }, { stockRatio: 1, time: 1 + i });
          ctx.restore();
        });
      } else {
        // Each outfit worn by a different staff role, so players can see it keeps the role's props.
        const roles = ['cashier', 'stocker', 'cleaner', 'manager'];
        const n = gr.outfits.length;
        gr.outfits.forEach((o, i) => {
          const look = { ...staffAppearance(roles[i % roles.length], i + 1, o), scale: n > 2 ? 1.7 : 2 };
          drawCharacter(ctx, (240 / (n + 1)) * (i + 1), 92, look, { state: 'idle', t: 0, front: true, right: i % 2 === 0 });
        });
      }
      return c;
    } finally {
      setView(prevView.yaw, prevView.pitch, prevView.px, prevView.py);
    }
  }

  // -------------------------------------------------------------- previews

  private startPreview(p: PremiumProduct): void {
    this.g.analytics('cosmetic_previewed', { product: p.id });
    const r = this.renderer;
    const gr = p.grant;
    r.preview = gr.kind === 'skin' ? { skin: gr.skin } : gr.kind === 'outfits' ? { outfit: gr.outfits[0] } : gr.kind === 'style' ? { styles: { [gr.slot]: gr.style } as Partial<Record<StyleSlot, string>> } : null;
    this.close();
    clear(this.previewBar);
    this.previewBar.append(
      el('div', { class: 'pb-text' }, el('b', {}, `👀 ${t('premium.previewing', { name: this.name(p) })}`), el('small', {}, t('premium.preview_hint'))),
      el('div', { class: 'row' }, el('button', { class: 'btn btn-small btn-primary', onclick: () => { this.endPreview(); this.show('featured', p.id); } }, t('premium.preview_details')), el('button', { class: 'btn btn-small btn-ghost', onclick: () => this.endPreview() }, `✕ ${t('premium.end_preview')}`)),
    );
    toggle(this.previewBar, 'hidden', false);
  }

  endPreview(): void {
    this.renderer.preview = null;
    toggle(this.previewBar, 'hidden', true);
  }

  get previewing(): boolean {
    return !this.previewBar.classList.contains('hidden');
  }

  get previewBarEl(): HTMLElement {
    return this.previewBar;
  }

  // ------------------------------------------------------------- purchases

  /** Why an item can't be bought; for a bundle, names the item that blocks it. */
  private whyText(p: PremiumProduct, block: string): string {
    if (p.grant.kind === 'bundle') {
      const item = p.grant.items.find((i) => this.g.store.blocker(i, true));
      if (item) return t('store.why.bundle_item', { item: this.name(PREMIUM_MAP[item]), why: t(`store.why.${block === 'owned_part' ? 'owned' : block}`) });
    }
    return t(`store.why.${block}`);
  }

  /** Explains a blocked purchase without spending anything. */
  private explain(reason: StoreFailReason): void {
    this.app.sfx('error');
    this.app.toast(t(`store.fail.${reason}`), reason === 'insufficient' ? '💎' : reason === 'locked' ? '🔒' : '⚠', 'bad');
  }

  private confirmGems(p: PremiumProduct): void {
    const g = this.g;
    const m = g.monetization;
    const price = g.store.priceOf(p.id);
    if (!price) return;
    const block = g.store.blocker(p.id);
    if (block) return this.explain(block);
    if (m.gems < price) {
      this.app.sfx('error');
      this.app.toast(t('premium.not_enough_gems', { n: price - m.gems }), '💎', 'bad');
      return;
    }
    const benefit = this.effectLines(p)[0] ?? t(`premium.${p.id}.desc`);
    const body = el(
      'div',
      { class: 'ps-confirm' },
      el('p', {}, benefit),
      el(
        'dl',
        { class: 'ps-confirm-sums' },
        el('dt', {}, t('store.confirm.cost')),
        el('dd', {}, `💎 ${formatNumber(price)}`),
        el('dt', {}, t('store.confirm.balance')),
        el('dd', {}, `💎 ${formatNumber(m.gems)}`),
        el('dt', {}, t('store.confirm.after')),
        el('dd', {}, `💎 ${formatNumber(m.gems - price)}`),
      ),
    );
    this.app.confirm({
      icon: p.preview.icon,
      title: t('premium.confirm_title', { name: this.name(p) }),
      text: body,
      okLabel: t('premium.confirm_spend', { price: formatNumber(price) }),
      onOk: guarded(`gems-${p.id}`, () => {
        g.analytics('purchase_initiated', { product: p.id, currency: 'gems' });
        const r = g.store.purchase(p.id);
        g.analytics('purchase_result', { product: p.id, currency: 'gems', result: r.ok ? 'success' : r.reason });
        if (r.ok) {
          this.app.sfx('upgrade');
          this.app.toast(this.successText(p), p.preview.icon, 'gold');
          this.app.saveNow();
        } else this.explain(r.reason);
        this.render();
      }),
    });
  }

  private successText(p: PremiumProduct): string {
    const gr = p.grant;
    if (gr.kind === 'booster') return t('store.done.booster', { name: this.name(p), time: formatDuration(Math.ceil(this.g.store.boosterRemaining(gr.booster))) });
    if (gr.kind === 'perk') return t('store.done.perk', { name: this.name(p), lv: this.g.store.perkLevel(gr.perk) });
    return t('premium.success', { name: this.name(p) });
  }

  private confirmMoney(p: PremiumProduct): void {
    const s = this.store();
    const price = s.priceOf(p.id);
    if (!price) return;
    this.app.confirm({
      icon: p.preview.icon,
      title: t('premium.confirm_title', { name: this.name(p) }),
      text: `${t('premium.confirm_money', { price: price.displayPrice })}${s.testMode ? `\n\n${t('premium.confirm_test')}` : ''}`,
      okLabel: s.testMode ? t('premium.confirm_test_ok', { price: price.displayPrice }) : t('premium.confirm_pay', { price: price.displayPrice }),
      onOk: guarded(`money-${p.id}`, async () => {
        this.render();
        this.g.analytics('purchase_initiated', { product: p.id, currency: 'store', test: s.testMode });
        const r = await s.purchase(p.id);
        this.g.analytics('purchase_result', { product: p.id, currency: 'store', result: r.status, test: s.testMode });
        this.reportOutcome(r);
        this.render();
      }),
    });
  }

  /** Every outcome gets explicit, honest feedback. */
  reportOutcome(r: PurchaseOutcome | { status: 'refunded'; productId: PremiumProductId }): void {
    const name = t(`premium.${r.productId}.name`);
    switch (r.status) {
      case 'verified':
        this.app.sfx('upgrade');
        this.app.toast(r.test ? t('premium.success_test', { name }) : t('premium.success', { name }), r.test ? '🧪' : '🎉', 'gold');
        this.app.saveNow();
        break;
      case 'pending':
        this.app.toast(t('premium.pending', { name }), '⏳');
        this.app.saveNow();
        break;
      case 'unverified':
        this.app.toast(t('premium.unverified'), '⚠', 'bad');
        this.app.saveNow();
        break;
      case 'cancelled':
        this.app.toast(t('premium.cancelled'), '↩️');
        break;
      case 'failed':
        this.app.sfx('error');
        this.app.toast(t('premium.failed', { reason: t(`premium.reason.${r.reason}`) }), '⚠', 'bad');
        break;
      case 'refunded':
        this.app.toast(t('premium.refunded', { name }), '↩️', 'bad');
        this.app.saveNow();
        break;
      case 'busy':
        this.app.toast(t('premium.busy'), '⏳');
        break;
      case 'owned':
        this.app.toast(t('premium.err.owned'), '✓');
        break;
      default:
        this.app.toast(t('premium.unavailable'), '🔌', 'bad');
    }
  }

  /** Keeps live bits (balances, booster timers) current without rebuilding every frame. */
  tick(): void {
    if (!this.open) return;
    const b = this.body.querySelector('.ps-gems') as HTMLElement | null;
    if (b) setText(b, `💎 ${formatNumber(this.g.monetization.gems)}`);
    const c = this.body.querySelector('.ps-cash') as HTMLElement | null;
    if (c) setText(c, formatMoney(this.g.state.player.money));
  }
}

