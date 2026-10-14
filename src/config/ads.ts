/** Optional rewarded-ad offer (balance values). The game never requires ads. */
export const ADS = {
  /** Sale prices are multiplied by this while the boost runs. */
  boostPriceMult: 1.5,
  /** Boost length in simulated seconds. */
  boostSeconds: 300,
  /** Real-time gap between two ads. */
  cooldownMs: 30 * 60 * 1000,
  /** Maximum rewarded ads per UTC day. */
  dailyCap: 4,
  placement: 'income_boost',
};
