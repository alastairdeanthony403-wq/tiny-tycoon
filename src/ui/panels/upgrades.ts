import { Panel } from '../panel';
import type { AppApi } from '../api';
import { el, setText } from '../dom';
import { UpgradeButton, card, iconBox, artIcon, sectionTitle, tag } from '../components';
import { UPGRADES } from '../../config/upgrades';
import { OBJECT_MAP } from '../../config/objects';
import { getProduct } from '../../config/products';
import { t } from '../../core/i18n';
import { objectUpgradePreview } from '../inspector';

export class UpgradesPanel extends Panel {
  constructor(private app: AppApi) {
    super('upgrades', t('nav.upgrades'), '⬆️');
  }

  protected structureKey(): string {
    const g = this.app.game;
    return [g.shop.locationId, g.state.player.level, g.shop.objects.map((o) => `${o.uid}:${o.kind}`).join(), g.shop.objects.length].join('|');
  }

  protected build(add: (fn: () => void) => void): Node[] {
    const g = this.app.game;
    const out: Node[] = [sectionTitle(t('upg.company'), '🏢'), el('p', { class: 'hint' }, t('upg.company_hint'))];
    for (const u of UPGRADES) {
      const lvl = el('small', { class: 'count' });
      const prev = el('div', { class: 'stat-preview' });
      const btn = new UpgradeButton({
        key: `upg-${u.id}`,
        tut: `upgrade-${u.id}`,
        label: () => t('ui.upgrade'),
        cost: () => g.upgrades.cost(u.id),
        can: () => g.upgrades.canBuy(u.id),
        onBuy: () => {
          const c = g.upgrades.cost(u.id) ?? 0;
          const ok = g.upgrades.buy(u.id);
          if (ok) this.app.spendFeedback(c);
          return ok;
        },
      });
      add(() => {
        btn.update();
        setText(lvl, `${t('ui.lv')} ${g.upgrades.level(u.id)}/${u.maxLevel}`);
        const p = g.upgrades.preview(u.id);
        const maxed = g.upgrades.level(u.id) >= u.maxLevel;
        setText(prev, maxed ? `${t(`upg.${u.id}.stat`)} +${p.current}${p.unit}` : `${t(`upg.${u.id}.stat`)} ${u.id === 'night_shift' ? '' : '+'}${p.current}${p.unit} → ${u.id === 'night_shift' ? '' : '+'}${p.next}${p.unit}`);
      });
      const locked = g.state.player.level < u.requiredLevel;
      out.push(card(locked ? 'locked-card' : '', iconBox(u.icon), el('div', { class: 'card-main' }, el('b', {}, t(`upg.${u.id}`), ' ', lvl), el('small', {}, t(`upg.${u.id}.desc`)), prev, el('div', { class: 'tags' }, tag(t(`upgcat.${u.category}`)), locked ? tag(`🔒 ${t('reason.level_n', { n: u.requiredLevel })}`, 'locked') : null)), btn.el));
    }
    out.push(sectionTitle(t('upg.objects'), '🗄️'));
    const objs = g.shop.objects.filter((o) => OBJECT_MAP[o.kind]?.tiers.length > 1);
    if (!objs.length) out.push(el('p', { class: 'hint' }, t('upg.no_objects')));
    for (const o of objs) {
      const def = OBJECT_MAP[o.kind];
      const prev = el('div', { class: 'stat-preview' });
      const lv = el('small', { class: 'count' });
      const btn = new UpgradeButton({
        key: `obj-${o.uid}`,
        label: () => t('ui.upgrade'),
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
        setText(lv, `${t('ui.lv')} ${o.tier + 1}/${def.tiers.length}`);
        setText(prev, objectUpgradePreview(g, o));
      });
      const p = getProduct(o.productId);
      out.push(card('', artIcon(p ? `product.${p.id}` : `furniture.${o.kind}`, p?.icon ?? def.icon), el('div', { class: 'card-main' }, el('b', {}, t(`object.${o.kind}`), ' ', lv), p ? el('small', {}, t(`product.${p.id}`)) : null, prev), btn.el));
    }
    return out;
  }
}
