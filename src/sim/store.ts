import type { Game } from './game';
import type { StoreState } from '../core/types';
import { PREMIUM_MAP, PREMIUM_CATALOG, RESOURCE_PRODUCTS, gemPriceFor } from '../monetization/catalog';
import type { PremiumProduct, PremiumProductId, Requirements, ResourceKind } from '../monetization/catalog';
import { BOOSTERS, GEM_PERKS, GEM_REWARDS, RESOURCES, STORE_EVENTS, STYLE_SLOTS } from '../config/store';
import type { BoosterDef, BoosterId, GemPerkDef, GemPerkId, StoreEventDef, StyleSlot } from '../config/store';
import { SHOP_TIERS, tierIndexOfStage } from '../config/shopTiers';
import { STAFF_MAX_LEVEL } from '../config/staff';
import { xpForLevel } from '../config/economy';
import { dayKey } from './missions';

export type StoreFailReason =
  | 'unknown' // no such item
  | 'busy' // another purchase is being applied
  | 'locked' // unlock requirements not met
  | 'owned' // unique item already owned
  | 'owned_part' // a bundle's unique item is already owned
  | 'max_level' // Gem upgrade fully upgraded
  | 'daily_limit' // repeatable item bought as often as allowed today
  | 'charge_held' // an unused charge of this kind is already waiting
  | 'nothing_to_do' // the item would have no effect right now (e.g. every shelf is already full)
  | 'not_for_gems' // can only be bought through the platform store
  | 'insufficient' // not enough Gems
  | 'failed'; // applying the reward failed: the Gems were returned

export type StoreResult = { ok: true; txId: string } | { ok: false; reason: StoreFailReason };

export interface RequirementRow {
  key: keyof Requirements;
  need: number | string;
  have: number | string;
  met: boolean;
}

/** Highest tier index per Requirements['tier'] name. */
const TIER_INDEX: Record<string, number> = Object.fromEntries(SHOP_TIERS.map((t, i) => [t.id, i]));
const DAY = 86_400_000;

/**
 * StoreManager: the single purchase path for everything bought with Gems, plus the effects those
 * purchases have on the game (Gem upgrades, timed boosters, one-shot charges) and the one-time
 * Gem rewards for progression. Every purchase is: resolve → requirements → ownership/limits →
 * availability → price → affordability → deduct once → grant (all or nothing) → record.
 * If granting throws, every partial change is undone and the Gems are returned.
 */
export class StoreManager {
  private busy = false;

  constructor(private game: Game) {
    const bus = game.bus;
    bus.on('levelUp', ({ level }) => this.earnOnce(`level:${level}`, GEM_REWARDS.levelUp.perLevel + (level % 5 === 0 ? GEM_REWARDS.levelUp.bonusEvery5 : 0), 'level_up'));
    bus.on('tierReached', ({ tier }) => {
      const n = GEM_REWARDS.tier[tier];
      if (n) this.earnOnce(`tier:${tier}`, n, 'shop_tier');
    });
    bus.on('franchised', ({ count }) => this.earnOnce(`franchise:${count}`, GEM_REWARDS.franchise, 'franchise'));
    bus.on('tutorialCompleted', ({ skipped }) => {
      if (!skipped) this.earnOnce('tutorial', GEM_REWARDS.tutorial, 'tutorial');
    });
  }

  get state(): StoreState {
    return this.game.state.store;
  }

  // -------------------------------------------------------------- Gem rewards

  /** Grants a one-time Gem reward. Returns the Gems added (0 when this key was already granted). */
  earnOnce(key: string, amount: number, source: string): number {
    if (!key || this.state.claims.includes(key)) return 0;
    this.state.claims.push(key);
    const n = this.game.monetization.earnGems(amount, `${source}:${key}`);
    if (n > 0) this.game.analytics('currency_earned', { currency: 'gems', amount: n, source });
    return n;
  }

  // -------------------------------------------------------------- events

  /** Store events running right now (from the real calendar or the save's creation date). */
  activeEvents(now = this.game.now()): StoreEventDef[] {
    return STORE_EVENTS.filter((e) => this.eventActive(e, now));
  }

  eventActive(e: StoreEventDef, now = this.game.now()): boolean {
    if (e.firstDays !== undefined) {
      const created = this.game.state.timestamps.created;
      return now >= created && now - created < e.firstDays * DAY;
    }
    if (!e.from || !e.to) return false;
    const d = new Date(now);
    const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const a = e.from[0] * 100 + e.from[1];
    const b = e.to[0] * 100 + e.to[1];
    return a <= b ? md >= a && md <= b : md >= a || md <= b;
  }

