import type { Vec } from './grid';
import { Grid } from './grid';
import { PathCache } from './pathfinding';
import type { ShopState } from '../core/types';
import type { StaffType } from '../config/staff';

export type CustomerStateId =
  | 'street_in'
  | 'enter'
  | 'browse'
  | 'select'
  | 'to_product'
  | 'take'
  | 'waiting_stock'
  | 'to_queue'
  | 'wait_queue'
  | 'queue'
  | 'pay'
  | 'exit'
  | 'street_out'
  | 'gone';

export type Emote = 'happy' | 'love' | 'angry' | 'question' | 'sad' | 'money' | 'wow' | 'sleep' | null;

export interface Customer {
  id: number;
  type: string;
  pos: Vec;
  path: Vec[];
  speed: number;
  state: CustomerStateId;
  stateTime: number;
  patience: number;
  maxPatience: number;
  budget: number;
  wants: string[];
  basket: { productId: string; price: number; cost: number }[];
  satisfaction: number;
  targetUid: number;
  checkoutUid: number;
  offset: Vec;
  emote: Emote;
  emoteTime: number;
  facing: number;
  moving: boolean;
  repath: boolean;
  waitTime: number;
  exitSide: number;
  lastTile: number;
  angry: boolean;
  /** Stagger index for decision updates. */
  phase: number;
}

export type EmployeeTask =
  | { kind: 'idle' }
  | { kind: 'goto_station'; uid: number }
  | { kind: 'at_station'; uid: number }
  | { kind: 'fetch'; uid: number }
  | { kind: 'pick'; uid: number; t: number }
  | { kind: 'deliver'; uid: number }
  | { kind: 'fill'; uid: number; t: number }
  | { kind: 'clean'; x: number; y: number }
  | { kind: 'scrub'; x: number; y: number; t: number }
  | { kind: 'wander'; t: number };

export interface EmployeeRuntime {
  id: number;
  type: StaffType;
  pos: Vec;
  path: Vec[];
  task: EmployeeTask;
  carrying: number;
  moving: boolean;
  facing: number;
  workAnim: number;
  repath: boolean;
  stuck: number;
}

export interface CheckoutRuntime {
  uid: number;
  queue: number[];
  serving: number; // customer id or 0
  timer: number;
  total: number;
  cashierId: number; // employee id or 0
  cashierPresent: boolean;
}

/** Runtime simulation data for the active shop. Rebuilt on load/location switch. */
export class World {
  grid: Grid;
  paths = new PathCache();
  customers: Customer[] = [];
  employees: EmployeeRuntime[] = [];
  checkouts = new Map<number, CheckoutRuntime>();
  /** Task claims: e.g. "restock:12" -> employee id. */
  claims = new Map<string, number>();
  manualCooldowns = new Map<number, number>();
  nextCustomerId = 1;
  spawnAcc = 0;
  tickCount = 0;
  fullStockTimer = 0;
  lowStockNotified = new Set<number>();

  constructor(shop: ShopState) {
    this.grid = new Grid(shop);
  }

  customerById(id: number): Customer | undefined {
    for (const c of this.customers) if (c.id === id) return c;
    return undefined;
  }
}

export function tileCenter(v: Vec): Vec {
  return { x: v.x + 0.5, y: v.y + 0.5 };
}
