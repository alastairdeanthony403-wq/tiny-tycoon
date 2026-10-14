import type { AdShowResult, NativeAdBridge, RewardedAdProvider } from './types';

/** No ad network configured: offers are hidden and nothing is ever shown. */
export class NoAdProvider implements RewardedAdProvider {
  readonly id = 'none';
  readonly simulated = false;
  isAvailable(): boolean {
    return false;
  }
  async show(): Promise<AdShowResult> {
    return { status: 'unavailable' };
  }
}

/**
 * DEVELOPMENT ONLY. Simulates a rewarded ad (no network, no ad revenue). Used in dev builds or
 * builds made with VITE_SIMULATED_ADS=1, and always labelled as a simulation in the UI.
 */
export class SimulatedAdProvider implements RewardedAdProvider {
  readonly id = 'simulated';
  readonly simulated = true;
  /** Test hook: what the next ad does. */
  scenario: 'complete' | 'skip' | 'fail' | 'duplicate' = 'complete';
  latency = 0;
  private n = 0;
  private lastId = '';

  isAvailable(): boolean {
    return true;
  }

  async show(): Promise<AdShowResult> {
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency));
    if (this.scenario === 'skip') return { status: 'skipped' };
    if (this.scenario === 'fail') return { status: 'failed', message: 'simulated failure' };
    if (this.scenario === 'duplicate' && this.lastId) return { status: 'completed', completionId: this.lastId };
    this.lastId = `simad-${Date.now().toString(36)}-${++this.n}`;
    return { status: 'completed', completionId: this.lastId };
  }
}

/** Production boundary: forwards to a native ad plugin when the app shell provides one. */
export class NativeAdBridgeProvider implements RewardedAdProvider {
  readonly id = 'native';
  readonly simulated = false;
  constructor(private bridge: NativeAdBridge, private placement: string) {}

  isAvailable(): boolean {
    try {
      return this.bridge.isReady(this.placement);
    } catch {
      return false;
    }
  }

  async show(placement: string): Promise<AdShowResult> {
    try {
      const r = await this.bridge.showRewarded(placement);
      if (r.status === 'completed' && r.completionId) return { status: 'completed', completionId: r.completionId };
      if (r.status === 'skipped') return { status: 'skipped' };
      return { status: 'failed', message: r.message };
    } catch (e) {
      return { status: 'failed', message: String(e) };
    }
  }
}
