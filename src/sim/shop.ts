import type { Game } from './game';
import type { Dir, PlacedObject, ShopState } from '../core/types';
import { DOOR_TILE, STOCKROOM_TILE } from '../core/state';
import { Grid, accessTile } from './grid';
import type { Vec } from './grid';
import { OBJECT_MAP } from '../config/objects';
import type { ObjectDef } from '../config/objects';
import { PRODUCTS, getProduct } from '../config/products';
import { DEPARTMENT_MAP } from '../config/departments';
import { EXPANSIONS } from '../config/expansions';
import { ECONOMY, scaledCost } from '../config/economy';

export interface PlacementResult {
  ok: boolean;
  dir: Dir;
  reason?: 'out_of_bounds' | 'occupied' | 'reserved' | 'no_access' | 'no_queue_space' | 'blocks_path';
}

export type BuyCheck = { ok: true; cost: number } | { ok: false; reason: string; cost: number };

const DIR_PREFERENCE: Dir[] = [1, 0, 2, 3];

/** ShopManager: building, placement validation, object upgrades, departments and expansion. */
export class ShopManager {
  constructor(private game: Game) {}

  get shop(): ShopState {
    return this.game.shop;
  }

  get costMult(): number {
    return this.game.mods.location.costMult;
  }

  getObject(uid: number): PlacedObject | undefined {
    return this.shop.objects.find((o) => o.uid === uid);
  }

  count(kind: string): number {
    let n = 0;
    for (const o of this.shop.objects) if (o.kind === kind) n++;
    return n;
  }

  isDisplay(o: PlacedObject): boolean {
    return OBJECT_MAP[o.kind]?.category === 'display';
  }

  displays(): PlacedObject[] {
    return this.shop.objects.filter((o) => this.isDisplay(o));
  }

  checkouts(): PlacedObject[] {
    return this.shop.objects.filter((o) => o.kind === 'checkout');
  }

  /** The owner always staffs the oldest checkout. */
  ownerCheckoutUid(): number {
    let best = 0;
    for (const o of this.shop.objects) if (o.kind === 'checkout' && (best === 0 || o.uid < best)) best = o.uid;
    return best;
  }

  // ---------------------------------------------------------------- costs

  objectCost(kind: string): number {
    const def = OBJECT_MAP[kind];
    if (!def) return Infinity;
    const starting = kind === 'shelf' || kind === 'checkout' ? 1 : 0;
    const n = Math.max(0, this.count(kind) - starting);
    return Math.round(scaledCost(def.baseCost, def.costGrowth, n) * this.costMult);
  }

  canBuy(kind: string): BuyCheck {
    const def = OBJECT_MAP[kind];
    if (!def) return { ok: false, reason: 'unknown', cost: Infinity };
    const cost = this.objectCost(kind);
    if (this.game.state.player.level < def.requiredLevel) return { ok: false, reason: 'level', cost };
    if (def.requiredDepartment && !this.shop.departments.includes(def.requiredDepartment)) return { ok: false, reason: 'department', cost };
    if (this.count(kind) >= def.maxCount) return { ok: false, reason: 'max', cost };
    if (this.shop.construction) return { ok: false, reason: 'construction', cost };
    if (!this.game.economy.canAfford(cost)) return { ok: false, reason: 'money', cost };
    return { ok: true, cost };
  }

  upgradeCost(o: PlacedObject): number | null {
    const def = OBJECT_MAP[o.kind];
    const next = def?.tiers[o.tier + 1];
    if (!next) return null;
    return Math.round(next.cost * this.costMult);
  }

  capacity(o: PlacedObject): number {
    const def = OBJECT_MAP[o.kind];
    const tier = def?.tiers[Math.min(o.tier, def.tiers.length - 1)];
    return Math.round((tier?.capacity ?? 0) * (def?.display === 'machine' ? 1 : this.game.mods.capacityMult()));
  }

  tierOf(o: PlacedObject) {
    const def = OBJECT_MAP[o.kind];
    return def.tiers[Math.min(o.tier, def.tiers.length - 1)];
  }

  // ------------------------------------------------------------ placement

