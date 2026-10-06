import type { Game } from './game';
import type { Customer } from './world';
import { tileCenter } from './world';
import type { Vec } from './grid';
import { accessTile } from './grid';
import { DOOR_TILE } from '../core/state';
import { ECONOMY } from '../config/economy';
import { CUSTOMER_MAP, CUSTOMER_TYPES } from '../config/customers';
import type { CustomerTypeDef } from '../config/customers';
import { getProduct } from '../config/products';
import { clamp } from '../core/format';

const DOOR_OUTSIDE: Vec = { x: DOOR_TILE.x - 0.5, y: DOOR_TILE.y + 0.5 };
const DOOR_INSIDE: Vec = tileCenter(DOOR_TILE);

/**
 * CustomerManager: spawning and the customer AI state machine.
 * ENTER → BROWSE → SELECT → MOVE_TO_PRODUCT → TAKE → (DECIDE_MORE) → QUEUE → PAY → EXIT
 * with WAITING (out of stock), ANGRY leave, and stuck/unreachable recovery.
 */
export class CustomerManager {
  constructor(private game: Game) {}

  get list(): Customer[] {
    return this.game.world.customers;
  }

  maxCustomers(): number {
    const s = this.game.shop.size;
    const base = ECONOMY.customers.maxCustomersBase + s * s * ECONOMY.customers.maxCustomersPerTile;
    return Math.min(ECONOMY.customers.hardCap, Math.floor(base * (this.game.state.events.active.some((e) => e.id === 'rush_hour') ? 1.6 : 1)));
  }

  spawnRate(): number {
    return ECONOMY.customers.baseSpawnPerSec * this.game.mods.spawnMult();
  }

  eligibleTypes(): CustomerTypeDef[] {
    const lvl = this.game.state.player.level;
    const tier = this.game.progression.repTier();
    return CUSTOMER_TYPES.filter((t) => !t.special && lvl >= t.requiredLevel && tier >= t.requiredRepTier);
  }

  typeWeight(t: CustomerTypeDef): number {
    let w = t.weight;
    const loc = this.game.mods.location.customerWeights[t.id];
    if (loc !== undefined) w = Math.max(w, 0) + loc;
    for (const s of this.game.mods.seasons()) {
      const sw = s.customerWeights?.[t.id];
      if (sw) w += sw;
    }
    return w;
  }

  tick(dt: number): void {
    const w = this.game.world;
    const shop = this.game.shop;
    if (shop.open) {
      w.spawnAcc += dt * this.spawnRate();
      if (w.spawnAcc >= 1) {
        w.spawnAcc -= 1;
        if (this.list.length < this.maxCustomers()) this.spawn();
      }
      w.spawnAcc = Math.min(w.spawnAcc, 2);
    }
    const tc = w.tickCount;
    for (const c of this.list) {
      try {
        this.update(c, dt, (c.phase + tc) % 4 === 0);
      } catch (e) {
        // Never let one broken NPC crash the simulation.
        this.game.log('customer', `customer ${c.id} failed in ${c.state}: ${String(e)}`);
        this.game.checkout.leave(c);
        c.state = 'gone';
      }
    }
    if (this.list.some((c) => c.state === 'gone')) {
      w.customers = this.list.filter((c) => {
        if (c.state !== 'gone') return true;
        try {
          this.finalize(c);
        } catch (e) {
          this.game.log('customer', `finalize ${c.id}: ${String(e)}`);
        }
        return false;
      });
    }
  }

