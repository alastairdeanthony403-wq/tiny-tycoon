import type { AppApi } from './api';
import { el, setText, toggle, guarded } from './dom';
import { unlockLine } from './unlocks';
import type { Game } from '../sim/game';
import { CurrencyDisplay, ProgressBar, TimerDisplay } from './components';
import { formatMoney, formatNumber } from '../core/format';
import { t } from '../core/i18n';
import { EVENT_MAP } from '../config/events';
import { QuestManager } from '../sim/quests';
import { getProduct } from '../config/products';
import { ADS } from '../config/ads';
import { formatDuration } from '../core/format';

/** Top HUD: money, stars, level/XP, reputation, quests and the event banner. */
export class Hud {
  el: HTMLElement;
  money: CurrencyDisplay;
  stars: CurrencyDisplay;
  gems: CurrencyDisplay;
  private lvl: HTMLElement;
  private xp = new ProgressBar('xp');
  private rep: HTMLElement;
  private shopLvl: HTMLElement;
  private quests: HTMLElement;
  private questKey = '';
  private questUpdaters: (() => void)[] = [];
  private eventBox: HTMLElement;
  private boostEl: HTMLElement;
  private eventKey = '';
  private eventTimer: TimerDisplay | null = null;
  questsCollapsed = loadCollapsed();

