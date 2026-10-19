import { ECONOMY } from '../config/economy';
import { EXPANSIONS } from '../config/expansions';
import { LOCATION_MAP } from '../config/locations';
import { DEPARTMENT_MAP } from '../config/departments';
import { MAIN_QUESTS } from '../config/quests';
import { mapFor } from '../world/maps';
import type { AdsState, GameState, MissionsState, MonetizationState, PlacedObject, SettingsState, ShopState, Stats, StoreState } from './types';
import { SAVE_VERSION } from './types';

/** Fixed landmark tiles (never buildable). */
export const DOOR_TILE = { x: 0, y: 1 };
export const STOCKROOM_TILE = { x: 1, y: 0 };

export function defaultSettings(): SettingsState {
  return {
    audioEnabled: true,
    musicEnabled: true,
    effectsEnabled: true,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    vibrationEnabled: true,
    notificationsEnabled: false,
    language: 'en',
    textScale: 1,
    colorblind: false,
    reduceFlashing: false,
    screenShake: true,
    graphics: 'high',
    analyticsConsent: false,
    cameraSensitivity: 1,
    cameraDrag: 'orbit',
    rememberCamera: true,
    cameraLock: true,
    cameraAutoUnlock: true,
  };
}

export function defaultStore(): StoreState {
  return { perks: {}, boosters: {}, purchases: {}, charges: { expansionPermit: 0, offlineBonus: 0 }, claims: [], seen: [] };
}

export function defaultMonetization(): MonetizationState {
  return {
    gemsEarned: 0,
    gemsPurchased: 0,
    totals: { earned: 0, purchased: 0, spent: 0, revoked: 0 },
    entitlements: {},
    processedTx: [],
    ledger: [],
    equipped: { skin: null, outfit: null, accessory: null, display: null, checkout: null, sign: null, entrance: null },
    layouts: {},
    automation: { autoRestock: false },
    pending: [],
    nextLedgerId: 1,
  };
}

export function defaultMissions(): MissionsState {
  return { dailyKey: '', weeklyKey: '', daily: [], weekly: [] };
}

export function defaultAds(): AdsState {
  return { dayKey: '', watchedToday: 0, lastWatchedAt: 0, boostRemaining: 0, processed: [] };
}

export function defaultStats(): Stats {
  return {
    customersServed: 0,
    itemsSold: 0,
    revenue: 0,
    manualRestocks: 0,
    upgradesBought: 0,
    cleaned: 0,
    cratesCollected: 0,
    rushesCompleted: 0,
    happyCustomers: 0,
    angryCustomers: 0,
    staffEverHired: 0,
    taps: 0,
    dailyMissionsClaimed: 0,
    weeklyMissionsClaimed: 0,
    soldByCategory: {},
  };
}

/**
 * Initial layout for the tiny 3×3 shop:
 *   y=0:  .  [stockroom]  shelf(facing +y)
 *   y=1: door   .          .
 *   y=2:  .     .        checkout(facing -x, queue toward the door)
 */
export function createShop(locationId: string, stageOverride?: number): ShopState {
  const loc = LOCATION_MAP[locationId] ?? LOCATION_MAP.neighborhood;
  const stage = stageOverride ?? loc.startStage;
  const size = EXPANSIONS[stage].size;
  const objects: PlacedObject[] = [];
  let uid = 1;
  objects.push({ uid: uid++, kind: 'shelf', x: 2, y: 0, dir: 1, tier: 0, productId: 'crisps', stock: 10, progress: 0 });
  objects.push({ uid: uid++, kind: 'checkout', x: 2, y: 2, dir: 2, tier: 0, stock: 0, progress: 0 });
  const shop: ShopState = {
    locationId: loc.id,
    open: locationId !== 'neighborhood',
    stage,
    size,
    objects,
    nextUid: uid,
    departments: [...loc.startDepartments],
    staff: [],
    dirt: [],
    satisfaction: ECONOMY.satisfaction.start,
    incomeRate: 0,
    pendingPlacements: [],
    purchases: {},
    hires: {},
    plotId: mapFor(loc.id).plots[0].id,
  };
  // Bigger starting locations come with a fridge for drinks.
  if (shop.departments.includes('drinks')) {
    if (size >= 4) shop.objects.push({ uid: shop.nextUid++, kind: 'fridge', x: 3, y: 0, dir: 1, tier: 0, productId: 'soda', stock: 12, progress: 0 });
    else shop.pendingPlacements.push({ kind: 'fridge', productId: 'soda' });
  }
  for (const d of shop.departments) {
    const def = DEPARTMENT_MAP[d];
    if (def?.grants && def.grants.kind !== 'fridge' && d !== 'snacks') shop.pendingPlacements.push({ ...def.grants });
  }
  return shop;
}

export function createInitialState(now = Date.now(), seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  return {
    version: SAVE_VERSION,
    player: {
      money: ECONOMY.startingCash,
      stars: 0,
      xp: 0,
      level: 1,
      reputation: 0,
      currentLocation: 'neighborhood',
      lifetimeRevenue: 0,
      lifetimeCustomers: 0,
      lifetimeProductsSold: 0,
      runRevenue: 0,
      prestigeCount: 0,
    },
    shops: { neighborhood: createShop('neighborhood') },
    progression: {
      unlockedProducts: ['crisps'],
      unlockedLocations: ['neighborhood'],
      mainQuestIndex: 0,
      activeQuests: [{ id: MAIN_QUESTS[0].id, base: 0, completed: false, claimed: false }],
      sideQuestCounter: 0,
      achievements: {},
      milestones: {},
      flags: {},
      tutorialDone: false,
      seenUnlocks: [],
    },
    globalUpgrades: {},
    perks: {},
    cosmetics: { theme: 'classic', unlockedThemes: ['classic'] },
    monetization: defaultMonetization(),
    store: defaultStore(),
    exploration: { found: [] },
    settings: defaultSettings(),
    stats: defaultStats(),
    missions: defaultMissions(),
    ads: defaultAds(),
    events: { active: [], nextRollIn: ECONOMY.events.firstDelay },
    timestamps: { created: now, lastSave: now, lastWage: 0 },
    incomeBuckets: [],
    rngSeed: seed,
  };
}
