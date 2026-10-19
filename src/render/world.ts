import { iso, faces, depth, shade, view } from './iso';
import { box } from './shapes';
import { drawSprite } from '../assets/spriteCache';
import { TERRAIN } from '../assets/terrain';
import { tone } from '../assets/draw';
import { textureImage, artVersion, TEXTURE_CELL } from '../assets/images';
import { mapFor, type MapDef } from '../world/maps';
import { generateWorld, plotById, plotOrigin, plotRect, artefactPos, type GeneratedWorld, type Placement } from '../world/gen';

/**
 * The world around the shop, drawn from the generated world map (src/world): terrain painted on the
 * ground plane, buildings and vehicles built from real boxes (so they rotate with the camera), and
 * billboard props from the asset registry. Everything is in world tiles, shifted so the active shop
 * plot's origin is the shop's tile (0,0). Visual only: nothing here touches the simulation.
 */

export interface WorldItem {
  x: number;
  y: number;
  draw: () => void;
  /** Rough on-screen radius in px at zoom 1 (for culling). */
  r?: number;
}

interface GroundBake {
  canvas: HTMLCanvasElement;
  R: number;
  water: [number, number][];
}

function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ground canvas resolution: pixels per tile for a world of this size (keeps the bake ≤ 1536 px). */
export const bakeResolution = (w: number, h: number) => Math.max(12, Math.min(32, Math.floor(1536 / Math.max(w, h))));

function bakeGround(world: GeneratedWorld): GroundBake | null {
  if (typeof document === 'undefined') return null;
  const W = world.w;
  const H = world.h;
  const R = bakeResolution(W, H);
  const canvas = document.createElement('canvas');
  canvas.width = W * R;
  canvas.height = H * R;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const at = (i: number, j: number) => (j >= 0 && j < H && i >= 0 && i < W ? world.terrain[j * W + i] : null);
  const water: [number, number][] = [];
  const ids = [...new Set(world.terrain)].sort((a, b) => (TERRAIN[a]?.z ?? 0) - (TERRAIN[b]?.z ?? 0));
  for (const id of ids) {
    const t = TERRAIN[id] ?? TERRAIN.grass;
    const tex = textureImage(id);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        if (world.terrain[j * W + i] !== id) continue;
        const px = i * R;
        const py = j * R;
        ctx.fillStyle = t.base;
        ctx.fillRect(px - 0.5, py - 0.5, R + 1, R + 1);
        if (id === 'water') water.push([i, j]);
        // soft edges spill over lower neighbours as a row of overlapping blobs
        if (t.soft) {
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = at(i + di, j + dj);
            if (!n || n === id || (TERRAIN[n]?.z ?? 0) > t.z || !TERRAIN[n]?.soft) continue;
            ctx.fillStyle = t.base;
            for (let k = 0; k < 4; k++) {
              const u = (k + 0.5) / 4 + (hash(i, j, k) - 0.5) * 0.15;
              const ex = px + (di === 0 ? u * R : di > 0 ? R : 0);
              const ey = py + (dj === 0 ? u * R : dj > 0 ? R : 0);
              ctx.beginPath();
              ctx.arc(ex, ey, R * (0.14 + hash(i, j, k + 9) * 0.12), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        // texture file (one of its 4 cells, picked per cell) or the procedural detail pattern
        if (tex) {
          const q = Math.floor(hash(i, j, 21) * 4);
          ctx.drawImage(tex, (q % 2) * TEXTURE_CELL, Math.floor(q / 2) * TEXTURE_CELL, TEXTURE_CELL, TEXTURE_CELL, px, py, R, R);
        } else detail(ctx, t.detail, t, px, py, R, i, j);
        // a kerb where a hard surface meets a soft one
        if (!t.soft) {
          ctx.strokeStyle = tone(t.base, -0.22);
          ctx.lineWidth = Math.max(1, R * 0.07);
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = at(i + di, j + dj);
            if (!n || n === id || !TERRAIN[n]?.soft) continue;
            ctx.beginPath();
            const ax = px + (di > 0 ? R : 0);
            const ay = py + (dj > 0 ? R : 0);
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + (di === 0 ? R : 0), ay + (dj === 0 ? R : 0));
            ctx.stroke();
          }
        }
      }
    }
  }
  // foam where water meets land
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(1, R * 0.06);
  for (const [i, j] of water) {
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at(i + di, j + dj);
      if (!n || n === 'water') continue;
      const inset = R * 0.32;
      const ax = i * R + (di > 0 ? R - inset : di < 0 ? inset : 0);
      const ay = j * R + (dj > 0 ? R - inset : dj < 0 ? inset : 0);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      if (di === 0) ctx.quadraticCurveTo(ax + R / 2, ay + (hash(i, j) - 0.5) * R * 0.2, ax + R, ay);
      else ctx.quadraticCurveTo(ax + (hash(i, j) - 0.5) * R * 0.2, ay + R / 2, ax, ay + R);
      ctx.stroke();
    }
  }
  roadMarkings(ctx, world.map, R, at);
  if (world.map.night) {
    ctx.fillStyle = 'rgba(16,4,46,0.42)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return { canvas, R, water };
}