  spawn(typeId?: string): Customer | null {
    const g = this.game;
    const def = typeId ? CUSTOMER_MAP[typeId] : g.rng.weighted(this.eligibleTypes(), (t) => this.typeWeight(t));
    if (!def) return null;
    const w = g.world;
    const n = g.shop.size;
    const fromTop = g.rng.chance(0.5);
    const startY = fromTop ? -2.5 : n + 2.5;
    const patience = def.patience * g.mods.patienceMult();
    const c: Customer = {
      id: w.nextCustomerId++,
      type: def.id,
      pos: { x: -0.5, y: startY },
      path: [{ ...DOOR_OUTSIDE }],
      speed: ECONOMY.customers.walkSpeed * def.speed * g.mods.customerSpeedMult() * g.rng.range(0.9, 1.1),
      state: 'street_in',
      stateTime: 0,
      patience,
      maxPatience: patience,
      budget: g.rng.range(def.budget[0], def.budget[1]) * g.mods.location.spendMult,
      wants: [],
      basket: [],
      satisfaction: ECONOMY.satisfaction.start + g.mods.appeal(),
      targetUid: 0,
      checkoutUid: 0,
      offset: { x: g.rng.range(-0.12, 0.12), y: g.rng.range(-0.12, 0.12) },
      emote: null,
      emoteTime: 0,
      facing: 1,
      moving: true,
      repath: false,
      waitTime: 0,
      exitSide: fromTop ? n + 2.5 : -2.5,
      lastTile: -1,
      angry: false,
      phase: w.nextCustomerId % 4,
    };
    c.wants = this.chooseWants(def, c.budget);
    w.customers.push(c);
    g.bus.emit('customerSpawned', { id: c.id, type: def.id });
    return c;
  }

  /** Picks a shopping list from products on display, weighted by taste, demand and budget. */
  chooseWants(def: CustomerTypeDef, budget: number): string[] {
    const g = this.game;
    const options = g.inventory.productsOnDisplay();
    if (!options.length) return [];
    const count = g.rng.int(def.items[0], def.items[1]);
    const wants: string[] = [];
    let money = budget;
    for (let i = 0; i < count; i++) {
      const pid = g.rng.weighted(options, (id) => {
        const p = getProduct(id);
        if (!p) return 0;
        const price = g.economy.unitPrice(id);
        if (price > money) return 0;
        let wgt = p.demand * (def.prefers[p.category] ?? 1);
        if (def.priceTaste === 'cheap') wgt *= p.rarity === 'common' ? 1.4 : 0.35;
        if (def.priceTaste === 'premium') wgt *= p.rarity === 'common' ? 0.6 : 2.2;
        if (wants.includes(id)) wgt *= 0.5;
        return wgt;
      });
      if (!pid) break;
      wants.push(pid);
      money -= g.economy.unitPrice(pid);
    }
    // Guarantee at least the cheapest item so nobody walks in for nothing.
    if (!wants.length) {
      const cheapest = options.slice().sort((a, b) => g.economy.unitPrice(a) - g.economy.unitPrice(b))[0];
      if (cheapest) wants.push(cheapest);
    }
    return wants;
  }

  // ---------------------------------------------------------------- movement

  private tileOf(c: Customer): Vec {
    return { x: Math.floor(c.pos.x), y: Math.floor(c.pos.y) };
  }

  /** Grid path to a tile; returns false (no change) when unreachable. */
  private goTo(c: Customer, tile: Vec): boolean {
    const g = this.game;
    const grid = g.world.grid;
    let start = this.tileOf(c);
    if (!grid.inBounds(start.x, start.y)) start = { ...DOOR_TILE };
    const p = g.world.paths.get(grid, start, tile);
    if (!p) return false;
    c.path = p.map(tileCenter);
    if (!grid.inBounds(Math.floor(c.pos.x), Math.floor(c.pos.y))) c.path.unshift({ ...DOOR_INSIDE });
    return true;
  }

  private move(c: Customer, dt: number): boolean {
    if (!c.path.length) {
      c.moving = false;
      return true;
    }
    const target = c.path[0];
    const dx = target.x - c.pos.x;
    const dy = target.y - c.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = c.speed * dt;
    c.moving = true;
    if (Math.abs(dx) > Math.abs(dy)) c.facing = dx > 0 ? 0 : 2;
    else if (dy !== 0) c.facing = dy > 0 ? 1 : 3;
    if (dist <= step) {
      c.pos.x = target.x;
      c.pos.y = target.y;
      c.path.shift();
      this.onTileEnter(c);
    } else {
      c.pos.x += (dx / dist) * step;
      c.pos.y += (dy / dist) * step;
    }
    if (!c.path.length) {
      c.moving = false;
      return true;
    }
    return false;
  }

  private onTileEnter(c: Customer): void {
    const g = this.game;
    const t = this.tileOf(c);
    if (!g.world.grid.inBounds(t.x, t.y)) return;
    const k = t.y * 100 + t.x;
    if (k === c.lastTile) return;
    c.lastTile = k;
    if (g.rng.chance(ECONOMY.customers.dirtChancePerTile * g.mods.dirtMult())) g.shopMgr.addDirt(t.x, t.y);
  }

