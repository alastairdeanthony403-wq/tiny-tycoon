import type { Game } from './game';
import type { EmployeeRuntime } from './world';
import { tileCenter } from './world';
import type { Vec } from './grid';
import { DIRS, accessTile } from './grid';
import type { EmployeeData, PlacedObject } from '../core/types';
import { STOCKROOM_TILE } from '../core/state';
import { ECONOMY, scaledCost } from '../config/economy';
import { OBJECT_MAP } from '../config/objects';
import { STAFF, STAFF_LEVEL_SPEED, STAFF_MAP, STAFF_MAX_LEVEL, STAFF_NAMES, TRAITS, TRAIT_MAP } from '../config/staff';
import type { StaffType } from '../config/staff';

export interface Candidate {
  name: string;
  trait: string;
}

/** EmployeeManager: hiring, levelling, assignment and the worker AI (they physically walk around). */
export class EmployeeManager {
  private candidates = new Map<StaffType, Candidate>();
  private nextId = 1;

  constructor(private game: Game) {}

  get staff(): EmployeeData[] {
    return this.game.shop.staff;
  }

  // ------------------------------------------------------------- hiring

  maxStaff(type: StaffType): number {
    const def = STAFF_MAP[type];
    if (type === 'cashier') return Math.max(1, this.game.shopMgr.count('checkout'));
    if (type === 'chef') {
      let machines = 0;
      for (const o of this.game.shop.objects) if (OBJECT_MAP[o.kind]?.display === 'machine') machines++;
      return Math.max(1, machines);
    }
    return Math.floor(def.maxBase + this.game.shop.stage * def.maxPerStage);
  }

  count(type: StaffType): number {
    return this.staff.filter((s) => s.type === type).length;
  }

  hireCost(type: StaffType): number {
    const def = STAFF_MAP[type];
    const n = this.game.shop.hires[type] ?? 0;
    return Math.round(scaledCost(def.hireCost, def.hireGrowth, Math.min(n, this.count(type))) * this.game.mods.location.costMult);
  }