/** Dashed centre lines on every road and zebra crossings beside each junction. */
function roadMarkings(ctx: CanvasRenderingContext2D, map: MapDef, R: number, at: (i: number, j: number) => string | null): void {
  if (map.road !== 'road') return;
  const inStreet = (y: number) => map.streets.some((s) => y >= s && y < s + 2);
  const inAvenue = (x: number) => map.avenues.some((a) => x >= a && x < a + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const a of map.avenues) for (let j = 0; j < map.size.h; j++) if (!inStreet(j) && at(a, j) === 'road') ctx.fillRect((a + 1) * R - R * 0.04, j * R + R * 0.2, R * 0.08, R * 0.45);
  for (const s of map.streets) for (let i = 0; i < map.size.w; i++) if (!inAvenue(i) && at(i, s) === 'road') ctx.fillRect(i * R + R * 0.2, (s + 1) * R - R * 0.04, R * 0.45, R * 0.08);
  // zebra crossings on the four arms of each junction
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const a of map.avenues)
    for (const s of map.streets) {
      for (const j of [s - 1, s + 2]) for (let k = 0; k < 4; k++) ctx.fillRect(a * R + (k + 0.15) * (R / 2), j * R + R * 0.15, R * 0.3, R * 0.7);
      for (const i of [a - 1, a + 2]) for (let k = 0; k < 4; k++) ctx.fillRect(i * R + R * 0.15, s * R + (k + 0.15) * (R / 2), R * 0.7, R * 0.3);
    }
}

/** Paints a terrain texture file's content: 2×2 cells of base colour and detail (used by the exporter). */
export function paintTerrainTexture(ctx: CanvasRenderingContext2D, id: string): void {
  const t = TERRAIN[id] ?? TERRAIN.grass;
  const R = TEXTURE_CELL;
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = t.base;
      ctx.fillRect(i * R, j * R, R, R);
      detail(ctx, t.detail, t, i * R, j * R, R, i + 17, j + 31);
    }
}

function detail(ctx: CanvasRenderingContext2D, kind: string, t: { base: string; alt: string }, px: number, py: number, R: number, i: number, j: number): void {
  const h = (k: number) => hash(i, j, k);
  ctx.fillStyle = t.alt;
  ctx.strokeStyle = t.alt;
  ctx.lineWidth = Math.max(1, R * 0.05);
  switch (kind) {
    case 'tufts':
      for (let k = 0; k < 3; k++) {
        const x = px + h(k) * R;
        const y = py + h(k + 5) * R;
        ctx.beginPath();
        ctx.moveTo(x - R * 0.06, y - R * 0.08);
        ctx.lineTo(x, y);
        ctx.lineTo(x + R * 0.06, y - R * 0.09);
        ctx.stroke();
      }
      if (h(11) < 0.14) {
        ctx.fillStyle = h(12) < 0.5 ? '#ffffff' : '#ffe066';
        ctx.beginPath();
        ctx.arc(px + h(13) * R, py + h(14) * R, R * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'slabs':
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, R / 2, R / 2);
      ctx.strokeRect(px + R / 2 + 0.5, py + R / 2 + 0.5, R / 2, R / 2);
      break;
    case 'asphalt':
    case 'tarmac':
      for (let k = 0; k < 5; k++) ctx.fillRect(px + h(k) * R, py + h(k + 7) * R, R * 0.06, R * 0.04);
      break;
    case 'waves':
      ctx.beginPath();
      ctx.arc(px + h(1) * R, py + h(2) * R, R * 0.18, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    case 'grain':
      for (let k = 0; k < 6; k++) ctx.fillRect(px + h(k) * R, py + h(k + 3) * R, R * 0.04, R * 0.04);
      break;
    case 'stones':
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(px + h(k) * R, py + h(k + 4) * R, R * 0.12, R * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'ruts':
      ctx.beginPath();
      ctx.moveTo(px + R * 0.3, py);
      ctx.lineTo(px + R * 0.3, py + R);
      ctx.moveTo(px + R * 0.7, py);
      ctx.lineTo(px + R * 0.7, py + R);
      ctx.stroke();
      break;
    case 'rows':
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(px, py + (k + 0.35) * (R / 4), R, R * 0.06);
        ctx.fillStyle = tone(t.alt, -0.15);
        for (let m = 0; m < 4; m++) ctx.fillRect(px + (m + 0.3) * (R / 4), py + (k + 0.2) * (R / 4), R * 0.07, R * 0.07);
        ctx.fillStyle = t.alt;
      }
      break;
    case 'cobbles':
      ctx.lineWidth = 1;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const w = R / 3;
        const off = b % 2 ? w / 2 : 0;
        ctx.beginPath();
        ctx.roundRect?.(px + a * w + off - (off && a === 2 ? w : 0) + 1, py + b * w + 1, w - 2, w - 2, w * 0.3);
        ctx.stroke();
      }
      break;
    case 'boards':
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(px, py + (k * R) / 4);
        ctx.lineTo(px + R, py + (k * R) / 4);
        ctx.stroke();
      }
      break;
  }
}