  private setState(c: Customer, s: Customer['state']): void {
    c.state = s;
    c.stateTime = 0;
  }

  private emote(c: Customer, e: Customer['emote'], t = 1.6): void {
    c.emote = e;
    c.emoteTime = t;
  }

  // ------------------------------------------------------------------- AI

  private update(c: Customer, dt: number, think: boolean): void {
    c.stateTime += dt;
    if (c.emoteTime > 0) {
      c.emoteTime -= dt;
      if (c.emoteTime <= 0) c.emote = null;
    }
    if (c.repath) this.handleRepath(c);
    const arrived = c.state === 'queue' ? this.moveInQueue(c, dt) : this.move(c, dt);

    // Safeguard: nobody stays stuck in a transient state forever.
    if (c.stateTime > ECONOMY.customers.stuckTimeout && c.state !== 'queue' && c.state !== 'wait_queue') {
      if (c.state === 'exit' || c.state === 'street_out') {
        c.state = 'gone';
        return;
      }
      this.startExit(c, true);
      return;
    }

    switch (c.state) {
      case 'street_in':
        if (arrived) {
          this.setState(c, 'enter');
          c.path = [{ ...DOOR_INSIDE }];
        }
        break;
      case 'enter':
        if (arrived) {
          if (this.game.rng.chance(ECONOMY.customers.browseChance)) {
            this.setState(c, 'browse');
            this.goTo(c, this.randomWalkable());
          } else this.setState(c, 'select');
        }
        break;
      case 'browse':
        if (arrived && c.stateTime > this.game.rng.range(ECONOMY.customers.browseTime[0], ECONOMY.customers.browseTime[1])) this.setState(c, 'select');
        break;
      case 'select':
        this.select(c);
        break;
      case 'to_product':
        if (arrived) this.setState(c, 'take');
        else if (think && !this.targetValid(c)) this.setState(c, 'select');
        break;
      case 'take':
        if (c.stateTime >= ECONOMY.customers.takeTime) this.take(c);
        break;
      case 'waiting_stock':
        this.waitStock(c, dt, arrived);
        break;
      case 'to_queue':
        if (think || c.stateTime === dt) this.chooseQueue(c);
        break;
      case 'wait_queue':
        c.patience -= dt;
        c.waitTime += dt;
        if (c.patience <= 0) this.leaveAngry(c);
        else if (think) this.chooseQueue(c);
        break;
      case 'queue':
        this.queueTick(c, dt);
        break;
      case 'pay':
        if (c.stateTime >= ECONOMY.customers.payAnimTime) this.startExit(c, false);
        break;
      case 'exit':
        if (arrived) {
          this.setState(c, 'street_out');
          c.path = [{ ...DOOR_OUTSIDE }, { x: -0.5, y: c.exitSide }];
        }
        break;
      case 'street_out':
        if (arrived) c.state = 'gone';
        break;
      case 'gone':
        break;
    }
  }

  private randomWalkable(): Vec {
    const grid = this.game.world.grid;
    for (let i = 0; i < 12; i++) {
      const x = this.game.rng.int(0, grid.size - 1);
      const y = this.game.rng.int(0, grid.size - 1);
      const t = grid.get(x, y);
      if (t && t.walkable && t.reserved !== 'queue') return { x, y };
    }
    return { ...DOOR_TILE };
  }

  private targetValid(c: Customer): boolean {
    const o = this.game.shopMgr.getObject(c.targetUid);
    return !!o && o.productId === c.wants[0];
  }

