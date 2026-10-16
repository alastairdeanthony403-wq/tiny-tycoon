import type { Game } from '../sim/game';
import type { PlacedObject } from '../core/types';
import type { AppApi } from './api';
import { el, setText, clear, guarded, toggle } from './dom';
import { UpgradeButton, ProgressBar, artIcon, tag } from './components';
import { OBJECT_MAP, CHECKOUT_TIER_KEYS } from '../config/objects';
import { getProduct } from '../config/products';
import { formatMoney } from '../core/format';
import { t } from '../core/i18n';

/** "Capacity 10 → 15" style preview for an object's next tier. */
export function objectUpgradePreview(g: Game, o: PlacedObject): string {
  const def = OBJECT_MAP[o.kind];
  const cur = def.tiers[o.tier];
  const next = def.tiers[o.tier + 1];
  const capMult = def.display === 'machine' ? 1 : g.mods.capacityMult();
  if (o.kind === 'checkout') {
    const a = `${t('stat.speed')} ×${cur.speed}`;
    return next ? `${a} → ×${next.speed} · ${t('stat.queue')} ${cur.maxQueue} → ${next.maxQueue}` : a;
  }
  if (def.display === 'machine') {
    const a = `${t('stat.speed')} ×${cur.speed} · ${t('stat.capacity')} ${cur.capacity}`;
    return next ? `${t('stat.speed')} ×${cur.speed} → ×${next.speed} · ${t('stat.capacity')} ${cur.capacity} → ${next.capacity}` : a;
  }
  if (cur.capacity) {
    const c1 = Math.round(cur.capacity * capMult);
    if (!next) return `${t('stat.capacity')} ${c1}`;
    const c2 = Math.round((next.capacity ?? 0) * capMult);
    return `${t('stat.capacity')} ${c1} → ${c2}${next.premiumBonus ? ` · +${Math.round(next.premiumBonus * 100)}% ${t('stat.premium')}` : ''}`;
  }
  return '';
}

/** Bottom card shown when a world object is tapped. */
export class Inspector {
  el: HTMLElement;
  uid = 0;
  private body: HTMLElement;
  private updaters: (() => void)[] = [];
  private key = '';

  constructor(private app: AppApi) {
    this.body = el('div', { class: 'insp-body' });
    this.el = el('div', { class: 'inspector hidden', role: 'dialog', 'aria-label': t('insp.title') }, el('button', { class: 'insp-close', 'aria-label': t('ui.close'), onclick: () => this.close() }, '✕'), this.body);
  }

  get open(): boolean {
    return this.uid !== 0;
  }

  show(uid: number): void {
    this.uid = uid;
    this.key = '';
    toggle(this.el, 'hidden', false);
    this.refresh();
  }

  close(): void {
    this.uid = 0;
    toggle(this.el, 'hidden', true);
  }

  refresh(): void {
    if (!this.uid) return;
    const g = this.app.game;
    const o = g.shopMgr.getObject(this.uid);
    if (!o) return this.close();
    const key = `${o.uid}:${o.tier}:${o.productId}:${g.shop.objects.length}:${g.state.player.level}`;
    if (key !== this.key) {
      this.key = key;
      this.updaters = [];
      clear(this.body);
      this.body.append(...this.build(o, (f) => this.updaters.push(f)));
    }
    for (const u of this.updaters) u();
  }

