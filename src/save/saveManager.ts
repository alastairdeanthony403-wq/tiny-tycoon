import type { GameState } from '../core/types';
import { SAVE_VERSION } from '../core/types';
import { createInitialState, createShop, defaultMonetization, defaultSettings, defaultStats } from '../core/state';
import { PREMIUM_MAP, MAX_GEMS, LEGACY_PRODUCT_IDS } from '../monetization/catalog';
import type { AdsState, MissionsState, MonetizationState } from '../core/types';
import { ECONOMY } from '../config/economy';
import { OBJECT_MAP } from '../config/objects';
import { PRODUCT_MAP } from '../config/products';
import { LOCATION_MAP } from '../config/locations';
import { EXPANSIONS } from '../config/expansions';
import { STAFF_MAP, STAFF_MAX_LEVEL, TRAIT_MAP } from '../config/staff';

/** Minimal storage interface (localStorage in the browser, a Map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

export const SAVE_KEY = 'tinytycoon.save';
export const BACKUP_KEY = 'tinytycoon.save.bak';
/** Damaged saves are copied here (never deleted silently) before a backup or new game replaces them. */
export const DAMAGED_KEY = 'tinytycoon.save.damaged';

interface SaveEnvelope {
  version: number;
  savedAt: number;
  checksum: string;
  state: unknown;
}

/** Simple string hash (FNV-1a) — detects accidental corruption and casual tampering. */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

type Migration = (s: any) => any;

/** Migrations from version N to N+1. Add an entry whenever the save structure changes. */
export const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: "premiumCurrency" became "stars"; settings gained text scale & graphics; per-shop hire counts.
  1: (s) => {
    if (s.player && s.player.premiumCurrency !== undefined) {
      s.player.stars = (s.player.stars ?? 0) + s.player.premiumCurrency;
      delete s.player.premiumCurrency;
    }
    if (s.settings) {
      s.settings.textScale ??= 1;
      s.settings.graphics ??= 'high';
    }
    for (const shop of Object.values<any>(s.shops ?? {})) shop.hires ??= {};
    return s;
  },
  // v2 → v3: premium store (Gems, entitlements, ledger, layouts). Existing progress is untouched.
  2: (s) => {
    s.monetization ??= defaultMonetization();
    return s;
  },
  // v3 → v4: daily/weekly missions and rewarded-ad state (defaults are filled by validate);
  // two onboarding steps were inserted into the main chain after "hire_1" (old index 9).
  3: (s) => {
    const prog = s.progression;
    if (prog && typeof prog.mainQuestIndex === 'number' && prog.mainQuestIndex >= 10) prog.mainQuestIndex += 2;
    return s;
  },
};

export function migrate(raw: any): any {
  let v = typeof raw?.version === 'number' ? raw.version : 1;
  let s = raw;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (m) s = m(s);
    v++;
    s.version = v;
  }
  return s;
}

const num = (v: unknown, def: number, min = 0, max: number = ECONOMY.maxMoney): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Validates and repairs a (migrated) save: every field is type-checked and clamped,
 * unknown ids are dropped, and anything missing falls back to safe defaults.
 */
