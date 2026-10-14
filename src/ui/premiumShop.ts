import type { AppApi } from './api';
import type { PurchaseController, PurchaseOutcome } from '../monetization/controller';
import { PREMIUM_CATALOG, PREMIUM_MAP } from '../monetization/catalog';
import type { PremiumProduct, PremiumProductId } from '../monetization/catalog';
import type { Renderer } from '../render/renderer';
import { el, clear, guarded, toggle, setText } from './dom';
import { card, tag } from './components';
import { drawObject, drawPerson } from '../render/sprites';
import { formatNumber } from '../core/format';
import { t } from '../core/i18n';

type Tab = 'featured' | 'cosmetic' | 'gems' | 'convenience';
const TABS: { id: Tab; icon: string }[] = [
  { id: 'featured', icon: '⭐' },
  { id: 'cosmetic', icon: '🎨' },
  { id: 'gems', icon: '💎' },
  { id: 'convenience', icon: '🧰' },
];

/**
 * Premium Shop. Pure UI: prices come from the PurchaseController (store-supplied),
 * ownership from the game's MonetizationManager. No countdowns, fake discounts or urgency.
 */
export class PremiumShop {
  el: HTMLElement;
  private body: HTMLElement;
  private tab: Tab = 'featured';
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

  show(tab: Tab = 'featured'): void {
    this.tab = tab;
    this.detail = null;
    toggle(this.el, 'hidden', false);
    const s = this.store();
    if (s.status === 'idle' || s.status === 'error' || s.status === 'offline') void s.init();
    this.render();
  }

  close(): void {
    toggle(this.el, 'hidden', true);
    this.detail = null;
  }

  /** Called by the controller on any state change and by the UI tick. */
  render(): void {
    if (!this.open) return;
    const scroll = (this.body.querySelector('.ps-scroll') as HTMLElement | null)?.scrollTop ?? 0;
    clear(this.body);
    this.body.append(this.header());
    if (this.store().testMode) this.body.append(el('div', { class: 'test-banner', role: 'note' }, `🧪 ${t('premium.test_banner')}`));
    const statusNote = this.statusNote();
    if (statusNote) this.body.append(statusNote);
    if (this.detail) this.body.append(this.detailView(PREMIUM_MAP[this.detail]));
    else {
      this.body.append(this.tabs());
      const list = el('div', { class: 'ps-scroll' });
      const items = PREMIUM_CATALOG.filter((p) => (this.tab === 'featured' ? p.featured : p.category === this.tab));
      if (!items.length) list.append(el('p', { class: 'hint' }, t('premium.empty')));
      for (const p of items) list.append(this.productCard(p));
      if (this.tab === 'gems') list.append(el('p', { class: 'hint' }, t('premium.gems_note')));
      this.body.append(list);
      list.scrollTop = scroll;
      this.body.append(this.footer());
    }
  }

  private header(): HTMLElement {
    const m = this.app.game.monetization;
    const st = this.app.game.state.monetization;
    return el(
      'div',
      { class: 'ps-head' },
      this.detail ? el('button', { class: 'btn btn-ghost btn-small', onclick: () => { this.detail = null; this.render(); } }, `← ${t('ui.back')}`) : el('h2', {}, `💎 ${t('premium.title')}`),
      el('div', { class: 'ps-balance', title: t('premium.balance_tip', { earned: st.gemsEarned, purchased: st.gemsPurchased }) }, el('b', {}, `💎 ${formatNumber(m.gems)}`), el('small', {}, t('premium.balance_split', { earned: formatNumber(st.gemsEarned), purchased: formatNumber(st.gemsPurchased) }))),
      el('button', { class: 'insp-close', 'aria-label': t('ui.close'), onclick: () => this.close() }, '✕'),
    );
  }

