import type { Game } from './game';
import { ACHIEVEMENTS, MILESTONES } from '../config/achievements';
import { runCheck } from './checks';
import { EARNED_GEMS_PER_ACHIEVEMENT_STAR, EARNED_GEMS_PER_MILESTONE } from '../monetization/catalog';

/** AchievementManager: achievements (claimable, permanent bonus) and celebratory milestones. */
export class AchievementManager {
  private timer = 0;

  constructor(private game: Game) {}

  tick(dt: number): void {
    this.timer += dt;
    if (this.timer < 1) return;
    this.timer = 0;
    this.evaluate();
  }

  evaluate(): void {
    const prog = this.game.state.progression;
    for (const a of ACHIEVEMENTS) {
      const st = prog.achievements[a.id];
      if (st?.unlocked) continue;
      if (runCheck(this.game, a.check, a.arg) >= a.target) {
        prog.achievements[a.id] = { unlocked: true, claimed: false };
        this.game.bus.emit('achievementUnlocked', { id: a.id });
        this.game.analytics('achievement_completed', { id: a.id });
      }
    }
    for (const m of MILESTONES) {
      if (prog.milestones[m.id]) continue;
      if (runCheck(this.game, m.check, m.arg) >= m.target) {
        prog.milestones[m.id] = true;
        if (m.money) this.game.economy.earn(m.money, false);
        this.game.monetization.earnGems(EARNED_GEMS_PER_MILESTONE, `milestone:${m.id}`);
        this.game.bus.emit('milestone', { id: m.id });
      }
    }
  }

  progress(id: string): { value: number; target: number } {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return { value: 0, target: 1 };
    return { value: Math.min(a.target, runCheck(this.game, a.check, a.arg)), target: a.target };
  }

  claim(id: string): boolean {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    const st = this.game.state.progression.achievements[id];
    if (!a || !st?.unlocked || st.claimed) return false; // no duplicate rewards
    st.claimed = true;
    this.game.economy.addStars(a.stars);
    this.game.monetization.earnGems(a.stars * EARNED_GEMS_PER_ACHIEVEMENT_STAR, `achievement:${a.id}`);
    if (a.unlockTheme && !this.game.state.cosmetics.unlockedThemes.includes(a.unlockTheme)) this.game.state.cosmetics.unlockedThemes.push(a.unlockTheme);
    if (a.title) this.game.state.player.title = a.title;
    this.game.bus.emit('achievementClaimed', { id, stars: a.stars });
    return true;
  }

  claimableCount(): number {
    return Object.values(this.game.state.progression.achievements).filter((a) => a.unlocked && !a.claimed).length;
  }
}
