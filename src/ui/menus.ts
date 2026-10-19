import type { AppApi } from './api';
import type { SettingsState } from '../core/types';
import { el, clear, guarded } from './dom';
import { card, iconBox, sectionTitle, tag, ProgressBar } from './components';
import { ACHIEVEMENTS } from '../config/achievements';
import { availableLanguages, t } from '../core/i18n';
import { formatMoney, formatNumber } from '../core/format';
import { ECONOMY } from '../config/economy';
import type { Game } from '../sim/game';
import type { AdController } from '../ads/controller';
import type { MissionKind, MissionView } from '../sim/missions';
import { ADS } from '../config/ads';
import { formatDuration } from '../core/format';

export type AchievementState = 'locked' | 'progress' | 'ready' | 'claimed';
const STATE_ICON: Record<AchievementState, string> = { locked: '🔒', progress: '⏳', ready: '🎁', claimed: '✓' };

/** Single source of truth for an achievement's display state. */
export function achievementState(g: Game, id: string): AchievementState {
  const st = g.state.progression.achievements[id];
  if (st?.claimed) return 'claimed';
  if (st?.unlocked) return 'ready';
  return g.achievements.progress(id).value > 0 ? 'progress' : 'locked';
}

export interface MenuHooks {
  continueGame: () => void;
  newGame: () => void;
  saveNow: () => void;
  toMainMenu: () => void;
  settingsChanged: (s: SettingsState) => void;
  resetSave: () => void;
  requestNotifications: () => Promise<boolean>;
  hasSave: () => boolean;
  ads: () => AdController;
  analyticsProvider: () => string | null;
  skipTutorial: () => void;
  replayTutorialTips: () => void;
}

/** Full-screen overlays: main menu, pause, settings, achievements, credits. */
export class Menus {
  el: HTMLElement;
  current: string | null = null;
  private returnTo: string | null = null;

  constructor(private app: AppApi, private hooks: MenuHooks) {
    this.el = el('div', { class: 'overlay hidden' });
  }

  get open(): boolean {
    return this.current !== null;
  }

  close(): void {
    this.current = null;
    this.el.classList.add('hidden');
    clear(this.el);
  }

