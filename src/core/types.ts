/** Serializable game state. Runtime-only data (NPC positions etc.) lives in sim/world.ts. */
import type { StaffType } from '../config/staff';

export const SAVE_VERSION = 3;

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
  equipped: { skin: string | null; outfit: string | null };
  /** Per location: saved layouts (index = slot). */
  layouts: Record<string, (SavedLayout | null)[]>;
  automation: { autoRestock: boolean };
  /** Purchases started but not finished (pending approval or awaiting verification). */
  pending: { txId: string; productId: string; state: 'pending' | 'purchased'; at: number }[];
  nextLedgerId: number;
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
