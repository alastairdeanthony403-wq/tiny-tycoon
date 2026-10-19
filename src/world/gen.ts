import { MAPS, type ArtefactDef, type BlockKind, type MapDef, type MapId, type PlotDef } from './maps';

/**
 * Deterministic world generation from a MapDef: terrain grid, roads and pavements, block fillers,
 * reserved shop plots and artefact positions, all in world tiles. Same map → same world, always.
 * Nothing here touches the simulation; the renderer draws it around the player's shop.
 */
export type BuildingStyle = 'stockroom' | 'house' | 'office' | 'hut' | 'barn' | 'terminal' | 'control_tower' | 'stall' | 'silo' | 'cafe' | 'storefront' | 'subway' | 'frame';

export type Placement =
  | { kind: 'prop'; id: string; x: number; y: number; size?: number; glow?: string; flip?: boolean }
  | { kind: 'building'; style: BuildingStyle; x0: number; y0: number; x1: number; y1: number; h: number; color: string; roof?: string; accent?: string }
  | { kind: 'fence'; x0: number; y0: number; x1: number; y1: number; color: string }
  | { kind: 'plane'; x: number; y: number }
  | { kind: 'car'; x: number; y: number; color: string; axis: 'x' | 'y'; dir: 1 | -1; van?: boolean; taxi?: boolean };

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Block {
  col: number;
  row: number;
  rect: Rect;
  kind: BlockKind | 'plot';
  plotId?: string;
}

export interface GeneratedWorld {
  map: MapDef;
  w: number;
  h: number;
  /** Terrain id per cell, row-major (index y·w + x). */
  terrain: string[];
  blocks: Block[];
  placements: Placement[];
  /** Free grass/sand spots where seasonal decorations can go. */
  decorSpots: { x: number; y: number }[];
  /** Artefact id → world position (never on water, rock, road, a plot or another object). */
  artefacts: Record<string, { x: number; y: number }>;
}

/** Largest shop (12×12) plus its 2-tile stockroom annex to the north. */
export const PLOT_SIZE = { w: 12, h: 14 };

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
const pick = <T>(arr: readonly T[], r: () => number) => arr[Math.floor(r() * arr.length) % arr.length];

/** X ranges of the block columns: col −1 west of the first avenue, col i east of avenue i. */
export function colRanges(map: MapDef): { col: number; a: number; b: number }[] {
  const out = [{ col: -1, a: 0, b: map.avenues[0] - 2 }];
  map.avenues.forEach((av, i) => out.push({ col: i, a: av + 4, b: i + 1 < map.avenues.length ? map.avenues[i + 1] - 2 : map.size.w }));
  return out.filter((c) => c.b - c.a >= 1);
}

export function rowRanges(map: MapDef): { row: number; a: number; b: number }[] {
  const out = [{ row: -1, a: 0, b: map.streets[0] - 2 }];
  map.streets.forEach((st, i) => out.push({ row: i, a: st + 4, b: i + 1 < map.streets.length ? map.streets[i + 1] - 2 : map.size.h }));
  return out.filter((r) => r.b - r.a >= 1);
}

export function blockRect(map: MapDef, col: number, row: number): Rect | null {
  const c = colRanges(map).find((x) => x.col === col);
  const r = rowRanges(map).find((x) => x.row === row);
  return c && r ? { x0: c.a, y0: r.a, x1: c.b, y1: r.b } : null;
}

/** World position of a plot's shop origin (the shop's tile 0,0). */
export function plotOrigin(map: MapDef, plot: PlotDef): { x: number; y: number } {
  const r = blockRect(map, plot.col, plot.row)!;
  return { x: r.x0, y: r.y0 + 2 };
}

export function plotById(map: MapDef, id: string | undefined): PlotDef {
  return map.plots.find((p) => p.id === id) ?? map.plots[0];
}

/** The reserved rectangle of a plot (largest shop + annex). */
export function plotRect(map: MapDef, plot: PlotDef): Rect {
  const o = plotOrigin(map, plot);
  return { x0: o.x, y0: o.y - 2, x1: o.x + PLOT_SIZE.w, y1: o.y + 12 };
}

/** Where the map definition would like an artefact (its block and the fractions fx, fy). */
function artefactHint(map: MapDef, a: ArtefactDef): { x: number; y: number } {
  const r = blockRect(map, a.col, a.row)!;
  return { x: r.x0 + 0.5 + (r.x1 - r.x0 - 1) * a.fx, y: r.y0 + 0.5 + (r.y1 - r.y0 - 1) * a.fy };
}

/** True on a road strip (by geometry, so it also works where roads share the ground's terrain). */
export function onRoad(map: MapDef, x: number, y: number): boolean {
  return map.avenues.some((av) => x >= av && x < av + 2) || map.streets.some((st) => y >= st && y < st + 2);
}

/** World position of an artefact: the clear, walkable spot nearest its hint (chosen at generation). */
export function artefactPos(map: MapDef, a: ArtefactDef): { x: number; y: number } {
  return generateWorld(map).artefacts[a.id] ?? artefactHint(map, a);
}

