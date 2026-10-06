import type { Dir, PlacedObject, ShopState } from '../core/types';
import { DOOR_TILE, STOCKROOM_TILE } from '../core/state';
import { OBJECT_MAP } from '../config/objects';
import { getProduct } from '../config/products';
import { ECONOMY } from '../config/economy';

export interface Vec {
  x: number;
  y: number;
}

export const DIRS: Vec[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export type TileBuilding = 'none' | 'display' | 'checkout' | 'decor';
export type TileReservation = 'none' | 'door' | 'stockroom' | 'access' | 'queue';

export interface Tile {
  occupied: number; // object uid, 0 = free
  buildable: boolean;
  walkable: boolean;
  buildingType: TileBuilding;
  decorationType: string | null;
  department: string | null;
  navigationCost: number;
  reserved: TileReservation;
}

export function accessTile(o: { x: number; y: number; dir: Dir }): Vec {
  const d = DIRS[o.dir];
  return { x: o.x + d.x, y: o.y + d.y };
}

/** Number of queue tiles a checkout wants at its current tier. */
export function wantedQueueTiles(o: PlacedObject): number {
  const def = OBJECT_MAP[o.kind];
  const tier = def.tiers[Math.min(o.tier, def.tiers.length - 1)];
  return Math.ceil((tier.maxQueue ?? 4) / ECONOMY.checkout.slotsPerTile);
}

/** Tiled, walkable navigation grid derived from the shop's objects. */
export class Grid {
  size = 0;
  tiles: Tile[] = [];
  /** Queue tiles per checkout uid, in order from the counter outwards. */
  queues = new Map<number, Vec[]>();
  version = 0;

  constructor(shop?: ShopState) {
    if (shop) this.rebuild(shop);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  get(x: number, y: number): Tile | undefined {
    return this.inBounds(x, y) ? this.tiles[y * this.size + x] : undefined;
  }

  isWalkable(x: number, y: number): boolean {
    const t = this.get(x, y);
    return !!t && t.walkable;
  }

  rebuild(shop: ShopState): void {
    this.size = shop.size;
    this.tiles = [];
    for (let i = 0; i < this.size * this.size; i++) {
      this.tiles.push({ occupied: 0, buildable: true, walkable: true, buildingType: 'none', decorationType: null, department: null, navigationCost: 1, reserved: 'none' });
    }
    const reserve = (x: number, y: number, kind: TileReservation, cost = 1) => {
      const t = this.get(x, y);
      if (!t || t.occupied) return;
      t.buildable = false;
      if (t.reserved === 'none' || kind === 'door' || kind === 'stockroom') t.reserved = kind;
      t.navigationCost = Math.max(t.navigationCost, cost);
    };
    for (const o of shop.objects) {
      const t = this.get(o.x, o.y);
      if (!t) continue;
      const def = OBJECT_MAP[o.kind];
      t.occupied = o.uid;
      t.walkable = false;
      t.buildable = false;
      t.buildingType = def?.category ?? 'decor';
      if (def?.category === 'decor') t.decorationType = o.kind;
      const p = getProduct(o.productId);
      if (p) t.department = p.department;
    }
    reserve(DOOR_TILE.x, DOOR_TILE.y, 'door');
    reserve(STOCKROOM_TILE.x, STOCKROOM_TILE.y, 'stockroom');
    for (const o of shop.objects) {
      const def = OBJECT_MAP[o.kind];
      if (!def?.needsAccess) continue;
      const a = accessTile(o);
      reserve(a.x, a.y, 'access');
      const at = this.get(a.x, a.y);
      const p = getProduct(o.productId);
      if (at && p && !at.department) at.department = p.department;
    }
    this.queues.clear();
    for (const o of shop.objects) {
      if (o.kind !== 'checkout') continue;
      const d = DIRS[o.dir];
      const tiles: Vec[] = [];
      const want = wantedQueueTiles(o);
      for (let k = 1; k <= want + 1 && tiles.length < want; k++) {
        const x = o.x + d.x * k;
        const y = o.y + d.y * k;
        const t = this.get(x, y);
        if (!t || t.occupied) break;
        tiles.push({ x, y });
        if (k > 1) reserve(x, y, 'queue', 4);
        else t.navigationCost = 3;
      }
      this.queues.set(o.uid, tiles);
    }
    this.version++;
  }

  /** BFS reachability from the door over walkable tiles. */
  reachableFrom(start: Vec): Uint8Array {
    const seen = new Uint8Array(this.size * this.size);
    if (!this.isWalkable(start.x, start.y)) return seen;
    const q: number[] = [start.y * this.size + start.x];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop()!;
      const x = i % this.size;
      const y = (i / this.size) | 0;
      for (const d of DIRS) {
        const nx = x + d.x;
        const ny = y + d.y;
        if (!this.isWalkable(nx, ny)) continue;
        const ni = ny * this.size + nx;
        if (!seen[ni]) {
          seen[ni] = 1;
          q.push(ni);
        }
      }
    }
    return seen;
  }

  /** Nearest walkable tile to (x,y) (BFS over all tiles). */
  nearestWalkable(x: number, y: number): Vec | null {
    const sx = Math.max(0, Math.min(this.size - 1, Math.floor(x)));
    const sy = Math.max(0, Math.min(this.size - 1, Math.floor(y)));
    if (this.isWalkable(sx, sy)) return { x: sx, y: sy };
    const seen = new Set<number>([sy * this.size + sx]);
    const q: Vec[] = [{ x: sx, y: sy }];
    while (q.length) {
      const c = q.shift()!;
      for (const d of DIRS) {
        const nx = c.x + d.x;
        const ny = c.y + d.y;
        if (!this.inBounds(nx, ny)) continue;
        const k = ny * this.size + nx;
        if (seen.has(k)) continue;
        seen.add(k);
        if (this.isWalkable(nx, ny)) return { x: nx, y: ny };
        q.push({ x: nx, y: ny });
      }
    }
    return null;
  }
}