export function validate(raw: any, now = Date.now()): GameState {
  const d = createInitialState(now, 1);
  const r = obj(raw);
  const p = obj(r.player);
  const st: GameState = {
    ...d,
    version: SAVE_VERSION,
    player: {
      money: num(p.money, d.player.money),
      stars: Math.floor(num(p.stars, 0, 0, 1e9)),
      xp: num(p.xp, 0),
      level: Math.floor(num(p.level, 1, 1, 999)),
      reputation: num(p.reputation, 0),
      currentLocation: LOCATION_MAP[p.currentLocation] ? p.currentLocation : 'neighborhood',
      lifetimeRevenue: num(p.lifetimeRevenue, 0),
      lifetimeCustomers: num(p.lifetimeCustomers, 0),
      lifetimeProductsSold: num(p.lifetimeProductsSold, 0),
      runRevenue: num(p.runRevenue, 0),
      prestigeCount: Math.floor(num(p.prestigeCount, 0, 0, 1e6)),
      title: typeof p.title === 'string' ? p.title : undefined,
    },
  };
  const prog = obj(r.progression);
  const unlockedLocations = arr<string>(prog.unlockedLocations).filter((id) => LOCATION_MAP[id]);
  if (!unlockedLocations.includes('neighborhood')) unlockedLocations.unshift('neighborhood');
  st.progression = {
    unlockedProducts: [...new Set(arr<string>(prog.unlockedProducts).filter((id) => PRODUCT_MAP[id]))],
    unlockedLocations,
    mainQuestIndex: Math.floor(num(prog.mainQuestIndex, 0, 0, 1000)),
    activeQuests: arr<any>(prog.activeQuests)
      .filter((q) => q && typeof q.id === 'string')
      .map((q) => ({ id: q.id, base: num(q.base, 0), completed: bool(q.completed, false), claimed: bool(q.claimed, false), side: q.side && typeof q.side.stat === 'string' ? { stat: q.side.stat, amount: num(q.side.amount, 1, 1), money: num(q.side.money, 0), xp: num(q.side.xp, 0) } : undefined })),
    sideQuestCounter: Math.floor(num(prog.sideQuestCounter, 0)),
    achievements: Object.fromEntries(Object.entries(obj(prog.achievements)).map(([k, v]) => [k, { unlocked: bool(obj(v).unlocked, false), claimed: bool(obj(v).claimed, false) }])),
    milestones: Object.fromEntries(Object.entries(obj(prog.milestones)).map(([k, v]) => [k, !!v])),
    flags: Object.fromEntries(Object.entries(obj(prog.flags)).map(([k, v]) => [k, !!v])),
    tutorialDone: bool(prog.tutorialDone, false),
    seenUnlocks: arr<string>(prog.seenUnlocks).filter((x) => typeof x === 'string'),
  };
  if (!st.progression.unlockedProducts.includes('crisps')) st.progression.unlockedProducts.unshift('crisps');

  st.shops = {};
  const shops = obj(r.shops);
  for (const id of unlockedLocations) st.shops[id] = validateShop(shops[id], id);
  if (!st.shops[st.player.currentLocation]) st.player.currentLocation = 'neighborhood';

  st.globalUpgrades = Object.fromEntries(Object.entries(obj(r.globalUpgrades)).map(([k, v]) => [k, Math.floor(num(v, 0, 0, 100))]));
  st.perks = Object.fromEntries(Object.entries(obj(r.perks)).map(([k, v]) => [k, Math.floor(num(v, 0, 0, 100))]));
  const cos = obj(r.cosmetics);
  const themes = arr<string>(cos.unlockedThemes).filter((t) => typeof t === 'string');
  if (!themes.includes('classic')) themes.unshift('classic');
  st.cosmetics = { theme: str(cos.theme, 'classic'), unlockedThemes: themes };
  st.monetization = validateMonetization(r.monetization);
  const set = obj(r.settings);
  const ds = defaultSettings();
  st.settings = {
    audioEnabled: bool(set.audioEnabled, ds.audioEnabled),
    musicEnabled: bool(set.musicEnabled, ds.musicEnabled),
    effectsEnabled: bool(set.effectsEnabled, ds.effectsEnabled),
    musicVolume: num(set.musicVolume, ds.musicVolume, 0, 1),
    sfxVolume: num(set.sfxVolume, ds.sfxVolume, 0, 1),
    vibrationEnabled: bool(set.vibrationEnabled, ds.vibrationEnabled),
    notificationsEnabled: bool(set.notificationsEnabled, ds.notificationsEnabled),
    language: str(set.language, ds.language),
    textScale: num(set.textScale, 1, 0.8, 1.6),
    colorblind: bool(set.colorblind, false),
    reduceFlashing: bool(set.reduceFlashing, false),
    screenShake: bool(set.screenShake, true),
    graphics: set.graphics === 'low' ? 'low' : 'high',
    analyticsConsent: bool(set.analyticsConsent, false),
    cameraSensitivity: num(set.cameraSensitivity, 1, 0.25, 3),
    cameraDrag: set.cameraDrag === 'pan' ? 'pan' : 'orbit',
    rememberCamera: bool(set.rememberCamera, true),
  };
  const cam = obj(r.camera);
  if (r.camera && Number.isFinite(cam.yaw) && Number.isFinite(cam.pitch)) {
    st.camera = { yaw: num(cam.yaw, 0, -1e6, 1e6) % 360, pitch: num(cam.pitch, 30, 20, 60), zoom: num(cam.zoom, 1, 0.5, 3), panX: num(cam.panX, 0, -50, 50), panY: num(cam.panY, 0, -50, 50) };
  }
  const stats = obj(r.stats);
  const ds2 = defaultStats();
  st.stats = { ...ds2 };
  for (const k of Object.keys(ds2) as (keyof typeof ds2)[]) {
    if (k === 'soldByCategory') continue;
    (st.stats as any)[k] = num(stats[k], 0);
  }
  st.stats.soldByCategory = Object.fromEntries(Object.entries(obj(stats.soldByCategory)).map(([k, v]) => [k, num(v, 0)]));
  st.missions = validateMissions(r.missions);
  st.ads = validateAds(r.ads);
  const ev = obj(r.events);
  st.events = {
    active: arr<any>(ev.active).filter((e) => e && typeof e.id === 'string').map((e) => ({ id: e.id, remaining: num(e.remaining, 0, 0, 600), duration: num(e.duration, 1, 1, 600), served: num(e.served, 0), lost: num(e.lost, 0), earned: num(e.earned, 0) })),
    nextRollIn: num(ev.nextRollIn, ECONOMY.events.firstDelay, 0, 3600),
  };
  const ts = obj(r.timestamps);
  st.timestamps = { created: num(ts.created, now, 0, 1e15), lastSave: num(ts.lastSave, now, 0, 1e15), lastWage: 0 };
  const po = obj(r.pendingOffline);
  if (r.pendingOffline && !po.claimed) st.pendingOffline = { seconds: num(po.seconds, 0), amount: num(po.amount, 0), claimed: false };
  st.incomeBuckets = arr<number>(r.incomeBuckets).map((v) => num(v, 0)).slice(-30);
  st.rngSeed = Math.floor(num(r.rngSeed, 1, 0, 2 ** 31));
  return st;
}