  private show(id: string, ...content: Node[]): void {
    this.current = id;
    clear(this.el);
    this.el.append(el('div', { class: `menu menu-${id}`, role: 'dialog', 'aria-modal': 'true' }, ...content));
    this.el.classList.remove('hidden');
    // Focus for keyboard users without scrolling long lists away from their top.
    (this.el.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  private back(to: string | null): HTMLElement {
    return el('button', { class: 'btn btn-ghost', onclick: () => (to === 'main' ? this.main() : to === 'pause' ? this.pause() : this.close()) }, `← ${t('ui.back')}`);
  }

  main(): void {
    const has = this.hooks.hasSave();
    this.show(
      'main',
      el('div', { class: 'logo big' }, el('span', { class: 'logo-icon' }, '🏪'), el('h1', {}, 'Tiny Tycoon'), el('p', { class: 'tagline' }, t('menu.tagline'))),
      el(
        'div',
        { class: 'menu-buttons' },
        has ? el('button', { class: 'btn btn-primary btn-big', onclick: () => { this.app.sfx('click'); this.hooks.continueGame(); } }, `▶ ${t('menu.continue')}`) : null,
        el(
          'button',
          {
            class: `btn ${has ? 'btn-ghost' : 'btn-primary btn-big'}`,
            onclick: () => {
              if (!has) return this.hooks.newGame();
              this.app.confirm({ icon: '🆕', title: t('menu.new_game'), text: t('menu.new_game_confirm'), okLabel: t('menu.new_game'), danger: true, onOk: () => this.hooks.newGame() });
            },
          },
          `🆕 ${t('menu.new_game')}`,
        ),
        el('button', { class: 'btn btn-ghost', onclick: () => { this.returnTo = 'main'; this.settings(); } }, `⚙️ ${t('menu.settings')}`),
        el('button', { class: 'btn btn-ghost', onclick: () => { this.returnTo = 'main'; this.achievements(); } }, `🏆 ${t('menu.achievements')}`),
        el('button', { class: 'btn btn-ghost', onclick: () => { this.returnTo = 'main'; this.credits(); } }, `💛 ${t('menu.credits')}`),
      ),
    );
  }

  pause(): void {
    const g = this.app.game;
    const p = g.state.player;
    this.returnTo = 'pause';
    this.show(
      'pause',
      el('h2', {}, `⏸ ${t('menu.paused')}`),
      card('stats-card', el('div', { class: 'stat-grid' }, el('div', { class: 'stat-row' }, el('span', {}, t('stat.lifetime_revenue')), el('b', {}, formatMoney(p.lifetimeRevenue))), el('div', { class: 'stat-row' }, el('span', {}, t('stat.lifetime_customers')), el('b', {}, formatNumber(p.lifetimeCustomers))), el('div', { class: 'stat-row' }, el('span', {}, t('stat.franchises')), el('b', {}, String(p.prestigeCount))), p.title ? el('div', { class: 'stat-row' }, el('span', {}, t('stat.title')), el('b', {}, t(`title.${p.title}`))) : null)),
      el(
        'div',
        { class: 'menu-buttons' },
        el('button', { class: 'btn btn-primary btn-big', onclick: () => this.close() }, `▶ ${t('menu.resume')}`),
        el('button', { class: 'btn btn-ghost', onclick: () => this.settings() }, `⚙️ ${t('menu.settings')}`),
        el('button', { class: 'btn btn-ghost', onclick: () => this.achievements() }, `🏆 ${t('menu.achievements')}`),
        g.missions.available ? el('button', { class: 'btn btn-ghost', onclick: () => this.missions() }, `📅 ${t('missions.title')}`) : null,
        el('button', { class: 'btn btn-ghost', onclick: () => this.help() }, `❓ ${t('help.title')}`),
        el('button', { class: 'btn btn-ghost', onclick: () => { this.hooks.saveNow(); this.app.toast(t('toast.saved'), '💾', 'good'); } }, `💾 ${t('menu.save')}`),
        el('button', { class: 'btn btn-ghost', onclick: () => this.hooks.toMainMenu() }, `🚪 ${t('menu.exit')}`),
      ),
    );
  }

  settings(): void {
    const s = this.app.game.state.settings;
    const changed = () => this.hooks.settingsChanged(s);
    const toggleRow = (key: keyof SettingsState, label: string, after?: (v: boolean) => void) => {
      const id = `set-${key}`;
      const input = el('input', { type: 'checkbox', id, role: 'switch' }) as HTMLInputElement;
      input.checked = s[key] as boolean;
      input.addEventListener('change', () => {
        (s as any)[key] = input.checked;
        after?.(input.checked);
        changed();
        this.app.sfx('click');
      });
      return el('label', { class: 'set-row', for: id }, el('span', {}, label), input);
    };
    const sliderRow = (key: 'musicVolume' | 'sfxVolume', label: string) => {
      const input = el('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100), 'aria-label': label }) as HTMLInputElement;
      input.addEventListener('input', () => {
        s[key] = Number(input.value) / 100;
        changed();
      });
      return el('label', { class: 'set-row' }, el('span', {}, label), input);
    };
    const select = <T extends string | number>(label: string, options: [T, string][], value: T, set: (v: T) => void) => {
      const sel = el('select', { 'aria-label': label }) as HTMLSelectElement;
      for (const [v, l] of options) sel.append(el('option', { value: String(v), selected: v === value }, l));
      sel.addEventListener('change', () => {
        const opt = options.find(([v]) => String(v) === sel.value);
        if (opt) set(opt[0]);
        changed();
      });
      return el('label', { class: 'set-row' }, el('span', {}, label), sel);
    };
    this.show(
      'settings',
      el('h2', {}, `⚙️ ${t('menu.settings')}`),
      el(
        'div',
        { class: 'settings-scroll' },
        sectionTitle(t('set.audio'), '🔊'),
        toggleRow('musicEnabled', t('set.music')),
        sliderRow('musicVolume', t('set.music_volume')),
        toggleRow('audioEnabled', t('set.sfx')),
        sliderRow('sfxVolume', t('set.sfx_volume')),
        sectionTitle(t('set.accessibility'), '♿'),
        select(t('set.text_size'), [[0.9, t('set.small')], [1, t('set.medium')], [1.15, t('set.large')], [1.3, t('set.xlarge')]], s.textScale, (v) => (s.textScale = v)),
        toggleRow('colorblind', t('set.colorblind')),
        toggleRow('reduceFlashing', t('set.reduce_flashing')),
        toggleRow('screenShake', t('set.screen_shake')),
        toggleRow('vibrationEnabled', typeof navigator !== 'undefined' && 'vibrate' in navigator ? t('set.vibration') : `${t('set.vibration')} (${t('set.unsupported')})`),
        sectionTitle(t('set.camera'), '🎥'),
        select(t('set.camera_sensitivity'), [[0.5, t('set.slow')], [1, t('set.normal')], [1.6, t('set.fast')]], s.cameraSensitivity, (v) => (s.cameraSensitivity = v)),
        select(t('set.camera_drag'), [['orbit', t('set.camera_drag_orbit')], ['pan', t('set.camera_drag_pan')]], s.cameraDrag, (v) => (s.cameraDrag = v as 'orbit' | 'pan')),
        toggleRow('cameraLock', t('set.camera_lock')),
        toggleRow('cameraAutoUnlock', t('set.camera_auto_unlock')),
        toggleRow('rememberCamera', t('set.remember_camera')),
        el('p', { class: 'hint' }, t('set.camera_help')),
        sectionTitle(t('set.graphics'), '🖼️'),
        toggleRow('effectsEnabled', t('set.effects')),
        select(t('set.quality'), [['high', t('set.high')], ['low', t('set.low')]], s.graphics, (v) => (s.graphics = v as 'high' | 'low')),
        sectionTitle(t('set.general'), '🌐'),
        select(t('set.language'), availableLanguages().map((l) => [l, t(`lang.${l}`)] as [string, string]), s.language, (v) => (s.language = v)),
        toggleRow('notificationsEnabled', t('set.notifications'), (v) => {
          if (v) void this.hooks.requestNotifications().then((ok) => { if (!ok) { s.notificationsEnabled = false; changed(); this.app.toast(t('toast.notif_denied'), '🔕', 'bad'); } });
        }),
        sectionTitle(t('set.privacy'), '🔒'),
        this.hooks.analyticsProvider() ? toggleRow('analyticsConsent', t('set.analytics_opt')) : null,
        el('p', { class: 'hint' }, this.hooks.analyticsProvider() ? t('set.analytics_on', { provider: this.hooks.analyticsProvider()! }) : t('set.analytics_off')),
        el('button', { class: 'btn btn-danger btn-small', onclick: () => this.app.confirm({ icon: '🗑️', title: t('set.reset'), text: t('set.reset_confirm'), okLabel: t('set.reset'), danger: true, onOk: () => this.hooks.resetSave() }) }, `🗑️ ${t('set.reset')}`),
      ),
      this.back(this.returnTo),
    );
  }

  /** Opened from inside the game (toast, Map tab): "Back" returns to the game, never the main menu. */
  achievementsFromGame(): void {
    this.returnTo = null;
    this.achievements();
  }

  achievements(): void {
    const g = this.app.game;
    g.state.progression.flags.viewedAchievements = true;
    const list = el('div', { class: 'ach-list' });
    const states = ACHIEVEMENTS.map((a) => ({ a, state: achievementState(g, a.id) }));
    // Ready-to-claim first, then in progress, locked, claimed.
    const order: Record<AchievementState, number> = { ready: 0, progress: 1, locked: 2, claimed: 3 };
    states.sort((x, y) => order[x.state] - order[y.state]);
    const ready = states.filter((s) => s.state === 'ready').length;
    const claimed = states.filter((s) => s.state === 'claimed').length;
    for (const { a, state } of states) {
      const pr = g.achievements.progress(a.id);
      const bar = new ProgressBar('ach');
      bar.set(state === 'claimed' || state === 'ready' ? 1 : pr.value / pr.target, `${formatNumber(state === 'claimed' || state === 'ready' ? pr.target : pr.value)} / ${formatNumber(pr.target)}`);
      const reward = el('div', { class: 'ach-reward' }, tag(`🌟 ${a.stars}`), tag(`📈 +${Math.round(ECONOMY.achievementRevenueBonus * 100)}% ${t('ach.prices')}`), a.title ? tag(`🏷️ ${t(`title.${a.title}`)}`) : null, a.unlockTheme ? tag(`🎨 ${t(`theme.${a.unlockTheme}`)}`) : null);
      const stateTag = tag(`${STATE_ICON[state]} ${t(`ach.state.${state}`)}`, `ach-state st-${state}`);
      let right: HTMLElement | null = null;
      if (state === 'ready') {
        const btn = el('button', { class: 'btn btn-claim' }, `🎁 ${t('ui.claim')}`) as HTMLButtonElement;
        btn.addEventListener(
          'click',
          guarded(`ach-${a.id}`, () => {
            btn.disabled = true; // a second tap can never claim twice
            if (g.achievements.claim(a.id)) {
              this.app.sfx('achievement');
              this.app.toast(t('toast.ach_claimed_full', { name: t(`ach.${a.id}`), n: a.stars }), '🌟', 'gold');
              this.hooks.saveNow();
            } else this.app.sfx('error');
            this.achievements();
          }),
        );
        right = btn;
      }
      list.append(card(`ach ach-${state}`, iconBox(state === 'locked' ? '🔒' : a.icon), el('div', { class: 'card-main' }, el('div', { class: 'ach-head' }, el('b', {}, t(`ach.${a.id}`)), stateTag), el('small', {}, t(`ach.${a.id}.desc`, { n: formatNumber(a.target) })), bar.el, reward), right));
    }
    const summary = el('p', { class: 'hint' }, t('ach.summary', { claimed, total: ACHIEVEMENTS.length, bonus: Math.round(claimed * ECONOMY.achievementRevenueBonus * 100), ready }));
    this.show('achievements', el('h2', {}, `🏆 ${t('menu.achievements')}`), summary, el('div', { class: 'menu-scroll' }, list), this.back(this.returnTo));
  }

  /** Opened from the HUD: "Back" returns to the game. */
  missionsFromGame(): void {
    this.returnTo = null;
    this.missions();
  }

  missions(): void {
    const g = this.app.game;
    g.missions.refresh();
    const section = (kind: MissionKind) => {
      const views = g.missions.views(kind);
      const reset = formatDuration(Math.ceil(g.missions.msUntilReset(kind) / 1000));
      const list = el('div', { class: 'ach-list' });
      for (const v of views) list.append(this.missionCard(v));
      if (!views.length) list.append(el('p', { class: 'hint' }, t('missions.none')));
      return el('section', { class: `missions-${kind}` }, sectionTitle(`${t(`missions.${kind}`)} · ${t('missions.resets_in', { time: reset })}`, kind === 'daily' ? '☀️' : '🗓️'), list);
    };
    this.show(
      'missions',
      el('h2', {}, `📅 ${t('missions.title')}`),
      el('p', { class: 'hint' }, t('missions.hint')),
      el('div', { class: 'menu-scroll' }, section('daily'), section('weekly'), this.adOffer()),
      this.back(this.returnTo),
    );
  }

  private missionCard(v: MissionView): HTMLElement {
    const g = this.app.game;
    const { m, kind } = v;
    const bar = new ProgressBar('ach');
    const fmt = m.stat === 'revenue' ? formatMoney : formatNumber;
    bar.set(v.value / m.target, `${fmt(v.value)} / ${fmt(m.target)}`);
    // Missions are never "locked": an unstarted one is simply to do.
    const state: AchievementState = m.claimed ? 'claimed' : m.completed ? 'ready' : 'progress';
    const stateLabel = state === 'progress' ? (v.value > 0 ? `${STATE_ICON.progress} ${t('ach.state.progress')}` : `🎯 ${t('missions.state.todo')}`) : `${STATE_ICON[state]} ${t(`ach.state.${state}`)}`;
    const rewardTags = el('div', { class: 'ach-reward' }, m.money ? tag(`💷 ${formatMoney(m.money)}`) : null, m.xp ? tag(`⭐ ${m.xp} XP`) : null, m.gems ? tag(`💎 ${m.gems}`) : null);
    let right: HTMLElement | null = null;
    if (state === 'ready') {
      const btn = el('button', { class: 'btn btn-claim', 'data-mission': `${kind}-${m.id}` }, `🎁 ${t('ui.claim')}`) as HTMLButtonElement;
      btn.addEventListener(
        'click',
        guarded(`mission-${kind}-${m.id}`, () => {
          btn.disabled = true;
          if (g.missions.claim(kind, m.id)) {
            this.app.sfx('achievement');
            this.app.toast(t('toast.mission_claimed'), '📅', 'gold');
            this.hooks.saveNow();
          } else this.app.sfx('error');
          this.missions();
        }),
      );
      right = btn;
    }
    const n = m.stat === 'revenue' ? formatMoney(m.target) : formatNumber(m.target);
    const label = m.stat.startsWith('sold:') ? t('mission.sold_cat', { n, cat: t(`cat.${m.stat.slice(5)}`) }) : t(`mission.${m.stat}`, { n });
    return card(
      `ach ach-${state} mission`,
      iconBox(state === 'claimed' ? '✓' : kind === 'daily' ? '☀️' : '🗓️'),
      el('div', { class: 'card-main' }, el('div', { class: 'ach-head' }, el('b', {}, label), tag(stateLabel, `ach-state st-${state}`)), bar.el, rewardTags),
      right,
    );
  }

  /** Optional rewarded ad. Hidden entirely when no ad provider can serve one. */
  private adOffer(): HTMLElement | null {
    const g = this.app.game;
    const ads = this.hooks.ads();
    if (!ads.provider.isAvailable()) return null;
    const block = g.ads.block();
    const boostPct = Math.round((ADS.boostPriceMult - 1) * 100);
    const mins = Math.round(ADS.boostSeconds / 60);
    let status: HTMLElement | null = null;
    let btn: HTMLButtonElement | null = null;
    if (block === 'boost_active') status = el('p', { class: 'hint' }, t('ads.active', { time: formatDuration(Math.ceil(g.state.ads.boostRemaining)) }));
    else if (block === 'daily_cap') status = el('p', { class: 'hint' }, t('ads.cap'));
    else if (block === 'cooldown') status = el('p', { class: 'hint' }, t('ads.cooldown', { time: formatDuration(Math.ceil(g.ads.cooldownLeftMs() / 1000)) }));
    else {
      btn = el('button', { class: 'btn btn-ghost', 'data-ad': 'watch' }, `▶ ${t('ads.watch')}`) as HTMLButtonElement;
      btn.addEventListener('click', async () => {
        if (!btn) return;
        btn.disabled = true;
        btn.textContent = t('ads.loading');
        const r = await ads.watch();
        if (r === 'rewarded') {
          this.app.sfx('achievement');
          this.app.toast(t('ads.rewarded', { pct: boostPct, mins }), '🚀', 'gold');
          this.hooks.saveNow();
        } else if (r === 'skipped') this.app.toast(t('ads.skipped'), '📺', 'info');
        else if (r !== 'busy') this.app.toast(t('ads.failed'), '📺', 'bad');
        if (this.current === 'missions') this.missions();
      });
    }
    return el(
      'section',
      { class: 'ad-offer' },
      sectionTitle(t('ads.title'), '📺'),
      card('ad-card', iconBox('🚀'), el('div', { class: 'card-main' }, el('b', {}, t('ads.offer', { pct: boostPct, mins })), el('small', {}, t('ads.terms', { cap: ADS.dailyCap })), ads.provider.simulated ? el('div', { class: 'test-banner small' }, `🧪 ${t('ads.simulated')}`) : null, status), btn),
    );
  }

  /** "How to play": re-read the basics at any time, and optionally replay the tutorial tips. */
  help(): void {
    const g = this.app.game;
    const steps = ['open', 'sell', 'stock', 'upgrade', 'staff', 'goals', 'levels', 'gems', 'next'];
    this.show(
      'help',
      el('h2', {}, `❓ ${t('help.title')}`),
      el('div', { class: 'menu-scroll' }, el('ol', { class: 'help-list' }, ...steps.map((k) => el('li', {}, t(`help.${k}`))))),
      el(
        'div',
        { class: 'menu-buttons' },
        g.state.progression.tutorialDone
          ? el('button', { class: 'btn btn-ghost', onclick: () => { this.hooks.replayTutorialTips(); this.close(); } }, `👆 ${t('help.replay_tips')}`)
          : el('button', { class: 'btn btn-ghost', onclick: () => this.app.confirm({ icon: '⏭️', title: t('tut.skip'), text: t('tut.skip_confirm'), okLabel: t('tut.skip'), onOk: () => { this.hooks.skipTutorial(); this.close(); } }) }, `⏭️ ${t('tut.skip')}`),
      ),
      this.back(this.returnTo),
    );
  }

  credits(): void {
    this.show('credits', el('h2', {}, `💛 ${t('menu.credits')}`), el('div', { class: 'credits' }, el('p', {}, t('credits.made')), el('p', {}, t('credits.tech')), el('p', {}, t('credits.thanks'))), this.back(this.returnTo));
  }
}
