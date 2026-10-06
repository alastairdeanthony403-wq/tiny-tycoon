import type { GameState, ShopState } from '../core/types';
import { EventBus } from '../core/bus';
import { Rng } from '../core/rng';
import { ECONOMY } from '../config/economy';
import { World } from './world';
import { Modifiers } from './modifiers';
import { EconomyManager } from './economy';
import { ShopManager } from './shop';
import { InventoryManager } from './inventory';
import { CustomerManager } from './customers';
import { CheckoutManager } from './checkout';
import { EmployeeManager } from './employees';
import { UpgradeManager } from './upgrades';
import { ProgressionManager } from './progression';
import { QuestManager } from './quests';
import { AchievementManager } from './achievements';
import { EventManager } from './events';
import { LocationManager } from './locations';
import { PrestigeManager } from './prestige';
import { OfflineManager } from './offline';
import { DebugTools } from './debug';
import { createShop } from '../core/state';

export interface GameOptions {
  now?: () => number;
  seed?: number;
  analytics?: (name: string, props: Record<string, unknown>) => void;
}

export const GAME_SPEEDS = [0.5, 1, 2, 5, 10];

/**
 * Game: thin orchestrator that owns the state, the fixed-timestep loop and the managers.
 * All gameplay rules live in the managers; nothing here touches the DOM.
 */
export class Game {
  readonly bus = new EventBus();
  readonly rng: Rng;
  readonly now: () => number;
  readonly dt = 1 / ECONOMY.tickRate;
  state: GameState;
  world!: World;

  mods: Modifiers;
  economy: EconomyManager;
  shopMgr: ShopManager;
  inventory: InventoryManager;
  customers: CustomerManager;
  checkout: CheckoutManager;
  employees: EmployeeManager;
  upgrades: UpgradeManager;
  progression: ProgressionManager;
  quests: QuestManager;
  achievements: AchievementManager;
  events: EventManager;
  locations: LocationManager;
  prestige: PrestigeManager;
  offline: OfflineManager;
  debug: DebugTools;

  simTime = 0;
  speed = 1;
  paused = false;
  /** Seconds of celebratory slow-motion remaining (level-ups). */
  slowmo = 0;
  private acc = 0;
  private analyticsSink?: GameOptions['analytics'];
  errors: string[] = [];

  constructor(state: GameState, opts: GameOptions = {}) {
    this.state = state;
    this.now = opts.now ?? (() => Date.now());
    this.rng = new Rng(opts.seed ?? state.rngSeed ?? 1);
    this.analyticsSink = opts.analytics;
    this.mods = new Modifiers(this);
    this.economy = new EconomyManager(this);
    this.shopMgr = new ShopManager(this);
    this.inventory = new InventoryManager(this);
    this.customers = new CustomerManager(this);
    this.checkout = new CheckoutManager(this);
    this.employees = new EmployeeManager(this);
    this.upgrades = new UpgradeManager(this);
    this.progression = new ProgressionManager(this);
    this.quests = new QuestManager(this);
    this.achievements = new AchievementManager(this);
    this.events = new EventManager(this);
    this.locations = new LocationManager(this);
    this.prestige = new PrestigeManager(this);
    this.offline = new OfflineManager(this);
    this.debug = new DebugTools(this);
    this.ensureShop();
    this.rebuildWorld();
    this.quests.startMain();
  }

  get shop(): ShopState {
    return this.state.shops[this.state.player.currentLocation];
  }

  private ensureShop(): void {
    const st = this.state;
    if (!st.shops[st.player.currentLocation]) {
      if (!st.progression.unlockedLocations.includes(st.player.currentLocation)) st.player.currentLocation = 'neighborhood';
      if (!st.shops[st.player.currentLocation]) st.shops[st.player.currentLocation] = createShop(st.player.currentLocation);
    }
  }

  /** Recreates runtime NPC data for the active shop (load, location switch, prestige). */
  rebuildWorld(): void {
    this.ensureShop();
    this.world = new World(this.shop);
    this.checkout.sync();
    this.employees.sync();
  }

  /** Called whenever objects are added/moved/removed or the shop grows. */
  onLayoutChanged(): void {
    this.world.grid.rebuild(this.shop);
    this.checkout.sync();
    this.customers.invalidatePaths();
    this.employees.invalidatePaths();
    // Dirt on tiles that are now blocked disappears.
    this.shop.dirt = this.shop.dirt.filter((d) => this.world.grid.isWalkable(d.x, d.y));
    this.bus.emit('layoutChanged', {});
  }

  setSpeed(s: number): void {
    this.speed = GAME_SPEEDS.includes(s) ? s : 1;
  }

  celebrate(seconds: number): void {
    this.slowmo = Math.max(this.slowmo, seconds);
  }

  /** Advance by real elapsed seconds; runs whole fixed steps. Speed never touches timestamps. */
  update(realDt: number): number {
    if (this.paused || !Number.isFinite(realDt) || realDt <= 0) return 0;
    const clamped = Math.min(realDt, 0.25);
    let scale = this.speed;
    if (this.slowmo > 0) {
      this.slowmo -= clamped;
      scale *= 0.35;
    }
    this.acc += clamped * scale;
    let steps = 0;
    const maxSteps = 60 * Math.max(1, this.speed);
    while (this.acc >= this.dt && steps < maxSteps) {
      this.tick(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    return steps;
  }

  /** One deterministic simulation step. Each system is isolated so one failure can't stop the rest. */
  tick(dt: number): void {
    this.simTime += dt;
    this.world.tickCount++;
    this.safe('shop', () => this.shopMgr.tick(dt));
    this.safe('inventory', () => this.inventory.tick(dt));
    this.safe('customers', () => this.customers.tick(dt));
    this.safe('checkout', () => this.checkout.tick(dt));
    this.safe('employees', () => this.employees.tick(dt));
    this.safe('economy', () => this.economy.tick(dt));
    this.safe('events', () => this.events.tick(dt));
    this.safe('quests', () => this.quests.tick(dt));
    this.safe('achievements', () => this.achievements.tick(dt));
  }

  /** Simulate many seconds quickly (tests / debug). */
  runFor(seconds: number): void {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.tick(this.dt);
  }

  private safe(where: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.log(where, e instanceof Error ? e.stack ?? e.message : String(e));
    }
  }

  log(where: string, message: string): void {
    const line = `[${where}] ${message}`;
    if (this.errors.length > 50) this.errors.shift();
    this.errors.push(line);
    if (typeof console !== 'undefined') console.warn(line);
    this.bus.emit('error', { where, message });
  }

  analytics(name: string, props: Record<string, unknown>): void {
    try {
      this.analyticsSink?.(name, props);
    } catch {
      /* analytics must never break the game */
    }
  }
}
