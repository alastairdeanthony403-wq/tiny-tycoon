import type { AppApi } from './api';
import { el, setText, toggle } from './dom';
import { CurrencyDisplay, ProgressBar, TimerDisplay } from './components';
import { formatMoney, formatNumber } from '../core/format';
import { t } from '../core/i18n';
import { EVENT_MAP } from '../config/events';
import { QuestManager } from '../sim/quests';
import { getProduct } from '../config/products';

/** Top HUD: money, stars, level/XP, reputation, quests and the event banner. */
export class Hud {
  el: HTMLElement;
  money: CurrencyDisplay;
  stars: CurrencyDisplay;
  private lvl: HTMLElement;
  private xp = new ProgressBar('xp');
  private rep: HTMLElement;
  private shopLvl: HTMLElement;
  private quests: HTMLElement;
  private questKey = '';
  private questUpdaters: (() => void)[] = [];
  private eventBox: HTMLElement;
  private eventKey = '';
  private eventTimer: TimerDisplay | null = null;
  questsCollapsed = false;

  constructor(private app: AppApi, onMenu: () => void, onDebug: (() => void) | null) {
    this.money = new CurrencyDisplay('💷', t('hud.money'));
    this.stars = new CurrencyDisplay('🌟', t('hud.stars'), (n) => formatNumber(Math.round(n)));
    this.lvl = el('span', { class: 'lvl-num' });
    this.rep = el('span', { class: 'rep' });
    this.shopLvl = el('span', { class: 'shop-lvl' });
    const levelBox = el('div', { class: 'level-box', 'aria-label': t('hud.level') }, el('span', { class: 'lvl-badge' }, '⭐', this.lvl), this.xp.el);
    this.quests = el('div', { class: 'quests' });
    this.eventBox = el('div', { class: 'event-box' });
    this.el = el(
      'div',
      { class: 'hud' },
      el(
        'div',
        { class: 'hud-top' },
        this.money.el,
        this.stars.el,
        levelBox,
        el('div', { class: 'hud-right' }, this.shopLvl, this.rep, onDebug ? el('button', { class: 'icon-btn', 'aria-label': 'Debug', onclick: onDebug }, '🐞') : null, el('button', { class: 'icon-btn', 'aria-label': t('menu.pause'), onclick: onMenu }, '⏸')),
      ),
      el('div', { class: 'hud-left' }, this.quests, this.eventBox),
    );
  }

  update(dt: number): void {
    const g = this.app.game;
    const p = g.state.player;
    this.money.set(p.money, `${formatMoney(g.economy.incomeRate() * 60)}${t('ui.per_min')}`);
    this.money.tick(dt);
    this.stars.set(p.stars);
    this.stars.tick(dt);
    setText(this.lvl, String(p.level));
    this.xp.set(p.xp / g.progression.xpToNext(), `${formatNumber(Math.floor(p.xp))}/${formatNumber(g.progression.xpToNext())} XP`);
    const tier = g.progression.repTier();
    const rp = g.progression.repProgress();
    setText(this.rep, `${'★'.repeat(tier)}${'☆'.repeat(5 - tier)} ${t(`rep.${tier}`)}`);
    this.rep.title = `${t('stat.reputation')}: ${rp.into}/${rp.need}`;
    setText(this.shopLvl, `🏪 ${g.shop.size}×${g.shop.size}`);
    this.updateQuests();
    this.updateEvents();
  }

  private questText(id: string, target: number, side?: string): string {
    if (side) {
      if (side.startsWith('sold:')) return t('quest.side_sell_cat', { n: target, cat: t(`cat.${side.slice(5)}`) });
      return t(`quest.${QuestManager.templateOf(id)}`, { n: target });
    }
    return t(`quest.${id}`, { n: formatNumber(target) });
  }