const dateKey = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

function validateMissions(raw: unknown): MissionsState {
  const m = obj(raw);
  const list = (v: unknown) =>
    arr<any>(v)
      .filter((x) => x && typeof x.id === 'string' && typeof x.stat === 'string')
      .slice(0, 6)
      .map((x) => ({ id: x.id, stat: x.stat, base: num(x.base, 0), target: Math.max(1, Math.floor(num(x.target, 1, 1))), money: num(x.money, 0), xp: Math.floor(num(x.xp, 0, 0, 1e6)), gems: Math.floor(num(x.gems, 0, 0, 100)), completed: bool(x.completed, false), claimed: bool(x.claimed, false) }));
  return { dailyKey: dateKey(m.dailyKey), weeklyKey: dateKey(m.weeklyKey), daily: list(m.daily), weekly: list(m.weekly) };
}

function validateAds(raw: unknown): AdsState {
  const a = obj(raw);
  return {
    dayKey: dateKey(a.dayKey),
    watchedToday: Math.floor(num(a.watchedToday, 0, 0, 100)),
    lastWatchedAt: num(a.lastWatchedAt, 0, 0, 1e15),
    boostRemaining: num(a.boostRemaining, 0, 0, 3600),
    processed: arr<string>(a.processed).filter((x) => typeof x === 'string').slice(-200),
  };
}

const gemInt = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? Math.min(MAX_GEMS, Math.max(0, v)) : 0);

/** Keeps only well-formed premium data; unknown products and malformed entries are dropped. */
export function validateMonetization(raw: unknown): MonetizationState {
  const d = defaultMonetization();
  const m = obj(raw);
  if (!raw) return d;
  const tot = obj(m.totals);
  const ents: MonetizationState['entitlements'] = {};
  for (const [rawId, e] of Object.entries(obj(m.entitlements))) {
    const id = LEGACY_PRODUCT_IDS[rawId] ?? rawId;
    const v = obj(e);
    if (!PREMIUM_MAP[id as keyof typeof PREMIUM_MAP] || typeof v.txId !== 'string') continue;
    ents[id] = { source: v.source === 'gems' ? 'gems' : 'iap', txId: v.txId, test: bool(v.test, false), at: num(v.at, 0, 0, 1e15) };
  }
  const eq = obj(m.equipped);
  const layouts: MonetizationState['layouts'] = {};
  for (const [loc, list] of Object.entries(obj(m.layouts))) {
    if (!LOCATION_MAP[loc]) continue;
    layouts[loc] = arr<any>(list)
      .slice(0, 16)
      .map((l) =>
        l && typeof l === 'object'
          ? { name: str(l.name, 'Layout').slice(0, 40), size: Math.floor(num(l.size, 3, 3, 12)), at: num(l.at, 0, 0, 1e15), objects: arr<any>(l.objects).filter((o) => o && Number.isInteger(o.uid) && Number.isInteger(o.x) && Number.isInteger(o.y)).map((o) => ({ uid: o.uid, kind: str(o.kind, ''), x: o.x, y: o.y, dir: ([0, 1, 2, 3].includes(o.dir) ? o.dir : 1) as 0 | 1 | 2 | 3 })) }
          : null,
      );
  }
  return {
    gemsEarned: gemInt(m.gemsEarned),
    gemsPurchased: gemInt(m.gemsPurchased),
    totals: { earned: gemInt(tot.earned), purchased: gemInt(tot.purchased), spent: gemInt(tot.spent), revoked: gemInt(tot.revoked) },
    entitlements: ents,
    processedTx: arr<string>(m.processedTx).filter((x) => typeof x === 'string').slice(-5000),
    ledger: arr<any>(m.ledger).filter((l) => l && typeof l.id === 'string').slice(-200).map((l) => ({ id: l.id, kind: ['earn', 'purchase', 'spend', 'revoke', 'entitlement'].includes(l.kind) ? l.kind : 'earn', gems: typeof l.gems === 'number' && Number.isSafeInteger(l.gems) ? l.gems : 0, productId: typeof l.productId === 'string' ? LEGACY_PRODUCT_IDS[l.productId] ?? l.productId : undefined, txId: typeof l.txId === 'string' ? l.txId : undefined, source: str(l.source, ''), test: bool(l.test, false), at: num(l.at, 0, 0, 1e15) })),
    equipped: { skin: typeof eq.skin === 'string' ? eq.skin : null, outfit: typeof eq.outfit === 'string' ? eq.outfit : null },
    layouts,
    automation: { autoRestock: bool(obj(m.automation).autoRestock, false) },
    pending: arr<any>(m.pending).filter((x) => x && typeof x.txId === 'string' && PREMIUM_MAP[(LEGACY_PRODUCT_IDS[x.productId] ?? x.productId) as keyof typeof PREMIUM_MAP]).map((x) => ({ txId: x.txId, productId: LEGACY_PRODUCT_IDS[x.productId] ?? x.productId, state: x.state === 'purchased' ? 'purchased' : 'pending', at: num(x.at, 0, 0, 1e15) })),
    nextLedgerId: Math.floor(num(m.nextLedgerId, 1, 1, 1e12)),
  };
}

