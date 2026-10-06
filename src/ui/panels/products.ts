import { Panel } from '../panel';
import type { AppApi } from '../api';
import { el, setText } from '../dom';
import { UpgradeButton, card, iconBox, sectionTitle, tag } from '../components';
import { PRODUCTS } from '../../config/products';
import type { ProductDef } from '../../config/products';
import { formatMoney } from '../../core/format';
import { t } from '../../core/i18n';

/** ProductCard list: prices, profit, demand and how to unlock. */
export class ProductsPanel extends Panel {
  constructor(private app: AppApi) {
    super('products', t('nav.products'), '🛍️');
  }

  protected structureKey(): string {
    const g = this.app.game;
    return [g.state.progression.unlockedProducts.join(), g.state.player.level, g.shop.departments.join(), g.inventory.productsOnDisplay().join(), g.mods.seasons().map((s) => s.id).join()].join('|');
  }

  protected build(add: (fn: () => void) => void): Node[] {
    const g = this.app.game;
    const out: Node[] = [el('p', { class: 'hint' }, t('prod.hint'))];
    const seasonal = PRODUCTS.filter((p) => p.season && g.progression.isProductAvailable(p.id));
    const normal = PRODUCTS.filter((p) => !p.season);
    const owned = normal.filter((p) => g.state.progression.unlockedProducts.includes(p.id));
    const rest = normal.filter((p) => !g.state.progression.unlockedProducts.includes(p.id)).sort((a, b) => a.requiredLevel - b.requiredLevel);
    if (seasonal.length) {
      out.push(sectionTitle(t('prod.seasonal'), '🎉'));
      for (const p of seasonal) out.push(this.productCard(p, add));
    }
    out.push(sectionTitle(t('prod.yours'), '✅'));
    for (const p of owned) out.push(this.productCard(p, add));
    out.push(sectionTitle(t('prod.more'), '🔒'));
    for (const p of rest) out.push(this.productCard(p, add));
    return out;
  }

  private productCard(p: ProductDef, add: (fn: () => void) => void): HTMLElement {
    const g = this.app.game;
    const unlocked = g.progression.isProductAvailable(p.id);
    const prices = el('div', { class: 'price-row' });
    add(() => {
      const price = g.economy.unitPrice(p.id);
      const cost = g.economy.unitCost(p.id);
      setText(prices, `${t('prod.cost')} ${formatMoney(cost)} · ${t('prod.sells')} ${formatMoney(price)} · ${t('prod.profit')} ${formatMoney(price - cost)}`);
    });
    const demand = el('span', { class: 'demand', title: t('prod.demand'), 'aria-label': `${t('prod.demand')} ${Math.round(p.demand * 100)}%` }, '●'.repeat(Math.max(1, Math.round(p.demand * 4))) + '○'.repeat(Math.max(0, 4 - Math.round(p.demand * 4))));
    const tags: Node[] = [tag(t(`cat.${p.category}`)), p.rarity !== 'common' ? tag(t(`rarity.${p.rarity}`), p.rarity) : null, tag(t(`display.${p.display}`))].filter(Boolean) as Node[];
    let right: Node;
    if (unlocked) {
      const n = g.inventory.displayersFor(p.id).length;
      right = n ? tag(`✓ ${t('prod.on_display', { n })}`, 'good') : el('div', { class: 'col' }, tag(`⚠ ${t('prod.not_displayed')}`, 'warn'), el('small', {}, t('prod.needs', { what: t(`display.${p.display}`) })));
    } else {
      const btn = new UpgradeButton({
        key: `prod-${p.id}`,
        tut: `unlock-${p.id}`,
        label: () => t('shop.unlock'),
        cost: () => p.unlockCost,
        free: p.unlockCost === 0,
        can: () => g.progression.canUnlockProduct(p.id),
        onBuy: () => {
          const ok = g.progression.unlockProduct(p.id);
          if (ok) this.app.spendFeedback(p.unlockCost);
          return ok;
        },
      });
      add(() => btn.update());
      const reqs: Node[] = [];
      if (g.state.player.level < p.requiredLevel) reqs.push(tag(`🔒 ${t('reason.level_n', { n: p.requiredLevel })}`, 'locked'));
      if (!g.shop.departments.includes(p.department)) reqs.push(tag(`🔒 ${t(`dept.${p.department}`)}`, 'locked'));
      right = el('div', { class: 'col' }, btn.el, ...reqs);
    }
    return card(unlocked ? '' : 'locked-card', iconBox(p.icon, `rar-${p.rarity}`), el('div', { class: 'card-main' }, el('b', {}, t(`product.${p.id}`), ' ', demand), el('small', {}, t(`product.${p.id}.desc`)), prices, el('div', { class: 'tags' }, ...tags)), right);
  }
}