  private select(c: Customer): void {
    const g = this.game;
    while (c.wants.length) {
      const pid = c.wants[0];
      const displays = g.inventory.displayersFor(pid);
      if (!displays.length) {
        c.wants.shift();
        c.satisfaction -= ECONOMY.satisfaction.outOfStockPenalty * 0.5;
        continue;
      }
      const here = c.pos;
      const sorted = displays
        .map((o) => ({ o, d: Math.abs(o.x + 0.5 - here.x) + Math.abs(o.y + 0.5 - here.y) }))
        .sort((a, b) => (b.o.stock > 0 ? 1 : 0) - (a.o.stock > 0 ? 1 : 0) || a.d - b.d);
      for (const { o } of sorted) {
        if (this.goTo(c, accessTile(o))) {
          c.targetUid = o.uid;
          if (o.stock > 0) this.setState(c, 'to_product');
          else {
            this.setState(c, 'waiting_stock');
            this.emote(c, 'question', 2);
          }
          return;
        }
      }
      // All displayers unreachable: give up on this product.
      c.wants.shift();
    }
    if (c.basket.length) this.setState(c, 'to_queue');
    else this.startExit(c, false, true);
  }

  private take(c: Customer): void {
    const g = this.game;
    const o = g.shopMgr.getObject(c.targetUid);
    const pid = c.wants[0];
    if (o && o.productId === pid) {
      if (g.inventory.take(o)) {
        c.basket.push({ productId: pid, price: 0, cost: 0 });
        c.budget -= g.economy.unitPrice(pid);
        c.wants.shift();
        if (getProduct(pid)?.rarity !== 'common') this.emote(c, 'wow', 1);
        this.setState(c, 'select');
        return;
      }
      this.setState(c, 'waiting_stock');
      this.emote(c, 'question', 2);
      return;
    }
    this.setState(c, 'select');
  }

  private waitStock(c: Customer, dt: number, arrived: boolean): void {
    const g = this.game;
    const o = g.shopMgr.getObject(c.targetUid);
    if (!o || o.productId !== c.wants[0]) {
      this.setState(c, 'select');
      return;
    }
    if (!arrived) return;
    c.patience -= dt * 0.5;
    if (o.stock > 0) {
      this.setState(c, 'take');
      return;
    }
    if (c.stateTime > ECONOMY.customers.waitForStockTime) {
      c.wants.shift();
      c.satisfaction -= ECONOMY.satisfaction.outOfStockPenalty;
      this.emote(c, 'sad');
      this.setState(c, 'select');
    }
  }

  private chooseQueue(c: Customer): void {
    const g = this.game;
    const def = CUSTOMER_MAP[c.type];
    const shortest = g.checkout.shortestQueue();
    if (def && shortest >= def.maxQueueTolerance && c.state === 'to_queue') {
      // Impatient types refuse long queues.
      this.leaveAngry(c);
      return;
    }
    const pick = g.checkout.choose();
    if (!pick) {
      if (c.state !== 'wait_queue') {
        this.setState(c, 'wait_queue');
        this.emote(c, 'sleep', 2);
      }
      return;
    }
    g.checkout.join(c, pick.uid);
    this.setState(c, 'queue');
    c.path = [];
    const idx = g.world.checkouts.get(pick.uid)!.queue.indexOf(c.id);
    const slot = g.checkout.slotPos(pick.uid, idx);
    if (slot) {
      const tile = { x: Math.floor(slot.x), y: Math.floor(slot.y) };
      if (this.goTo(c, tile)) c.path.push(slot);
      else c.path = [slot];
    }
  }

