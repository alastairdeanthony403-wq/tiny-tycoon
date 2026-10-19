/** Serializable game state. Runtime-only data (NPC positions etc.) lives in sim/world.ts. */
import type { StaffType } from '../config/staff';

export const SAVE_VERSION = 5;

export type Dir = 0 | 1 | 2 | 3; // 0:+x 1:+y 2:-x 3:-y

export interface PlacedObject {
  uid: number;
  kind: string;
  x: number;
  y: number;
  dir: Dir;
  tier: number; // 0-based
  productId?: string;
  stock: number;
  /** Fractional restock/production progress. */
  progress: number;
}

export interface EmployeeData {
  id: number;
  type: StaffType;
  name: string;
  level: number;
  trait: string;
  assignedUid?: number;
}

export interface DirtSpot {
  x: number;
  y: number;
}

export interface Construction {
  targetStage: number;
  remaining: number;
  duration: number;
}

export interface ShopState {
  locationId: string;
  open: boolean;
  stage: number;
  size: number;
  objects: PlacedObject[];
  nextUid: number;
  departments: string[];
  staff: EmployeeData[];
  dirt: DirtSpot[];
  satisfaction: number;
  /** Measured income per second (used for inactive-shop and offline income). */
  incomeRate: number;
  construction?: Construction;
  /** Free objects granted (e.g. by a department) that still need a spot. */
  pendingPlacements: { kind: string; productId?: string }[];
  /** Counts of each object kind ever bought here (drives cost scaling). */
  purchases: Record<string, number>;
  hires: Record<string, number>;
  /** Plot of the location's world map the shop stands on (see world/maps.ts). */
  plotId: string;
}

export interface PlayerState {
  money: number;
  stars: number;
  xp: number;
  level: number;
  reputation: number;
  currentLocation: string;
  lifetimeRevenue: number;
  lifetimeCustomers: number;
  lifetimeProductsSold: number;
  runRevenue: number;
  prestigeCount: number;
  title?: string;
}

export interface QuestProgress {
  id: string;
  base: number;
  completed: boolean;
  claimed: boolean;
  /** Generated side quests store their goal inline. */
  side?: { stat: string; amount: number; money: number; xp: number };
}

export interface ProgressionState {
  unlockedProducts: string[];
  unlockedLocations: string[];
  mainQuestIndex: number;
  activeQuests: QuestProgress[];
  sideQuestCounter: number;
  achievements: Record<string, { unlocked: boolean; claimed: boolean }>;
  milestones: Record<string, boolean>;
  flags: Record<string, boolean>;
  tutorialDone: boolean;
  seenUnlocks: string[];
}

export interface Stats {
  customersServed: number;
  itemsSold: number;
  revenue: number;
  manualRestocks: number;
  upgradesBought: number;
  cleaned: number;
  cratesCollected: number;
  rushesCompleted: number;
  happyCustomers: number;
  angryCustomers: number;
  staffEverHired: number;
  taps: number;
  dailyMissionsClaimed: number;
  weeklyMissionsClaimed: number;
  soldByCategory: Record<string, number>;
}

export interface SettingsState {
  audioEnabled: boolean;
  musicEnabled: boolean;
  effectsEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  language: string;
  textScale: number;
  colorblind: boolean;
  reduceFlashing: boolean;
  screenShake: boolean;
  graphics: 'low' | 'high';
  /** Opt-in for sending anonymous analytics to a configured provider (off by default). */
  analyticsConsent: boolean;
  /** Camera drag/rotate speed multiplier. */
  cameraSensitivity: number;
  /** What a one-finger / left-button drag does. */
  cameraDrag: 'orbit' | 'pan';
  /** Restore the last camera angle, zoom and pan when returning. */
  rememberCamera: boolean;
  /** Shop Lock: keep the camera focused on the shop (off = free exploration of the world). */
  cameraLock: boolean;
  /** Dragging past the Shop Lock limit switches to Free Explore. */
  cameraAutoUnlock: boolean;
}

