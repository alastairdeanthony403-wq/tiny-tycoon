/**
 * NotificationService: sparse system notifications (only while the tab is hidden,
 * only when enabled by the player, and rate-limited so they never spam).
 */
export class NotificationService {
  private last = 0;
  minIntervalMs = 10 * 60 * 1000;
  enabled = false;

  get supported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  async requestPermission(): Promise<boolean> {
    if (!this.supported) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      return (await Notification.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  notify(title: string, body: string): void {
    if (!this.enabled || !this.supported || Notification.permission !== 'granted') return;
    if (typeof document !== 'undefined' && !document.hidden) return;
    const now = Date.now();
    if (now - this.last < this.minIntervalMs) return;
    this.last = now;
    try {
      new Notification(title, { body, icon: './icon.svg', tag: 'tiny-tycoon' });
    } catch {
      /* ignore */
    }
  }
}