  private statusNote(): HTMLElement | null {
    const s = this.store();
    const pending = this.app.game.state.monetization.pending;
    const notes: HTMLElement[] = [];
    if (s.status === 'loading') notes.push(el('div', { class: 'ps-status loading' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), t('premium.loading')));
    if (s.status === 'unavailable') notes.push(el('div', { class: 'ps-status' }, `🔌 ${t('premium.unavailable')}`));
    if (s.status === 'offline') notes.push(el('div', { class: 'ps-status' }, `📡 ${t('premium.offline')}`, el('button', { class: 'btn btn-small', onclick: () => void s.init() }, t('premium.retry'))));
    if (s.status === 'error') notes.push(el('div', { class: 'ps-status bad' }, `⚠ ${t('premium.error')}`, el('button', { class: 'btn btn-small', onclick: () => void s.init() }, t('premium.retry'))));
    if (pending.length) notes.push(el('div', { class: 'ps-status' }, `⏳ ${t('premium.pending_n', { n: pending.length })}`));
    if (this.busyMsg) notes.push(el('div', { class: 'ps-status loading' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), this.busyMsg));
    return notes.length ? el('div', { class: 'ps-notes' }, ...notes) : null;
  }

  private tabs(): HTMLElement {
    return el(
      'div',
      { class: 'ps-tabs', role: 'tablist' },
      ...TABS.map((tb) => el('button', { class: `ps-tab ${this.tab === tb.id ? 'active' : ''}`, role: 'tab', 'aria-selected': String(this.tab === tb.id), onclick: () => { this.tab = tb.id; this.render(); } }, `${tb.icon} ${t(`premium.tab.${tb.id}`)}`)),
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

  // ------------------------------------------------------------------ cards

  private stateTag(p: PremiumProduct): HTMLElement | null {
    const g = this.app.game;
    const m = g.monetization;
    if (g.state.monetization.pending.some((x) => x.productId === p.id)) return tag(`⏳ ${t('premium.state.pending')}`, 'warn');
    if (p.ownership !== 'once' || !m.owns(p.id)) return null;
    const eq = g.state.monetization.equipped;
    const equipped = (p.grant.kind === 'skin' && eq.skin === p.grant.skin) || (p.grant.kind === 'outfits' && !!eq.outfit && p.grant.outfits.includes(eq.outfit)) || (p.grant.kind === 'automation' && m.autoRestockActive());
    return el('span', { class: 'tags' }, tag(`✓ ${t('premium.state.owned')}`, 'good'), equipped ? tag(`★ ${t(p.grant.kind === 'automation' ? 'premium.state.on' : 'premium.state.equipped')}`, 'lv') : null, m.ownsTestOnly(p.id) ? tag(`🧪 ${t('premium.state.test')}`, 'special') : null);
  }

  private priceLine(p: PremiumProduct): string {
    const s = this.store();
    const parts: string[] = [];
    if (p.gemPrice) parts.push(`💎 ${p.gemPrice}`);
    if (p.realMoney) parts.push(s.priceOf(p.id)?.displayPrice ?? t('premium.price_unavailable'));
    return parts.join(` ${t('premium.or')} `);
  }

  private productCard(p: PremiumProduct): HTMLElement {
    const owned = p.ownership === 'once' && this.app.game.monetization.owns(p.id);
    const c = card(
      `ps-card ${owned ? 'owned' : ''}`,
      el('div', { class: 'ps-thumb', style: { background: `linear-gradient(135deg, ${p.preview.swatch.join(', ')})` }, 'aria-hidden': 'true' }, p.preview.icon),
      el('div', { class: 'card-main' }, el('b', {}, t(`premium.${p.id}.name`)), el('small', {}, t(`premium.${p.id}.desc`)), owned ? null : el('div', { class: 'ps-price' }, this.priceLine(p)), this.stateTag(p)),
      el('span', { class: 'ps-chevron', 'aria-hidden': 'true' }, '›'),
    );
    c.setAttribute('role', 'button');
    c.tabIndex = 0;
    const open = () => {
      this.detail = p.id;
      this.app.sfx('click');
      this.render();
    };
    c.addEventListener('click', open);
    c.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && open());
    return c;
  }

  // ----------------------------------------------------------------- detail

  private detailView(p: PremiumProduct): HTMLElement {
    const g = this.app.game;
    const m = g.monetization;
    const s = this.store();
    const owned = p.ownership === 'once' && m.owns(p.id);
    const out = el('div', { class: 'ps-scroll ps-detail' });
    out.append(el('div', { class: 'ps-hero', style: { background: `linear-gradient(135deg, ${p.preview.swatch.join(', ')})` } }, this.previewCanvas(p) ?? el('span', { class: 'ps-hero-icon' }, p.preview.icon)));
    out.append(el('h3', {}, t(`premium.${p.id}.name`)), el('p', {}, t(`premium.${p.id}.long`)));
    out.append(el('div', { class: 'ps-contents' }, el('b', {}, t('premium.contents')), el('ul', {}, ...p.contents.map((k) => el('li', {}, t(k))))));
    out.append(el('p', { class: 'hint' }, t(p.type === 'consumable' ? 'premium.type.consumable' : 'premium.type.permanent')));
    const st = this.stateTag(p);
    if (st) out.append(st);
    const actions = el('div', { class: 'ps-actions' });
    // Live preview on the actual shop (skins & outfits).
    if (p.grant.kind === 'skin' || p.grant.kind === 'outfits') {
      actions.append(el('button', { class: 'btn btn-ghost', onclick: () => this.startPreview(p) }, `👀 ${t('premium.preview_in_shop')}`));
    }
    if (owned) {
      if (p.grant.kind === 'skin') {
        const skin = p.grant.skin;
        const on = g.state.monetization.equipped.skin === skin;
        actions.append(el('button', { class: `btn ${on ? 'btn-ghost' : 'btn-primary'}`, onclick: () => { m.equipSkin(on ? null : skin); this.app.sfx('pop'); this.render(); } }, on ? t('premium.unequip') : t('premium.equip')));
      } else if (p.grant.kind === 'outfits') {
        const row = el('div', { class: 'product-picker', role: 'radiogroup', 'aria-label': t('premium.outfit') });
        for (const o of [null, ...p.grant.outfits]) {
          const on = g.state.monetization.equipped.outfit === o;
          row.append(el('button', { class: `chip ${on ? 'active' : ''}`, role: 'radio', 'aria-checked': String(on), onclick: () => { m.equipOutfit(o); this.app.sfx('pop'); this.render(); } }, t(`premium.outfit.${o ?? 'standard'}`)));
        }
        actions.append(row);
      } else if (p.grant.kind === 'automation') {
        const on = m.autoRestockActive();
        actions.append(el('button', { class: `btn ${on ? 'btn-ghost' : 'btn-primary'}`, onclick: () => { m.setAutoRestock(!on); this.app.sfx('pop'); this.render(); } }, on ? t('premium.turn_off') : t('premium.turn_on')));
      } else if (p.grant.kind === 'decor') {
        actions.append(el('button', { class: 'btn btn-primary', onclick: () => { this.close(); this.app.openPanel('shop'); } }, `🪴 ${t('premium.place_decor')}`));
      } else if (p.grant.kind === 'layout_slots') {
        actions.append(el('button', { class: 'btn btn-primary', onclick: () => { this.close(); this.app.openPanel('shop'); } }, `🗂️ ${t('premium.open_layouts')}`));
      }
    } else {
      if (p.gemPrice) {
        const enough = m.gems >= p.gemPrice;
        actions.append(
          el(
            'button',
            { class: `btn btn-buy ${enough ? 'affordable' : 'cant'}`, 'data-buy': `gems-${p.id}`, onclick: () => this.confirmGems(p) },
            el('span', { class: 'ub-label' }, t('premium.buy_with_gems')),
            el('span', { class: 'ub-price' }, `💎 ${p.gemPrice}`),
            enough ? null : el('span', { class: 'ub-need' }, t('hud.need_more', { amount: `💎 ${p.gemPrice - m.gems}` })),
          ),
        );
      }
      if (p.realMoney) {
        const price = s.priceOf(p.id);
        const busy = s.inFlight === p.id;
        actions.append(
          el(
            'button',
            { class: `btn btn-buy ${price && s.status === 'ready' ? 'affordable gold' : 'cant'}`, 'data-buy': `money-${p.id}`, disabled: !price || s.status !== 'ready' || !!s.inFlight, onclick: () => this.confirmMoney(p) },
            el('span', { class: 'ub-label' }, busy ? t('premium.processing') : s.testMode ? t('premium.buy_test') : t('premium.buy')),
            el('span', { class: 'ub-price' }, price?.displayPrice ?? t('premium.price_unavailable')),
          ),
        );
      }
    }
    out.append(actions);
    return out;
  }

  /** Small canvas preview drawn with the real game sprites (decor bundle & staff outfits). */
  private previewCanvas(p: PremiumProduct): HTMLCanvasElement | null {
    if (p.grant.kind !== 'decor' && p.grant.kind !== 'outfits') return null;
    const c = el('canvas', { class: 'ps-canvas', width: 480, height: 200, 'aria-label': t(`premium.${p.id}.name`) }) as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.scale(2, 2);
    if (p.grant.kind === 'decor') {
      p.grant.objects.forEach((kind, i) => {
        ctx.save();
        ctx.translate(60 + i * 60, 30);
        drawObject(ctx, { uid: i, kind, x: 0, y: 0, dir: 1, tier: 0, stock: 0, progress: 0 }, { stockRatio: 1, time: 1 + i });
        ctx.restore();
      });
    } else {
      const outfits = { smart: { body: '#1d3557', apron: '#ffd166' }, diner: { body: '#ff6b9a', apron: '#2ec4b6' } } as Record<string, { body: string; apron: string }>;
      p.grant.outfits.forEach((o, i) => {
        const st = outfits[o];
        drawPerson(ctx, 80 + i * 80, 85, { body: st.body, apron: st.apron, head: '#e0ac69', hair: '#4a3728', scale: 1.8, hat: i ? 'cap' : 'tie' }, { moving: false, phase: 0, facing: 1 });
      });
    }
    return c;
  }

  // -------------------------------------------------------------- previews

  private startPreview(p: PremiumProduct): void {
    const r = this.renderer;
    r.preview = p.grant.kind === 'skin' ? { skin: p.grant.skin } : p.grant.kind === 'outfits' ? { outfit: p.grant.outfits[0] } : null;
    this.close();
    clear(this.previewBar);
    this.previewBar.append(
      el('div', { class: 'pb-text' }, el('b', {}, `👀 ${t('premium.previewing', { name: t(`premium.${p.id}.name`) })}`), el('small', {}, t('premium.preview_hint'))),
      el('div', { class: 'row' }, el('button', { class: 'btn btn-small btn-primary', onclick: () => { this.endPreview(); this.show(); this.detail = p.id; this.render(); } }, t('premium.preview_details')), el('button', { class: 'btn btn-small btn-ghost', onclick: () => this.endPreview() }, `✕ ${t('premium.end_preview')}`)),
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

  private confirmGems(p: PremiumProduct): void {
    const m = this.app.game.monetization;
    if (!p.gemPrice) return;
    if (m.gems < p.gemPrice) {
      this.app.sfx('error');
      this.app.toast(t('premium.not_enough_gems', { n: p.gemPrice - m.gems }), '💎', 'bad');
      return;
    }
    this.app.confirm({
      icon: p.preview.icon,
      title: t('premium.confirm_title', { name: t(`premium.${p.id}.name`) }),
      text: t('premium.confirm_gems', { price: p.gemPrice, after: m.gems - p.gemPrice }),
      okLabel: t('premium.confirm_spend', { price: p.gemPrice }),
      onOk: guarded(`gems-${p.id}`, () => {
        const r = m.buyWithGems(p.id);
        if (r.ok) {
          this.app.sfx('upgrade');
          this.app.toast(t('premium.success', { name: t(`premium.${p.id}.name`) }), '🎉', 'gold');
          this.app.saveNow();
        } else {
          this.app.sfx('error');
          this.app.toast(t(`premium.err.${r.reason}`), '⚠', 'bad');
        }
        this.render();
      }),
    });
  }

  private confirmMoney(p: PremiumProduct): void {
    const s = this.store();
    const price = s.priceOf(p.id);
    if (!price) return;
    this.app.confirm({
      icon: p.preview.icon,
      title: t('premium.confirm_title', { name: t(`premium.${p.id}.name`) }),
      text: `${t('premium.confirm_money', { price: price.displayPrice })}${s.testMode ? `\n\n${t('premium.confirm_test')}` : ''}`,
      okLabel: s.testMode ? t('premium.confirm_test_ok', { price: price.displayPrice }) : t('premium.confirm_pay', { price: price.displayPrice }),
      onOk: guarded(`money-${p.id}`, async () => {
        this.render();
        const r = await s.purchase(p.id);
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

  /** Keeps live bits (balance, in-flight state) current without rebuilding every frame. */
  tick(): void {
    const b = this.body.querySelector('.ps-balance b') as HTMLElement | null;
    if (b) setText(b, `💎 ${formatNumber(this.app.game.monetization.gems)}`);
  }
}
