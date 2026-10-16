/**
 * Location art sets: which terrain covers the ground around the shop and which props, buildings,
 * fences and vehicles stand there. Purely visual and deterministic (seeded by the set and the shop
 * size), so the same shop always looks the same and nothing here touches the simulation.
 *
 * Ground coordinates: the shop occupies [0, S)²; customers walk along the pavement at x ≈ −0.5;
 * the road is x ∈ [−4, −2); the scene runs from −8 to S + 7 on both axes.
 */
export type LocationSetId = 'town' | 'city' | 'beach' | 'airport' | 'night_market' | 'countryside';

export type BuildingStyle = 'stockroom' | 'house' | 'office' | 'hut' | 'barn' | 'terminal' | 'control_tower' | 'stall' | 'silo';

export type Placement =
  | { kind: 'prop'; id: string; x: number; y: number; size?: number; glow?: string; flip?: boolean }
  | { kind: 'building'; style: BuildingStyle; x0: number; y0: number; x1: number; y1: number; h: number; color: string; roof?: string; accent?: string }
  | { kind: 'fence'; x0: number; y0: number; x1: number; y1: number; color: string }
  | { kind: 'plane'; x: number; y: number };

export interface LocationSet {
  id: LocationSetId;
  /** Terrain id for the ground cell whose top-left corner is (cx, cy). */
  terrainAt(cx: number, cy: number, S: number): string;
  layout(S: number): Placement[];
  /** Moving things on the road / water (visual only). */
  traffic: 'cars' | 'boats' | 'none';
  /** Darken the ground for night scenes (lamps and lanterns then glow). */
  night?: boolean;
  /** A signature prop used for the location's thumbnail. */
  icon: string;
}

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

const seedOf = (id: string, S: number) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) + S * 7919;

/** Shared street layout: road at cx ∈ {−4, −3}, pavement at {−2, −1}, the shop floor itself. */
function street(cx: number, cy: number, S: number, road = 'road', walk = 'pavement'): string | null {
  if (cx >= 0 && cy >= 0 && cx < S && cy < S) return 'pavement';
  if (cx === -4 || cx === -3) return road;
  if (cx === -2 || cx === -1) return walk;
  return null;
}

/** True if a prop at (x, y) keeps clear of the shop, the street, the door and the entrance. */
export function clearOfShop(x: number, y: number, S: number, margin = 0.6): boolean {
  if (x > -margin && x < S + margin && y > -margin && y < S + margin) return false;
  if (x > -4.4 && x < 0.2) return false;
  // the stockroom annex behind the north wall
  if (x > 0.1 && x < 3.8 && y > -2.4 && y < 0) return false;
  return true;
}

/** The stockroom annex that every shop has behind its stockroom door (visual only). */
export function stockroomAnnex(): Placement[] {
  return [
    { kind: 'building', style: 'stockroom', x0: 0.35, y0: -1.75, x1: 2.65, y1: -0.15, h: 30, color: '#ced4da', roof: '#6c757d', accent: '#ffd166' },
    { kind: 'prop', id: 'deco.crate_stack', x: 3.2, y: -0.8 },
  ];
}

/** Evenly spread props around the back and sides of the shop with jitter. */
function ring(S: number, r: () => number, ids: string[], count: number, opts: { minX?: number } = {}): Placement[] {
  const out: Placement[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    const side = r();
    let x: number;
    let y: number;
    if (side < 0.45) {
      x = S + 0.9 + r() * 5.4;
      y = -7 + r() * (S + 13);
    } else if (side < 0.75) {
      x = (opts.minX ?? 0.6) + r() * (S + 5);
      y = -1.1 - r() * 5.9;
    } else {
      x = (opts.minX ?? 0.6) + r() * (S + 5);
      y = S + 1.1 + r() * 5.4;
    }
    if (!clearOfShop(x, y, S, 0.9)) continue;
    if (out.some((p) => p.kind === 'prop' && Math.hypot(p.x - x, p.y - y) < 1.25)) continue;
    out.push({ kind: 'prop', id: `deco.${ids[Math.floor(r() * ids.length)]}`, x, y, flip: r() < 0.5 });
  }
  return out;
}

/** Streetlights (or lanterns) along the pavement, skipping the door. */
function lamps(S: number, id: string, glow: string, step = 4): Placement[] {
  const out: Placement[] = [];
  for (let y = -6; y < S + 6; y += step) if (y < -0.5 || y > 3.5) out.push({ kind: 'prop', id, x: -1.9, y, glow });
  return out;
}

/** Along the far side of the road, a row of buildings separated by gaps. */
function acrossRow(S: number, r: () => number, make: (y0: number, y1: number, i: number) => Placement[], width = 2.6, gap = 1.2): Placement[] {
  const out: Placement[] = [];
  let y = -7.5;
  let i = 0;
  while (y + width < S + 6.5) {
    out.push(...make(y, y + width, i++));
    y += width + gap + r() * 0.8;
  }
  return out;
}