  /** Last day (UTC ms at midnight) of an event's current run, from its configured schedule. */
  eventEnds(e: StoreEventDef, now = this.game.now()): number | null {
    if (!this.eventActive(e, now)) return null;
    if (e.firstDays !== undefined) return this.game.state.timestamps.created + e.firstDays * DAY;
    const d = new Date(now);
    let year = d.getUTCFullYear();
    const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    if (e.to![0] * 100 + e.to![1] < md) year++;
    return Date.UTC(year, e.to![0] - 1, e.to![1]);
  }

  /** The once-per-event Gem gift (claimed with a button in the store). */
  eventGiftClaimable(e: StoreEventDef): boolean {
    return this.eventActive(e) && !this.state.claims.includes(`event:${e.id}`);
  }

  claimEventGift(id: StoreEventDef['id']): number {
    const e = STORE_EVENTS.find((x) => x.id === id);
    if (!e || !this.eventActive(e)) return 0;
    return this.earnOnce(`event:${e.id}`, GEM_REWARDS.eventGift, 'event');
  }

  // -------------------------------------------------------------- requirements

  /** Highest tier index any shop has reached. */
  maxTierIndex(): number {
    let best = 0;
    for (const s of Object.values(this.game.state.shops)) best = Math.max(best, tierIndexOfStage(s.stage));
    return best;
  }

  /** Requirements of an item; a bundle also needs everything its contents need. */
  requirementsOf(p: PremiumProduct): Requirements {
    const req: Requirements = { ...(p.requires ?? {}) };
    if (p.grant.kind === 'bundle') {
      for (const id of p.grant.items) {
        const r = PREMIUM_MAP[id]?.requires;
        if (!r) continue;
        if (r.level !== undefined) req.level = Math.max(req.level ?? 0, r.level);
        if (r.lifetimeRevenue !== undefined) req.lifetimeRevenue = Math.max(req.lifetimeRevenue ?? 0, r.lifetimeRevenue);
        if (r.franchises !== undefined) req.franchises = Math.max(req.franchises ?? 0, r.franchises);
        if (r.tier && (!req.tier || TIER_INDEX[r.tier] > TIER_INDEX[req.tier])) req.tier = r.tier;
        if (r.achievement) req.achievement = r.achievement;
        if (r.event) req.event = r.event;
      }
    }
    return req;
  }

  /** One row per requirement with the player's progress toward it. */
  requirementRows(id: PremiumProductId): RequirementRow[] {
    const p = PREMIUM_MAP[id];
    if (!p) return [];
    const r = this.requirementsOf(p);
    const g = this.game.state;
    const rows: RequirementRow[] = [];
    if (r.level !== undefined) rows.push({ key: 'level', need: r.level, have: g.player.level, met: g.player.level >= r.level });
    if (r.lifetimeRevenue !== undefined) rows.push({ key: 'lifetimeRevenue', need: r.lifetimeRevenue, have: g.player.lifetimeRevenue, met: g.player.lifetimeRevenue >= r.lifetimeRevenue });
    if (r.tier) {
      const have = this.maxTierIndex();
      rows.push({ key: 'tier', need: r.tier, have: SHOP_TIERS[have].id, met: have >= TIER_INDEX[r.tier] });
    }
    if (r.franchises !== undefined) rows.push({ key: 'franchises', need: r.franchises, have: g.player.prestigeCount, met: g.player.prestigeCount >= r.franchises });
    if (r.achievement) rows.push({ key: 'achievement', need: r.achievement, have: '', met: !!g.progression.achievements[r.achievement]?.claimed });
    if (r.event) {
      const e = STORE_EVENTS.find((x) => x.id === r.event);
      rows.push({ key: 'event', need: r.event, have: '', met: !!e && this.eventActive(e) });
    }
    return rows;
  }

  unlocked(id: PremiumProductId): boolean {
    return this.requirementRows(id).every((r) => r.met);
  }

  // -------------------------------------------------------------- ownership & limits

  perkLevel(perk: GemPerkId): number {
    return this.state.perks[perk] ?? 0;
  }

  /** Gem price of the next purchase (undefined when it can't be bought with Gems). */
  priceOf(id: PremiumProductId): number | undefined {
    const p = PREMIUM_MAP[id];
    if (!p) return undefined;
    return gemPriceFor(p, p.grant.kind === 'perk' ? this.perkLevel(p.grant.perk) : 0);
  }

  boughtToday(id: PremiumProductId): number {
    const rec = this.state.purchases[id];
    return rec && rec.day === dayKey(this.game.now()) ? rec.today : 0;
  }