  private buildGrid(objects: PlacedObject[]): Grid {
    const g = new Grid();
    g.rebuild({ ...this.shop, objects } as ShopState);
    return g;
  }

  /** Validates placing `kind` at (x,y). Tries the requested direction first, then others. */
  canPlace(kind: string, x: number, y: number, dir?: Dir, ignoreUid = 0): PlacementResult {
    const def = OBJECT_MAP[kind];
    const fallbackDir: Dir = dir ?? 1;
    if (!def) return { ok: false, dir: fallbackDir, reason: 'occupied' };
    const others = this.shop.objects.filter((o) => o.uid !== ignoreUid);
    const before = this.buildGrid(others);
    const t = before.get(x, y);
    if (!t) return { ok: false, dir: fallbackDir, reason: 'out_of_bounds' };
    if (t.occupied) return { ok: false, dir: fallbackDir, reason: 'occupied' };
    if (t.reserved !== 'none') return { ok: false, dir: fallbackDir, reason: 'reserved' };
    const dirs: Dir[] = def.needsAccess ? (dir !== undefined ? [dir, ...DIR_PREFERENCE.filter((d) => d !== dir)] : DIR_PREFERENCE) : [fallbackDir];
    let lastReason: PlacementResult['reason'] = 'no_access';
    for (const d of dirs) {
      const r = this.validateWithDir(def, others, before, x, y, d);
      if (r.ok) return r;
      lastReason = r.reason;
    }
    return { ok: false, dir: fallbackDir, reason: lastReason };
  }

  private validateWithDir(def: ObjectDef, others: PlacedObject[], before: Grid, x: number, y: number, dir: Dir): PlacementResult {
    const cand: PlacedObject = { uid: -1, kind: def.id, x, y, dir, tier: 0, stock: 0, progress: 0 };
    if (def.needsAccess) {
      const a = accessTile(cand);
      const at = before.get(a.x, a.y);
      if (!at || at.occupied || at.reserved === 'door' || at.reserved === 'queue') return { ok: false, dir, reason: 'no_access' };
    }
    const after = this.buildGrid([...others, cand]);
    if (def.id === 'checkout') {
      const q = after.queues.get(-1) ?? [];
      if (q.length < 2) return { ok: false, dir, reason: 'no_queue_space' };
      for (const qt of q.slice(1)) {
        const bt = before.get(qt.x, qt.y);
        if (!bt || (bt.reserved !== 'none' && bt.reserved !== 'queue')) return { ok: false, dir, reason: 'no_queue_space' };
      }
    }
    if (!this.connectivityOk(after, [...others, cand])) return { ok: false, dir, reason: 'blocks_path' };
    return { ok: true, dir };
  }

  /** Every access tile, queue head and the stockroom must stay reachable from the door. */
  connectivityOk(grid: Grid, objects: PlacedObject[]): boolean {
    if (!grid.isWalkable(DOOR_TILE.x, DOOR_TILE.y)) return false;
    const seen = grid.reachableFrom(DOOR_TILE);
    const ok = (v: Vec) => grid.inBounds(v.x, v.y) && seen[v.y * grid.size + v.x] === 1;
    if (!ok(STOCKROOM_TILE)) return false;
    for (const o of objects) {
      if (!OBJECT_MAP[o.kind]?.needsAccess) continue;
      if (!ok(accessTile(o))) return false;
      if (o.kind === 'checkout') {
        const q = grid.queues.get(o.uid) ?? [];
        if (q.length && !ok(q[q.length - 1])) return false;
      }
    }
    return true;
  }