  canHire(type: StaffType): { ok: boolean; reason?: string } {
    const def = STAFF_MAP[type];
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.game.state.player.level < def.requiredLevel) return { ok: false, reason: 'level' };
    if (def.requiredDepartmentAny && !def.requiredDepartmentAny.some((d) => this.game.shop.departments.includes(d))) return { ok: false, reason: 'department' };
    if (this.count(type) >= this.maxStaff(type)) return { ok: false, reason: 'max' };
    if (!this.game.economy.canAfford(this.hireCost(type))) return { ok: false, reason: 'money' };
    return { ok: true };
  }

  candidate(type: StaffType): Candidate {
    let c = this.candidates.get(type);
    if (!c) {
      c = { name: this.game.rng.pick(STAFF_NAMES), trait: this.game.rng.pick(TRAITS).id };
      this.candidates.set(type, c);
    }
    return c;
  }

  hire(type: StaffType): EmployeeData | null {
    if (!this.canHire(type).ok) return null;
    if (!this.game.economy.spend(this.hireCost(type), `hire:${type}`)) return null;
    const cand = this.candidate(type);
    this.candidates.delete(type);
    const id = this.allocId();
    const e: EmployeeData = { id, type, name: cand.name, level: 1, trait: cand.trait };
    this.staff.push(e);
    this.game.shop.hires[type] = (this.game.shop.hires[type] ?? 0) + 1;
    this.game.state.stats.staffEverHired++;
    this.sync();
    this.game.progression.addXp(ECONOMY.xp.perHire);
    this.game.bus.emit('employeeHired', { id, type, name: e.name });
    this.game.analytics('employee_hired', { type });
    return e;
  }

  private allocId(): number {
    let max = 0;
    for (const s of Object.values(this.game.state.shops)) for (const e of s.staff) max = Math.max(max, e.id);
    this.nextId = Math.max(this.nextId, max + 1);
    return this.nextId++;
  }

  levelUpCost(e: EmployeeData): number | null {
    if (e.level >= STAFF_MAX_LEVEL) return null;
    const def = STAFF_MAP[e.type];
    return Math.round(scaledCost(def.levelUpBase, def.levelUpGrowth, e.level - 1) * this.game.mods.location.costMult);
  }

  levelUp(id: number): boolean {
    const e = this.staff.find((s) => s.id === id);
    if (!e) return false;
    const cost = this.levelUpCost(e);
    if (cost === null || !this.game.economy.spend(cost, 'staff_level')) return false;
    e.level++;
    this.game.state.stats.upgradesBought++;
    this.game.progression.addXp(ECONOMY.xp.perUpgrade);
    this.game.bus.emit('employeeLeveled', { id, level: e.level });
    return true;
  }

  fire(id: number): boolean {
    const shop = this.game.shop;
    const i = shop.staff.findIndex((s) => s.id === id);
    if (i < 0) return false;
    shop.staff.splice(i, 1);
    this.releaseClaims(id);
    this.sync();
    this.game.bus.emit('employeeFired', { id });
    return true;
  }

  speedOf(e: EmployeeData): number {
    return STAFF_LEVEL_SPEED[Math.min(STAFF_MAX_LEVEL, Math.max(1, e.level)) - 1];
  }

  // --------------------------------------------------------- runtime sync

  /** Creates/removes runtime NPCs to match staff data and (re)assigns stations. */
  sync(): void {
    const w = this.game.world;
    const ids = new Set(this.staff.map((s) => s.id));
    for (const rt of w.employees) if (!ids.has(rt.id)) this.releaseClaims(rt.id);
    w.employees = w.employees.filter((e) => ids.has(e.id));
    for (const s of this.staff) {
      if (!w.employees.some((e) => e.id === s.id)) {
        w.employees.push({ id: s.id, type: s.type, pos: tileCenter(STOCKROOM_TILE), path: [], task: { kind: 'idle' }, carrying: 0, moving: false, facing: 1, workAnim: 0, repath: false, stuck: 0 });
      }
    }
    this.assign();
  }

  private assign(): void {
    const shop = this.game.shop;
    const w = this.game.world;
    // Cashiers → checkouts (non-owner tills first, they are closed otherwise).
    const owner = this.game.shopMgr.ownerCheckoutUid();
    const tills = this.game.shopMgr.checkouts().map((o) => o.uid).sort((a, b) => (a === owner ? 1 : 0) - (b === owner ? 1 : 0) || a - b);
    const machines = shop.objects.filter((o) => OBJECT_MAP[o.kind]?.display === 'machine').map((o) => o.uid);
    const assignType = (type: StaffType, stations: number[]) => {
      const people = shop.staff.filter((s) => s.type === type);
      const taken = new Set<number>();
      for (const p of people) if (p.assignedUid && stations.includes(p.assignedUid) && !taken.has(p.assignedUid)) taken.add(p.assignedUid);
      else p.assignedUid = undefined;
      for (const p of people) {
        if (p.assignedUid) continue;
        const free = stations.find((s) => !taken.has(s));
        if (free) {
          p.assignedUid = free;
          taken.add(free);
        }
      }
    };
    assignType('cashier', tills);
    assignType('chef', machines);
    for (const rt of w.checkouts.values()) {
      const cashier = shop.staff.find((s) => s.type === 'cashier' && s.assignedUid === rt.uid);
      rt.cashierId = cashier?.id ?? 0;
      if (!cashier) rt.cashierPresent = false;
    }
    for (const e of w.employees) {
      const data = shop.staff.find((s) => s.id === e.id);
      if (!data) continue;
      if ((e.task.kind === 'goto_station' || e.task.kind === 'at_station') && e.task.uid !== data.assignedUid) {
        e.task = { kind: 'idle' };
        e.path = [];
      }
    }
  }

  private releaseClaims(id: number): void {
    const w = this.game.world;
    for (const [k, v] of w.claims) if (v === id) w.claims.delete(k);
    for (const rt of w.checkouts.values()) if (rt.cashierId === id) rt.cashierPresent = false;
  }

  invalidatePaths(): void {
    for (const e of this.game.world.employees) e.repath = true;
    this.assign();
  }

  // ------------------------------------------------------------------ AI

  tick(dt: number): void {
    const w = this.game.world;
    for (const e of w.employees) {
      const data = this.staff.find((s) => s.id === e.id);
      if (!data) continue;
      try {
        this.update(e, data, dt);
      } catch (err) {
        this.game.log('employee', `employee ${e.id} failed: ${String(err)}`);
        this.releaseClaims(e.id);
        e.task = { kind: 'idle' };
        e.path = [];
        e.pos = tileCenter(STOCKROOM_TILE);
      }
    }
  }

  private moveSpeed(data: EmployeeData): number {
    return 1.9 * (TRAIT_MAP[data.trait]?.moveMult ?? 1) * Math.sqrt(this.speedOf(data)) * this.game.mods.staffSpeedMult();
  }

  private workSpeed(data: EmployeeData): number {
    return this.speedOf(data) * (TRAIT_MAP[data.trait]?.workMult ?? 1) * this.game.mods.staffSpeedMult();
  }

  private goTo(e: EmployeeRuntime, tile: Vec): boolean {
    const grid = this.game.world.grid;
    const start = { x: Math.floor(e.pos.x), y: Math.floor(e.pos.y) };
    const p = this.game.world.paths.get(grid, start, tile);
    if (!p) return false;
    e.path = p.map(tileCenter);
    return true;
  }

  private move(e: EmployeeRuntime, speed: number, dt: number): boolean {
    if (!e.path.length) {
      e.moving = false;
      return true;
    }
    const t = e.path[0];
    const dx = t.x - e.pos.x;
    const dy = t.y - e.pos.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    e.moving = true;
    if (Math.abs(dx) > Math.abs(dy)) e.facing = dx > 0 ? 0 : 2;
    else if (dy !== 0) e.facing = dy > 0 ? 1 : 3;
    if (d <= step) {
      e.pos = { x: t.x, y: t.y };
      e.path.shift();
    } else {
      e.pos.x += (dx / d) * step;
      e.pos.y += (dy / d) * step;
    }
    if (!e.path.length) {
      e.moving = false;
      return true;
    }
    return false;
  }

  /** Spot where a cashier stands: a walkable tile next to the counter that isn't the queue. */
  stationTile(o: PlacedObject): Vec | null {
    const grid = this.game.world.grid;
    const a = accessTile(o);
    if (o.kind !== 'checkout') return a;
    const queue = grid.queues.get(o.uid) ?? [];
    const opposite = DIRS[(o.dir + 2) % 4];
    const order = [opposite, DIRS[(o.dir + 1) % 4], DIRS[(o.dir + 3) % 4]];
    for (const d of order) {
      const x = o.x + d.x;
      const y = o.y + d.y;
      const t = grid.get(x, y);
      if (t && t.walkable && !queue.some((q) => q.x === x && q.y === y)) return { x, y };
    }
    return null;
  }

  private stationPos(o: PlacedObject): Vec {
    const st = this.stationTile(o);
    if (st) return tileCenter(st);
    // No free tile: stand just behind the counter (visual only).
    const d = DIRS[(o.dir + 2) % 4];
    return { x: o.x + 0.5 + d.x * 0.45, y: o.y + 0.5 + d.y * 0.45 };
  }

  private update(e: EmployeeRuntime, data: EmployeeData, dt: number): void {
    const g = this.game;
    if (e.repath) {
      e.repath = false;
      const t = { x: Math.floor(e.pos.x), y: Math.floor(e.pos.y) };
      if (g.world.grid.inBounds(t.x, t.y) && !g.world.grid.isWalkable(t.x, t.y) && e.task.kind !== 'at_station') {
        const n = g.world.grid.nearestWalkable(t.x, t.y);
        if (n) e.pos = tileCenter(n);
      }
      if (e.path.length) {
        const dest = e.path[e.path.length - 1];
        if (!this.goTo(e, { x: Math.floor(dest.x), y: Math.floor(dest.y) })) this.resetTask(e);
      }
    }
    const arrived = this.move(e, this.moveSpeed(data), dt);
    e.workAnim = Math.max(0, e.workAnim - dt);
    switch (data.type) {
      case 'cashier':
      case 'chef':
        this.stationWorker(e, data, arrived);
        break;
      case 'stocker':
        this.stocker(e, data, arrived, dt);
        break;
      case 'cleaner':
        this.cleaner(e, data, arrived, dt);
        break;
      case 'manager':
        this.wander(e, arrived, dt);
        break;
    }
  }

  private resetTask(e: EmployeeRuntime): void {
    this.releaseClaims(e.id);
    e.task = { kind: 'idle' };
    e.path = [];
    e.carrying = 0;
  }

  private stationWorker(e: EmployeeRuntime, data: EmployeeData, arrived: boolean): void {
    const g = this.game;
    const uid = data.assignedUid;
    const o = uid ? g.shopMgr.getObject(uid) : undefined;
    if (!o) {
      this.wander(e, arrived, 1 / ECONOMY.tickRate);
      return;
    }
    const rt = g.world.checkouts.get(o.uid);
    if (e.task.kind === 'at_station' && e.task.uid === o.uid) {
      if (rt) rt.cashierPresent = true;
      if (rt?.serving || data.type === 'chef') e.workAnim = 0.2;
      e.facing = (o.dir + 2) % 4;
      return;
    }
    if (e.task.kind !== 'goto_station' || e.task.uid !== o.uid) {
      e.task = { kind: 'goto_station', uid: o.uid };
      const st = this.stationTile(o);
      if (!st || !this.goTo(e, st)) {
        // Can't reach a station tile: snap to the counter so the till still works.
        e.pos = this.stationPos(o);
        e.path = [];
        e.task = { kind: 'at_station', uid: o.uid };
      }
      return;
    }
    if (arrived) {
      e.pos = this.stationPos(o);
      e.task = { kind: 'at_station', uid: o.uid };
      if (rt) rt.cashierPresent = true;
    }
  }

  private stocker(e: EmployeeRuntime, data: EmployeeData, arrived: boolean, dt: number): void {
    const g = this.game;
    const w = g.world;
    const task = e.task;
    switch (task.kind) {
      case 'idle':
      case 'wander': {
        const target = this.findRestockTarget(e.id);
        if (target) {
          w.claims.set(`restock:${target.uid}`, e.id);
          if (this.goTo(e, STOCKROOM_TILE)) e.task = { kind: 'fetch', uid: target.uid };
          else this.resetTask(e);
        } else this.wander(e, arrived, dt);
        break;
      }
      case 'fetch':
        if (!g.shopMgr.getObject(task.uid)) return this.resetTask(e);
        if (arrived) e.task = { kind: 'pick', uid: task.uid, t: ECONOMY.restock.stockerPickTime / this.workSpeed(data) };
        break;
      case 'pick':
        task.t -= dt;
        e.workAnim = 0.2;
        if (task.t <= 0) {
          e.carrying = g.mods.stockerCarry();
          const o = g.shopMgr.getObject(task.uid);
          if (!o || !this.goTo(e, accessTile(o))) return this.resetTask(e);
          e.task = { kind: 'deliver', uid: task.uid };
        }
        break;
      case 'deliver':
        if (!g.shopMgr.getObject(task.uid)) return this.resetTask(e);
        if (arrived) e.task = { kind: 'fill', uid: task.uid, t: ECONOMY.restock.stockerFillTime / this.workSpeed(data) };
        break;
      case 'fill': {
        task.t -= dt;
        e.workAnim = 0.2;
        const o = g.shopMgr.getObject(task.uid);
        if (o) e.facing = this.faceToward(e.pos, { x: o.x + 0.5, y: o.y + 0.5 });
        if (task.t <= 0) {
          g.inventory.deliver(task.uid, e.carrying);
          this.resetTask(e);
        }
        break;
      }
      default:
        this.resetTask(e);
    }
  }

  private findRestockTarget(employeeId: number): PlacedObject | null {
    const g = this.game;
    let best: PlacedObject | null = null;
    let bestRatio = 0.75;
    for (const o of g.shop.objects) {
      const def = OBJECT_MAP[o.kind];
      if (def?.category !== 'display' || def.display === 'machine' || !o.productId) continue;
      const claim = g.world.claims.get(`restock:${o.uid}`);
      if (claim && claim !== employeeId) continue;
      const ratio = o.stock / Math.max(1, g.shopMgr.capacity(o));
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = o;
      }
    }
    return best;
  }

  private cleaner(e: EmployeeRuntime, data: EmployeeData, arrived: boolean, dt: number): void {
    const g = this.game;
    const w = g.world;
    const task = e.task;
    switch (task.kind) {
      case 'idle':
      case 'wander': {
        const dirt = g.shop.dirt.filter((d) => {
          const c = w.claims.get(`clean:${d.x},${d.y}`);
          return !c || c === e.id;
        });
        if (dirt.length) {
          dirt.sort((a, b) => Math.hypot(a.x + 0.5 - e.pos.x, a.y + 0.5 - e.pos.y) - Math.hypot(b.x + 0.5 - e.pos.x, b.y + 0.5 - e.pos.y));
          const d = dirt[0];
          if (this.goTo(e, d)) {
            w.claims.set(`clean:${d.x},${d.y}`, e.id);
            e.task = { kind: 'clean', x: d.x, y: d.y };
            return;
          }
        }
        this.wander(e, arrived, dt);
        break;
      }
      case 'clean':
        if (!g.shop.dirt.some((d) => d.x === task.x && d.y === task.y)) return this.resetTask(e);
        if (arrived) e.task = { kind: 'scrub', x: task.x, y: task.y, t: 1.2 / this.workSpeed(data) };
        break;
      case 'scrub':
        task.t -= dt;
        e.workAnim = 0.2;
        if (task.t <= 0) {
          g.shopMgr.clean(task.x, task.y, false);
          w.claims.delete(`clean:${task.x},${task.y}`);
          e.task = { kind: 'idle' };
        }
        break;
      default:
        this.resetTask(e);
    }
  }

  private wander(e: EmployeeRuntime, arrived: boolean, dt: number): void {
    if (e.task.kind !== 'wander') {
      e.task = { kind: 'wander', t: this.game.rng.range(1, 3) };
      return;
    }
    if (!arrived) return;
    e.task.t -= dt;
    if (e.task.t <= 0) {
      const grid = this.game.world.grid;
      const x = this.game.rng.int(0, grid.size - 1);
      const y = this.game.rng.int(0, grid.size - 1);
      const t = grid.get(x, y);
      if (t?.walkable && t.reserved !== 'queue') this.goTo(e, { x, y });
      e.task = { kind: 'wander', t: this.game.rng.range(2, 5) };
    }
  }

  private faceToward(from: Vec, to: Vec): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 0 : 2;
    return dy > 0 ? 1 : 3;
  }

  staffTypes() {
    return STAFF;
  }
}