  /** Why the item can't be bought right now, ignoring price (null = it can). */
  blocker(id: PremiumProductId, inBundle = false): Exclude<StoreFailReason, 'insufficient' | 'busy' | 'failed'> | null {
    const p = PREMIUM_MAP[id];
    if (!p) return 'unknown';
    const m = this.game.monetization;
    if (p.ownership === 'once' && m.owns(id)) return 'owned';
    if (!inBundle && !this.unlocked(id)) return 'locked';
    if (p.grant.kind === 'perk' && this.perkLevel(p.grant.perk) >= GEM_PERKS[p.grant.perk].prices.length) return 'max_level';
    if (!inBundle && p.limit && this.boughtToday(id) >= p.limit.perDay) return 'daily_limit';
    if (p.grant.kind === 'resource') {
      const r = this.resourceBlocker(p.grant.resource);
      if (r) return r;
    }
    if (p.grant.kind === 'bundle') {
      for (const item of p.grant.items) {
        const b = this.blocker(item, true);
        if (b === 'owned') return 'owned_part';
        if (b) return b;
      }
    }
    return null;
  }

  private resourceBlocker(r: ResourceKind): 'charge_held' | 'nothing_to_do' | null {
    const g = this.game;
    switch (r) {
      case 'stock':
        return g.shopMgr.displays().some((o) => this.stockable(o)) ? null : 'nothing_to_do';
      case 'staff_training':
        return g.shop.staff.some((e) => e.level < STAFF_MAX_LEVEL) ? null : 'nothing_to_do';
      case 'expansion_permit':
        if (this.state.charges.expansionPermit >= RESOURCES.maxCharges) return 'charge_held';
        return g.shopMgr.nextExpansion() ? null : 'nothing_to_do';
      case 'offline_bonus':
        return this.state.charges.offlineBonus >= RESOURCES.maxCharges ? 'charge_held' : null;
      default:
        return null;
    }
  }

  private stockable(o: { kind: string; stock: number; uid: number }): boolean {
    const g = this.game;
    const full = o.stock >= g.shopMgr.capacity(o as never);
    if (full) return false;
    return !(g.inventory.isMachine(o as never) && g.mods.machinesOff());
  }

  // -------------------------------------------------------------- resource amounts (shown before purchase)

  cashAmount(kind: 'cash_small' | 'cash_large'): number {
    const cfg = kind === 'cash_small' ? RESOURCES.cashSmall : RESOURCES.cashLarge;
    const level = this.game.state.player.level;
    return Math.round(Math.max(cfg.floorPerLevel * level, this.game.economy.incomeRate() * cfg.seconds));
  }

  xpAmount(): number {
    return Math.round(xpForLevel(this.game.state.player.level) * RESOURCES.xpShare);
  }

  /** Staff member a training voucher would level up (lowest level first). */
  trainingTarget() {
    return [...this.game.shop.staff].filter((e) => e.level < STAFF_MAX_LEVEL).sort((a, b) => a.level - b.level || a.id - b.id)[0] ?? null;
  }

  // -------------------------------------------------------------- purchase

