import type { AppApi } from './api';
import type { SettingsState } from '../core/types';
import { el, clear, guarded } from './dom';
import { card, iconBox, sectionTitle, tag, ProgressBar } from './components';
import { ACHIEVEMENTS } from '../config/achievements';
import { availableLanguages, t } from '../core/i18n';
import { formatMoney, formatNumber } from '../core/format';
import { ECONOMY } from '../config/economy';
import type { Game } from '../sim/game';

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
    (this.el.querySelector('button') as HTMLButtonElement | null)?.focus();
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
        sectionTitle(t('set.graphics'), '🖼️'),
        toggleRow('effectsEnabled', t('set.effects')),
        select(t('set.quality'), [['high', t('set.high')], ['low', t('set.low')]], s.graphics, (v) => (s.graphics = v as 'high' | 'low')),
        sectionTitle(t('set.general'), '🌐'),
        select(t('set.language'), availableLanguages().map((l) => [l, t(`lang.${l}`)] as [string, string]), s.language, (v) => (s.language = v)),
        toggleRow('notificationsEnabled', t('set.notifications'), (v) => {
          if (v) void this.hooks.requestNotifications().then((ok) => { if (!ok) { s.notificationsEnabled = false; changed(); this.app.toast(t('toast.notif_denied'), '🔕', 'bad'); } });
        }),
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

  credits(): void {
    this.show('credits', el('h2', {}, `💛 ${t('menu.credits')}`), el('div', { class: 'credits' }, el('p', {}, t('credits.made')), el('p', {}, t('credits.tech')), el('p', {}, t('credits.thanks'))), this.back(this.returnTo));
  }
}