  /** Finds a sensible free spot automatically (used by "Auto place" and free department items). */
  findSpot(kind: string, ignoreUid = 0): { x: number; y: number; dir: Dir } | null {
    const n = this.shop.size;
    const cands: { x: number; y: number; score: number }[] = [];
    const def = OBJECT_MAP[kind];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
        const doorDist = Math.abs(x - DOOR_TILE.x) + Math.abs(y - DOOR_TILE.y);
        let score: number;
        if (def?.id === 'checkout') score = doorDist * 2 + (y === n - 1 ? -3 : 0);
        else if (def?.category === 'decor') score = (edge ? 0 : 20) - doorDist * 0.2 + (x + y) * 0.05;
        else score = (y === 0 ? 0 : x === n - 1 ? 2 : edge ? 4 : 8) + doorDist * 0.3;
        cands.push({ x, y, score });
      }
    }
    cands.sort((a, b) => a.score - b.score);
    for (const c of cands) {
      const r = this.canPlace(kind, c.x, c.y, undefined, ignoreUid);
      if (r.ok) return { x: c.x, y: c.y, dir: r.dir };
    }
    return null;
  }

  // ------------------------------------------------------------- actions

  /** Picks the best product for a fresh displayer: unlocked, compatible, least displayed. */
  defaultProductFor(kind: string): string | undefined {
    const def = OBJECT_MAP[kind];
    if (!def?.display) return undefined;
    const options = this.compatibleProducts(kind);
    if (!options.length) return undefined;
    const counts = new Map<string, number>();
    for (const o of this.shop.objects) if (o.productId) counts.set(o.productId, (counts.get(o.productId) ?? 0) + 1);
    options.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || this.game.economy.unitProfit(b) - this.game.economy.unitProfit(a));
    return options[0];
  }

  compatibleProducts(kind: string): string[] {
    const def = OBJECT_MAP[kind];
    if (!def?.display) return [];
    return PRODUCTS.filter((p) => {
      if (p.display !== def.display) return false;
      if (!this.game.progression.isProductAvailable(p.id)) return false;
      if (!this.shop.departments.includes(p.department)) return false;
      if (def.display === 'machine') {
        // Ovens bake bakery goods, coffee machines brew café goods.
        if (def.id === 'oven' && p.department !== 'bakery') return false;
        if (def.id === 'coffee_machine' && p.department !== 'cafe') return false;
      }
      return true;
    }).map((p) => p.id);
  }

  private addObject(kind: string, x: number, y: number, dir: Dir, productId?: string): PlacedObject {
    const shop = this.shop;
    const pid = productId && this.compatibleProducts(kind).includes(productId) ? productId : this.defaultProductFor(kind);
    const o: PlacedObject = { uid: shop.nextUid++, kind, x, y, dir, tier: 0, productId: pid, stock: 0, progress: 0 };
    shop.objects.push(o);
    o.stock = OBJECT_MAP[kind]?.category === 'display' ? this.capacity(o) : 0;
    shop.purchases[kind] = (shop.purchases[kind] ?? 0) + 1;
    this.game.onLayoutChanged();
    this.game.bus.emit('objectPlaced', { uid: o.uid, kind, x, y });
    return o;
  }

  buy(kind: string, x: number, y: number, dir?: Dir, productId?: string): PlacedObject | null {
    const check = this.canBuy(kind);
    if (!check.ok) {
      this.game.bus.emit('purchaseFailed', { reason: check.reason });
      return null;
    }
    const place = this.canPlace(kind, x, y, dir);
    if (!place.ok) {
      this.game.bus.emit('purchaseFailed', { reason: place.reason ?? 'placement' });
      return null;
    }
    if (!this.game.economy.spend(check.cost, `buy:${kind}`)) return null;
    this.game.state.stats.upgradesBought++;
    this.game.progression.addXp(ECONOMY.xp.perUpgrade);
    this.game.analytics('upgrade_purchased', { id: kind, kind: 'object' });
    return this.addObject(kind, x, y, place.dir, productId);
  }

  placePending(index: number, x: number, y: number, dir?: Dir): PlacedObject | null {
    const p = this.shop.pendingPlacements[index];
    if (!p) return null;
    const place = this.canPlace(p.kind, x, y, dir);
    if (!place.ok) return null;
    this.shop.pendingPlacements.splice(index, 1);
    return this.addObject(p.kind, x, y, place.dir, p.productId);
  }

  /** Auto-places pending free items when there is room. */
  autoPlacePending(): void {
    for (let i = this.shop.pendingPlacements.length - 1; i >= 0; i--) {
      const p = this.shop.pendingPlacements[i];
      const spot = this.findSpot(p.kind);
      if (spot) this.placePending(i, spot.x, spot.y, spot.dir);
    }
  }

  move(uid: number, x: number, y: number, dir?: Dir): boolean {
    const o = this.getObject(uid);
    if (!o) return false;
    const r = this.canPlace(o.kind, x, y, dir ?? o.dir, uid);
    if (!r.ok) {
      this.game.bus.emit('purchaseFailed', { reason: r.reason ?? 'placement' });
      return false;
    }
    o.x = x;
    o.y = y;
    o.dir = r.dir;
    this.game.onLayoutChanged();
    return true;
  }

  canSell(uid: number): boolean {
    const o = this.getObject(uid);
    if (!o) return false;
    if (o.kind === 'checkout' && this.count('checkout') <= 1) return false;
    if (this.isDisplay(o) && this.displays().length <= 1) return false;
    return true;
  }

  sellValue(o: PlacedObject): number {
    const def = OBJECT_MAP[o.kind];
    if (!def) return 0;
    const starting = o.kind === 'shelf' || o.kind === 'checkout' ? 1 : 0;
    const n = Math.max(0, this.count(o.kind) - 1 - starting);
    return Math.floor(scaledCost(def.baseCost, def.costGrowth, n) * this.costMult * ECONOMY.shop.sellRefund);
  }

  sell(uid: number): boolean {
    if (!this.canSell(uid)) return false;
    const o = this.getObject(uid)!;
    const refund = this.sellValue(o);
    this.shop.objects = this.shop.objects.filter((x) => x.uid !== uid);
    this.game.economy.earn(refund, false);
    this.game.onLayoutChanged();
    this.game.bus.emit('objectRemoved', { uid });
    return true;
  }

  upgrade(uid: number): boolean {
    const o = this.getObject(uid);
    if (!o) return false;
    const cost = this.upgradeCost(o);
    if (cost === null) return false;
    if (!this.game.economy.spend(cost, `upgrade:${o.kind}`)) return false;
    o.tier++;
    if (this.isDisplay(o)) o.stock = Math.min(this.capacity(o), o.stock + Math.ceil(this.capacity(o) * 0.25));
    this.game.state.stats.upgradesBought++;
    this.game.progression.addXp(ECONOMY.xp.perUpgrade);
    if (o.kind === 'checkout') this.game.onLayoutChanged(); // queue may lengthen
    this.game.bus.emit('objectUpgraded', { uid, kind: o.kind, level: o.tier + 1, x: o.x, y: o.y });
    this.game.analytics('upgrade_purchased', { id: o.kind, tier: o.tier + 1 });
    return true;
  }

  setProduct(uid: number, productId: string): boolean {
    const o = this.getObject(uid);
    if (!o || !this.compatibleProducts(o.kind).includes(productId) || o.productId === productId) return false;
    o.productId = productId;
    o.stock = Math.floor(this.capacity(o) * 0.5);
    o.progress = 0;
    this.game.onLayoutChanged();
    return true;
  }

  rotate(uid: number): boolean {
    const o = this.getObject(uid);
    if (!o) return false;
    for (let i = 1; i <= 3; i++) {
      const d = ((o.dir + i) % 4) as Dir;
      const r = this.canPlace(o.kind, o.x, o.y, d, uid);
      if (r.ok && r.dir === d) {
        o.dir = d;
        this.game.onLayoutChanged();
        return true;
      }
    }
    return false;
  }

  openShop(): void {
    if (this.shop.open) return;
    this.shop.open = true;
    this.game.bus.emit('stateChanged', { reason: 'open' });
  }

  // ----------------------------------------------------------- departments

  departmentCost(id: string): number {
    return Math.round((DEPARTMENT_MAP[id]?.cost ?? Infinity) * this.costMult);
  }

  canUnlockDepartment(id: string): { ok: boolean; reason?: string } {
    const d = DEPARTMENT_MAP[id];
    if (!d) return { ok: false, reason: 'unknown' };
    if (this.shop.departments.includes(id)) return { ok: false, reason: 'owned' };
    if (this.game.state.player.level < d.requiredLevel) return { ok: false, reason: 'level' };
    if (this.shop.stage < d.requiredStage) return { ok: false, reason: 'stage' };
    if (!this.game.economy.canAfford(this.departmentCost(id))) return { ok: false, reason: 'money' };
    return { ok: true };
  }

  unlockDepartment(id: string): boolean {
    const c = this.canUnlockDepartment(id);
    if (!c.ok) return false;
    const d = DEPARTMENT_MAP[id];
    if (!this.game.economy.spend(this.departmentCost(id), `dept:${id}`)) return false;
    this.shop.departments.push(id);
    for (const pid of d.freeProducts) this.game.progression.grantProduct(pid, false);
    if (d.grants) {
      this.shop.pendingPlacements.push({ ...d.grants });
      this.autoPlacePending();
    }
    this.game.progression.addXp(ECONOMY.xp.perProductUnlock * 2);
    this.game.bus.emit('departmentUnlocked', { id });
    return true;
  }

  // ------------------------------------------------------------- expansion

  nextExpansion() {
    return EXPANSIONS[this.shop.stage + 1];
  }

  expansionCost(): number | null {
    const e = this.nextExpansion();
    return e ? Math.round(e.cost * this.costMult) : null;
  }

  canExpand(): { ok: boolean; reason?: string } {
    const e = this.nextExpansion();
    if (!e) return { ok: false, reason: 'max' };
    if (this.shop.construction) return { ok: false, reason: 'construction' };
    if (this.game.state.player.level < e.requiredLevel) return { ok: false, reason: 'level' };
    if (!this.game.economy.canAfford(this.expansionCost()!)) return { ok: false, reason: 'money' };
    return { ok: true };
  }

  expand(): boolean {
    if (!this.canExpand().ok) return false;
    const e = this.nextExpansion()!;
    if (!this.game.economy.spend(this.expansionCost()!, 'expansion')) return false;
    this.shop.construction = { targetStage: this.shop.stage + 1, remaining: e.buildTime, duration: e.buildTime };
    this.game.bus.emit('expansionStarted', { size: e.size, duration: e.buildTime });
    return true;
  }

  tick(dt: number): void {
    const c = this.shop.construction;
    if (!c) return;
    c.remaining -= dt;
    if (c.remaining <= 0) this.completeExpansion();
  }

  completeExpansion(): void {
    const c = this.shop.construction;
    if (!c) return;
    const stage = Math.min(EXPANSIONS.length - 1, c.targetStage);
    this.shop.stage = stage;
    this.shop.size = EXPANSIONS[stage].size;
    this.shop.construction = undefined;
    this.game.onLayoutChanged();
    this.autoPlacePending();
    this.game.progression.addXp(ECONOMY.xp.perExpansion);
    this.game.bus.emit('expansionCompleted', { size: this.shop.size });
    this.game.analytics('shop_expanded', { size: this.shop.size, location: this.shop.locationId });
  }

  // ---------------------------------------------------------------- dirt

  maxDirt(): number {
    return Math.floor(ECONOMY.shop.maxDirtBase + this.shop.size * this.shop.size * ECONOMY.shop.maxDirtPerTile);
  }

  addDirt(x: number, y: number): void {
    const shop = this.shop;
    if (shop.dirt.length >= this.maxDirt()) return;
    if (shop.dirt.some((d) => d.x === x && d.y === y)) return;
    const t = this.game.world.grid.get(x, y);
    if (!t || !t.walkable) return;
    shop.dirt.push({ x, y });
  }

  clean(x: number, y: number, manual: boolean): boolean {
    const shop = this.shop;
    const i = shop.dirt.findIndex((d) => d.x === x && d.y === y);
    if (i < 0) return false;
    shop.dirt.splice(i, 1);
    this.game.state.stats.cleaned++;
    if (manual) this.game.progression.addXp(ECONOMY.xp.perClean);
    this.game.bus.emit('dirtCleaned', { x, y });
    return true;
  }

  productOn(o: PlacedObject) {
    return getProduct(o.productId);
  }
}
