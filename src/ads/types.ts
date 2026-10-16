/** Outcome of showing one rewarded ad. Only `completed` (confirmed by the provider) earns a reward. */
export type AdShowResult =
  | { status: 'completed'; completionId: string }
  | { status: 'skipped' }
  | { status: 'failed'; message?: string }
  | { status: 'unavailable' };

/**
 * Rewarded-ad provider boundary. A production provider wraps the ad network SDK (via a native
 * bridge or web SDK) and should confirm completions with server-side verification (SSV).
 */
export interface RewardedAdProvider {
  readonly id: string;
  /** True only for the development simulator: the UI labels it and no ad revenue exists. */
  readonly simulated: boolean;
  isAvailable(): boolean;
  show(placement: string): Promise<AdShowResult>;
}

/** Native bridge contract a future iOS/Android ad plugin implements (window.TinyTycoonAds). */
export interface NativeAdBridge {
  isReady(placement: string): boolean;
  showRewarded(placement: string): Promise<{ status: 'completed' | 'skipped' | 'failed'; completionId?: string; message?: string }>;
}

declare global {
  interface Window {
    TinyTycoonAds?: NativeAdBridge;
  }
}