function validateShop(raw: any, id: string) {
  const def = createShop(id);
  const s = obj(raw);
  if (!raw) return def;
  const stage = Math.floor(num(s.stage, def.stage, 0, EXPANSIONS.length - 1));
  const size = EXPANSIONS[stage].size;
  const seen = new Set<string>();
  const uids = new Set<number>();
  const objects = arr<any>(s.objects)
    .filter((o) => o && OBJECT_MAP[o.kind] && Number.isInteger(o.x) && Number.isInteger(o.y) && o.x >= 0 && o.y >= 0 && o.x < size && o.y < size)
    .filter((o) => {
      const k = `${o.x},${o.y}`;
      if (seen.has(k) || uids.has(o.uid)) return false;
      seen.add(k);
      uids.add(o.uid);
      return true;
    })
    .map((o) => {
      const odef = OBJECT_MAP[o.kind];
      return {
        uid: Math.floor(num(o.uid, 0, 1, 1e9)),
        kind: o.kind,
        x: o.x,
        y: o.y,
        dir: ([0, 1, 2, 3].includes(o.dir) ? o.dir : 1) as 0 | 1 | 2 | 3,
        tier: Math.floor(num(o.tier, 0, 0, odef.tiers.length - 1)),
        productId: PRODUCT_MAP[o.productId] ? o.productId : undefined,
        stock: Math.floor(num(o.stock, 0, 0, 1000)),
        progress: num(o.progress, 0, 0, 1),
      };
    });
  // A shop must always keep a checkout and a display; restore defaults if the save lost them.
  const hasCheckout = objects.some((o) => o.kind === 'checkout');
  const hasDisplay = objects.some((o) => OBJECT_MAP[o.kind].category === 'display');
  const finalObjects = hasCheckout && hasDisplay ? objects : def.objects;
  const maxUid = finalObjects.reduce((m, o) => Math.max(m, o.uid), 0);
  return {
    locationId: id,
    open: bool(s.open, def.open),
    stage,
    size,
    objects: finalObjects,
    nextUid: Math.max(maxUid + 1, Math.floor(num(s.nextUid, 1, 1, 1e9))),
    departments: [...new Set(arr<string>(s.departments).filter((d) => typeof d === 'string'))].length ? [...new Set(arr<string>(s.departments))] : def.departments,
    staff: arr<any>(s.staff)
      .filter((e) => e && STAFF_MAP[e.type as keyof typeof STAFF_MAP])
      .map((e) => ({ id: Math.floor(num(e.id, 1, 1, 1e9)), type: e.type, name: str(e.name, 'Sam'), level: Math.floor(num(e.level, 1, 1, STAFF_MAX_LEVEL)), trait: TRAIT_MAP[e.trait] ? e.trait : 'fast', assignedUid: undefined })),
    dirt: arr<any>(s.dirt).filter((d) => d && Number.isInteger(d.x) && Number.isInteger(d.y) && d.x >= 0 && d.y >= 0 && d.x < size && d.y < size).slice(0, 50),
    satisfaction: num(s.satisfaction, def.satisfaction, 0, 100),
    incomeRate: num(s.incomeRate, 0, 0, 1e12),
    construction: s.construction ? { targetStage: Math.min(EXPANSIONS.length - 1, Math.floor(num(s.construction.targetStage, stage + 1))), remaining: num(s.construction.remaining, 0, 0, 60), duration: num(s.construction.duration, 1, 0.1, 60) } : undefined,
    pendingPlacements: arr<any>(s.pendingPlacements).filter((p) => p && OBJECT_MAP[p.kind]).map((p) => ({ kind: p.kind, productId: PRODUCT_MAP[p.productId] ? p.productId : undefined })),
    purchases: Object.fromEntries(Object.entries(obj(s.purchases)).map(([k, v]) => [k, num(v, 0)])),
    hires: Object.fromEntries(Object.entries(obj(s.hires)).map(([k, v]) => [k, num(v, 0)])),
  };
}