  private updateQuests(): void {
    const g = this.app.game;
    const views = g.quests.views();
    const key = views.map((v) => `${v.id}:${v.progress.completed}`).join('|') + this.questsCollapsed;
    if (key !== this.questKey) {
      this.questKey = key;
      this.questUpdaters = [];
      this.quests.replaceChildren();
      const head = el('button', { class: 'quest-head', 'aria-expanded': String(!this.questsCollapsed), onclick: () => { this.questsCollapsed = !this.questsCollapsed; this.questKey = ''; } }, `📋 ${t('hud.goals')} ${this.questsCollapsed ? '▸' : '▾'}`);
      this.quests.append(head);
      const list = this.questsCollapsed ? views.filter((v) => v.progress.completed).slice(0, 1) : views;
      for (const v of list) {
        const bar = new ProgressBar('quest');
        const r = v.reward;
        const rewardText = [r.money ? formatMoney(r.money) : '', r.stars ? `${r.stars}🌟` : '', r.unlockProduct ? `${getProduct(r.unlockProduct)?.icon ?? '🎁'} ${t('quest.new_product')}` : '', r.xp ? `${r.xp} XP` : ''].filter(Boolean).join(' · ');
        const claim = v.progress.completed
          ? el('button', { class: 'btn btn-claim', onclick: () => { if (g.quests.claim(v.id)) { this.app.sfx('achievement'); this.questKey = ''; } } }, `🎁 ${t('ui.claim')}`)
          : null;
        const node = el('div', { class: `quest ${v.main ? 'main' : 'side'} ${v.progress.completed ? 'done' : ''}`, 'data-quest': v.id }, el('div', { class: 'quest-title' }, v.main ? '⭐ ' : '• ', this.questText(v.id, v.target, v.progress.side?.stat)), bar.el, el('div', { class: 'quest-reward' }, `${t('quest.reward')}: ${rewardText}`), claim);
        this.questUpdaters.push(() => {
          const cur = g.quests.view(v.progress);
          bar.set(cur.value / cur.target, `${formatNumber(Math.min(cur.value, cur.target))}/${formatNumber(cur.target)}`);
        });
        this.quests.append(node);
      }
    }
    for (const u of this.questUpdaters) u();
  }

  private updateEvents(): void {
    const g = this.app.game;
    const ev = g.state.events;
    const active = ev.active[0];
    const key = `${active?.id ?? ''}|${ev.offer?.id ?? ''}|${ev.crate ? 1 : 0}`;
    if (key !== this.eventKey) {
      this.eventKey = key;
      this.eventBox.replaceChildren();
      this.eventTimer = null;
      if (active) {
        const def = EVENT_MAP[active.id];
        this.eventTimer = new TimerDisplay(def.icon, t(`event.${active.id}`), t(`event.${active.id}.desc`));
        this.eventBox.append(el('div', { class: `event-banner ev-${active.id}` }, this.eventTimer.el, active.id === 'rush_hour' ? el('div', { class: 'rush-score' }) : null));
      } else if (ev.offer) {
        const def = EVENT_MAP[ev.offer.id];
        this.eventBox.append(
          el(
            'div',
            { class: 'event-banner offer' },
            el('div', { class: 'timer-head' }, el('span', { class: 'timer-icon' }, def.icon), el('b', {}, t(`event.${ev.offer.id}`))),
            el('div', { class: 'timer-desc' }, t(`event.${ev.offer.id}.offer`)),
            el('div', { class: 'row' }, el('button', { class: 'btn btn-primary btn-small', onclick: () => { g.events.acceptOffer(); } }, `▶ ${t('event.start')}`), el('button', { class: 'btn btn-ghost btn-small', onclick: () => g.events.declineOffer() }, t('event.skip'))),
          ),
        );
      }
      if (ev.crate) this.eventBox.append(el('div', { class: 'event-banner crate', onclick: () => g.events.collectCrate() }, `📦 ${t('event.crate_hint')}`));
    }
    if (active && this.eventTimer) {
      this.eventTimer.set(active.remaining, active.duration);
      const rs = this.eventBox.querySelector('.rush-score') as HTMLElement | null;
      if (rs) setText(rs, `✅ ${active.served}  ❌ ${active.lost}`);
    }
    toggle(this.eventBox, 'hidden', !this.eventBox.childElementCount);
  }
}