// ------------------------------------------------------------------------------------- generation

class Builder {
  terrain: string[];
  placements: Placement[] = [];
  decorSpots: { x: number; y: number }[] = [];
  /** Occupied rectangles (buildings) and points (props) for overlap checks. */
  private solids: Rect[] = [];
  private points: { x: number; y: number }[] = [];

  constructor(public map: MapDef) {
    this.terrain = new Array(map.size.w * map.size.h).fill(map.base);
  }

  paint(r: Rect, id: string): void {
    for (let y = Math.max(0, Math.floor(r.y0)); y < Math.min(this.map.size.h, Math.ceil(r.y1)); y++)
      for (let x = Math.max(0, Math.floor(r.x0)); x < Math.min(this.map.size.w, Math.ceil(r.x1)); x++) this.terrain[y * this.map.size.w + x] = id;
  }

  paintCircle(cx: number, cy: number, rad: number, id: string): void {
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
      for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad && x >= 0 && y >= 0 && x < this.map.size.w && y < this.map.size.h) this.terrain[y * this.map.size.w + x] = id;
  }

  at(x: number, y: number): string {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.map.size.w || yi >= this.map.size.h) return '';
    return this.terrain[yi * this.map.size.w + xi];
  }

  free(x: number, y: number, gap = 1): boolean {
    for (const s of this.solids) if (x > s.x0 - 0.4 && x < s.x1 + 0.4 && y > s.y0 - 0.4 && y < s.y1 + 0.4) return false;
    for (const p of this.points) if (Math.abs(p.x - x) < gap && Math.abs(p.y - y) < gap) return false;
    return true;
  }

  prop(id: string, x: number, y: number, opts: { size?: number; glow?: string; flip?: boolean; force?: boolean } = {}): boolean {
    if (!opts.force && !this.free(x, y)) return false;
    this.points.push({ x, y });
    this.placements.push({ kind: 'prop', id, x, y, size: opts.size, glow: opts.glow, flip: opts.flip });
    return true;
  }

  building(style: BuildingStyle, r: Rect, h: number, color: string, roof?: string, accent?: string): void {
    this.solids.push(r);
    this.placements.push({ kind: 'building', style, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, h, color, roof, accent });
  }

  fence(x0: number, y0: number, x1: number, y1: number, color: string): void {
    this.placements.push({ kind: 'fence', x0, y0, x1, y1, color });
  }

  car(x: number, y: number, color: string, axis: 'x' | 'y', extra: { van?: boolean; taxi?: boolean } = {}): void {
    this.solids.push({ x0: x - 0.4, y0: y - 0.4, x1: x + 0.4, y1: y + 0.4 });
    this.placements.push({ kind: 'car', x, y, color, axis, dir: 1, ...extra });
  }

  /** Scatter props on cells of an allowed terrain inside a rect. */
  scatter(r: Rect, ids: readonly string[], n: number, rand: () => number, allowed: string[]): void {
    let placed = 0;
    for (let i = 0; i < n * 6 && placed < n; i++) {
      const x = r.x0 + 0.6 + rand() * (r.x1 - r.x0 - 1.2);
      const y = r.y0 + 0.6 + rand() * (r.y1 - r.y0 - 1.2);
      if (!allowed.includes(this.at(x, y))) continue;
      if (this.prop(pick(ids, rand), x, y, { flip: rand() < 0.5 })) placed++;
    }
  }
}

const HOUSE_WALLS = ['#fff1e6', '#fde2e4', '#e2ece9', '#fff3b0', '#dfe7fd', '#ffe5d9'];
const HOUSE_ROOFS = ['#e76f51', '#457b9d', '#9d4edd', '#2a9d8f', '#bc6c25', '#6d597a'];
const GLASS = ['#6c757d', '#8d99ae', '#5c677d', '#4a6fa5', '#7d8597'];
const AWNINGS = ['#ef476f', '#06d6a0', '#118ab2', '#ffd166', '#f78c6b', '#9d4edd'];
const STALL_ROOFS = ['#e63946', '#ff9e00', '#7209b7', '#06d6a0', '#f72585'];
const CAR_COLORS = ['#ef476f', '#3a86ff', '#ffd166', '#06d6a0', '#f8f9fa', '#9d4edd', '#264653'];

