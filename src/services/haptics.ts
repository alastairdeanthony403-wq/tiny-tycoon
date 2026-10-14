export class Haptics {
  enabled = true;
  vibrate(pattern: number | number[]): void {
    if (!this.enabled) return;
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
    } catch {
      /* unsupported */
    }
  }
}