// ------------------------------------------------------------------- geometry helpers

function quad(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

type Side = { ax: number; ay: number; bx: number; by: number; nx: number; ny: number };

function sidesOf(x0: number, y0: number, x1: number, y1: number): Side[] {
  return [
    { ax: x1, ay: y0, bx: x1, by: y1, nx: 1, ny: 0 },
    { ax: x0, ay: y1, bx: x1, by: y1, nx: 0, ny: 1 },
    { ax: x0, ay: y0, bx: x0, by: y1, nx: -1, ny: 0 },
    { ax: x0, ay: y0, bx: x1, by: y0, nx: 0, ny: -1 },
  ];
}

/** A rectangle on a side face: u along the side (0..1), z in px. */
function panel(ctx: CanvasRenderingContext2D, s: Side, u0: number, u1: number, z0: number, z1: number, fill: string, stroke?: string): void {
  const p = (u: number, z: number) => iso(s.ax + (s.bx - s.ax) * u, s.ay + (s.by - s.ay) * u, z);
  quad(ctx, [p(u0, z0), p(u1, z0), p(u1, z1), p(u0, z1)], fill, stroke);
}

/** Gable roof over a footprint; the ridge runs along the longer side. */
function gableRoof(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, zb: number, rh: number, color: string, gable: string): void {
  const o = 0.15;
  const alongX = x1 - x0 >= y1 - y0;
  const P = (x: number, y: number, z: number) => iso(x, y, z);
  if (alongX) {
    const ym = (y0 + y1) / 2;
    const slopes = [
      { pts: [P(x0 - o, y0 - o, zb - 2), P(x1 + o, y0 - o, zb - 2), P(x1 + o, ym, zb + rh), P(x0 - o, ym, zb + rh)], d: depth((x0 + x1) / 2, y0), lit: faces(0, -1) },
      { pts: [P(x0 - o, y1 + o, zb - 2), P(x1 + o, y1 + o, zb - 2), P(x1 + o, ym, zb + rh), P(x0 - o, ym, zb + rh)], d: depth((x0 + x1) / 2, y1), lit: faces(0, 1) },
    ].sort((a, b) => a.d - b.d);
    quad(ctx, slopes[0].pts, shade(color, slopes[0].lit ? 0 : -0.2), shade(color, -0.45));
    for (const [x, nx] of [[x0, -1], [x1, 1]] as const) if (faces(nx, 0)) quad(ctx, [P(x, y0, zb), P(x, y1, zb), P(x, ym, zb + rh)], gable, shade(gable, -0.4));
    quad(ctx, slopes[1].pts, shade(color, slopes[1].lit ? 0.08 : -0.12), shade(color, -0.45));
  } else {
    const xm = (x0 + x1) / 2;
    const slopes = [
      { pts: [P(x0 - o, y0 - o, zb - 2), P(x0 - o, y1 + o, zb - 2), P(xm, y1 + o, zb + rh), P(xm, y0 - o, zb + rh)], d: depth(x0, (y0 + y1) / 2), lit: faces(-1, 0) },
      { pts: [P(x1 + o, y0 - o, zb - 2), P(x1 + o, y1 + o, zb - 2), P(xm, y1 + o, zb + rh), P(xm, y0 - o, zb + rh)], d: depth(x1, (y0 + y1) / 2), lit: faces(1, 0) },
    ].sort((a, b) => a.d - b.d);
    quad(ctx, slopes[0].pts, shade(color, slopes[0].lit ? 0 : -0.2), shade(color, -0.45));
    for (const [y, ny] of [[y0, -1], [y1, 1]] as const) if (faces(0, ny)) quad(ctx, [P(x0, y, zb), P(x1, y, zb), P(xm, y, zb + rh)], gable, shade(gable, -0.4));
    quad(ctx, slopes[1].pts, shade(color, slopes[1].lit ? 0.08 : -0.12), shade(color, -0.45));
  }
}

/** A regular prism (silo, tower shaft): only camera-facing faces are drawn. */
function prism(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, z0: number, h: number, color: string, top: string): void {
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) pts.push([cx + Math.cos((k / n) * Math.PI * 2) * r, cy + Math.sin((k / n) * Math.PI * 2) * r]);
  for (let k = 0; k < n; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[(k + 1) % n];
    const mx = (ax + bx) / 2 - cx;
    const my = (ay + by) / 2 - cy;
    if (!faces(mx, my)) continue;
    const lit = mx * -0.6 + my * -0.8;
    quad(ctx, [iso(ax, ay, z0), iso(bx, by, z0), iso(bx, by, z0 + h), iso(ax, ay, z0 + h)], shade(color, lit * 0.25 - 0.08), shade(color, -0.4));
  }
  quad(ctx, pts.map(([x, y]) => iso(x, y, z0 + h)), top, shade(top, -0.4));
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Extract<Placement, { kind: 'building' }>, lit: boolean): void {
  const { x0, y0, x1, y1, h, color } = b;
  const visible = sidesOf(x0, y0, x1, y1).filter((s) => faces(s.nx, s.ny));
  const winLit = lit ? '#ffe066' : 'rgba(202,240,248,0.85)';
  switch (b.style) {
    case 'stockroom': {
      box(ctx, x0, y0, x1, y1, h, color);
      for (const s of visible) {
        if (s.ny === 1) continue; // that side touches the shop wall
        panel(ctx, s, 0.22, 0.78, 0, h * 0.72, '#adb5bd', 'rgba(0,0,0,0.3)');
        for (let z = 4; z < h * 0.72; z += 4) panel(ctx, s, 0.22, 0.78, z, z + 0.8, 'rgba(0,0,0,0.18)');
        panel(ctx, s, 0.22, 0.78, h * 0.78, h * 0.9, b.accent ?? '#ffd166');
      }
      box(ctx, x0 - 0.1, y0 - 0.1, x1 + 0.1, y1, 3, b.roof ?? '#6c757d', h);
      break;
    }
    case 'cafe':
    case 'storefront': {
      box(ctx, x0, y0, x1, y1, h, color);
      for (const s of visible) {
        const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
        // big shop window and a door, then a striped awning above them
        panel(ctx, s, 0.08, 0.62, 3, h * 0.55, winLit, 'rgba(255,255,255,0.9)');
        panel(ctx, s, 0.7, 0.9, 0, h * 0.55, b.accent === '#ffffff' ? '#6f4518' : b.accent ?? '#6f4518', 'rgba(0,0,0,0.3)');
        const stripes = Math.max(3, Math.round(len * 2.4));
        for (let k = 0; k < stripes; k++) panel(ctx, s, k / stripes, (k + 1) / stripes, h * 0.58, h * 0.72, k % 2 ? '#ffffff' : b.roof ?? '#ef476f');
      }
      box(ctx, x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, 3, shade(color, -0.12), h);
      if (b.style === 'cafe') {
        const c = iso((x0 + x1) / 2, (y0 + y1) / 2, h + 3);
        ctx.fillStyle = '#6f4518';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - 5, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 7px Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☕', c.x, c.y - 5);
      }
      break;
    }
    case 'subway': {
      // a low entrance with a dark stairwell, railings and a lit name band
      box(ctx, x0, y0, x1, y1, 3, '#6c757d');
      box(ctx, x0 + 0.3, y0 + 0.3, x1 - 0.3, y1 - 0.3, 0.5, '#1b1b2f', 3);
      for (let k = 1; k < 5; k++) box(ctx, x0 + 0.3, y0 + 0.3 + (k * (y1 - y0 - 0.6)) / 5, x1 - 0.3, y0 + 0.36 + (k * (y1 - y0 - 0.6)) / 5, 0.3, '#495057', 3.5 - k * 0.5, false);
      for (const [ax, ay, bx, by] of [[x0, y0, x0, y1], [x1, y0, x1, y1], [x0, y0, x1, y0]] as const) {
        const a = iso(ax, ay, 12);
        const bb = iso(bx, by, 12);
        ctx.strokeStyle = b.roof ?? '#4cc9f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bb.x, bb.y);
        ctx.stroke();
      }
      break;
    }
    case 'frame': {
      // an unfinished building: corner posts, two floors of beams and a crane-yellow top
      const posts: [number, number][] = [[x0, y0], [x1 - 0.2, y0], [x0, y1 - 0.2], [x1 - 0.2, y1 - 0.2]];
      for (const [px, py] of posts) box(ctx, px, py, px + 0.2, py + 0.2, h, color, 0, false);
      for (const z of [h * 0.5, h]) {
        box(ctx, x0, y0, x1, y0 + 0.2, 1.5, b.roof ?? '#ffb703', z - 1.5, false);
        box(ctx, x0, y1 - 0.2, x1, y1, 1.5, b.roof ?? '#ffb703', z - 1.5, false);
        box(ctx, x0, y0, x0 + 0.2, y1, 1.5, b.roof ?? '#ffb703', z - 1.5, false);
        box(ctx, x1 - 0.2, y0, x1, y1, 1.5, b.roof ?? '#ffb703', z - 1.5, false);
      }
      break;
    }
    case 'house': {
      box(ctx, x0, y0, x1, y1, h, color);
      for (const s of visible) {
        const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
        const n = Math.max(1, Math.round(len / 1.2));
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n;
          if (s.nx === 1 && k === Math.floor(n / 2)) panel(ctx, s, u - 0.1, u + 0.1, 0, h * 0.62, b.accent ?? '#6f4518', 'rgba(0,0,0,0.3)');
          else panel(ctx, s, u - 0.12, u + 0.12, h * 0.38, h * 0.78, winLit, 'rgba(255,255,255,0.9)');
        }
      }
      gableRoof(ctx, x0, y0, x1, y1, h, 18, b.roof ?? '#e76f51', color);
      break;
    }
    case 'barn': {
      box(ctx, x0, y0, x1, y1, h, color);
      for (const s of visible) {
        panel(ctx, s, 0.36, 0.64, 0, h * 0.7, shade(color, -0.25), b.accent ?? '#fff');
        const p = (u: number, z: number) => iso(s.ax + (s.bx - s.ax) * u, s.ay + (s.by - s.ay) * u, z);
        ctx.strokeStyle = b.accent ?? '#fff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const a = p(0.36, 0);
        const c = p(0.64, h * 0.7);
        const d = p(0.64, 0);
        const e = p(0.36, h * 0.7);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
      gableRoof(ctx, x0, y0, x1, y1, h, 24, b.roof ?? '#6c584c', color);
      break;
    }
    case 'office': {
      box(ctx, x0, y0, x1, y1, h, color);
      for (const s of visible) {
        const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
        const cols = Math.max(2, Math.round(len * 2));
        for (let z = 8; z < h - 10; z += 14) {
          for (let k = 0; k < cols; k++) {
            const on = lit ? hash(k, z, Math.round(x0 * 10)) < 0.55 : hash(k, z, Math.round(y0 * 10)) < 0.35;
            panel(ctx, s, (k + 0.18) / cols, (k + 0.82) / cols, z, z + 8, on ? (b.accent ?? '#ffe066') : 'rgba(202,240,248,0.55)');
          }
        }
      }
      box(ctx, x0 + 0.5, y0 + 0.5, x0 + 1.1, y0 + 1.1, 6, '#adb5bd', h);
      break;
    }
    case 'hut': {
      box(ctx, x0, y0, x1, y1, h, color);
      for (const s of visible) panel(ctx, s, 0.35, 0.65, 0, h * 0.7, shade(color, -0.3), 'rgba(0,0,0,0.25)');
      box(ctx, x0 - 0.15, y0 - 0.15, x1 + 0.15, y1 + 0.15, 4, b.roof ?? '#ffffff', h);
      break;
    }
    case 'terminal': {
      box(ctx, x0, y0, x1, y1, h, color);
      for (const s of visible) panel(ctx, s, 0.03, 0.97, 10, h - 8, b.accent ?? '#90e0ef', 'rgba(255,255,255,0.7)');
      box(ctx, x0 - 0.2, y0 - 0.2, x1 + 0.2, y1 + 0.2, 4, shade(color, 0.15), h);
      break;
    }
    case 'control_tower': {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      prism(ctx, cx, cy, 0.45, 8, 0, h - 26, color, color);
      prism(ctx, cx, cy, 0.85, 8, h - 26, 16, b.accent ?? '#48cae4', '#e9ecef');
      prism(ctx, cx, cy, 0.95, 8, h - 10, 4, '#e9ecef', '#dee2e6');
      break;
    }
    case 'stall': {
      box(ctx, x0, y0, x1, y1, 12, color);
      for (const [px, py] of [[x0, y0], [x1 - 0.12, y0], [x0, y1 - 0.12], [x1 - 0.12, y1 - 0.12]]) box(ctx, px, py, px + 0.12, py + 0.12, 30, '#6f4518', 0, false);
      box(ctx, x0 - 0.2, y0 - 0.2, x1 + 0.2, y1 + 0.2, 3, b.roof ?? '#e63946', 30);
      // goods on the counter
      for (let k = 0; k < 3; k++) {
        const u = (k + 0.5) / 3;
        const p = iso(x0 + (x1 - x0) * u, (y0 + y1) / 2, 14);
        ctx.fillStyle = ['#ffd166', '#ef476f', '#06d6a0'][k];
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 4, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (lit) {
        const p = iso((x0 + x1) / 2, (y0 + y1) / 2, 30);
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 34);
        g.addColorStop(0, 'rgba(255,190,80,0.35)');
        g.addColorStop(1, 'rgba(255,190,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'silo': {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      prism(ctx, cx, cy, (x1 - x0) / 2, 10, 0, h, color, b.roof ?? '#6c757d');
      break;
    }
  }
}

function drawFence(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, color: string): void {
  const p0 = iso(ax, ay, 0);
  const p1 = iso(bx, by, 0);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (const z of [5, 10]) {
    const a = iso(ax, ay, z);
    const b = iso(bx, by, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = 2.6;
  for (const p of [p0, p1]) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 13 * view.zs);
    ctx.stroke();
  }
}

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // engines, wings, fuselage, tail: painted far → near so the parts overlap correctly
  box(ctx, x - 1.9, y - 0.45, x - 1.5, y + 0.35, 6, '#adb5bd', 4);
  box(ctx, x + 1.5, y - 0.45, x + 1.9, y + 0.35, 6, '#adb5bd', 4);
  box(ctx, x - 3, y - 0.2, x + 3, y + 0.5, 2, '#dee2e6', 10);
  box(ctx, x - 0.42, y - 3.2, x + 0.42, y + 3, 12, '#f8f9fa', 4);
  box(ctx, x - 1.1, y + 2.4, x + 1.1, y + 2.9, 2, '#dee2e6', 14);
  box(ctx, x - 0.08, y + 2.2, x + 0.08, y + 3, 16, '#3a86ff', 16);
  const nose = sidesOf(x - 0.42, y - 3.2, x + 0.42, y + 3).find((s) => s.ny === -1 && faces(0, -1));
  if (nose) panel(ctx, nose, 0.15, 0.85, 10, 14, '#2b2d42');
  for (const s of sidesOf(x - 0.42, y - 3.2, x + 0.42, y + 3)) {
    if (s.nx === 0 || !faces(s.nx, 0)) continue;
    for (let k = 0; k < 9; k++) panel(ctx, s, 0.12 + k * 0.08, 0.15 + k * 0.08, 10, 13, '#90e0ef');
    panel(ctx, s, 0.05, 0.95, 6.5, 8, '#3a86ff');
  }
}

/** A car (or delivery van / taxi) driving along `axis`; `dir` is the direction of travel. */
function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, dir: number, axis: 'x' | 'y' = 'y', kind: { van?: boolean; taxi?: boolean } = {}): void {
  const L = kind.van ? 0.75 : 0.62;
  const W = 0.3;
  const rect = (along0: number, along1: number, across0: number, across1: number) =>
    axis === 'y' ? [x + across0, y + along0, x + across1, y + along1] : [x + along0, y + across0, x + along1, y + across1];
  for (const [a0, c0] of [[-L * 0.6, -W], [-L * 0.6, W - 0.12], [L * 0.6 - 0.2, -W], [L * 0.6 - 0.2, W - 0.12]]) {
    const [rx0, ry0, rx1, ry1] = rect(a0, a0 + 0.2, c0, c0 + 0.12);
    box(ctx, rx0, ry0, rx1, ry1, 4, '#2b2d42', 0, false);
  }
  const [bx0, by0, bx1, by1] = rect(-L, L, -W, W);
  box(ctx, bx0, by0, bx1, by1, kind.van ? 14 : 8, color, 3);
  if (kind.van) {
    const [cx0, cy0, cx1, cy1] = rect(L * 0.45 * dir - 0.18, L * 0.45 * dir + 0.18, -W + 0.04, W - 0.04);
    box(ctx, Math.min(cx0, cx1), Math.min(cy0, cy1), Math.max(cx0, cx1), Math.max(cy0, cy1), 0.6, '#caf0f8', 14);
  } else {
    const [gx0, gy0, gx1, gy1] = rect(-L * 0.45 - dir * 0.08, L * 0.45 - dir * 0.08, -W + 0.05, W - 0.05);
    box(ctx, gx0, gy0, gx1, gy1, 6, '#caf0f8', 11);
    const [rx0, ry0, rx1, ry1] = rect(-L * 0.35 - dir * 0.08, L * 0.35 - dir * 0.08, -W + 0.05, W - 0.05);
    box(ctx, rx0, ry0, rx1, ry1, 1.2, color, 17);
    if (kind.taxi) {
      const [tx0, ty0, tx1, ty1] = rect(-0.12, 0.12, -0.08, 0.08);
      box(ctx, tx0, ty0, tx1, ty1, 2.5, '#2b2d42', 18.2, false);
    }
  }
  const nx = axis === 'x' ? dir : 0;
  const ny = axis === 'y' ? dir : 0;
  const front = sidesOf(bx0, by0, bx1, by1).find((s) => s.nx === nx && s.ny === ny && faces(nx, ny));
  if (front) {
    panel(ctx, front, 0.1, 0.3, 6, 9, '#fff3b0');
    panel(ctx, front, 0.7, 0.9, 6, 9, '#fff3b0');
  }
}

