import type { Game } from './game';
import { ECONOMY } from '../config/economy';

/**
 * Pure offline-earnings formula (unit tested). Clock rollbacks give nothing,
 * and duration is capped so time manipulation can't break the economy.
 */
export function computeOffline(params: { lastSave: number; now: number; ratePerSec: number; efficiency: number; capSeconds: number }): { seconds: number; amount: number } {
  const { lastSave, now, ratePerSec, efficiency, capSeconds } = params;
  if (!Number.isFinite(lastSave) || !Number.isFinite(now) || now <= lastSave) return { seconds: 0, amount: 0 };
  const seconds = Math.min(capSeconds, (now - lastSave) / 1000);
  const rate = Number.isFinite(ratePerSec) && ratePerSec > 0 ? ratePerSec : 0;
  const amount = Math.floor(rate * Math.max(0, Math.min(1, efficiency)) * seconds);
  return { seconds: Math.floor(seconds), amount: Math.min(ECONOMY.maxMoney, amount) };
}

/** OfflineManager: computes "welcome back" earnings on load and pays them out once. */
export class OfflineManager {
  constructor(private game: Game) {}

  /** Called during boot. Stores a pending reward (claimed via the welcome-back popup). */
  compute(now: number): { seconds: number; amount: number } | null {
    const g = this.game;
    const st = g.state;
    // The temporary ad boost never carries into offline earnings.
    const rate = Math.max(g.economy.incomeRate(), g.shop.incomeRate) / g.ads.priceMult() + g.locations.passiveIncome();
    const res = computeOffline({ lastSave: st.timestamps.lastSave, now, ratePerSec: rate, efficiency: g.mods.offlineEfficiency(), capSeconds: g.mods.offlineCapSeconds() });
    // Always move the timestamp forward (or back, on clock rollback) so it can't be re-used.
    st.timestamps.lastSave = now;
    if (res.seconds < ECONOMY.offline.minSecondsForPopup || res.amount <= 0) return null;
    if (st.pendingOffline && !st.pendingOffline.claimed) {
      st.pendingOffline.amount += res.amount;
      st.pendingOffline.seconds += res.seconds;
    } else st.pendingOffline = { seconds: res.seconds, amount: res.amount, claimed: false };
    return { ...st.pendingOffline };
  }

  claim(multiplier = 1): number {
    const p = this.game.state.pendingOffline;
    if (!p || p.claimed) return 0;
    p.claimed = true;
    const amount = Math.floor(p.amount * Math.max(1, Math.min(2, multiplier)));
    this.game.economy.earn(amount, false);
    this.game.state.pendingOffline = undefined;
    this.game.bus.emit('offlineEarnings', { seconds: p.seconds, amount });
    return amount;
  }
}
