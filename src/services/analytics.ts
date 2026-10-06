/**
 * AnalyticsManager: optional event hooks. The game works without any sink attached.
 * Plug a real provider in by calling `addSink`.
 */
export type AnalyticsEvent =
  | 'game_started'
  | 'tutorial_completed'
  | 'product_unlocked'
  | 'upgrade_purchased'
  | 'shop_expanded'
  | 'employee_hired'
  | 'location_unlocked'
  | 'prestige_completed'
  | 'achievement_completed'
  | 'session_started'
  | 'session_ended';

type Sink = (name: string, props: Record<string, unknown>) => void;

export class AnalyticsManager {
  private sinks: Sink[] = [];
  readonly buffer: { name: string; props: Record<string, unknown>; at: number }[] = [];

  addSink(s: Sink): void {
    this.sinks.push(s);
  }

  track(name: AnalyticsEvent | string, props: Record<string, unknown> = {}): void {
    const at = Date.now();
    this.buffer.push({ name, props, at });
    if (this.buffer.length > 200) this.buffer.shift();
    for (const s of this.sinks) {
      try {
        s(name, props);
      } catch {
        /* never let analytics break gameplay */
      }
    }
  }
}
