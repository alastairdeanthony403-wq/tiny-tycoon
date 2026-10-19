import { LOCATION_MAP_ID, mapFor } from '../../world/maps';
import { Panel } from '../panel';
import type { AppApi } from '../api';
import { el, setText } from '../dom';
import { UpgradeButton, card, iconBox, artIcon, sectionTitle, tag } from '../components';
import { LOCATIONS } from '../../config/locations';
import { PERKS } from '../../config/prestige';
import { ECONOMY } from '../../config/economy';
import { formatMoney } from '../../core/format';
import { t } from '../../core/i18n';

/** Locations (world maps, shop plots, discoveries), franchising (prestige) and Head Office perks. */
export class MapPanel extends Panel {
  constructor(private app: AppApi) {
    super('map', t('nav.map'), '🗺️');
  }

  protected structureKey(): string {
    const g = this.app.game;
    return [g.state.progression.unlockedLocations.join(), g.state.player.currentLocation, g.shop.plotId, !!g.shop.construction, g.state.exploration.found.length, g.state.player.level, g.progression.repTier(), g.state.player.prestigeCount, JSON.stringify(g.state.perks)].join('|');
  }

  protected build(add: (fn: () => void) => void): Node[] {
    const g = this.app.game;
    const passive = el('b');
    add(() => setText(passive, `${formatMoney(g.locations.passiveIncome() * 60)}${t('ui.per_min')}`));
    const out: Node[] = [sectionTitle(t('map.locations'), '📍'), card('stats-card', el('div', { class: 'stat-row' }, el('span', {}, t('map.passive')), passive)), el('p', { class: 'hint' }, t('map.hint'))];
    for (const l of LOCATIONS) {
      const owned = g.locations.owned(l.id);
      const current = g.state.player.currentLocation === l.id;
      const map = mapFor(l.id);
      const traits = el('div', { class: 'tags' }, tag(`👣 ×${l.trafficMult}`), tag(`💷 ×${l.spendMult}`), l.special ? tag(t(`loc.special.${l.special}`), 'special') : null);
      // what the district looks like: landmark highlights, plots and map size
      const around = el('div', { class: 'tags map-highlights', 'aria-label': t('map.highlights') }, ...map.highlights.slice(0, 4).map((h) => tag(t(`map.highlight.${h}`))), tag(`📐 ${map.size.w}×${map.size.h}`), tag(`🏪 ${map.plots.length} ${t('map.plots').toLowerCase()}`));
      let right: Node;
      if (current) right = tag(`📍 ${t('map.here')}`, 'good');
      else if (owned)
        right = el(
          'button',
          {
            class: 'btn btn-buy affordable',
            onclick: () => {
              g.locations.switchTo(l.id);
              this.app.sfx('swoosh');
              this.app.openPanel(null);
            },
          },
          t('map.visit'),
        );
      else {
        const btn = new UpgradeButton({
          key: `loc-${l.id}`,
          label: () => t('map.open_shop'),
          cost: () => l.unlockCost,
          can: () => g.locations.canUnlock(l.id),
          onBuy: () => {
            const ok = g.locations.unlock(l.id);
            if (ok) {
              this.app.spendFeedback(l.unlockCost);
              this.refresh(true);
            }
            return ok;
          },
        });
        add(() => btn.update());
        const reqs: Node[] = [];
        if (g.state.player.level < l.requiredLevel) reqs.push(tag(`🔒 ${t('reason.level_n', { n: l.requiredLevel })}`, 'locked'));
        if (g.progression.repTier() < l.requiredRepTier) reqs.push(tag(`🔒 ${'★'.repeat(l.requiredRepTier)} ${t(`rep.${l.requiredRepTier}`)}`, 'locked'));
        right = el('div', { class: 'col' }, btn.el, ...reqs);
      }
      out.push(card(`loc-card ${current ? 'current' : ''}`, artIcon(`location.${LOCATION_MAP_ID[l.id] ?? 'town'}`, l.icon), el('div', { class: 'card-main' }, el('b', {}, t(`location.${l.id}`)), el('small', {}, t(`location.${l.id}.desc`)), traits, around), right));
    }

    // ---- Shop plots of the current location (relocation is explicit and keeps everything)
    const locId = g.state.player.currentLocation;
    out.push(sectionTitle(t('map.plots'), '🏪'));
    for (const p of g.locations.plots(locId)) {
      const name = t(`plot.${p.def.id}`);
      let right: Node;
      if (p.current) right = tag(`📍 ${t('map.plot_here')}`, 'good');
      else if (p.reason === 'level') right = tag(`🔒 ${t('map.plot_level', { n: p.def.requiredLevel ?? 1 })}`, 'locked');
      else if (p.reason === 'building') right = tag(t('map.plot_building'), 'locked');
      else
        right = el(
          'button',
          {
            class: 'btn btn-buy affordable',
            'data-plot': p.def.id,
            onclick: () =>
              this.app.confirm({
                icon: '🏪',
                title: t('map.plot_title', { plot: name }),
                text: t('map.plot_confirm', { map: t(`location.${locId}`) }),
                okLabel: t('map.plot_move'),
                onOk: () => {
                  if (!g.locations.choosePlot(locId, p.def.id)) return;
                  this.app.sfx('swoosh');
                  this.app.toast(t('map.plot_moved', { plot: name }), '🏪', 'good');
                  this.app.openPanel(null);
                },
              }),
          },
          t('map.plot_move'),
        );
      out.push(card(`plot-card ${p.current ? 'current' : ''}`, iconBox(p.current ? '📍' : '🏷️'), el('div', { class: 'card-main' }, el('b', {}, name), el('small', {}, t(`location.${locId}`))), right));
    }

    // ---- Discoveries (artefacts hidden around this location's map)
    const prog = g.exploration.progress();
    out.push(sectionTitle(t('map.discoveries'), '🔎'));
    out.push(el('p', { class: 'hint' }, `${t('map.discoveries_hint')} ${t('map.discovered', { found: prog.found, total: prog.total })}`));
    for (const a of g.exploration.here()) {
      const found = g.exploration.isFound(a.id);
      out.push(card(`artefact-card ${found ? 'found' : ''}`, found ? artIcon(a.asset, '🔎') : iconBox('❔'), el('div', { class: 'card-main' }, el('b', {}, found ? t(`artefact.${a.id}.name`) : '???'), el('small', {}, found ? t(`artefact.${a.id}.desc`) : t('map.undiscovered'))), found ? tag('✓', 'good') : null));
    }

    // ---- Franchise / prestige
    out.push(sectionTitle(t('map.franchise'), '🏢'));
    const can = g.prestige.canFranchise();
    const preview = el('b');
    add(() => setText(preview, `🌟 ${g.prestige.starsForFranchise()}`));
    const rev = el('small');
    add(() => setText(rev, t('map.franchise_progress', { have: formatMoney(g.state.player.runRevenue), need: formatMoney(ECONOMY.prestige.minRunRevenue), lvl: ECONOMY.prestige.minLevel })));
    const fbtn = el(
      'button',
      {
        class: `btn btn-buy ${can.ok ? 'affordable gold' : 'cant'}`,
        onclick: () => {
          if (!g.prestige.canFranchise().ok) {
            this.app.sfx('error');
            return;
          }
          this.app.confirm({
            icon: '🏢',
            title: t('map.franchise_confirm_title'),
            text: t('map.franchise_confirm', { stars: g.prestige.starsForFranchise(), bonus: Math.round(ECONOMY.prestige.revenueBonusPerFranchise * 100) }),
            okLabel: t('map.franchise_btn'),
            onOk: () => {
              g.prestige.franchise();
              this.app.openPanel(null);
            },
          });
        },
      },
      t('map.franchise_btn'),
    );
    out.push(
      card(
        `franchise-card ${can.ok ? 'highlight' : ''}`,
        iconBox('🏢'),
        el('div', { class: 'card-main' }, el('b', {}, t('map.franchise_title')), el('small', {}, t('map.franchise_desc', { bonus: Math.round(ECONOMY.prestige.revenueBonusPerFranchise * 100) })), rev, el('div', {}, `${t('map.franchise_reward')} `, preview), g.state.player.prestigeCount ? tag(`🏢 ×${g.state.player.prestigeCount} · +${Math.round(g.mods.franchiseBonus() * 100)}%`, 'good') : null),
        fbtn,
      ),
    );

    // ---- Head office perks (stars)
    out.push(sectionTitle(t('map.perks'), '🌟'));
    out.push(el('p', { class: 'hint' }, t('map.perks_hint')));
    for (const p of PERKS) {
      const lvl = el('small', { class: 'count' });
      const btn = new UpgradeButton({
        key: `perk-${p.id}`,
        currency: 'stars',
        label: () => t('ui.upgrade'),
        cost: () => g.prestige.perkCost(p.id),
        can: () => {
          const c = g.prestige.perkCost(p.id);
          return c === null ? { ok: false, reason: 'max' } : g.state.player.stars >= c ? { ok: true } : { ok: false, reason: 'stars' };
        },
        onBuy: () => {
          const ok = g.prestige.buyPerk(p.id);
          if (ok) this.app.sfx('upgrade');
          return ok;
        },
      });
      add(() => {
        btn.update();
        setText(lvl, `${t('ui.lv')} ${g.prestige.perkLevel(p.id)}/${p.maxLevel}`);
      });
      out.push(card('', iconBox(p.icon), el('div', { class: 'card-main' }, el('b', {}, t(`perk.${p.id}`), ' ', lvl), el('small', {}, t(`perk.${p.id}.desc`, { n: p.id === 'start_cash' ? formatMoney(p.perLevel) : Math.round(p.perLevel * 100) }))), btn.el));
    }
    out.push(el('button', { class: 'btn btn-wide', onclick: () => this.app.showAchievements() }, `🏆 ${t('menu.achievements')}`));
    return out;
  }
}