const pick = <T>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];

export const LOCATION_SETS: Record<LocationSetId, LocationSet> = {
  town: {
    id: 'town',
    traffic: 'cars',
    icon: 'deco.tree_round',
    terrainAt(cx, cy, S) {
      const st = street(cx, cy, S);
      if (st) return st;
      // a pavement apron around the shop and paths to the houses
      if (cx >= 0 && cx <= S && (cy === -1 || cy === S)) return 'pavement';
      if (cx === S && cy >= -1 && cy <= S) return 'pavement';
      // a little park pond behind the shop
      const px = S + 3.5;
      const py = Math.floor(S / 2);
      const d = Math.hypot(cx + 0.5 - px, (cy + 0.5 - py) * 1.2);
      if (d < 1.5) return 'water';
      if (d < 2.1) return 'sand';
      return 'grass';
    },
    layout(S) {
      const r = rng(seedOf('town', S));
      const out: Placement[] = [];
      const roofs = ['#e76f51', '#457b9d', '#9d4edd', '#2a9d8f', '#bc6c25'];
      const walls = ['#fff1e6', '#fde2e4', '#e2ece9', '#fff3b0', '#dfe7fd'];
      out.push(...acrossRow(S, r, (y0, y1, i) => [
        { kind: 'building', style: 'house', x0: -7.7, y0, x1: -5.3, y1, h: 26 + r() * 6, color: walls[i % walls.length], roof: roofs[(i * 3) % roofs.length], accent: '#6f4518' },
        { kind: 'prop', id: 'deco.mailbox', x: -4.75, y: y0 + 0.4 },
        { kind: 'fence', x0: -5.05, y0: y0 + 0.9, x1: -5.05, y1: y1 + 0.6, color: '#ffffff' },
      ]));
      out.push(...lamps(S, 'deco.streetlight', 'rgba(255,243,176,0.5)'));
      // the park: fountain, benches, flowers
      const py = Math.floor(S / 2);
      out.push({ kind: 'prop', id: 'deco.bench', x: S + 1.6, y: py - 2.2 }, { kind: 'prop', id: 'deco.bench', x: S + 1.6, y: py + 2.4 });
      out.push({ kind: 'prop', id: 'deco.rocks_small', x: S + 5.3, y: py + 1.3 }, { kind: 'prop', id: 'deco.flower_bed', x: S + 1.4, y: py });
      out.push({ kind: 'prop', id: 'deco.trash_bin', x: -1.75, y: 3.8 });
      out.push(...ring(S, r, ['tree_round', 'tree_round', 'tree_fruit', 'bush', 'flower_bed', 'hedge', 'tree_pine'], 16).filter((p) => p.kind !== 'prop' || Math.hypot(p.x - (S + 3.5), p.y - py) > 2.6));
      return out;
    },
  },
  city: {
    id: 'city',
    traffic: 'cars',
    icon: 'deco.bus_stop',
    terrainAt(cx, cy, S) {
      const st = street(cx, cy, S);
      if (st) return st;
      // grass squares in the plaza
      if (cx > S && ((cx - S) % 5 === 2 || (cx - S) % 5 === 3) && ((cy + 8) % 6 === 2 || (cy + 8) % 6 === 3)) return 'grass';
      return 'pavement';
    },
    layout(S) {
      const r = rng(seedOf('city', S));
      const out: Placement[] = [];
      const glass = ['#6c757d', '#8d99ae', '#5c677d', '#4a6fa5', '#7d8597'];
      out.push(...acrossRow(S, r, (y0, y1, i) => [{ kind: 'building', style: 'office', x0: -7.8, y0, x1: -5, y1, h: 60 + r() * 70, color: glass[i % glass.length], accent: '#ffe066' }], 2.8, 0.6));
      // tower blocks behind the shop
      for (let y = -7; y < S + 5; y += 4.2) out.push({ kind: 'building', style: 'office', x0: S + 4, y0: y, x1: S + 6.6, y1: y + 3, h: 70 + r() * 80, color: pick(glass, r), accent: '#caf0f8' });
      for (let x = 1; x < S + 3; x += 4.4) out.push({ kind: 'building', style: 'office', x0: x, y0: -7.6, x1: x + 3, y1: -5, h: 50 + r() * 60, color: pick(glass, r), accent: '#ffe066' });
      out.push(...lamps(S, 'deco.streetlight', 'rgba(255,243,176,0.5)', 3));
      out.push({ kind: 'prop', id: 'deco.bus_stop', x: -1.9, y: S + 1.5 }, { kind: 'prop', id: 'deco.road_sign', x: -1.85, y: -1.4 });
      out.push({ kind: 'prop', id: 'deco.trash_bin', x: -1.75, y: 3.9 }, { kind: 'prop', id: 'deco.fountain', x: S + 2.2, y: Math.floor(S / 2) });
      out.push(...ring(S, r, ['planter', 'tree_round', 'bench', 'trash_bin', 'planter'], 10).filter((p) => p.kind === 'prop' && p.x < S + 3.6 && p.y > -4.6));
      return out;
    },
  },
  beach: {
    id: 'beach',
    traffic: 'boats',
    icon: 'deco.palm',
    terrainAt(cx, cy, S) {
      if (cx >= 0 && cx < S && cy >= 0 && cy < S) return 'pavement';
      if (cx === -2 || cx === -1) return 'boardwalk';
      if (cx <= -4) return 'water';
      // a rocky outcrop at each end of the beach
      if ((cx === -3 || cx === -5) && (cy === -7 || cy === S + 5)) return 'rock';
      if (cx > S + 3 && ((cx + cy) % 7 === 0 || (cx * 3 + cy) % 11 === 0)) return 'grass';
      return 'sand';
    },
    layout(S) {
      const r = rng(seedOf('beach', S));
      const out: Placement[] = [];
      const huts = ['#ff70a6', '#4cc9f0', '#ffd166', '#06d6a0', '#ff9f1c'];
      for (let y = -6.5, i = 0; y < S + 5; y += 3.6, i++) out.push({ kind: 'building', style: 'hut', x0: S + 4.4, y0: y, x1: S + 5.9, y1: y + 1.5, h: 22, color: huts[i % huts.length], roof: '#ffffff' });
      out.push({ kind: 'prop', id: 'deco.lifebuoy', x: -1.9, y: -1.6 }, { kind: 'prop', id: 'deco.lifebuoy', x: -1.9, y: S + 1.6 });
      out.push({ kind: 'prop', id: 'deco.rock', x: -3.4, y: S + 3.2 }, { kind: 'prop', id: 'deco.rocks_small', x: -3.2, y: -5 });
      out.push(...ring(S, r, ['palm', 'palm', 'umbrella', 'beach_towel', 'umbrella', 'rocks_small'], 15).filter((p) => p.kind === 'prop' && p.x < S + 4));
      return out;
    },
  },
  airport: {
    id: 'airport',
    traffic: 'cars',
    icon: 'deco.windsock',
    terrainAt(cx, cy, S) {
      const st = street(cx, cy, S);
      if (st) return st;
      if (cx === -5 || (cx > S + 1 && cx < S + 3)) return 'grass';
      return 'tarmac';
    },
    layout(S) {
      const r = rng(seedOf('airport', S));
      const out: Placement[] = [];
      out.push({ kind: 'plane', x: -7, y: Math.floor(S / 2) + 0.5 });
      for (let y = -7; y < S + 6; y += 2) out.push({ kind: 'prop', id: 'deco.runway_light', x: -5.5, y, glow: 'rgba(255,209,102,0.5)' });
      out.push({ kind: 'building', style: 'terminal', x0: S + 3.2, y0: -6, x1: S + 6.6, y1: S + 4, h: 46, color: '#adb5bd', accent: '#90e0ef' });
      out.push({ kind: 'building', style: 'control_tower', x0: S + 4, y0: S + 4.6, x1: S + 5.4, y1: S + 6, h: 120, color: '#e9ecef', accent: '#48cae4' });
      out.push({ kind: 'prop', id: 'deco.windsock', x: S + 2, y: -5.5 });
      out.push(...lamps(S, 'deco.streetlight', 'rgba(255,243,176,0.5)', 3));
      for (let i = 0; i < 6; i++) out.push({ kind: 'prop', id: 'deco.cone', x: 1 + r() * S, y: -1.4 - r() * 0.6 });
      out.push(...ring(S, r, ['planter', 'bush', 'trash_bin'], 6).filter((p) => p.kind === 'prop' && p.x < S + 3));
      return out;
    },
  },
  night_market: {
    id: 'night_market',
    traffic: 'none',
    night: true,
    icon: 'deco.lantern_post',
    terrainAt(cx, cy, S) {
      const st = street(cx, cy, S, 'cobble', 'cobble');
      if (st) return st;
      return 'cobble';
    },
    layout(S) {
      const r = rng(seedOf('night_market', S));
      const out: Placement[] = [];
      const canopies = ['#e63946', '#ff9e00', '#7209b7', '#06d6a0', '#f72585'];
      out.push(...acrossRow(S, r, (y0, y1, i) => [{ kind: 'building', style: 'stall', x0: -6.8, y0, x1: -5, y1, h: 18, color: '#8d5524', roof: canopies[i % canopies.length], accent: '#ffd166' }], 1.8, 1));
      for (let y = -6.5, i = 0; y < S + 5; y += 2.8, i++) out.push({ kind: 'building', style: 'stall', x0: S + 1.4, y0: y, x1: S + 3.2, y1: y + 1.8, h: 18, color: '#6f4518', roof: canopies[(i + 2) % canopies.length], accent: '#ffd166' });
      out.push(...lamps(S, 'deco.lantern_post', 'rgba(255,158,0,0.55)', 3));
      for (let y = -6; y < S + 5; y += 3) out.push({ kind: 'prop', id: 'deco.lantern_post', x: S + 4.2, y: y + 1.4, glow: 'rgba(255,158,0,0.55)' });
      out.push(...ring(S, r, ['crate_stack', 'string_lights', 'crate_stack'], 6).filter((p) => p.kind === 'prop' && p.x < S + 1));
      return out;
    },
  },
  countryside: {
    id: 'countryside',
    traffic: 'cars',
    icon: 'deco.hay_bale',
    terrainAt(cx, cy, S) {
      const st = street(cx, cy, S, 'road', 'dirt');
      if (st) return st;
      if (cx <= -5) return cy % 7 === 3 ? 'dirt' : 'field';
      const px = S + 4;
      const py = S + 3;
      const d = Math.hypot(cx + 0.5 - px, (cy + 0.5 - py) * 1.3);
      if (d < 1.7) return 'water';
      if (d < 2.3) return 'rock';
      if (cx >= 0 && cx <= S && cy === -1) return 'dirt';
      return 'grass';
    },
    layout(S) {
      const r = rng(seedOf('countryside', S));
      const out: Placement[] = [];
      out.push({ kind: 'building', style: 'barn', x0: S + 2.4, y0: -6.6, x1: S + 5.6, y1: -2.6, h: 34, color: '#c1121f', roof: '#6c584c', accent: '#ffffff' });
      out.push({ kind: 'building', style: 'silo', x0: S + 5.8, y0: -5.8, x1: S + 6.8, y1: -4.8, h: 56, color: '#adb5bd', roof: '#6c757d' });
      out.push({ kind: 'building', style: 'house', x0: 2, y0: -6.8, x1: 4.6, y1: -4.4, h: 28, color: '#fff1e6', roof: '#6c584c', accent: '#6f4518' });
      out.push({ kind: 'fence', x0: -4.7, y0: -7.6, x1: -4.7, y1: S + 6.6, color: '#bc8a5f' });
      out.push({ kind: 'fence', x0: S + 1.8, y0: -7.2, x1: S + 6.8, y1: -7.2, color: '#bc8a5f' });
      out.push({ kind: 'fence', x0: S + 1.8, y0: -7.2, x1: S + 1.8, y1: -2, color: '#bc8a5f' });
      out.push({ kind: 'prop', id: 'deco.scarecrow', x: -6.4, y: Math.floor(S / 2) });
      for (let y = -6; y < S + 6; y += 3.4) out.push({ kind: 'prop', id: 'deco.hay_bale', x: -5.6 - r() * 2, y: y + r() });
      out.push({ kind: 'prop', id: 'deco.rocks_small', x: S + 2.2, y: S + 4.6 });
      out.push(...ring(S, r, ['tree_pine', 'tree_fruit', 'tree_round', 'bush', 'hay_bale', 'flower_bed'], 14).filter((p) => p.kind === 'prop' && Math.hypot(p.x - (S + 4), p.y - (S + 3)) > 2.6 && !(p.x > S + 1.8 && p.y < -2)));
      return out;
    },
  },
};