  purchase(id: PremiumProductId): StoreResult {
    const fail = (reason: StoreFailReason): StoreResult => {
      this.game.analytics('store_purchase_failed', { item: id, reason });
      return { ok: false, reason };
    };
    const p = PREMIUM_MAP[id];
    if (!p) return fail('unknown');
    if (this.busy) return fail('busy');
    const block = this.blocker(id);
    if (block) return fail(block);
    const price = this.priceOf(id);
    if (price === undefined || !Number.isSafeInteger(price) || price <= 0) return fail('not_for_gems');
    const m = this.game.monetization;
    if (m.gems < price) return fail('insufficient');
    this.busy = true;
    try {
      const txId = `store-${id}-${this.game.now()}-${this.game.state.monetization.nextLedgerId}`;
      const debit = m.debitGems(price, id, txId);
      if (!debit) return fail('insufficient');
      const undo: (() => void)[] = [];
      try {
        this.apply(p, txId, undo);
      } catch (e) {
        for (const u of undo.reverse()) {
          try {
            u();
          } catch {
            /* best effort */
          }
        }
        m.refundGems(debit, id, txId);
        this.game.log('store', `grant failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
        return fail('failed');
      }
      if (p.ownership === 'stackable') {
        const today = dayKey(this.game.now());
        const rec = this.state.purchases[id] ?? { total: 0, day: today, today: 0 };
        if (rec.day !== today) {
          rec.day = today;
          rec.today = 0;
        }
        rec.total++;
        rec.today++;
        this.state.purchases[id] = rec;
      }
      this.game.bus.emit('storePurchased', { id, price });
      this.game.analytics('currency_spent', { currency: 'gems', amount: price, item: id });
      this.game.analytics('store_purchase_succeeded', { item: id, price, category: p.category });
      return { ok: true, txId };
    } finally {
      this.busy = false;
    }
  }

  /** Applies an item's reward, pushing an undo step for every change. Throws on an impossible grant. */
  private apply(p: PremiumProduct, txId: string, undo: (() => void)[]): void {
    const g = this.game;
    const st = this.state;
    const gr = p.grant;
    switch (gr.kind) {
      case 'perk': {
        const before = this.perkLevel(gr.perk);
        if (before >= GEM_PERKS[gr.perk].prices.length) throw new Error('max level');
        st.perks[gr.perk] = before + 1;
        undo.push(() => (st.perks[gr.perk] = before));
        g.bus.emit('upgradePurchased', { id: `perk:${gr.perk}`, level: before + 1 });
        return;
      }
      case 'booster': {
        const def = BOOSTERS[gr.booster];
        const before = st.boosters[gr.booster] ?? 0;
        st.boosters[gr.booster] = Math.min(def.maxStackSeconds, before + def.seconds);
        undo.push(() => {
          if (before > 0) st.boosters[gr.booster] = before;
          else delete st.boosters[gr.booster];
        });
        g.bus.emit('boosterStarted', { id: gr.booster, seconds: st.boosters[gr.booster] });
        g.analytics('booster_activated', { booster: gr.booster, seconds: def.seconds });
        return;
      }
      case 'resource':
        this.applyResource(gr.resource, undo);
        return;
      case 'bundle': {
        for (const item of gr.items) {
          const ip = PREMIUM_MAP[item];
          if (!ip) throw new Error(`unknown bundle item ${item}`);
          this.apply(ip, `${txId}:${item}`, undo);
        }
        this.entitle(p, txId, undo);
        return;
      }
      case 'gems':
        throw new Error('Gem packs are not sold for Gems');
      default:
        // skins, outfits, styles, decor, layout slots, automation: permanent ownership
        this.entitle(p, txId, undo);
    }
  }

  private entitle(p: PremiumProduct, txId: string, undo: (() => void)[]): void {
    const m = this.game.monetization;
    if (m.owns(p.id)) throw new Error(`already owns ${p.id}`);
    const eq = { ...this.game.state.monetization.equipped };
    const auto = this.game.state.monetization.automation.autoRestock;
    m.grantOwned(p, { source: 'gems', txId, test: false, at: this.game.now() });
    undo.push(() => {
      delete this.game.state.monetization.entitlements[p.id];
      this.game.state.monetization.equipped = eq;
      this.game.state.monetization.automation.autoRestock = auto;
    });
  }

  private applyResource(r: ResourceKind, undo: (() => void)[]): void {
    const g = this.game;
    const st = this.state;
    switch (r) {
      case 'cash_small':
      case 'cash_large': {
        const amount = this.cashAmount(r);
        const before = g.state.player.money;
        g.economy.earn(amount, false);
        undo.push(() => (g.state.player.money = before));
        g.bus.emit('storeReward', { kind: 'cash', amount });
        return;
      }
      case 'xp': {
        const amount = this.xpAmount();
        // XP can trigger a level-up (with its own rewards); it is the last step of any purchase that includes it.
        g.progression.addXp(amount);
        g.bus.emit('storeReward', { kind: 'xp', amount });
        return;
      }
      case 'stock': {
        const changed: [{ stock: number }, number][] = [];
        for (const o of g.shopMgr.displays()) {
          if (!this.stockable(o)) continue;
          changed.push([o, o.stock]);
          const cap = g.shopMgr.capacity(o);
          const add = cap - o.stock;
          o.stock = cap;
          g.world.lowStockNotified.delete(o.uid);
          g.bus.emit('restocked', { uid: o.uid, x: o.x, y: o.y, amount: add, manual: false });
        }
        if (!changed.length) throw new Error('nothing to restock');
        undo.push(() => changed.forEach(([o, s]) => (o.stock = s)));
        return;
      }
      case 'staff_training': {
        const e = this.trainingTarget();
        if (!e) throw new Error('no staff to train');
        e.level++;
        undo.push(() => e.level--);
        g.bus.emit('employeeLeveled', { id: e.id, level: e.level });
        return;
      }
      case 'expansion_permit': {
        if (st.charges.expansionPermit >= RESOURCES.maxCharges) throw new Error('permit held');
        st.charges.expansionPermit++;
        undo.push(() => st.charges.expansionPermit--);
        return;
      }
      case 'offline_bonus': {
        if (st.charges.offlineBonus >= RESOURCES.maxCharges) throw new Error('bonus held');
        st.charges.offlineBonus++;
        undo.push(() => st.charges.offlineBonus--);
        return;
      }
    }
  }

  // -------------------------------------------------------------- effects read by the simulation

  boosterRemaining(id: BoosterId): number {
    return this.state.boosters[id] ?? 0;
  }

  /** Product of active boosters for an effect (1 when none). */
  boostMult(effect: BoosterDef['effect']): number {
    let m = 1;
    for (const def of Object.values(BOOSTERS)) if (def.effect === effect && this.boosterRemaining(def.id) > 0) m *= def.mult;
    return m;
  }

  /** Sum of Gem upgrade bonuses for an effect. */
  perkBonus(effect: GemPerkDef['effect']): number {
    let n = 0;
    for (const def of Object.values(GEM_PERKS)) if (def.effect === effect) n += this.perkLevel(def.id) * def.perLevel;
    return n;
  }

  /** Price of the next expansion after the Expansion Permit discount (consumed by `useExpansionPermit`). */
  expansionDiscount(): number {
    return this.state.charges.expansionPermit > 0 ? RESOURCES.expansionDiscount : 0;
  }

  useExpansionPermit(): void {
    if (this.state.charges.expansionPermit > 0) this.state.charges.expansionPermit--;
  }

  /** Multiplier for the next offline collection; consumes the Offline Bonus charge. */
  takeOfflineMultiplier(): number {
    if (this.state.charges.offlineBonus <= 0) return 1;
    this.state.charges.offlineBonus--;
    return RESOURCES.offlineMultiplier;
  }

  /** Counts active boosters down in simulated (active play) seconds. */
  tick(dt: number): void {
    for (const [id, left] of Object.entries(this.state.boosters)) {
      const next = Math.max(0, left - dt);
      if (next > 0) this.state.boosters[id] = next;
      else {
        delete this.state.boosters[id];
        this.game.bus.emit('boosterEnded', { id });
      }
    }
  }

  // -------------------------------------------------------------- cosmetics

  ownedStyles(slot: StyleSlot): string[] {
    return PREMIUM_CATALOG.filter((p) => p.grant.kind === 'style' && p.grant.slot === slot && this.game.monetization.owns(p.id)).map((p) => (p.grant as { style: string }).style);
  }

  equipStyle(slot: StyleSlot, style: string | null): boolean {
    if (!STYLE_SLOTS.includes(slot)) return false;
    if (style !== null && !this.ownedStyles(slot).includes(style)) return false;
    this.game.state.monetization.equipped[slot] = style;
    this.game.bus.emit('stateChanged', { reason: 'style' });
    this.game.analytics('cosmetic_equipped', { slot, style });
    return true;
  }

  // -------------------------------------------------------------- discovery

  /** Unlocked, buyable items the player hasn't seen in the store yet. */
  newlyUnlocked(): PremiumProductId[] {
    return PREMIUM_CATALOG.filter((p) => p.category !== 'gems' && p.requires && this.unlocked(p.id) && !this.state.seen.includes(p.id) && this.blocker(p.id) === null).map((p) => p.id);
  }

  markSeen(ids: PremiumProductId[]): void {
    for (const id of ids) if (!this.state.seen.includes(id)) this.state.seen.push(id);
  }

  /** A few useful, affordable-soon items for the store's home page. */
  recommended(limit = 3): PremiumProductId[] {
    const g = this.game;
    const out: PremiumProductId[] = [];
    const push = (id: PremiumProductId) => {
      if (out.length < limit && !out.includes(id) && this.blocker(id) === null) out.push(id);
    };
    if (g.shopMgr.displays().some((o) => g.inventory.status(o) !== 'ok')) push('res_stock');
    const perks = PREMIUM_CATALOG.filter((p) => p.grant.kind === 'perk' && this.blocker(p.id) === null).sort((a, b) => (this.priceOf(a.id) ?? 0) - (this.priceOf(b.id) ?? 0));
    if (perks[0]) push(perks[0].id);
    if (g.shopMgr.nextExpansion() && !g.shop.construction) push('res_expansion_permit');
    push('boost_revenue');
    push('res_cash_small');
    return out;
  }
}

/** Resource products by resource kind (for UI text). */
export const RESOURCE_BY_KIND: Record<ResourceKind, PremiumProductId> = Object.fromEntries(Object.entries(RESOURCE_PRODUCTS).map(([id, r]) => [r.resource, id])) as Record<ResourceKind, PremiumProductId>;

