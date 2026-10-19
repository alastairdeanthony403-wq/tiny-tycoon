/**
 * AnalyticsManager: one adapter for gameplay analytics and error reports.
 *
 * - Without a provider (the default) events stay in a small in-memory buffer used for
 *   debugging; nothing leaves the device.
 * - A provider (e.g. a native analytics/crash plugin exposed as window.TinyTycoonAnalytics)
 *   receives events only after the player has opted in (`consent`).
 * Events never contain names, payment details or other personal data.
 */
export type AnalyticsEvent =
  | 'game_started'
  | 'tutorial_started'
  | 'tutorial_completed'
  | 'tutorial_skipped'
  | 'first_sale'
  | 'goal_completed'
  | 'mission_completed'
  | 'mission_claimed'
  | 'level_up'
  | 'product_unlocked'
  | 'upgrade_purchased'
  | 'shop_expanded'
  | 'employee_hired'
  | 'location_unlocked'
  | 'plot_changed'
  | 'artefact_found'
  | 'prestige_completed'
  | 'achievement_completed'
  | 'premium_shop_opened'
  | 'store_opened'
  | 'store_category_selected'
  | 'store_item_viewed'
  | 'store_purchase_succeeded'
  | 'store_purchase_failed'
  | 'currency_earned'
  | 'currency_spent'
  | 'booster_activated'
  | 'cosmetic_previewed'
  | 'cosmetic_unlocked'
  | 'cosmetic_equipped'
  | 'purchase_initiated'
  | 'purchase_result'
  | 'rewarded_ad_started'
  | 'rewarded_ad_completed'
  | 'rewarded_ad_not_completed'
  | 'save_failed'
  | 'save_load_recovered'
  | 'client_error'
  | 'session_started'
  | 'session_ended';

type Sink = (name: string, props: Record<string, unknown>) => void;

export interface AnalyticsProvider {
  readonly name: string;
  track: Sink;
}

/** Contract a native shell can expose to forward events to its analytics/crash SDK. */
export interface NativeAnalyticsBridge {
  name?: string;
  track(name: string, props: Record<string, unknown>): void;
}

declare global {
  interface Window {
    TinyTycoonAnalytics?: NativeAnalyticsBridge;
  }
}

const FORBIDDEN_KEYS = /name|email|card|token|receipt|password|address|phone/i;

export class AnalyticsManager {
  private debugSinks: Sink[] = [];
  provider: AnalyticsProvider | null = null;
  /** Player opt-in for sending events to the provider. */
  consent = false;
  readonly buffer: { name: string; props: Record<string, unknown>; at: number }[] = [];

  /** Local debug sinks (console in dev builds). Never network. */
  addSink(s: Sink): void {
    this.debugSinks.push(s);
  }

  setProvider(p: AnalyticsProvider | null): void {
    this.provider = p;
  }

  get sending(): boolean {
    return !!this.provider && this.consent;
  }

  track(name: AnalyticsEvent | string, props: Record<string, unknown> = {}): void {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (FORBIDDEN_KEYS.test(k)) continue;
      clean[k] = typeof v === 'string' ? v.slice(0, 200) : v;
    }
    const at = Date.now();
    this.buffer.push({ name, props: clean, at });
    if (this.buffer.length > 200) this.buffer.shift();
    const sinks = [...this.debugSinks, ...(this.sending && this.provider ? [this.provider.track] : [])];
    for (const s of sinks) {
      try {
        s(name, clean);
      } catch {
        /* never let analytics break gameplay */
      }
    }
  }

  /** Crash/error reporting through the same adapter (respects consent like any other event). */
  reportError(where: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.track('client_error', { where, message: message.slice(0, 200) });
  }
}