  constructor(private app: AppApi, onMenu: () => void, onDebug: (() => void) | null) {
    this.money = new CurrencyDisplay('💷', t('hud.money'));
    this.money.el.title = t('hud.money_tip');
    this.stars = new CurrencyDisplay('🌟', t('hud.stars'), (n) => formatNumber(Math.round(n)));
    this.gems = new CurrencyDisplay('💎', t('hud.gems'), (n) => formatNumber(Math.round(n)));
    this.gems.el.classList.add('gem-pill');
    this.gems.el.setAttribute('role', 'button');
    this.gems.el.tabIndex = 0;
    this.gems.el.title = t('hud.gems_tip');
    this.gems.el.addEventListener('click', () => this.app.openPremium());
    this.gems.el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && this.app.openPremium());
    this.lvl = el('span', { class: 'lvl-num' });
    this.rep = el('span', { class: 'rep' });
    this.shopLvl = el('span', { class: 'shop-lvl' });
    const levelBox = el('div', { class: 'level-box', 'aria-label': t('hud.level') }, el('span', { class: 'lvl-badge' }, '⭐', this.lvl), this.xp.el);
    this.quests = el('div', { class: 'quests' });
    this.eventBox = el('div', { class: 'event-box' });
    this.boostEl = el('div', { class: 'boost-chip hidden', role: 'status' });
    this.el = el(
      'div',
      { class: 'hud' },
      el(
        'div',
        { class: 'hud-top' },
        this.money.el,
        this.stars.el,
        this.gems.el,
        levelBox,
        el('div', { class: 'hud-right' }, this.shopLvl, this.rep, onDebug ? el('button', { class: 'icon-btn', 'aria-label': 'Debug', onclick: onDebug }, '🐞') : null, el('button', { class: 'icon-btn', 'data-tut': 'pause', 'aria-label': t('menu.pause'), onclick: onMenu }, '⏸')),
      ),
      el('div', { class: 'hud-left' }, this.quests, this.boostEl, this.eventBox),
    );
  }

  update(dt: number): void {
    const g = this.app.game;
    const p = g.state.player;
    const net = g.economy.netIncomeRate() * 60;
    this.money.set(p.money, `${net >= 0 ? '+' : '−'}${formatMoney(Math.abs(net))}${t('ui.per_min')}`);
    this.money.tick(dt);
    this.stars.set(p.stars);
    this.stars.tick(dt);
    this.gems.set(g.monetization.gems);
    this.gems.tick(dt);
    setText(this.lvl, String(p.level));
    this.xp.set(p.xp / g.progression.xpToNext(), `${formatNumber(Math.floor(p.xp))}/${formatNumber(g.progression.xpToNext())} XP`);
    const tier = g.progression.repTier();
    const rp = g.progression.repProgress();
    setText(this.rep, `${'★'.repeat(tier)}${'☆'.repeat(5 - tier)} ${t(`rep.${tier}`)}`);
    this.rep.title = `${t('stat.reputation')}: ${rp.into}/${rp.need}`;
    setText(this.shopLvl, `🏪 ${g.shop.size}×${g.shop.size}`);
    this.updateQuests();
    this.updateEvents();
    const boost = g.state.ads.boostRemaining;
    toggle(this.boostEl, 'hidden', boost <= 0);
    if (boost > 0) setText(this.boostEl, `🚀 ${t('ads.boost_chip', { pct: Math.round((ADS.boostPriceMult - 1) * 100), time: formatDuration(Math.ceil(boost)) })}`);
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
    const main = views.find((v) => v.main) ?? views[0];
    const others = views.filter((v) => v !== main);
    const level = g.state.player.level;
    const missionsReady = g.missions.available ? g.missions.unclaimedCount() : 0;
    const tutDone = g.state.progression.tutorialDone;
    const key = views.map((v) => `${v.id}:${v.progress.completed}`).join('|') + `|${this.questsCollapsed}|${level}|${missionsReady}|${tutDone}|${g.missions.available}`;
    if (key !== this.questKey) {
      this.questKey = key;
      this.questUpdaters = [];
      this.quests.replaceChildren();
      const readyCount = views.filter((v) => v.progress.completed).length;
      const summary = this.questsCollapsed && others.length ? ` · +${others.length}` : '';
      const head = el(
        'button',
        {
          class: 'quest-head',
          'aria-expanded': String(!this.questsCollapsed),
          'aria-controls': 'quest-list',
          onclick: () => {
            this.questsCollapsed = !this.questsCollapsed;
            storeCollapsed(this.questsCollapsed);
            this.questKey = '';
            this.app.sfx('click');
          },
        },
        el('span', {}, `📋 ${t('hud.goals')}${summary}`),
        readyCount ? el('span', { class: 'quest-ready' }, `🎁 ${readyCount}`) : null,
        el('span', { class: 'quest-chevron', 'aria-hidden': 'true' }, this.questsCollapsed ? '▸' : '▾'),
      );
      const list = el('div', { id: 'quest-list', class: 'quest-list' });
      const missionsBtn = g.missions.available
        ? el('button', { class: 'quest-missions', 'data-tut': 'missions', 'aria-label': t('missions.title'), title: t('missions.title'), onclick: () => { this.app.sfx('click'); this.app.openMissions(); } }, '📅', missionsReady ? el('span', { class: 'quest-ready' }, `🎁 ${missionsReady}`) : null)
        : null;
      this.quests.append(el('div', { class: 'quest-head-row' }, head, missionsBtn), list);
      toggle(this.quests, 'collapsed', this.questsCollapsed);
      // Collapsed: only the main goal (title + progress + claim). Expanded: main goal, side goals, next level preview.
      const shown = main ? (this.questsCollapsed ? [main] : [main, ...others]) : [];
      for (const v of shown) list.append(this.questNode(v, this.questsCollapsed));
      if (!this.questsCollapsed && !tutDone) {
        list.append(el('button', { class: 'link-btn', 'data-tut': 'skip-tutorial', onclick: () => this.app.skipTutorial() }, `⏭️ ${t('tut.skip')}`));
      }
      if (!this.questsCollapsed) {
        const next = g.progression.unlocksAt(level + 1);
        if (next.length) {
          const names = next.slice(0, 3).map(unlockLine).join(', ') + (next.length > 3 ? ` +${next.length - 3}` : '');
          list.append(el('div', { class: 'next-unlock' }, el('b', {}, `${t('hud.next_level', { n: level + 1 })}: `), names));
        }
      }
    }
    for (const u of this.questUpdaters) u();
  }

  private questNode(v: ReturnType<Game['quests']['views']>[number], compact: boolean): HTMLElement {
    const g = this.app.game;
    const bar = new ProgressBar('quest');
    const r = v.reward;
    const rewardText = [r.money ? formatMoney(r.money) : '', r.stars ? `${r.stars}🌟` : '', r.unlockProduct ? `${getProduct(r.unlockProduct)?.icon ?? '🎁'} ${t(`product.${r.unlockProduct}`)}` : '', r.xp ? `${r.xp} XP` : ''].filter(Boolean).join(' · ');
    const claim = v.progress.completed
      ? el(
          'button',
          {
            class: 'btn btn-claim',
            onclick: guarded(`quest-${v.id}`, () => {
              if (g.quests.claim(v.id)) {
                this.app.sfx('achievement');
                this.app.toast(t('toast.reward_claimed', { reward: rewardText }), '🎁', 'gold');
                this.questKey = '';
              }
            }),
          },
          `🎁 ${t('ui.claim')} · ${rewardText}`,
        )
      : null;
    const node = el(
      'div',
      { class: `quest ${v.main ? 'main' : 'side'} ${v.progress.completed ? 'done' : ''}`, 'data-quest': v.id },
      el('div', { class: 'quest-title' }, v.main ? '⭐ ' : '• ', this.questText(v.id, v.target, v.progress.side?.stat)),
      v.progress.completed ? null : bar.el,
      !compact && !v.progress.completed && rewardText ? el('div', { class: 'quest-reward' }, `${t('quest.reward')}: ${rewardText}`) : null,
      claim,
    );
    this.questUpdaters.push(() => {
      const cur = g.quests.view(v.progress);
      bar.set(cur.value / cur.target, `${formatNumber(Math.min(cur.value, cur.target))} / ${formatNumber(cur.target)}`);
    });
    return node;
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

const COLLAPSE_KEY = 'tinytycoon.ui.goalsCollapsed';

/** UI preference only (not game state): survives reloads, safe if storage is blocked. */
function loadCollapsed(): boolean {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY);
    if (v !== null) return v === '1';
  } catch {
    /* fall through to the default */
  }
  // Default: compact on short screens so the shop keeps the space.
  return typeof window !== 'undefined' && window.innerHeight < 700;
}

function storeCollapsed(v: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    /* storage unavailable: preference lasts for this session only */
  }
}