/** The stockroom annex behind the stockroom door, in shop coordinates (every shop has one). */
export function stockroomAnnex(): Placement[] {
  return [
    { kind: 'building', style: 'stockroom', x0: 0.35, y0: -1.75, x1: 2.65, y1: -0.15, h: 30, color: '#ced4da', roof: '#6c757d', accent: '#ffd166' },
    { kind: 'prop', id: 'deco.crate_stack', x: 3.2, y: -0.8 },
  ];
}

/** Seasonal decorations on free grass and sand spots of the world (world coordinates). */
export function seasonalPlacements(world: GeneratedWorld, seasons: string[]): Placement[] {
  const out: Placement[] = [];
  const spots = world.decorSpots;
  const take = (n: number, id: string, offset: number) => {
    for (let i = 0; i < n && i < spots.length; i++) {
      const sp = spots[(i * 7 + offset) % spots.length];
      out.push({ kind: 'prop', id, x: sp.x, y: sp.y });
    }
  };
  if (seasons.includes('halloween')) {
    take(14, 'deco.pumpkin', 0);
    take(8, 'deco.leaf_pile', 3);
  }
  if (seasons.includes('winter')) take(16, 'deco.snow_pile', 1);
  if (seasons.includes('spring')) take(10, 'deco.flower_bed', 2);
  if (seasons.includes('summer')) take(6, 'deco.umbrella', 4);
  return out;
}