function fillBlock(b: Builder, block: Block, rand: () => number, plots: boolean): void {
  const r = block.rect;
  const { x0, y0, x1, y1 } = r;
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const d = b.map.density;
  const night = !!b.map.night;
  const lamp = night ? 'deco.lantern_post' : 'deco.streetlight';
  const glow = night ? 'rgba(255,158,0,0.55)' : 'rgba(255,243,176,0.5)';
  const greenSpot = (n: number) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + 0.8 + rand() * (w - 1.6);
      const y = y0 + 0.8 + rand() * (h - 1.6);
      if (['grass', 'sand'].includes(b.at(x, y)) && b.free(x, y, 1.4)) b.decorSpots.push({ x, y });
    }
  };
  switch (block.kind) {
    case 'plot': {
      // The lot itself keeps the map's ground; the shop (or a "for sale" sign) is drawn by the
      // renderer. Whatever of the block the plot doesn't use becomes a small garden.
      if (!plots) return;
      const plot = b.map.plots.find((p) => p.id === block.plotId);
      if (!plot) return;
      const pr = plotRect(b.map, plot);
      const rest: Rect[] = [];
      if (pr.x1 + 2 < x1) rest.push({ x0: pr.x1 + 0.8, y0, x1, y1 });
      if (pr.y1 + 2 < y1) rest.push({ x0, y0: pr.y1 + 0.8, x1: Math.min(x1, pr.x1 + 0.8), y1 });
      for (const q of rest) {
        const area = (q.x1 - q.x0) * (q.y1 - q.y0);
        b.scatter(q, ['deco.tree_round', 'deco.bush', 'deco.flower_bed', 'deco.tree_pine', 'deco.bush', 'deco.bench'], Math.ceil((area / 8) * d), rand, [b.map.base, 'grass']);
        greenSpot(2);
      }
      return;
    }
    case 'houses': {
      b.paint(r, 'grass');
      const houseW = 3.6;
      const rows = h >= 10 ? [y0 + 0.8, y1 - 4] : [y0 + 0.8];
      for (const hy of rows) {
        for (let hx = x0 + 0.8; hx + houseW <= x1 - 0.5; hx += houseW + 1.6) {
          const ci = Math.floor(rand() * 100);
          b.building('house', { x0: hx, y0: hy, x1: hx + houseW, y1: hy + 3 }, 24 + rand() * 8, HOUSE_WALLS[ci % HOUSE_WALLS.length], HOUSE_ROOFS[(ci * 7) % HOUSE_ROOFS.length], '#6f4518');
          const front = hy === rows[0] ? hy - 0.5 : hy + 3.5;
          b.prop('deco.mailbox', hx + houseW + 0.4, front, { force: true });
          b.prop(pick(['deco.tree_round', 'deco.tree_fruit', 'deco.bush'], rand), hx + houseW + 0.8, hy + 1.5);
        }
      }
      b.paint({ x0: x0 + 1, y0: cy - 0.5, x1: x1 - 1, y1: cy + 0.5 }, 'dirt');
      b.scatter({ x0, y0: y0 + 4.5, x1, y1: y1 - 4.5 }, ['deco.tree_round', 'deco.bush', 'deco.flower_bed', 'deco.hedge', 'deco.tree_pine'], Math.round(6 * d), rand, ['grass']);
      greenSpot(6);
      return;
    }
    case 'park': {
      b.paint(r, 'grass');
      b.paint({ x0, y0: cy - 0.6, x1, y1: cy + 0.6 }, 'pavement');
      b.paint({ x0: cx - 0.6, y0, x1: cx + 0.6, y1 }, 'pavement');
      b.paintCircle(cx, cy, 2.4, 'pavement');
      b.prop('deco.fountain', cx, cy + 0.4, { force: true, size: 1.1 });
      for (const [dx, dy] of [[-2.6, -1.4], [2.6, 1.6], [-1.5, 2.6], [1.6, -2.6]]) b.prop('deco.bench', cx + dx, cy + dy, { force: true });
      // playground in the north-east quarter
      const px = x1 - 3.4;
      const py = y0 + 2.6;
      b.paint({ x0: px - 2, y0: py - 1.8, x1: px + 2.4, y1: py + 1.8 }, 'sand');
      b.prop('deco.swing_set', px, py, { force: true });
      b.prop('deco.slide', px + 1.6, py + 1.2, { force: true });
      // pond in the south-west quarter
      b.paintCircle(x0 + 3.4, y1 - 3.4, 1.9, 'water');
      b.prop('deco.rocks_small', x0 + 5.2, y1 - 2.2, { force: true });
      b.prop('deco.noticeboard', cx + 1.4, y0 + 0.9, { force: true });
      b.prop('deco.bike_rack', cx - 1.6, y1 - 0.9, { force: true });
      for (const [lx, ly] of [[cx - 1, y0 + 2], [cx + 1, y1 - 2], [x0 + 2, cy + 1], [x1 - 2, cy - 1]]) b.prop(lamp, lx, ly, { glow, force: true });
      b.scatter(r, ['deco.tree_round', 'deco.tree_round', 'deco.tree_fruit', 'deco.bush', 'deco.flower_bed', 'deco.tree_pine'], Math.round(12 * d), rand, ['grass']);
      greenSpot(10);
      return;
    }
    case 'cafe': {
      b.paint(r, night ? 'cobble' : 'pavement');
      b.building('cafe', { x0: x0 + 1, y0: y0 + 1, x1: x0 + 6.5, y1: y0 + 5 }, 26, '#fff1e6', pick(AWNINGS, rand), '#6f4518');
      for (let i = 0; i < 3; i++) {
        b.prop('deco.umbrella', x0 + 1.6 + i * 2, y0 + 7, { force: true, size: 0.8 });
        b.prop('deco.cafe_table', x0 + 1.6 + i * 2, y0 + 7.1, { force: true });
      }
      if (w > 9) b.building('storefront', { x0: x1 - 5, y0: y0 + 1, x1: x1 - 1, y1: y0 + 4.5 }, 30, pick(HOUSE_WALLS, rand), pick(AWNINGS, rand), '#ffffff');
      if (h > 10) b.building('storefront', { x0: x0 + 1, y0: y1 - 4.5, x1: x0 + 5, y1: y1 - 1 }, 28, pick(HOUSE_WALLS, rand), pick(AWNINGS, rand), '#ffffff');
      b.prop('deco.bike_rack', x0 + 7.2, y0 + 5.5, { force: true });
      b.scatter(r, ['deco.planter', 'deco.planter', 'deco.trash_bin', 'deco.bench', 'deco.ad_board'], Math.round(5 * d), rand, ['pavement', 'cobble']);
      return;
    }
    case 'offices':
    case 'skyline': {
      b.paint(r, 'pavement');
      const towers = block.kind === 'skyline' || w < 9 || h < 9 ? [[x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5]] : [
        [x0 + 0.8, y0 + 0.8, cx - 0.8, cy - 0.8],
        [cx + 0.8, y0 + 0.8, x1 - 0.8, cy - 1.6],
        [x0 + 0.8, cy + 1.6, cx - 0.8, y1 - 0.8],
      ];
      for (const [a, bb, c, e] of towers) {
        if (c - a < 1.5 || e - bb < 1.5) continue;
        // long strips are split into a row of towers
        const along = c - a > e - bb ? 'x' : 'y';
        const len = along === 'x' ? c - a : e - bb;
        const n = Math.max(1, Math.round(len / 4));
        for (let i = 0; i < n; i++) {
          const s = a + ((c - a) * i) / (along === 'x' ? n : 1);
          const t = bb + ((e - bb) * i) / (along === 'y' ? n : 1);
          const rr = along === 'x' ? { x0: s + 0.2, y0: bb, x1: s + (c - a) / n - 0.2, y1: e } : { x0: a, y0: t + 0.2, x1: c, y1: t + (e - bb) / n - 0.2 };
          b.building('office', rr, 60 + rand() * 90 * d, pick(GLASS, rand), undefined, night ? '#ffd166' : '#ffe066');
        }
      }
      if (towers.length > 1) {
        b.paint({ x0: cx + 1, y0: cy, x1: x1 - 1, y1: y1 - 1 }, 'grass');
        b.scatter({ x0: cx + 1, y0: cy, x1: x1 - 1, y1: y1 - 1 }, ['deco.tree_round', 'deco.bench', 'deco.planter', 'deco.flower_bed'], Math.round(6 * d), rand, ['grass']);
      }
      b.scatter(r, ['deco.trash_bin', 'deco.planter', 'deco.ad_board'], Math.round(3 * d), rand, ['pavement']);
      return;
    }
    case 'plaza': {
      b.paint(r, 'cobble');
      b.paintCircle(cx, cy, 3, 'pavement');
      b.prop(night ? 'deco.fountain' : 'deco.fountain', cx, cy + 0.4, { force: true, size: 1.3 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.prop('deco.bench', cx + Math.cos(a) * 3.6, cy + Math.sin(a) * 3.6, { force: true });
      }
      for (const [tx, ty] of [[x0 + 1.5, y0 + 1.5], [x1 - 1.5, y0 + 1.5], [x0 + 1.5, y1 - 1.5], [x1 - 1.5, y1 - 1.5]]) {
        b.prop('deco.planter', tx, ty, { force: true });
        b.prop('deco.tree_round', tx + 0.9, ty + 0.4, { force: true, size: 0.9 });
      }
      b.building('stall', { x0: x0 + 1, y0: cy - 0.9, x1: x0 + 2.8, y1: cy + 0.9 }, 16, '#8d5524', pick(STALL_ROOFS, rand), '#ffd166');
      b.building('stall', { x0: x1 - 2.8, y0: cy - 0.9, x1: x1 - 1, y1: cy + 0.9 }, 16, '#8d5524', pick(STALL_ROOFS, rand), '#ffd166');
      b.prop('deco.ad_board', cx - 4.5, y0 + 1.2, { force: true });
      b.prop('deco.ad_board', cx + 4.5, y1 - 1.2, { force: true });
      for (const [lx, ly] of [[cx - 4, cy - 4], [cx + 4, cy - 4], [cx - 4, cy + 4], [cx + 4, cy + 4]]) b.prop(lamp, lx, ly, { glow, force: true });
      if (night) b.scatter(r, ['deco.string_lights', 'deco.crate_stack'], 4, rand, ['cobble']);
      return;
    }
    case 'transit': {
      b.paint(r, 'pavement');
      b.building('subway', { x0: cx - 2, y0: y0 + 1.5, x1: cx + 1, y1: y0 + 3.5 }, 10, '#2b2d42', '#4cc9f0', '#ffd166');
      b.prop('deco.subway_sign', cx + 1.6, y0 + 3.6, { force: true });
      for (let i = 0; i < 3; i++) b.car(x0 + 1.2 + i * 1.6, y1 - 1.2, '#ffd166', 'y', { taxi: true });
      b.prop('deco.taxi_sign', x0 + 5.8, y1 - 1, { force: true });
      b.prop('deco.bus_stop', x1 - 1.6, y1 - 1.2, { force: true });
      b.scatter(r, ['deco.bench', 'deco.planter', 'deco.trash_bin', 'deco.ad_board', 'deco.tree_round'], Math.round(6 * d), rand, ['pavement']);
      return;
    }
    case 'shops': {
      b.paint(r, 'pavement');
      const depth = Math.min(3.2, h / 3);
      for (const sy of h >= 8 ? [y0 + 0.6, y1 - 0.6 - depth] : [y0 + 0.4]) {
        for (let sx = x0 + 0.5; sx + 2.8 <= x1 - 0.3; sx += 3.6) b.building('storefront', { x0: sx, y0: sy, x1: sx + 3.2, y1: sy + depth }, 26 + rand() * 12, pick(HOUSE_WALLS, rand), pick(AWNINGS, rand), '#ffffff');
      }
      if (h >= 8) {
        for (let px = x0 + 1.5; px < x1 - 1; px += 3.2) b.prop(pick(['deco.planter', 'deco.bench', 'deco.ad_board', 'deco.bike_rack'], rand), px, cy + (rand() - 0.5), { force: true });
        b.prop(lamp, x0 + 0.8, cy, { glow, force: true });
        b.prop(lamp, x1 - 0.8, cy, { glow, force: true });
      }
      return;
    }
    case 'parking': {
      b.paint(r, 'tarmac');
      for (let py = y0 + 1.2; py < y1 - 0.8; py += 2.2) {
        for (let px = x0 + 1; px < x1 - 0.8; px += 1.3) if (rand() < 0.7 * d) b.car(px, py, pick(CAR_COLORS, rand), 'y', { van: rand() < 0.25 });
      }
      b.building('stockroom', { x0: x1 - 4, y0: y0 + 0.4, x1: x1 - 0.4, y1: y0 + 2.6 }, 28, '#ced4da', '#6c757d', '#ffd166');
      b.prop('deco.crate_stack', x1 - 4.6, y0 + 1.5, { force: true });
      b.scatter(r, ['deco.cone', 'deco.cone', 'deco.crate_stack'], 4, rand, ['tarmac']);
      return;
    }
    case 'stalls': {
      b.paint(r, 'cobble');
      const rowsY = h >= 8 ? [y0 + 0.8, y1 - 2.6] : [y0 + 0.5];
      for (const sy of rowsY) for (let sx = x0 + 0.6; sx + 1.8 <= x1 - 0.4; sx += 2.6) b.building('stall', { x0: sx, y0: sy, x1: sx + 1.8, y1: sy + 1.8 }, 16, '#6f4518', pick(STALL_ROOFS, rand), '#ffd166');
      if (h >= 8) {
        for (let lx = x0 + 1.5; lx < x1 - 1; lx += 3) b.prop('deco.lantern_post', lx, cy, { glow: 'rgba(255,158,0,0.55)', force: true });
        b.scatter({ x0, y0: cy - 2, x1, y1: cy + 2 }, ['deco.cafe_table', 'deco.crate_stack', 'deco.string_lights'], Math.round(5 * d), rand, ['cobble']);
      }
      return;
    }
    case 'shore': {
      const sandTo = x0 + Math.max(3, Math.round(w * 0.35));
      b.paint({ x0, y0, x1: sandTo, y1 }, 'sand');
      b.paint({ x0: sandTo, y0, x1, y1 }, 'water');
      // a pier out into the water
      const py = Math.round(cy);
      b.paint({ x0: sandTo - 1, y0: py, x1: x1 - 2, y1: py + 1 }, 'boardwalk');
      b.prop('deco.lifebuoy', sandTo - 0.6, py - 0.4, { force: true });
      b.prop('deco.boat', x1 - 3, py + 2.4, { force: true });
      b.prop('deco.boat', sandTo + 3, y0 + 2.5, { force: true, flip: true });
      b.prop('deco.rocks_small', sandTo - 0.3, y1 - 2, { force: true });
      b.scatter({ x0, y0, x1: sandTo, y1 }, ['deco.palm', 'deco.umbrella', 'deco.beach_towel', 'deco.rock'], Math.round(5 * d), rand, ['sand']);
      greenSpot(4);
      return;
    }
    case 'beach': {
      b.paint(r, 'sand');
      if (w >= 8 && h >= 6) b.building('hut', { x0: x1 - 2.6, y0: y0 + 0.8, x1: x1 - 0.8, y1: y0 + 2.6 }, 22, pick(['#ff70a6', '#4cc9f0', '#ffd166', '#06d6a0'], rand), '#ffffff');
      if (w >= 12 && h >= 12) b.building('hut', { x0: x0 + 0.8, y0: y1 - 2.6, x1: x0 + 2.6, y1: y1 - 0.8 }, 22, pick(['#ff70a6', '#4cc9f0', '#ffd166', '#06d6a0'], rand), '#ffffff');
      // sunbathers' corner: umbrellas with towels in a neat row
      for (let i = 0; i < Math.min(4, Math.floor(w / 4)); i++) {
        b.prop('deco.umbrella', x0 + 2 + i * 3, cy - 1);
        b.prop('deco.beach_towel', x0 + 2.6 + i * 3, cy + 0.2);
      }
      b.scatter(r, ['deco.palm', 'deco.palm', 'deco.umbrella', 'deco.beach_towel', 'deco.rocks_small', 'deco.lifebuoy'], Math.max(2, Math.round((w * h) / 12 * d)), rand, ['sand']);
      greenSpot(4);
      return;
    }
    case 'field': {
      b.paint(r, 'field');
      b.paint({ x0, y0: cy - 0.5, x1, y1: cy + 0.5 }, 'dirt');
      b.fence(x0 + 0.3, y0 + 0.3, x1 - 0.3, y0 + 0.3, '#bc8a5f');
      b.fence(x0 + 0.3, y1 - 0.3, x1 - 0.3, y1 - 0.3, '#bc8a5f');
      b.prop('deco.scarecrow', cx + 2, cy - 2, { force: true });
      for (let i = 0; i < Math.round(4 * d); i++) b.prop('deco.hay_bale', x0 + 1 + rand() * (w - 2), cy + (rand() < 0.5 ? -0.2 : 0.2) + (rand() - 0.5), { force: true });
      return;
    }
    case 'farm': {
      b.paint(r, 'grass');
      b.building('barn', { x0: x0 + 1, y0: y0 + 1, x1: x0 + 5, y1: y0 + 5 }, 34, '#c1121f', '#6c584c', '#ffffff');
      b.building('silo', { x0: x0 + 5.6, y0: y0 + 1.2, x1: x0 + 6.8, y1: y0 + 2.4 }, 56, '#adb5bd', '#6c757d');
      b.building('house', { x0: x1 - 5, y0: y0 + 1, x1: x1 - 1.4, y1: y0 + 4 }, 28, '#fff1e6', '#6c584c', '#6f4518');
      b.paintCircle(cx + 2, y1 - 3.5, 2, 'water');
      b.paintCircle(cx + 2, y1 - 3.5, 2.6, 'rock');
      b.paintCircle(cx + 2, y1 - 3.5, 2, 'water');
      b.fence(x0 + 0.5, y0 + 6, x0 + 0.5, y1 - 0.5, '#bc8a5f');
      b.fence(x0 + 0.5, y1 - 0.5, cx - 1, y1 - 0.5, '#bc8a5f');
      b.scatter(r, ['deco.hay_bale', 'deco.tree_fruit', 'deco.tree_round', 'deco.bush'], Math.round(7 * d), rand, ['grass']);
      greenSpot(6);
      return;
    }
    case 'woods': {
      b.paint(r, 'grass');
      b.scatter(r, ['deco.tree_pine', 'deco.tree_pine', 'deco.tree_round', 'deco.tree_fruit', 'deco.bush', 'deco.rock'], Math.max(2, Math.round(((w * h) / 7) * d)), rand, ['grass']);
      greenSpot(4);
      return;
    }
    case 'construction': {
      b.paint(r, 'dirt');
      b.building('frame', { x0: x0 + 2, y0: y0 + 2, x1: x1 - 3, y1: y1 - 4 }, 40, '#adb5bd', '#ffb703');
      for (let i = 0; i < 5; i++) b.prop('deco.cone', x0 + 1 + i * ((w - 2) / 4), y1 - 1.2, { force: true });
      b.prop('deco.barrier', cx, y1 - 2.2, { force: true });
      b.prop('deco.sale_sign', x1 - 1.5, y1 - 2, { force: true });
      b.scatter(r, ['deco.crate_stack', 'deco.rocks_small'], 4, rand, ['dirt']);
      return;
    }
    case 'runway': {
      b.paint(r, 'tarmac');
      b.paint({ x0: cx - 0.15, y0: y0 + 1, x1: cx + 0.15, y1: y1 - 1 }, 'pavement');
      for (let y = y0 + 1; y < y1; y += 2) {
        b.prop('deco.runway_light', x0 + 1, y, { glow: 'rgba(255,209,102,0.5)', force: true });
        b.prop('deco.runway_light', x1 - 1, y, { glow: 'rgba(255,209,102,0.5)', force: true });
      }
      if (h >= 10 && rand() < 0.8) b.placements.push({ kind: 'plane', x: cx - 2.5, y: cy });
      b.prop('deco.windsock', x1 - 2, y0 + 1.5, { force: true });
      return;
    }
    case 'terminal': {
      b.paint(r, 'pavement');
      b.building('terminal', { x0: x0 + 1, y0: y0 + 1, x1: x1 - 1, y1: y0 + Math.min(6, h - 4) }, 46, '#adb5bd', undefined, '#90e0ef');
      b.building('control_tower', { x0: x1 - 2.6, y0: y1 - 3, x1: x1 - 1.2, y1: y1 - 1.6 }, 120, '#e9ecef', undefined, '#48cae4');
      b.prop('deco.bus_stop', x0 + 1.6, y1 - 1.2, { force: true });
      b.scatter({ x0, y0: y0 + 7, x1, y1 }, ['deco.planter', 'deco.bench', 'deco.trash_bin', 'deco.cone'], Math.round(6 * d), rand, ['pavement']);
      return;
    }
  }
}

