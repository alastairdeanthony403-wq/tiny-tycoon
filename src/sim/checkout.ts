import type { Game } from './game';
import type { CheckoutRuntime, Customer } from './world';
import type { Vec } from './grid';
import { DIRS, accessTile } from './grid';
import { ECONOMY } from '../config/economy';
import { OBJECT_MAP } from '../config/objects';
import { CUSTOMER_MAP } from '../config/customers';
import { STAFF_LEVEL_SPEED, TRAIT_MAP } from '../config/staff';

/** CheckoutManager: queue bookkeeping, service timing and payments. */
export class CheckoutManager {
  constructor(private game: Game) {}

  /** Re-syncs runtime checkouts with the shop layout (call after layout changes). */
  sync(): void {
    const w = this.game.world;
    const uids = new Set(this.game.shopMgr.checkouts().map((o) => o.uid));
    for (const [uid, rt] of w.checkouts) {
      if (!uids.has(uid)) {
        // Checkout removed: send its queue back to choose another checkout.
        for (const id of rt.queue) {
          const c = w.customerById(id);
          if (c && c.state === 'queue') {
            c.state = 'to_queue';
            c.checkoutUid = 0;
            c.stateTime = 0;
          }
        }
        w.checkouts.delete(uid);
      }
    }
    for (const uid of uids) {
      if (!w.checkouts.has(uid)) w.checkouts.set(uid, { uid, queue: [], serving: 0, timer: 0, total: 0, cashierId: 0, cashierPresent: false });
    }
    // Trim queues that no longer fit (e.g. tile space shrank after moving).
    for (const rt of w.checkouts.values()) {
      const max = this.maxQueue(rt.uid);
      while (rt.queue.length > max) {
        const id = rt.queue.pop()!;
        const c = w.customerById(id);
        if (c) {
          c.state = 'to_queue';
          c.checkoutUid = 0;
        }
      }
    }
  }

  maxQueue(uid: number): number {
    const o = this.game.shopMgr.getObject(uid);
    if (!o) return 0;
    const tier = this.game.shopMgr.tierOf(o);
    const tiles = this.game.world.grid.queues.get(uid)?.length ?? 1;
    return Math.max(1, Math.min(tier.maxQueue ?? 4, tiles * ECONOMY.checkout.slotsPerTile));
  }

  isOpen(uid: number): boolean {
    const rt = this.game.world.checkouts.get(uid);
    if (!rt) return false;
    return uid === this.game.shopMgr.ownerCheckoutUid() || rt.cashierId !== 0;
  }

  /** Service speed multiplier (tier × staff). 0 when nobody is at the till. */
  speed(uid: number): number {
    const o = this.game.shopMgr.getObject(uid);
    const rt = this.game.world.checkouts.get(uid);
    if (!o || !rt) return 0;
    const tierSpeed = this.game.shopMgr.tierOf(o).speed ?? 1;
    if (rt.cashierId && rt.cashierPresent) {
      const e = this.game.shop.staff.find((s) => s.id === rt.cashierId);
      if (e) return tierSpeed * 1.3 * STAFF_LEVEL_SPEED[e.level - 1] * (TRAIT_MAP[e.trait]?.workMult ?? 1) * this.game.mods.staffSpeedMult();
    }
    if (uid === this.game.shopMgr.ownerCheckoutUid()) return tierSpeed * ECONOMY.checkout.ownerSpeed;
    return 0;
  }

  /** World position of queue slot i (slot 0 = at the counter). */
  slotPos(uid: number, i: number): Vec | null {
    const o = this.game.shopMgr.getObject(uid);
    if (!o) return null;
    const a = accessTile(o);
    const d = DIRS[o.dir];
    const step = 1 / ECONOMY.checkout.slotsPerTile;
    return { x: a.x + 0.5 + d.x * step * i, y: a.y + 0.5 + d.y * step * i };
  }

  /** Picks the best open checkout for a customer, or null if all are full/closed. */
  choose(): { uid: number; len: number } | null {
    let best: { uid: number; len: number; score: number } | null = null;
    for (const rt of this.game.world.checkouts.values()) {
      if (!this.isOpen(rt.uid)) continue;
      if (rt.queue.length >= this.maxQueue(rt.uid)) continue;
      const sp = Math.max(0.3, this.speed(rt.uid) || 1);
      const score = (rt.queue.length + 1) / sp;
      if (!best || score < best.score) best = { uid: rt.uid, len: rt.queue.length, score };
    }
    return best ? { uid: best.uid, len: best.len } : null;
  }

  shortestQueue(): number {
    let m = Infinity;
    for (const rt of this.game.world.checkouts.values()) if (this.isOpen(rt.uid)) m = Math.min(m, rt.queue.length);
    return m;
  }