  private build(o: PlacedObject, add: (f: () => void) => void): Node[] {
    const g = this.app.game;
    const def = OBJECT_MAP[o.kind];
    const p = getProduct(o.productId);
    const out: Node[] = [];
    const tierName = o.kind === 'checkout' ? t(`checkout.${CHECKOUT_TIER_KEYS[o.tier]}`) : `${t('ui.lv')} ${o.tier + 1}`;
    out.push(el('div', { class: 'insp-head' }, artIcon(p ? `product.${p.id}` : `furniture.${o.kind}`, p?.icon ?? def.icon), el('div', {}, el('b', {}, t(`object.${o.kind}`)), ' ', tag(tierName, 'lv'), p ? el('div', { class: 'insp-sub' }, `${p.icon} ${t(`product.${p.id}`)} · ${formatMoney(g.economy.unitPrice(p.id))}`) : null)));

    if (def.category === 'display') {
      const bar = new ProgressBar('stock');
      const status = el('span', { class: 'stock-status' });
      add(() => {
        const cap = g.shopMgr.capacity(o);
        bar.set(o.stock / cap, `${o.stock}/${cap}`);
        const st = g.inventory.status(o);
        setText(status, st === 'out' ? `⚠ ${t('world.out_of_stock')}` : st === 'low' ? `▼ ${t('world.low_stock')}` : `✓ ${t('insp.stocked')}`);
        status.className = `stock-status st-${st}`;
        toggle(bar.el, 'low', st !== 'ok');
      });
      out.push(el('div', { class: 'insp-row' }, el('span', {}, t('insp.stock')), bar.el, status));
      if (def.display === 'machine') {
        const prod = el('small', { class: 'hint' });
        add(() => {
          const sp = g.inventory.machineSpeed(o);
          const chef = g.world.employees.some((e) => e.type === 'chef' && e.task.kind === 'at_station' && e.task.uid === o.uid);
          setText(prod, g.mods.machinesOff() ? `🔌 ${t('insp.power_cut')}` : `${chef ? '👩‍🍳 ' + t('insp.chef_on') : t('insp.no_chef')} · ×${sp.toFixed(2)}`);
        });
        out.push(prod);
      }
      const rb = el('button', { class: 'btn btn-action', 'data-tut': 'inspector-restock' });
      rb.addEventListener(
        'click',
        guarded(`restock-${o.uid}`, () => {
          if (g.inventory.manualRestock(o.uid)) this.app.sfx('restock');
          else this.app.sfx('error');
        }),
      );
      add(() => {
        const cd = g.inventory.cooldownLeft(o);
        const can = g.inventory.canManualRestock(o);
        rb.disabled = !can;
        setText(rb, def.display === 'machine' ? `⚡ ${t('insp.boost')}` : cd > 0 ? `📦 ${t('insp.restock')} (${Math.ceil(cd)}s)` : `📦 ${t('insp.restock')}`);
      });
      out.push(rb);
      // Product switching
      const options = g.shopMgr.compatibleProducts(o.kind);
      if (options.length > 1) {
        const sel = el('div', { class: 'product-picker', role: 'radiogroup', 'aria-label': t('insp.product') });
        for (const pid of options) {
          const pp = getProduct(pid)!;
          sel.append(
            el(
              'button',
              {
                class: `chip ${pid === o.productId ? 'active' : ''}`,
                role: 'radio',
                'aria-checked': String(pid === o.productId),
                title: t(`product.${pid}`),
                onclick: () => {
                  if (g.shopMgr.setProduct(o.uid, pid)) this.app.sfx('pop');
                  this.key = '';
                  this.refresh();
                },
              },
              `${pp.icon} ${t(`product.${pid}`)}`,
            ),
          );
        }
        out.push(el('div', { class: 'insp-row col' }, el('span', {}, t('insp.product')), sel));
      }
    }

    if (o.kind === 'checkout') {
      const info = el('div', { class: 'hint' });
      add(() => {
        const rt = g.world.checkouts.get(o.uid);
        const owner = o.uid === g.shopMgr.ownerCheckoutUid();
        const cashier = rt?.cashierId ? g.shop.staff.find((s) => s.id === rt.cashierId) : undefined;
        const who = cashier ? `🧑‍💼 ${cashier.name}` : owner ? `🙋 ${t('insp.you')}` : `⛔ ${t('insp.closed_hire')}`;
        setText(info, `${who} · ${t('stat.queue')} ${rt?.queue.length ?? 0}/${g.checkout.maxQueue(o.uid)} · ${t('stat.speed')} ×${g.checkout.speed(o.uid).toFixed(2)}`);
      });
      out.push(info, el('small', { class: 'hint' }, `👆 ${t('insp.tap_boost')}`));
    }
    if (def.appeal) out.push(el('div', { class: 'hint' }, `✨ ${t('stat.appeal_n', { n: def.appeal })}`));

    // Upgrade
    if (def.tiers.length > 1) {
      const prev = el('div', { class: 'stat-preview big' });
      const btn = new UpgradeButton({
        key: `insp-up-${o.uid}`,
        tut: 'inspector-upgrade',
        label: () => (g.shopMgr.upgradeCost(o) === null ? t('ui.maxed') : t('ui.upgrade')),
        cost: () => g.shopMgr.upgradeCost(o),
        can: () => {
          const c = g.shopMgr.upgradeCost(o);
          return c === null ? { ok: false, reason: 'max' } : g.economy.canAfford(c) ? { ok: true } : { ok: false, reason: 'money' };
        },
        onBuy: () => {
          const c = g.shopMgr.upgradeCost(o) ?? 0;
          const ok = g.shopMgr.upgrade(o.uid);
          if (ok) this.app.spendFeedback(c);
          return ok;
        },
      });
      add(() => {
        btn.update();
        setText(prev, objectUpgradePreview(g, o));
        toggle(this.el, 'can-upgrade', g.shopMgr.upgradeCost(o) !== null && g.economy.canAfford(g.shopMgr.upgradeCost(o)!));
      });
      out.push(el('div', { class: 'insp-upgrade' }, prev, btn.el));
    }

    // Move / rotate / sell
    const sellVal = g.shopMgr.sellValue(o);
    out.push(
      el(
        'div',
        { class: 'insp-actions' },
        el('button', { class: 'btn btn-ghost btn-small', onclick: () => this.app.startPlacement({ kind: o.kind, mode: 'move', uid: o.uid }) }, `✥ ${t('insp.move')}`),
        def.needsAccess ? el('button', { class: 'btn btn-ghost btn-small', onclick: () => (g.shopMgr.rotate(o.uid) ? this.app.sfx('pop') : this.app.sfx('error')) }, `⟳ ${t('insp.rotate')}`) : null,
        el(
          'button',
          {
            class: 'btn btn-ghost btn-small',
            disabled: !g.shopMgr.canSell(o.uid),
            title: g.shopMgr.canSell(o.uid) ? '' : t('insp.cant_sell'),
            onclick: () =>
              this.app.confirm({
                icon: def.icon,
                title: t('insp.sell_title', { name: t(`object.${o.kind}`) }),
                text: t('insp.sell_text', { amount: formatMoney(sellVal) }),
                okLabel: t('insp.sell'),
                danger: true,
                onOk: () => {
                  if (g.shopMgr.sell(o.uid)) this.close();
                },
              }),
          },
          `💰 ${t('insp.sell')} ${formatMoney(sellVal)}`,
        ),
      ),
    );
    return out;
  }
}