/** Street furniture along every road: lamps and bins on the pavement beside the kerb. */
function streetFurniture(b: Builder, plotRects: Rect[]): void {
  const m = b.map;
  const night = !!m.night;
  const lamp = night ? 'deco.lantern_post' : 'deco.streetlight';
  const glow = night ? 'rgba(255,158,0,0.55)' : 'rgba(255,243,176,0.5)';
  const onRoadAxis = (v: number, roads: number[]) => roads.some((r) => v > r - 2.5 && v < r + 4.5);
  const nearDoor = (x: number, y: number) => plotRects.some((p) => x > p.x0 - 4.6 && x < p.x0 + 0.5 && y > p.y0 + 1.5 && y < p.y0 + 6.5);
  // nothing on (or touching) a shop plot
  const onPlot = (x: number, y: number) => plotRects.some((p) => x > p.x0 - 0.6 && x < p.x1 + 0.6 && y > p.y0 - 0.6 && y < p.y1 + 0.6);
  for (const av of m.avenues) {
    for (let y = 2; y < m.size.h - 1; y += 6) {
      if (onRoadAxis(y, m.streets)) continue;
      for (const x of [av - 0.1, av + 2.1]) if (!nearDoor(x, y) && !onPlot(x, y)) b.prop(lamp, x, y, { glow, force: true });
    }
  }
  for (const st of m.streets) {
    for (let x = 3; x < m.size.w - 1; x += 7) {
      if (onRoadAxis(x, m.avenues)) continue;
      if (!onPlot(x, st + 2.1)) b.prop(lamp, x, st + 2.1, { glow, force: true });
      if (!night && x % 2 === 1 && !onPlot(x + 1.2, st - 1.75)) b.prop('deco.trash_bin', x + 1.2, st - 1.75, { force: true });
    }
  }
  // bus stops on the pavement beside alternate street/avenue corners
  if (m.traffic === 'cars' && !night)
    m.streets.forEach((st, i) =>
      m.avenues.forEach((av, j) => {
        const x = av + 7.5;
        const y = st + 3.2;
        if ((i + j) % 2 === 0 && x < m.size.w - 1 && !onPlot(x, y) && b.at(x, y) === m.walk) b.prop('deco.bus_stop', x, y);
      }),
    );
  // a road sign at every crossing
  if (m.traffic === 'cars') for (const av of m.avenues) for (const st of m.streets) b.prop('deco.road_sign', av - 1.6, st - 1.6, { force: true });
}