/** Last camera view (only used when settings.rememberCamera is on). */
export interface CameraState {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface ActiveEvent {
  id: string;
  remaining: number;
  duration: number;
  served: number;
  lost: number;
  earned: number;
}

export interface EventsState {
  active: ActiveEvent[];
  nextRollIn: number;
  offer?: { id: string; expires: number };
  crate?: { x: number; y: number; expires: number };
}

export interface LedgerEntry {
  id: string;
  kind: 'earn' | 'purchase' | 'spend' | 'revoke' | 'entitlement';
  /** Signed gem delta (0 for pure entitlement entries). */
  gems: number;
  productId?: string;
  txId?: string;
  source: string;
  test: boolean;
  at: number;
}

export interface Entitlement {
  source: 'iap' | 'gems';
  txId: string;
  test: boolean;
  at: number;
}

export interface SavedLayout {
  name: string;
  size: number;
  objects: { uid: number; kind: string; x: number; y: number; dir: Dir }[];
  at: number;
}

export interface MonetizationState {
  gemsEarned: number;
  gemsPurchased: number;
  totals: { earned: number; purchased: number; spent: number; revoked: number };
  entitlements: Record<string, Entitlement>;
  /** Transaction ids already granted: the client-side idempotency record. */
  processedTx: string[];
  /** Most recent ledger entries (capped); totals above are lifetime. */
  ledger: LedgerEntry[];
  equipped: { skin: string | null; outfit: string | null; accessory?: string | null; display?: string | null; checkout?: string | null; sign?: string | null; entrance?: string | null };
  /** Per location: saved layouts (index = slot). */
  layouts: Record<string, (SavedLayout | null)[]>;
  automation: { autoRestock: boolean };
  /** Purchases started but not finished (pending approval or awaiting verification). */
  pending: { txId: string; productId: string; state: 'pending' | 'purchased'; at: number }[];
  nextLedgerId: number;
}

/** Store state that isn't an entitlement: Gem upgrade levels, timers, charges, limits, one-time claims. */
export interface StoreState {
  /** Gem upgrade levels by perk id. */
  perks: Record<string, number>;
  /** Remaining active-play seconds per booster id. */
  boosters: Record<string, number>;
  /** Repeatable purchases per item: lifetime count and today's count (UTC day key). */
  purchases: Record<string, { total: number; day: string; today: number }>;
  /** Unused one-shot charges. */
  charges: { expansionPermit: number; offlineBonus: number };
  /** One-time Gem reward keys already granted (level:12, tier:super, event:autumn_market…). */
  claims: string[];
  /** Unlocked items the player has already seen in the store (for "recently unlocked"). */
  seen: string[];
}

/** One issued daily/weekly mission: progress = stat gained since `base`. */
export interface MissionProgress {
  id: string;
  stat: string;
  base: number;
  target: number;
  money: number;
  xp: number;
  gems: number;
  completed: boolean;
  claimed: boolean;
}

export interface MissionsState {
  /** UTC date (YYYY-MM-DD) the daily set was issued for. */
  dailyKey: string;
  /** UTC date of the Monday that starts the weekly set. */
  weeklyKey: string;
  daily: MissionProgress[];
  weekly: MissionProgress[];
}

/** Rewarded-ad offers: cooldowns, daily caps and the active timed boost. */
export interface AdsState {
  dayKey: string;
  watchedToday: number;
  lastWatchedAt: number;
  boostRemaining: number;
  processed: string[];
}

export interface GameState {
  version: number;
  player: PlayerState;
  shops: Record<string, ShopState>;
  progression: ProgressionState;
  globalUpgrades: Record<string, number>;
  perks: Record<string, number>;
  cosmetics: { theme: string; unlockedThemes: string[] };
  monetization: MonetizationState;
  store: StoreState;
  missions: MissionsState;
  ads: AdsState;
  camera?: CameraState;
  /** Discovered world artefacts (ids from world/maps.ts). */
  exploration: { found: string[] };
  settings: SettingsState;
  stats: Stats;
  events: EventsState;
  timestamps: { created: number; lastSave: number; lastWage: number };
  pendingOffline?: { seconds: number; amount: number; claimed: boolean };
  /** Rolling income buckets (10s each) used to compute offline income rate. */
  incomeBuckets: number[];
  rngSeed: number;
  debug?: { forcedSeason?: string | null };
}