export interface LoadResult {
  state: GameState;
  source: 'main' | 'backup' | 'new';
  migratedFrom?: number;
  error?: string;
  /** Set when an unreadable save was found: loaded the backup instead, or had to start fresh. */
  recovered?: 'backup' | 'new_game';
}

/**
 * SaveManager: versioned saves with checksum, automatic backup of the previous good save,
 * migration of old versions and validation/repair on load.
 */
export class SaveManager {
  lastError?: string;

  constructor(private store: KeyValueStore) {}

  serialize(state: GameState, now = Date.now()): string {
    state.timestamps.lastSave = now;
    const body = JSON.stringify(state);
    const env: SaveEnvelope = { version: SAVE_VERSION, savedAt: now, checksum: checksum(body), state };
    return JSON.stringify(env);
  }

  save(state: GameState, now = Date.now()): boolean {
    try {
      const data = this.serialize(state, now);
      const prev = this.store.getItem(SAVE_KEY);
      if (prev && this.parse(prev)) this.store.setItem(BACKUP_KEY, prev);
      this.store.setItem(SAVE_KEY, data);
      return true;
    } catch (e) {
      this.lastError = String(e);
      return false;
    }
  }

  /** Parses an envelope; returns null when corrupt or checksum mismatch. */
  parse(text: string): { state: any; version: number } | null {
    try {
      const env = JSON.parse(text) as Partial<SaveEnvelope>;
      if (!env || typeof env !== 'object' || !env.state) return null;
      const body = JSON.stringify(env.state);
      if (env.checksum && env.checksum !== checksum(body)) return null;
      return { state: env.state, version: typeof env.version === 'number' ? env.version : 1 };
    } catch {
      return null;
    }
  }

  /** Keeps an unreadable save so a later fix (or support) can still recover it. */
  private quarantine(text: string): void {
    try {
      if (!this.store.getItem(DAMAGED_KEY)) this.store.setItem(DAMAGED_KEY, text);
    } catch {
      /* storage full: nothing more we can do */
    }
  }

  load(now = Date.now()): LoadResult {
    let damaged = false;
    for (const [key, source] of [
      [SAVE_KEY, 'main'],
      [BACKUP_KEY, 'backup'],
    ] as const) {
      const text = this.store.getItem(key);
      if (!text) continue;
      const parsed = this.parse(text);
      if (!parsed) {
        this.lastError = `corrupt ${source} save`;
        this.quarantine(text);
        damaged = true;
        continue;
      }
      try {
        const fromVersion = parsed.version;
        const migrated = migrate({ ...parsed.state, version: parsed.state.version ?? fromVersion });
        const state = validate(migrated, now);
        return { state, source, migratedFrom: fromVersion < SAVE_VERSION ? fromVersion : undefined, recovered: damaged ? 'backup' : undefined };
      } catch (e) {
        this.lastError = String(e);
        this.quarantine(text);
        damaged = true;
      }
    }
    return { state: createInitialState(now), source: 'new', error: damaged ? this.lastError : undefined, recovered: damaged ? 'new_game' : undefined };
  }

  hasSave(): boolean {
    return !!this.store.getItem(SAVE_KEY) || !!this.store.getItem(BACKUP_KEY);
  }

  reset(): void {
    this.store.removeItem(SAVE_KEY);
    this.store.removeItem(BACKUP_KEY);
  }
}
