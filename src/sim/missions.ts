import type { Game } from './game';
import type { MissionProgress } from '../core/types';
import { MISSIONS } from '../config/missions';
import type { MissionTemplate } from '../config/missions';
import { Rng } from '../core/rng';
import { statValue } from './checks';

export type MissionKind = 'daily' | 'weekly';

const DAY = 86_400_000;

/** UTC calendar day, e.g. "2026-10-14". */
export function dayKey(ms: number): string {
  return new Date(Math.floor(ms / DAY) * DAY).toISOString().slice(0, 10);
}

/** UTC date of the Monday starting the week that contains `ms`. */
export function weekKey(ms: number): string {
  const day = Math.floor(ms / DAY);
  const dow = (new Date(day * DAY).getUTCDay() + 6) % 7; // Monday = 0
  return dayKey((day - dow) * DAY);
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export interface MissionView {
  kind: MissionKind;
  m: MissionProgress;
  value: number;
}

/**
 * Daily and weekly missions. Sets are issued per UTC day / UTC week (Monday) and chosen
 * deterministically from the period key + the save's seed, so restarting the game never
 * rerolls or resets them. Progress is measured from real gameplay stats.
 *
 * Limitation: the period is taken from the device clock (no trusted server time). Moving the
 * clock forward rolls the sets early; moving it backwards never rerolls them.
 */
export class MissionManager {
  private timer = 0;

  constructor(private game: Game) {}

  /** Missions start once the tutorial is done, so new players aren't overwhelmed. */
  get available(): boolean {
    return this.game.state.progression.tutorialDone;
  }

  tick(dt: number): void {
    this.timer += dt;
    if (this.timer < 1) return;
    this.timer = 0;
    this.refresh();
  }

  refresh(): void {
    if (!this.available) return;
    const st = this.game.state.missions;
    const now = this.game.now();
    const dk = dayKey(now);
    const wk = weekKey(now);
    if (dk > st.dailyKey) {
      st.dailyKey = dk;
      st.daily = this.issue('daily', dk);
      this.game.bus.emit('missionsReset', { kind: 'daily' });
    }
    if (wk > st.weeklyKey) {
      st.weeklyKey = wk;
      st.weekly = this.issue('weekly', wk);
      this.game.bus.emit('missionsReset', { kind: 'weekly' });
    }
    for (const kind of ['daily', 'weekly'] as const) {
      for (const m of st[kind]) {
        // Stats only grow, but rebase defensively so a mission can never get stuck below zero.
        const cur = statValue(this.game, m.stat);
        if (cur < m.base) m.base = cur;
        if (!m.completed && cur - m.base >= m.target) {
          m.completed = true;
          this.game.bus.emit('missionCompleted', { kind, id: m.id });
          this.game.analytics('mission_completed', { kind, id: m.id });
        }
      }
    }
  }

  private issue(kind: MissionKind, key: string): MissionProgress[] {
    const g = this.game;
    const lvl = g.state.player.level;
    const pool: MissionTemplate[] = MISSIONS[kind].filter((t) => lvl >= t.minLevel);
    const rng = new Rng(hash(`${kind}:${key}:${g.state.rngSeed}`));
    const chosen: MissionTemplate[] = [];
    const count = kind === 'daily' ? MISSIONS.dailyCount : MISSIONS.weeklyCount;
    const left = [...pool];
    while (chosen.length < count && left.length) chosen.push(left.splice(Math.floor(rng.next() * left.length), 1)[0]);
    return chosen.map((t) => ({
      id: t.id,
      stat: t.stat,
      base: statValue(g, t.stat),
      target: Math.max(1, Math.round(t.base + t.perLevel * lvl)),
      money: Math.round(t.moneyPerLevel * lvl * g.mods.location.costMult),
      xp: t.xp,
      gems: t.gems,
      completed: false,
      claimed: false,
    }));
  }

  views(kind: MissionKind): MissionView[] {
    return this.game.state.missions[kind].map((m) => ({ kind, m, value: Math.min(m.target, Math.max(0, statValue(this.game, m.stat) - m.base)) }));
  }

  /** Claims a completed mission's reward exactly once. */
  claim(kind: MissionKind, id: string): boolean {
    const m = this.game.state.missions[kind].find((x) => x.id === id);
    if (!m || m.claimed) return false;
    if (!m.completed && statValue(this.game, m.stat) - m.base < m.target) return false;
    m.completed = true;
    m.claimed = true;
    const g = this.game;
    if (m.money) g.economy.earn(m.money, false);
    if (m.xp) g.progression.addXp(m.xp);
    if (m.gems) g.monetization.earnGems(m.gems, `mission:${kind}:${g.state.missions[kind === 'daily' ? 'dailyKey' : 'weeklyKey']}:${id}`);
    if (kind === 'daily') g.state.stats.dailyMissionsClaimed++;
    else g.state.stats.weeklyMissionsClaimed++;
    g.bus.emit('missionClaimed', { kind, id, money: m.money, xp: m.xp, gems: m.gems });
    return true;
  }

  /** Milliseconds until the next reset (UTC midnight / Monday 00:00 UTC). */
  msUntilReset(kind: MissionKind): number {
    const now = this.game.now();
    const nextDay = (Math.floor(now / DAY) + 1) * DAY;
    if (kind === 'daily') return nextDay - now;
    const dow = (new Date(Math.floor(now / DAY) * DAY).getUTCDay() + 6) % 7;
    return nextDay + (6 - dow) * DAY - now;
  }

  unclaimedCount(): number {
    const st = this.game.state.missions;
    return [...st.daily, ...st.weekly].filter((m) => m.completed && !m.claimed).length;
  }
}