const cache = new Map<MapId, GeneratedWorld>();

/** The generated world for a map (cached; deterministic). */
export function generateWorld(map: MapDef): GeneratedWorld {
  const hit = cache.get(map.id);
  if (hit && hit.map === map) return hit;
  const b = new Builder(map);
  const plotByBlock = new Map(map.plots.map((p) => [`${p.col},${p.row}`, p]));
  const blocks: Block[] = [];
  for (const c of colRanges(map))
    for (const r of rowRanges(map)) {
      const key = `${c.col},${r.row}`;
      const plot = plotByBlock.get(key);
      const edge = c.col < 0 || r.row < 0 || c.b - c.a < 6 || r.b - r.a < 6;
      const kind: Block['kind'] = plot ? 'plot' : edge ? map.edge : map.blocks[key] ?? map.defaultBlock;
      blocks.push({ col: c.col, row: r.row, rect: { x0: c.a, y0: r.a, x1: c.b, y1: r.b }, kind, plotId: plot?.id });
    }
  for (const bl of blocks) fillBlock(b, bl, rng(seedOf(`${map.id}:${bl.col},${bl.row}`)), true);
  // pavements, then roads on top (crossings stay road)
  for (const av of map.avenues) {
    b.paint({ x0: av - 2, y0: 0, x1: av, y1: map.size.h }, map.walk);
    b.paint({ x0: av + 2, y0: 0, x1: av + 4, y1: map.size.h }, map.walk);
  }
  for (const st of map.streets) {
    b.paint({ x0: 0, y0: st - 2, x1: map.size.w, y1: st }, map.walk);
    b.paint({ x0: 0, y0: st + 2, x1: map.size.w, y1: st + 4 }, map.walk);
  }
  for (const av of map.avenues) b.paint({ x0: av, y0: 0, x1: av + 2, y1: map.size.h }, map.road);
  for (const st of map.streets) b.paint({ x0: 0, y0: st, x1: map.size.w, y1: st + 2 }, map.road);
  const plotRects = map.plots.map((p) => plotRect(map, p));
  streetFurniture(b, plotRects);
  // artefacts: the nearest clear spot to each hint, spiralling outwards inside its block
  const artefacts: GeneratedWorld['artefacts'] = {};
  const rects = b.placements.map(placementRect);
  const clear = (x: number, y: number, block: Rect) =>
    x > block.x0 + 0.6 && x < block.x1 - 0.6 && y > block.y0 + 0.6 && y < block.y1 - 0.6 &&
    !onRoad(map, x, y) &&
    !['water', 'rock'].includes(b.at(x, y)) &&
    !plotRects.some((r) => x > r.x0 - 0.5 && x < r.x1 + 0.5 && y > r.y0 - 0.5 && y < r.y1 + 0.5) &&
    !rects.some((r) => x > r.x0 - 0.8 && x < r.x1 + 0.8 && y > r.y0 - 0.8 && y < r.y1 + 0.8) &&
    !Object.values(artefacts).some((q) => Math.hypot(q.x - x, q.y - y) < 2);
  for (const a of map.artefacts) {
    const block = blockRect(map, a.col, a.row);
    const hint = artefactHint(map, a);
    if (!block) continue;
    search: for (let rad = 0; rad <= 12; rad += 0.5)
      for (let k = 0; k < Math.max(1, Math.round(rad * 8)); k++) {
        const ang = (k / Math.max(1, Math.round(rad * 8))) * Math.PI * 2;
        const x = hint.x + Math.cos(ang) * rad;
        const y = hint.y + Math.sin(ang) * rad;
        if (clear(x, y, block)) {
          artefacts[a.id] = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
          break search;
        }
      }
  }
  // seasonal decorations never land on an artefact
  const decorSpots = b.decorSpots.filter((d) => !Object.values(artefacts).some((q) => Math.hypot(q.x - d.x, q.y - d.y) < 1.5));
  const world: GeneratedWorld = { map, w: map.size.w, h: map.size.h, terrain: b.terrain, blocks, placements: b.placements, decorSpots, artefacts };
  cache.set(map.id, world);
  return world;
}