/** Gameplay location id → art set. Unknown ids fall back to the town set. */
export const LOCATION_ART: Record<string, LocationSetId> = {
  neighborhood: 'town',
  downtown: 'city',
  beach: 'beach',
  airport: 'airport',
  night_market: 'night_market',
  countryside: 'countryside',
};

export function locationSet(locationId: string): LocationSet {
  return LOCATION_SETS[LOCATION_ART[locationId] ?? 'town'];
}

/** Seasonal outdoor decor for active season ids (purely visual). */
export function seasonalProps(seasons: string[], S: number): Placement[] {
  const out: Placement[] = [];
  const r = rng(seedOf('season', S));
  if (seasons.includes('halloween')) {
    for (let i = 0; i < 6; i++) out.push({ kind: 'prop', id: 'deco.pumpkin', x: -1.75, y: i < 3 ? -0.6 - i * 0.7 : 3.6 + (i - 3) * 0.7 });
    out.push(...ring(S, r, ['leaf_pile'], 5));
  }
  if (seasons.includes('winter')) out.push(...ring(S, r, ['snow_pile'], 8));
  if (seasons.includes('spring')) out.push(...ring(S, r, ['flower_bed'], 5));
  if (seasons.includes('summer')) out.push(...ring(S, r, ['umbrella'], 2));
  return out;
}
