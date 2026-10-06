import type { Game } from './game';
import type { ActiveEvent } from '../core/types';
import { EVENTS, EVENT_MAP, RUSH_MAX_LOST_FOR_BONUS } from '../config/events';
import { ECONOMY } from '../config/economy';
import { OBJECT_MAP } from '../config/objects';

/** EventManager: random temporary events, Rush Hour scoring and mystery crates. */
export class EventManager {
  constructor(private game: Game) {}

  get state() {
    return this.game.state.events;
  }

  isActive(id: string): boolean {
    return this.state.active.some((e) => e.id === id);
  }

  tick(dt: number): void {
    const st = this.state;
    const g = this.game;
    // Tick active events.
    for (const e of st.active) e.remaining -= dt;
    const ended = st.active.filter((e) => e.remaining <= 0);
    if (ended.length) {
      st.active = st.active.filter((e) => e.remaining > 0);
      for (const e of ended) this.finish(e);
    }
    // Pending offer expiry.
    if (st.offer) {
      st.offer.expires -= dt;
      if (st.offer.expires <= 0) st.offer = undefined;
    }
    // Crate expiry.
    if (st.crate) {
      st.crate.expires -= dt;
      if (st.crate.expires <= 0) st.crate = undefined;
    }
    // Schedule new events only once the basics are learned and the shop is open.
    if (!g.shop.open || g.state.player.level < 2 || st.active.length || st.offer) return;
    st.nextRollIn -= dt;
    if (st.nextRollIn > 0) return;
    st.nextRollIn = g.rng.range(ECONOMY.events.intervalMin, ECONOMY.events.intervalMax) * (g.mods.location.special === 'night' ? 0.7 : 1);
    this.roll();
  }

  private roll(): void {
    const g = this.game;
    const hasMachines = g.shop.objects.some((o) => OBJECT_MAP[o.kind]?.display === 'machine');
    const options = EVENTS.filter((e) => g.state.player.level >= e.minLevel && (!e.requiresMachines || hasMachines));
    const ev = g.rng.weighted(options, (e) => e.weight * (e.id === 'rush_hour' && g.mods.location.special === 'night' ? 2 : 1));
    if (!ev) return;
    if (ev.optional) {
      this.state.offer = { id: ev.id, expires: ECONOMY.events.offerTimeout };
      g.bus.emit('eventOffered', { id: ev.id });
    } else this.start(ev.id);
  }

  acceptOffer(): boolean {
    const o = this.state.offer;
    if (!o) return false;
    this.state.offer = undefined;
    return this.start(o.id);
  }

  declineOffer(): void {
    this.state.offer = undefined;
  }

  start(id: string): boolean {
    const def = EVENT_MAP[id];
    if (!def || this.isActive(id)) return false;
    const g = this.game;
    this.state.active.push({ id, remaining: def.duration, duration: def.duration, served: 0, lost: 0, earned: 0 });
    if (id === 'celebrity_visit') g.customers.spawn('celebrity');
    if (id === 'mystery_delivery') this.spawnCrate(def.duration);
    g.bus.emit('eventStarted', { id, duration: def.duration });
    return true;
  }

  private finish(e: ActiveEvent): void {
    const g = this.game;
    if (e.id === 'rush_hour') {
      const success = e.lost <= RUSH_MAX_LOST_FOR_BONUS && e.served > 0;
      const money = success ? Math.round(Math.max(100, g.economy.incomeRate() * 30) + e.served * 5 * g.state.player.level) : 0;
      const xp = success ? 25 + e.served : 5;
      if (money) g.economy.earn(money, false);
      g.progression.addXp(xp);
      if (success) g.state.stats.rushesCompleted++;
      if (e.lost === 0 && e.served >= 10) g.state.progression.flags.perfectRush = true;
      g.bus.emit('eventEnded', { id: e.id, summary: { served: e.served, lost: e.lost, money, xp, success } });
    } else g.bus.emit('eventEnded', { id: e.id });
  }

  recordServed(amount: number): void {
    for (const e of this.state.active) {
      e.served++;
      e.earned += amount;
    }
  }

  recordLost(): void {
    for (const e of this.state.active) e.lost++;
  }

  spawnCrate(duration = 30): boolean {
    const g = this.game;
    const grid = g.world.grid;
    const free: { x: number; y: number }[] = [];
    for (let y = 0; y < grid.size; y++) for (let x = 0; x < grid.size; x++) {
      const t = grid.get(x, y)!;
      if (t.walkable && t.reserved === 'none') free.push({ x, y });
    }
    const spot = free.length ? g.rng.pick(free) : null;
    if (!spot) return false;
    this.state.crate = { x: spot.x, y: spot.y, expires: duration };
    g.bus.emit('crateSpawned', spot);
    return true;
  }

  collectCrate(): boolean {
    const c = this.state.crate;
    if (!c) return false;
    this.state.crate = undefined; // cleared first: no double collection
    const g = this.game;
    const lvl = g.state.player.level;
    const money = Math.round(40 * lvl + g.economy.incomeRate() * 20 * g.rng.range(0.8, 1.5));
    const stars = g.rng.chance(0.25) ? 1 : 0;
    const xp = 10 + lvl * 2;
    g.economy.earn(money, false);
    g.economy.addStars(stars);
    g.progression.addXp(xp);
    g.state.stats.cratesCollected++;
    g.bus.emit('crateCollected', { money, stars, xp, x: c.x, y: c.y });
    return true;
  }
}
