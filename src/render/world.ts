import { iso, faces, depth, shade, view } from './iso';
import { box } from './shapes';
import { drawSprite } from '../assets/spriteCache';
import { TERRAIN } from '../assets/terrain';
import { locationSet, seasonalProps, stockroomAnnex, type LocationSet, type Placement } from '../assets/locations';
import { tone } from '../assets/draw';

/**
 * The world around the shop: terrain painted on the ground plane, buildings and vehicles built
 * from real boxes (so they rotate with the camera), and billboard props from the asset registry.
 * Everything here is visual only.
 */

export interface WorldItem {
  x: number;
  y: number;
  draw: () => void;
}

interface GroundBake {
  canvas: HTMLCanvasElement;
  x0: number;
  y0: number;
  R: number;
  water: [number, number][];
}

/** Ground extent: the scene runs from −8 to S + 7 on both axes. */
export const GROUND_MIN = -8;
export const groundMax = (S: number) => S + 7;

function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Terrain id per cell for a set and shop size (exported for tests). */
export function terrainGrid(set: LocationSet, S: number): string[][] {
  const out: string[][] = [];
  for (let cy = GROUND_MIN; cy < groundMax(S); cy++) {
    const row: string[] = [];
    for (let cx = GROUND_MIN; cx < groundMax(S); cx++) row.push(set.terrainAt(cx, cy, S));
    out.push(row);
  }
  return out;
}