  /** Queue movement: follow the grid path to our slot, then shuffle forward in a straight line. */
  private moveInQueue(c: Customer, dt: number): boolean {
    if (c.path.length) {
      this.move(c, dt);
      return false;
    }
    const rt = this.game.world.checkouts.get(c.checkoutUid);
    if (!rt) return true;
    const idx = rt.queue.indexOf(c.id);
    const slot = this.game.checkout.slotPos(c.checkoutUid, Math.max(0, idx));
    if (!slot) return true;
    const dx = slot.x - c.pos.x;
    const dy = slot.y - c.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      c.moving = false;
      return true;
    }
    const step = Math.min(dist, c.speed * 0.8 * dt);
    c.pos.x += (dx / dist) * step;
    c.pos.y += (dy / dist) * step;
    c.moving = true;
    if (Math.abs(dx) > Math.abs(dy)) c.facing = dx > 0 ? 0 : 2;
    else c.facing = dy > 0 ? 1 : 3;
    return false;
  }

  private queueTick(c: Customer, dt: number): void {
    const g = this.game;
    const rt = g.world.checkouts.get(c.checkoutUid);
    if (!rt || !rt.queue.includes(c.id)) {
      this.setState(c, 'to_queue');
      c.checkoutUid = 0;
      return;
    }
    if (rt.serving === c.id) return; // being served: patience frozen
    c.patience -= dt;
    c.waitTime += dt;
    if (c.patience < c.maxPatience * 0.3 && !c.emote) this.emote(c, 'angry', 1.2);
    if (c.patience <= 0) this.leaveAngry(c);
  }

  leaveAngry(c: Customer): void {
    const g = this.game;
    g.checkout.leave(c);
    // Put items back on the shelf where possible (no stock is lost).
    for (const b of c.basket) {
      const o = g.inventory.displayersFor(b.productId)[0];
      if (o) o.stock = Math.min(g.shopMgr.capacity(o), o.stock + 1);
    }
    c.basket = [];
    c.angry = true;
    c.satisfaction = Math.min(c.satisfaction, ECONOMY.satisfaction.angry);
    this.emote(c, 'angry', 2.5);
    g.events.recordLost();
    g.bus.emit('customerLeftAngry', { id: c.id, x: c.pos.x, y: c.pos.y });
    this.startExit(c, true);
  }

  private startExit(c: Customer, force: boolean, empty = false): void {
    if (empty) {
      c.satisfaction -= ECONOMY.satisfaction.outOfStockPenalty;
      this.emote(c, 'sad');
    }
    if (c.checkoutUid) this.game.checkout.leave(c);
    this.setState(c, 'exit');
    if (!this.goTo(c, DOOR_TILE)) {
      // Path blocked: walk straight out (graceful recovery, never stuck).
      c.path = [{ ...DOOR_INSIDE }];
      if (force) c.pos = { ...DOOR_INSIDE };
    }
  }

  private handleRepath(c: Customer): void {
    c.repath = false;
    const g = this.game;
    const t = this.tileOf(c);
    if (g.world.grid.inBounds(t.x, t.y) && !g.world.grid.isWalkable(t.x, t.y)) {
      // Something was built on top of us: hop to the nearest free tile.
      const n = g.world.grid.nearestWalkable(t.x, t.y);
      if (n) c.pos = tileCenter(n);
    }
    switch (c.state) {
      case 'browse':
      case 'to_product':
      case 'waiting_stock':
        this.setState(c, 'select');
        c.path = [];
        break;
      case 'exit':
        if (!this.goTo(c, DOOR_TILE)) c.path = [{ ...DOOR_INSIDE }];
        break;
      case 'queue': {
        const rt = g.world.checkouts.get(c.checkoutUid);
        if (!rt) {
          this.setState(c, 'to_queue');
          c.checkoutUid = 0;
          break;
        }
        const slot = g.checkout.slotPos(c.checkoutUid, Math.max(0, rt.queue.indexOf(c.id)));
        if (slot && c.path.length) {
          const ok = this.goTo(c, { x: Math.floor(slot.x), y: Math.floor(slot.y) });
          if (ok) c.path.push(slot);
          else c.path = [slot];
        }
        break;
      }
      default:
        break;
    }
  }

  private finalize(c: Customer): void {
    const g = this.game;
    let sat = c.satisfaction;
    sat -= Math.min(ECONOMY.satisfaction.dirtPenaltyCap, g.shop.dirt.length * ECONOMY.satisfaction.dirtPenaltyPerSpot);
    sat -= (c.waitTime / Math.max(1, c.maxPatience)) * ECONOMY.satisfaction.queueWaitPenalty;
    sat = clamp(sat, 0, 100);
    const shop = g.shop;
    shop.satisfaction = clamp(shop.satisfaction + (sat - shop.satisfaction) * ECONOMY.satisfaction.ema, 0, 100);
    if (sat >= 60 && !c.angry) {
      g.state.stats.happyCustomers++;
      g.progression.addReputation(ECONOMY.reputation.gainHappy * (c.type === 'celebrity' ? 25 : 1));
      g.bus.emit('customerHappy', { id: c.id, x: c.pos.x, y: c.pos.y });
    } else if (c.angry) {
      g.state.stats.angryCustomers++;
      g.progression.addReputation(-ECONOMY.reputation.lossAngry);
    }
  }

  /** Marks every NPC for re-pathing (after layout changes). */
  invalidatePaths(): void {
    for (const c of this.list) c.repath = true;
  }
}