const shift = (p: Placement, ox: number, oy: number): Placement => {
  switch (p.kind) {
    case 'building':
    case 'fence':
      return { ...p, x0: p.x0 - ox, y0: p.y0 - oy, x1: p.x1 - ox, y1: p.y1 - oy };
    default:
      return { ...p, x: p.x - ox, y: p.y - oy };
  }
};

export interface WorldView {
  world: GeneratedWorld;
  /** World position of the shop's tile (0,0). */
  origin: { x: number; y: number };
  /** World bounds in shop coordinates. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

export class WorldRenderer {
  private bakes = new Map<string, GroundBake | null>();
  private bakedVersion = -1;
  private layouts = new Map<string, Placement[]>();

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** The world map, the active plot's origin and the world bounds in shop coordinates. */
  view(locationId: string, plotId?: string): WorldView {
    const map = mapFor(locationId);
    const world = generateWorld(map);
    const origin = plotOrigin(map, plotById(map, plotId));
    return { world, origin, bounds: { x0: -origin.x, y0: -origin.y, x1: map.size.w - origin.x, y1: map.size.h - origin.y } };
  }

  /** Paints the terrain (baked once per map) onto the ground plane. */
  drawGround(locationId: string, plotId: string | undefined, time: number, animate: boolean): void {
    const v = this.view(locationId, plotId);
    const key = v.world.map.id;
    if (this.bakedVersion !== artVersion()) {
      // texture files finished loading: repaint the ground with them
      this.bakes.clear();
      this.bakedVersion = artVersion();
    }
    if (!this.bakes.has(key)) {
      if (this.bakes.size > 3) this.bakes.clear();
      this.bakes.set(key, bakeGround(v.world));
    }
    const bake = this.bakes.get(key);
    if (!bake) return;
    const ctx = this.ctx;
    const o = iso(-v.origin.x, -v.origin.y);
    const ax = iso(-v.origin.x + 1, -v.origin.y);
    const by = iso(-v.origin.x, -v.origin.y + 1);
    const R = bake.R;
    ctx.save();
    ctx.transform((ax.x - o.x) / R, (ax.y - o.y) / R, (by.x - o.x) / R, (by.y - o.y) / R, o.x, o.y);
    ctx.drawImage(bake.canvas, 0, 0);
    if (animate && bake.water.length) {
      // gentle moving glints on water
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.beginPath();
      for (let n = 0; n < bake.water.length; n += Math.max(1, Math.floor(bake.water.length / 600))) {
        const [i, j] = bake.water[n];
        const ph = time * 1.3 + i * 0.9 + j * 1.7;
        const s = Math.sin(ph);
        if (s < 0.2) continue;
        const cx = i * R + (0.25 + 0.5 * hash(i, j, 3)) * R;
        const cy = j * R + (0.25 + 0.5 * hash(i, j, 4)) * R + Math.cos(ph) * R * 0.08;
        ctx.moveTo(cx - R * 0.15 * s, cy);
        ctx.lineTo(cx + R * 0.15 * s, cy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Static placements in shop coordinates: the map, vacant plots, seasonal decor and the stockroom annex (cached). */
  placements(locationId: string, plotId: string | undefined, seasons: string[]): Placement[] {
    const v = this.view(locationId, plotId);
    const map = v.world.map;
    const active = plotById(map, plotId);
    const key = `${map.id}|${active.id}|${seasons.join(',')}`;
    let p = this.layouts.get(key);
    if (!p) {
      if (this.layouts.size > 12) this.layouts.clear();
      const vacant: Placement[] = [];
      for (const plot of map.plots) {
        if (plot.id === active.id) continue;
        const r = plotRect(map, plot);
        vacant.push({ kind: 'prop', id: 'deco.sale_sign', x: r.x0 + 1.2, y: r.y0 + 3.5 });
        vacant.push({ kind: 'fence', x0: r.x0 + 0.4, y0: r.y0 + 2.4, x1: r.x0 + 0.4, y1: r.y1 - 0.4, color: '#ffffff' });
        vacant.push({ kind: 'prop', id: 'deco.flower_bed', x: r.x0 + 5, y: r.y0 + 8 });
      }
      p = [...[...v.world.placements, ...vacant, ...seasonalPlacements(v.world, seasons)].map((x) => shift(x, v.origin.x, v.origin.y)), ...stockroomAnnex()];
      this.layouts.set(key, p);
    }
    return p;
  }

  /** Depth-sortable world items: buildings, fences, props, vehicles and artefacts (shop coordinates). */
  items(locationId: string, plotId: string | undefined, seasons: string[], time: number, opts: { animate: boolean; lit: boolean; found: ReadonlySet<string> }): WorldItem[] {
    const ctx = this.ctx;
    const v = this.view(locationId, plotId);
    const map = v.world.map;
    const lit = opts.lit || !!map.night;
    const out: WorldItem[] = [];
    for (const p of this.placements(locationId, plotId, seasons)) {
      if (p.kind === 'prop') {
        out.push({ x: p.x, y: p.y, r: 70, draw: () => this.drawProp(p, lit, time, opts.animate) });
      } else if (p.kind === 'building') {
        const r = 40 + Math.max(p.x1 - p.x0, p.y1 - p.y0) * 45 + p.h * 1.2;
        out.push({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, r, draw: () => drawBuilding(ctx, p, lit) });
      } else if (p.kind === 'fence') {
        const len = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
        const n = Math.max(1, Math.round(len));
        for (let k = 0; k < n; k++) {
          const ax = p.x0 + ((p.x1 - p.x0) * k) / n;
          const ay = p.y0 + ((p.y1 - p.y0) * k) / n;
          const bx = p.x0 + ((p.x1 - p.x0) * (k + 1)) / n;
          const by = p.y0 + ((p.y1 - p.y0) * (k + 1)) / n;
          out.push({ x: (ax + bx) / 2, y: (ay + by) / 2, r: 60, draw: () => drawFence(ctx, ax, ay, bx, by, p.color) });
        }
      } else if (p.kind === 'plane') {
        out.push({ x: p.x, y: p.y, r: 320, draw: () => drawPlane(ctx, p.x, p.y) });
      } else if (p.kind === 'car') {
        out.push({ x: p.x, y: p.y, r: 60, draw: () => drawCar(ctx, p.x, p.y, p.color, p.dir, p.axis, { van: p.van, taxi: p.taxi }) });
      }
    }
    // discoverable artefacts: a sparkle until found
    for (const a of map.artefacts) {
      const w = artefactPos(map, a);
      const x = w.x - v.origin.x;
      const y = w.y - v.origin.y;
      const found = opts.found.has(a.id);
      out.push({ x, y, r: 70, draw: () => this.drawArtefact(a.asset, x, y, found, time, opts.animate) });
    }
    // traffic on every road (parked when motion is reduced)
    if (map.traffic === 'cars') {
      const t = opts.animate ? time : 0;
      const colors = ['#ef476f', '#3a86ff', '#ffd166', '#06d6a0', '#f8f9fa', '#9d4edd'];
      map.avenues.forEach((av, i) => {
        for (const dir of [1, -1] as const) {
          const span = map.size.h;
          const raw = (t * (dir > 0 ? 1.7 : 1.4) + i * 13 + (dir > 0 ? 0 : span / 2)) % span;
          const x = av + (dir > 0 ? 0.5 : 1.5) - v.origin.x;
          const y = (dir > 0 ? raw : span - raw) - v.origin.y;
          const color = colors[(i * 2 + (dir > 0 ? 0 : 1)) % colors.length];
          const van = (i + (dir > 0 ? 1 : 0)) % 3 === 0;
          out.push({ x, y, r: 60, draw: () => drawCar(ctx, x, y, color, dir, 'y', { van }) });
        }
      });
      map.streets.forEach((st, i) => {
        for (const dir of [1, -1] as const) {
          const span = map.size.w;
          const raw = (t * (dir > 0 ? 1.5 : 1.3) + i * 17 + (dir > 0 ? span / 3 : 0)) % span;
          const y = st + (dir > 0 ? 1.5 : 0.5) - v.origin.y;
          const x = (dir > 0 ? raw : span - raw) - v.origin.x;
          const color = colors[(i * 2 + 3 + (dir > 0 ? 0 : 1)) % colors.length];
          out.push({ x, y, r: 60, draw: () => drawCar(ctx, x, y, color, dir, 'x') });
        }
      });
    }
    return out;
  }

  private drawArtefact(asset: string, x: number, y: number, found: boolean, time: number, animate: boolean): void {
    const ctx = this.ctx;
    const pt = iso(x, y);
    drawSprite(ctx, asset, pt.x, pt.y, { size: 0.9 });
    if (found) return;
    // a soft twinkle so curious players can spot it (static under reduced motion)
    const k = animate ? 0.6 + 0.4 * Math.sin(time * 4 + x) : 1;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = '#fff3b0';
    for (const [dx, dy, s] of [[-9, -26, 3.2], [8, -18, 2.2], [0, -34, 2.6]]) {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 ? s * 0.35 : s;
        ctx.lineTo(pt.x + dx + Math.cos(a) * rr, pt.y + dy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawProp(p: Extract<Placement, { kind: 'prop' }>, lit: boolean, time: number, animate: boolean): void {
    const ctx = this.ctx;
    const pt = iso(p.x, p.y);
    if (p.glow && lit) {
      const g = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, 36);
      g.addColorStop(0, p.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, 36, 36 * view.sinP, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const bob = p.id === 'deco.boat' && animate ? Math.sin(time * 2 + p.x) * 1.5 : 0;
    drawSprite(ctx, p.id, pt.x, pt.y + bob, { size: p.size ?? 1, flip: p.flip });
    if (p.glow && lit) {
      const top = pt.y - (p.id === 'deco.runway_light' ? 5 : 52);
      const k = animate ? 0.85 + 0.15 * Math.sin(time * 3 + p.y) : 1;
      const g = ctx.createRadialGradient(pt.x, top, 1, pt.x, top, 16);
      g.addColorStop(0, p.glow.replace(/[\d.]+\)$/, `${0.9 * k})`));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pt.x, top, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
