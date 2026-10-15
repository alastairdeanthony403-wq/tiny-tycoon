/**
 * Typed event bus. Simulation systems emit; UI, audio, VFX, analytics subscribe.
 * Listener errors are caught so a broken subscriber can never break the simulation.
 */
export interface GameEvents {
  sale: { amount: number; x: number; y: number; items: number; tip: number };
  moneySpent: { amount: number };
  purchaseFailed: { reason: string };
  upgradePurchased: { id: string; level: number; x?: number; y?: number };
  objectPlaced: { uid: number; kind: string; x: number; y: number };
  objectUpgraded: { uid: number; kind: string; level: number; x: number; y: number };
  objectRemoved: { uid: number };
  restocked: { uid: number; x: number; y: number; amount: number; manual: boolean };
  lowStock: { uid: number; productId: string };
  outOfStock: { uid: number; productId: string };
  levelUp: { level: number; unlocks: UnlockInfo[]; reward: { money: number; stars: number } };
  xpGained: { amount: number };
  reputationTier: { tier: number; up: boolean };
  productUnlocked: { id: string };
  departmentUnlocked: { id: string };
  expansionStarted: { size: number; duration: number };
  expansionCompleted: { size: number };
  employeeHired: { id: number; type: string; name: string };
  employeeFired: { id: number };
  employeeLeveled: { id: number; level: number };
  customerSpawned: { id: number; type: string };
  customerLeftAngry: { id: number; x: number; y: number };
  customerHappy: { id: number; x: number; y: number };
  questCompleted: { id: string };
  questClaimed: { id: string; money: number; stars: number; xp: number };
  milestone: { id: string };
  achievementUnlocked: { id: string };
  achievementClaimed: { id: string; stars: number };
  tutorialCompleted: { skipped: boolean };
  tierReached: { tier: string; stage: number };
  missionsReset: { kind: 'daily' | 'weekly' };
  missionCompleted: { kind: 'daily' | 'weekly'; id: string };
  missionClaimed: { kind: 'daily' | 'weekly'; id: string; money: number; xp: number; gems: number };
  adBoostStarted: { seconds: number };
  adBoostEnded: Record<string, never>;
  eventOffered: { id: string };
  eventStarted: { id: string; duration: number };
  eventEnded: { id: string; summary?: RushSummary };
  crateSpawned: { x: number; y: number };
  crateCollected: { money: number; stars: number; xp: number; x: number; y: number };
  dirtCleaned: { x: number; y: number };
  locationUnlocked: { id: string };
  locationSwitched: { id: string };
  franchised: { stars: number; count: number };
  offlineEarnings: { seconds: number; amount: number };
  tapBoost: { uid: number; x: number; y: number };
  stateChanged: { reason: string };
  layoutChanged: Record<string, never>;
  notify: { key: string; vars?: Record<string, string | number>; icon?: string };
  error: { where: string; message: string };
  gemsChanged: { delta: number; reason: string };
  premiumGranted: { productId: string; test: boolean };
  premiumRevoked: { productId: string };
}

export interface UnlockInfo {
  kind: 'product' | 'department' | 'upgrade' | 'staff' | 'location' | 'customer' | 'feature' | 'decor';
  id: string;
}

export interface RushSummary {
  served: number;
  lost: number;
  money: number;
  xp: number;
  success: boolean;
}

type Listener<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof GameEvents, Set<Listener<any>>>();
  private anyListeners = new Set<(type: keyof GameEvents, payload: unknown) => void>();

  on<K extends keyof GameEvents>(type: K, fn: Listener<GameEvents[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  onAny(fn: (type: keyof GameEvents, payload: unknown) => void): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(type);
    if (set) {
      for (const fn of set) {
        try {
          fn(payload);
        } catch (e) {
          console.error(`[bus] listener for ${String(type)} failed`, e);
        }
      }
    }
    for (const fn of this.anyListeners) {
      try {
        fn(type, payload);
      } catch (e) {
        console.error('[bus] any-listener failed', e);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