export function terrainAtWorld(world: GeneratedWorld, x: number, y: number): string {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= world.w || yi >= world.h) return world.map.base;
  return world.terrain[yi * world.w + xi];
}

/** Footprint of a placement (props are a small square around their foot point). */
export function placementRect(p: Placement): Rect {
  switch (p.kind) {
    case 'building':
    case 'fence':
      return { x0: Math.min(p.x0, p.x1), y0: Math.min(p.y0, p.y1), x1: Math.max(p.x0, p.x1), y1: Math.max(p.y0, p.y1) };
    case 'plane':
      return { x0: p.x - 3, y0: p.y - 3.2, x1: p.x + 3, y1: p.y + 3 };
    default:
      return { x0: p.x - 0.3, y0: p.y - 0.3, x1: p.x + 0.3, y1: p.y + 0.3 };
  }
}

export const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Development-time checks for a map definition (also run by the tests). */
export function validateMap(map: MapDef): string[] {
  const errs: string[] = [];
  const { w, h } = map.size;
  if (w < 32 || h < 32 || w > 128 || h > 128) errs.push(`${map.id}: size out of range`);
  for (const list of [map.avenues, map.streets]) for (let i = 1; i < list.length; i++) if (list[i] <= list[i - 1]) errs.push(`${map.id}: roads must be ascending`);
  if (!map.plots.length) errs.push(`${map.id}: needs at least one plot`);
  if (new Set(map.plots.map((p) => p.id)).size !== map.plots.length) errs.push(`${map.id}: duplicate plot id`);
  for (const p of map.plots) {
    const r = blockRect(map, p.col, p.row);
    // customers arrive and leave along the street up to 3 tiles beyond the largest shop
    if (r && r.y0 + 2 + PLOT_SIZE.h - 2 + 4 > h) errs.push(`${map.id}/${p.id}: no room for the street beyond the shop`);
    if (!r || p.col < 0) {
      errs.push(`${map.id}/${p.id}: plot must be in a block east of an avenue`);
      continue;
    }
    if (r.x1 - r.x0 < PLOT_SIZE.w || r.y1 - r.y0 < PLOT_SIZE.h) errs.push(`${map.id}/${p.id}: block too small for the largest shop`);
  }
  for (const a of map.artefacts) {
    const r = blockRect(map, a.col, a.row);
    if (!r) errs.push(`${map.id}/${a.id}: artefact block missing`);
    else if (!generateWorld(map).artefacts[a.id]) errs.push(`${map.id}/${a.id}: no clear spot for the artefact in its block`);
    else if (map.plots.some((p) => p.col === a.col && p.row === a.row)) errs.push(`${map.id}/${a.id}: artefact inside a shop plot`);
    if (a.fx < 0 || a.fx > 1 || a.fy < 0 || a.fy > 1) errs.push(`${map.id}/${a.id}: position outside its block`);
  }
  return errs;
}

export function allMaps(): MapDef[] {
  return Object.values(MAPS);
}