function bakeGround(set: LocationSet, S: number): GroundBake | null {
  if (typeof document === 'undefined') return null;
  const N = groundMax(S) - GROUND_MIN;
  const R = Math.max(16, Math.min(32, Math.floor(1024 / N)));
  const canvas = document.createElement('canvas');
  canvas.width = N * R;
  canvas.height = N * R;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grid = terrainGrid(set, S);
  const at = (i: number, j: number) => (j >= 0 && j < N && i >= 0 && i < N ? grid[j][i] : null);
  const water: [number, number][] = [];
  const ids = [...new Set(grid.flat())].sort((a, b) => (TERRAIN[a]?.z ?? 0) - (TERRAIN[b]?.z ?? 0));
  for (const id of ids) {
    const t = TERRAIN[id] ?? TERRAIN.grass;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        if (grid[j][i] !== id) continue;
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
        detail(ctx, t.detail, t, px, py, R, i, j);
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
  // road centre line
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const roadI = -3 - GROUND_MIN;
  for (let j = 0; j < N; j++) if (at(roadI, j) === 'road' && at(roadI - 1, j) === 'road') ctx.fillRect(roadI * R - R * 0.04, j * R + R * 0.2, R * 0.08, R * 0.45);
  // runway centre line on tarmac far from the shop
  const rwI = -7 - GROUND_MIN;
  for (let j = 0; j < N; j++) if (at(rwI, j) === 'tarmac') ctx.fillRect(rwI * R + R * 0.47, j * R + R * 0.1, R * 0.06, R * 0.5);
  if (set.night) {
    ctx.fillStyle = 'rgba(16,4,46,0.42)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return { canvas, x0: GROUND_MIN, y0: GROUND_MIN, R, water };
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

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, dirY: number): void {
  const L = 0.62;
  const W = 0.3;
  for (const [wx, wy] of [[-W, -L * 0.6], [W - 0.12, -L * 0.6], [-W, L * 0.6 - 0.2], [W - 0.12, L * 0.6 - 0.2]]) box(ctx, x + wx, y + wy, x + wx + 0.12, y + wy + 0.2, 4, '#2b2d42', 0, false);
  box(ctx, x - W, y - L, x + W, y + L, 8, color, 3);
  box(ctx, x - W + 0.05, y - L * 0.45 - dirY * 0.08, x + W - 0.05, y + L * 0.45 - dirY * 0.08, 6, '#caf0f8', 11);
  box(ctx, x - W + 0.05, y - L * 0.35 - dirY * 0.08, x + W - 0.05, y + L * 0.35 - dirY * 0.08, 1.2, color, 17);
  const front = sidesOf(x - W, y - L, x + W, y + L).find((s) => s.nx === 0 && s.ny === dirY && faces(0, dirY));
  if (front) {
    panel(ctx, front, 0.1, 0.3, 6, 9, '#fff3b0');
    panel(ctx, front, 0.7, 0.9, 6, 9, '#fff3b0');
  }
}

const CAR_COLORS = ['#ef476f', '#3a86ff', '#ffd166', '#06d6a0', '#f8f9fa', '#9d4edd'];

export class WorldRenderer {
  private bakes = new Map<string, GroundBake | null>();
  private layouts = new Map<string, Placement[]>();

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Paints the terrain (baked once per location + size) onto the ground plane. */
  drawGround(locationId: string, S: number, time: number, animate: boolean): void {
    const set = locationSet(locationId);
    const key = `${set.id}|${S}`;
    if (!this.bakes.has(key)) {
      if (this.bakes.size > 6) this.bakes.clear();
      this.bakes.set(key, bakeGround(set, S));
    }
    const bake = this.bakes.get(key);
    if (!bake) return;
    const ctx = this.ctx;
    const o = iso(bake.x0, bake.y0);
    const ax = iso(bake.x0 + 1, bake.y0);
    const by = iso(bake.x0, bake.y0 + 1);
    const R = bake.R;
    ctx.save();
    ctx.transform((ax.x - o.x) / R, (ax.y - o.y) / R, (by.x - o.x) / R, (by.y - o.y) / R, o.x, o.y);
    ctx.drawImage(bake.canvas, 0, 0);
    if (animate && bake.water.length) {
      // gentle moving glints on water
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.beginPath();
      for (const [i, j] of bake.water.slice(0, 500)) {
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

  /** Static placements for a location (cached) plus seasonal decor. */
  placements(locationId: string, S: number, seasons: string[]): Placement[] {
    const set = locationSet(locationId);
    const key = `${set.id}|${S}|${seasons.join(',')}`;
    let p = this.layouts.get(key);
    if (!p) {
      if (this.layouts.size > 12) this.layouts.clear();
      p = [...stockroomAnnex(), ...set.layout(S), ...seasonalProps(seasons, S)];
      this.layouts.set(key, p);
    }
    return p;
  }

  /** Depth-sortable world items: buildings, fences, props, vehicles. */
  items(locationId: string, S: number, seasons: string[], time: number, opts: { animate: boolean; lit: boolean }): WorldItem[] {
    const ctx = this.ctx;
    const set = locationSet(locationId);
    const lit = opts.lit || !!set.night;
    const out: WorldItem[] = [];
    for (const p of this.placements(locationId, S, seasons)) {
      if (p.kind === 'prop') {
        out.push({ x: p.x, y: p.y, draw: () => this.drawProp(p, lit, time, opts.animate) });
      } else if (p.kind === 'building') {
        out.push({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, draw: () => drawBuilding(ctx, p, lit) });
      } else if (p.kind === 'fence') {
        const len = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
        const n = Math.max(1, Math.round(len));
        for (let k = 0; k < n; k++) {
          const ax = p.x0 + ((p.x1 - p.x0) * k) / n;
          const ay = p.y0 + ((p.y1 - p.y0) * k) / n;
          const bx = p.x0 + ((p.x1 - p.x0) * (k + 1)) / n;
          const by = p.y0 + ((p.y1 - p.y0) * (k + 1)) / n;
          out.push({ x: (ax + bx) / 2, y: (ay + by) / 2, draw: () => drawFence(ctx, ax, ay, bx, by, p.color) });
        }
      } else if (p.kind === 'plane') {
        out.push({ x: p.x, y: p.y, draw: () => drawPlane(ctx, p.x, p.y) });
      }
    }
    // traffic: cars on the road, boats at sea (parked when motion is reduced)
    const span = S + 15;
    const t = opts.animate ? time : 0;
    if (set.traffic === 'cars') {
      for (let i = 0; i < 4; i++) {
        const dir = i % 2 ? 1 : -1;
        const lane = dir > 0 ? -3.5 : -2.5;
        const raw = (t * (dir > 0 ? 1.7 : 1.4) + i * span * 0.27) % span;
        const y = dir > 0 ? GROUND_MIN + raw : GROUND_MIN + span - raw;
        const color = CAR_COLORS[i % CAR_COLORS.length];
        out.push({ x: lane, y, draw: () => drawCar(ctx, lane, y, color, dir) });
      }
    } else if (set.traffic === 'boats') {
      for (let i = 0; i < 2; i++) {
        const raw = (t * 0.25 + i * span * 0.5) % span;
        const y = GROUND_MIN + raw;
        const x = -6 - i;
        out.push({
          x,
          y,
          draw: () => {
            const p = iso(x, y);
            drawSprite(ctx, 'deco.boat', p.x, p.y + (opts.animate ? Math.sin(time * 2 + i) * 1.5 : 0), { flip: i % 2 === 1 });
          },
        });
      }
    }
    return out;
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
    drawSprite(ctx, p.id, pt.x, pt.y, { size: p.size ?? 1, flip: p.flip });
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
