import type { Game } from './game';
import type { QuestProgress } from '../core/types';
import { MAIN_QUESTS, SIDE_QUEST_TEMPLATES } from '../config/quests';
import type { QuestDef, Reward } from '../config/quests';
import { runCheck, statValue } from './checks';

export interface QuestView {
  id: string;
  progress: QuestProgress;
  def?: QuestDef;
  value: number;
  target: number;
  reward: Reward;
  main: boolean;
}

const MAX_SIDE_QUESTS = 2;

/** QuestManager: the main quest chain (incl. tutorial) plus generated side quests. */
export class QuestManager {
  private timer = 0;

  constructor(private game: Game) {}

  get active(): QuestProgress[] {
    return this.game.state.progression.activeQuests;
  }

  mainDef(id: string): QuestDef | undefined {
    return MAIN_QUESTS.find((q) => q.id === id);
  }

  view(q: QuestProgress): QuestView {
    const def = this.mainDef(q.id);
    if (q.side) {
      return { id: q.id, progress: q, value: Math.max(0, statValue(this.game, q.side.stat) - q.base), target: q.side.amount, reward: { money: q.side.money, xp: q.side.xp }, main: false };
    }
    if (!def) return { id: q.id, progress: q, value: 0, target: 1, reward: {}, main: true };
    const goal = def.goal;
    const value = goal.type === 'stat' ? statValue(this.game, goal.stat) - q.base : runCheck(this.game, goal.check, goal.arg);
    return { id: q.id, progress: q, def, value: Math.max(0, value), target: goal.amount, reward: def.reward, main: true };
  }

  views(): QuestView[] {
    return this.active.map((q) => this.view(q));
  }

  /** The current tutorial/main quest (drives the tutorial pointer). */
  currentMain(): QuestView | null {
    const q = this.active.find((a) => !a.side);
    return q ? this.view(q) : null;
  }

  tick(dt: number): void {
    this.timer += dt;
    if (this.timer < 0.25) return;
    this.timer = 0;
    this.evaluate();
  }

  evaluate(): void {
    for (const q of this.active) {
      if (q.completed) continue;
      const v = this.view(q);
      if (v.value >= v.target) {
        q.completed = true;
        this.game.bus.emit('questCompleted', { id: q.id });
      }
    }
    this.fillSideQuests();
  }

  claim(id: string): boolean {
    const prog = this.game.state.progression;
    const q = this.active.find((a) => a.id === id);
    if (!q || !q.completed || q.claimed) return false; // anti double-claim
    q.claimed = true;
    const v = this.view(q);
    const r = v.reward;
    if (r.money) this.game.economy.earn(r.money, false);
    if (r.stars) this.game.economy.addStars(r.stars);
    if (r.unlockProduct) this.game.progression.grantProduct(r.unlockProduct, true);
    if (r.xp) this.game.progression.addXp(r.xp);
    prog.activeQuests = this.active.filter((a) => a !== q);
    this.game.bus.emit('questClaimed', { id, money: r.money ?? 0, stars: r.stars ?? 0, xp: r.xp ?? 0 });
    if (!q.side) {
      const def = this.mainDef(id);
      if (def?.tutorial && !MAIN_QUESTS[prog.mainQuestIndex + 1]?.tutorial && !prog.tutorialDone) {
        prog.tutorialDone = true;
        this.game.analytics('tutorial_completed', {});
      }
      prog.mainQuestIndex++;
      this.startMain();
    }
    this.evaluate();
    return true;
  }

  startMain(): void {
    const prog = this.game.state.progression;
    const def = MAIN_QUESTS[prog.mainQuestIndex];
    if (!def || this.active.some((a) => a.id === def.id)) return;
    const base = def.goal.type === 'stat' ? statValue(this.game, def.goal.stat) : 0;
    prog.activeQuests.unshift({ id: def.id, base, completed: false, claimed: false });
  }

  private fillSideQuests(): void {
    const g = this.game;
    const prog = g.state.progression;
    const lvl = g.state.player.level;
    if (!prog.tutorialDone) return;
    let sides = this.active.filter((a) => a.side).length;
    let guard = 0;
    while (sides < MAX_SIDE_QUESTS && guard++ < 10) {
      const options = SIDE_QUEST_TEMPLATES.filter((t) => lvl >= t.minLevel && !this.active.some((a) => a.side?.stat === t.stat));
      const tpl = g.rng.pick(options);
      if (!tpl) return;
      const amount = Math.max(1, Math.round(tpl.base + tpl.perLevel * lvl));
      prog.sideQuestCounter++;
      prog.activeQuests.push({
        id: `${tpl.id}#${prog.sideQuestCounter}`,
        base: statValue(g, tpl.stat),
        completed: false,
        claimed: false,
        side: { stat: tpl.stat, amount, money: Math.round(tpl.rewardMoneyPerLevel * lvl * g.mods.location.costMult), xp: 10 + lvl * 3 },
      });
      sides++;
    }
  }

  /** Template id for a side quest instance id ("side_sell#4" → "side_sell"). */
  static templateOf(id: string): string {
    return id.split('#')[0];
  }
}