  join(c: Customer, uid: number): boolean {
    const rt = this.game.world.checkouts.get(uid);
    if (!rt || rt.queue.length >= this.maxQueue(uid)) return false;
    if (!rt.queue.includes(c.id)) rt.queue.push(c.id);
    c.checkoutUid = uid;
    return true;
  }

  leave(c: Customer): void {
    const rt = this.game.world.checkouts.get(c.checkoutUid);
    if (rt) {
      rt.queue = rt.queue.filter((id) => id !== c.id);
      if (rt.serving === c.id) {
        rt.serving = 0;
        rt.timer = 0;
      }
    }
    c.checkoutUid = 0;
  }

  /** Player taps a checkout to speed up the current customer (active play bonus). */
  tapBoost(uid: number): boolean {
    const rt = this.game.world.checkouts.get(uid);
    const o = this.game.shopMgr.getObject(uid);
    if (!rt || !o || !rt.serving) return false;
    rt.timer = Math.max(0, rt.timer - ECONOMY.checkout.tapBoostSeconds);
    this.game.state.stats.taps++;
    this.game.bus.emit('tapBoost', { uid, x: o.x, y: o.y });
    return true;
  }

  tick(dt: number): void {
    const w = this.game.world;
    for (const rt of w.checkouts.values()) {
      try {
        this.tickOne(rt, dt);
      } catch (e) {
        this.game.log('checkout', String(e));
        rt.serving = 0;
        rt.queue = rt.queue.filter((id) => !!w.customerById(id));
      }
    }
  }

  private tickOne(rt: CheckoutRuntime, dt: number): void {
    const w = this.game.world;
    // Drop stale queue entries (customers that left or were removed).
    rt.queue = rt.queue.filter((id) => {
      const c = w.customerById(id);
      return !!c && c.state === 'queue' && c.checkoutUid === rt.uid;
    });
    if (rt.serving && rt.queue[0] !== rt.serving) {
      rt.serving = 0;
      rt.timer = 0;
    }
    const speed = this.speed(rt.uid);
    if (!rt.serving) {
      const front = rt.queue[0] ? w.customerById(rt.queue[0]) : undefined;
      const slot = this.slotPos(rt.uid, 0);
      if (front && slot && speed > 0 && Math.hypot(front.pos.x - slot.x, front.pos.y - slot.y) < 0.2) {
        rt.serving = front.id;
        rt.total = rt.timer = ECONOMY.checkout.overhead + ECONOMY.checkout.secPerItem * front.basket.length;
      }
      return;
    }
    if (speed <= 0) return; // till unattended: pause
    rt.timer -= dt * speed;
    if (rt.timer <= 0) this.complete(rt);
  }

  private complete(rt: CheckoutRuntime): void {
    const w = this.game.world;
    const c = w.customerById(rt.serving);
    rt.serving = 0;
    rt.timer = 0;
    rt.queue.shift();
    if (!c) return;
    const o = this.game.shopMgr.getObject(rt.uid);
    const def = CUSTOMER_MAP[c.type];
    // Quick service & friendly staff improve satisfaction.
    if (c.waitTime < 6) c.satisfaction += ECONOMY.satisfaction.fastServiceBonus;
    let luck = 0;
    if (rt.cashierId) {
      const e = this.game.shop.staff.find((s) => s.id === rt.cashierId);
      const tr = e ? TRAIT_MAP[e.trait] : undefined;
      if (tr) {
        c.satisfaction += tr.satisfactionBonus;
        luck = tr.luck;
      }
    }
    const econ = this.game.economy;
    const items = c.basket.map((b) => ({ productId: b.productId, price: econ.unitPrice(b.productId), cost: econ.unitCost(b.productId) }));
    let gross = 0;
    for (const it of items) gross += it.price;
    let tip = 0;
    if (c.satisfaction >= 75 && this.game.rng.chance((def?.tipChance ?? 0) + luck)) tip = Math.max(1, Math.round(gross * 0.15));
    const credited = econ.recordSale(items, tip);
    c.basket = [];
    c.checkoutUid = 0;
    c.state = 'pay';
    c.stateTime = 0;
    c.emote = tip > 0 ? 'love' : 'money';
    c.emoteTime = 1.4;
    const xp = items.length * ECONOMY.xp.perItemSold + Math.floor(gross / 25);
    this.game.progression.addXp(xp);
    this.game.events.recordServed(credited);
    this.game.bus.emit('sale', { amount: credited, x: o ? o.x + 0.5 : c.pos.x, y: o ? o.y + 0.5 : c.pos.y, items: items.length, tip });
  }

  /** Can this checkout be placed / is the object a checkout at all (helper for UI). */
  isCheckout(kind: string): boolean {
    return OBJECT_MAP[kind]?.category === 'checkout';
  }
}
