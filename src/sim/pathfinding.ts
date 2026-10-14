import type { Grid, Vec } from './grid';
import { DIRS } from './grid';

/**
 * A* over the shop grid (4-neighbour). Returns the list of tiles from start (exclusive)
 * to goal (inclusive), [] when already there, or null when unreachable.
 * The start tile may be non-walkable (an NPC can be standing where something was just built).
 */
export function findPath(grid: Grid, start: Vec, goal: Vec): Vec[] | null {
  const n = grid.size;
  if (!grid.inBounds(goal.x, goal.y) || !grid.isWalkable(goal.x, goal.y)) return null;
  const sx = Math.max(0, Math.min(n - 1, start.x));
  const sy = Math.max(0, Math.min(n - 1, start.y));
  if (sx === goal.x && sy === goal.y) return [];
  const total = n * n;
  const g = new Float32Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const startI = sy * n + sx;
  const goalI = goal.y * n + goal.x;
  g[startI] = 0;
  // Small grids (≤ 12×12) → a simple array-based open list is fast enough.
  const open: number[] = [startI];
  const f = new Float32Array(total).fill(Infinity);
  f[startI] = Math.abs(goal.x - sx) + Math.abs(goal.y - sy);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % n;
    const cy = (cur / n) | 0;
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!grid.inBounds(nx, ny)) continue;
      const t = grid.tiles[ny * n + nx];
      if (!t.walkable) continue;
      const ni = ny * n + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + t.navigationCost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        f[ni] = ng + Math.abs(goal.x - nx) + Math.abs(goal.y - ny);
        open.push(ni);
      }
    }
  }
  if (came[goalI] === -1) return null;
  const path: Vec[] = [];
  let c = goalI;
  while (c !== startI && c !== -1) {
    path.push({ x: c % n, y: (c / n) | 0 });
    c = came[c];
  }
  path.reverse();
  return path;
}

/** Path cache keyed by grid version; cleared automatically when the layout changes. */
export class PathCache {
  private cache = new Map<string, Vec[] | null>();
  private version = -1;
  hits = 0;
  misses = 0;

  get(grid: Grid, start: Vec, goal: Vec): Vec[] | null {
    if (grid.version !== this.version) {
      this.cache.clear();
      this.version = grid.version;
    }
    const key = `${start.x},${start.y}>${goal.x},${goal.y}`;
    if (this.cache.has(key)) {
      this.hits++;
      const p = this.cache.get(key)!;
      return p ? p.slice() : null;
    }
    this.misses++;
    const p = findPath(grid, start, goal);
    if (this.cache.size > 2000) this.cache.clear();
    this.cache.set(key, p);
    return p ? p.slice() : null;
  }
}
