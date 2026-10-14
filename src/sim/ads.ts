import type { Game } from './game';
import { ADS } from '../config/ads';
import { dayKey } from './missions';

export type AdOfferBlock = 'boost_active' | 'cooldown' | 'daily_cap' | null;

/**
 * Rewarded-ad rules (provider-independent). The reward — a temporary sale-price boost — is
 * granted only through `grantVerified`, which the ad controller calls after the provider
 * confirms the ad was watched to completion. Each completion id is processed once.
 */
export class AdRewardManager {
  constructor(private game: Game) {}

  private rollDay(): void {
    const st = this.game.state.ads;
    const dk = dayKey(this.game.now());
    if (dk > st.dayKey) {
      st.dayKey = dk;
      st.watchedToday = 0;
    }
  }

  /** Why the offer can't be shown right now (null = available). */
  block(): AdOfferBlock {
    this.rollDay();
    const st = this.game.state.ads;
    if (st.boostRemaining > 0) return 'boost_active';
    if (st.watchedToday >= ADS.dailyCap) return 'daily_cap';
    if (this.game.now() - st.lastWatchedAt < ADS.cooldownMs && st.lastWatchedAt <= this.game.now()) return 'cooldown';
    return null;
  }

  cooldownLeftMs(): number {
    const st = this.game.state.ads;
    return Math.max(0, ADS.cooldownMs - (this.game.now() - st.lastWatchedAt));
  }

  get boostActive(): boolean {
    return this.game.state.ads.boostRemaining > 0;
  }

  /** Multiplier applied to sale prices (1 when no boost). */
  priceMult(): number {
    return this.boostActive ? ADS.boostPriceMult : 1;
  }

  /** Grants the reward for one verified ad completion. Returns false for duplicates or when not offerable. */
  grantVerified(completionId: string): boolean {
    const st = this.game.state.ads;
    if (!completionId || st.processed.includes(completionId)) return false;
    if (this.block()) return false;
    st.processed.push(completionId);
    if (st.processed.length > 200) st.processed.splice(0, st.processed.length - 200);
    st.watchedToday++;
    st.lastWatchedAt = this.game.now();
    st.boostRemaining = ADS.boostSeconds;
    this.game.bus.emit('adBoostStarted', { seconds: ADS.boostSeconds });
    this.game.analytics('rewarded_ad_completed', { placement: ADS.placement });
    return true;
  }

  tick(dt: number): void {
    const st = this.game.state.ads;
    if (st.boostRemaining <= 0) return;
    st.boostRemaining = Math.max(0, st.boostRemaining - dt);
    if (st.boostRemaining === 0) this.game.bus.emit('adBoostEnded', {});
  }
}
