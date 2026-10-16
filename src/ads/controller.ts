import type { Game } from '../sim/game';
import type { RewardedAdProvider } from './types';
import { ADS } from '../config/ads';

export type AdWatchOutcome = 'rewarded' | 'skipped' | 'failed' | 'unavailable' | 'busy' | 'duplicate';

/** Shows a rewarded ad on explicit player request and grants the reward only on verified completion. */
export class AdController {
  busy = false;

  constructor(private game: () => Game, readonly provider: RewardedAdProvider, private track: (name: string, props: Record<string, unknown>) => void = () => {}) {}

  /** The offer is shown only when a provider can actually serve an ad and the rules allow it. */
  get offerable(): boolean {
    return this.provider.isAvailable() && !this.game().ads.block();
  }

  async watch(): Promise<AdWatchOutcome> {
    if (this.busy) return 'busy';
    if (!this.offerable) return 'unavailable';
    this.busy = true;
    this.track('rewarded_ad_started', { placement: ADS.placement, provider: this.provider.id });
    try {
      const r = await this.provider.show(ADS.placement);
      if (r.status === 'completed') return this.game().ads.grantVerified(r.completionId) ? 'rewarded' : 'duplicate';
      this.track('rewarded_ad_not_completed', { status: r.status });
      return r.status === 'skipped' ? 'skipped' : r.status === 'unavailable' ? 'unavailable' : 'failed';
    } finally {
      this.busy = false;
    }
  }
}
