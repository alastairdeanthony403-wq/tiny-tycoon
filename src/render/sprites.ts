import type { PlacedObject } from '../core/types';
import { iso, shade } from './iso';
import { box, ellipse, emoji, roundRect, badge, diamond } from './shapes';
import { getProduct } from '../config/products';
import { OBJECT_MAP } from '../config/objects';

const SHELF_TIERS = [
  { color: '#e9c08f', h: 26, trim: '#a0522d' },
  { color: '#e0a96d', h: 32, trim: '#a0522d' },
  { color: '#f4f1ea', h: 38, trim: '#4cc9f0' },
  { color: '#3d3b52', h: 44, trim: '#ffd166' },
  { color: '#ffd166', h: 50, trim: '#ff9f1c' },
];
const CHECKOUT_TIERS = ['#8d99ae', '#4cc9f0', '#52b788', '#ffd166'];

export interface ObjectDrawInfo {
  stockRatio: number;
  closed?: boolean;
  producing?: boolean;
  powerOff?: boolean;
  time: number;
}

/** Height in px of an object's sprite (for hit-testing and badges). */
export function objectHeight(o: PlacedObject): number {
  switch (o.kind) {
    case 'shelf':
      return SHELF_TIERS[Math.min(o.tier, 4)].h + 14;
    case 'fridge':
      return 48 + o.tier * 4;
    case 'oven':
      return 40;
    case 'coffee_machine':
      return 44;
    case 'checkout':
      return 36;
    case 'lamp':
      return 52;
    case 'statue':
      return 50;
    case 'arcade':
      return 46;
    default:
      return 30;
  }
}

function productsOnTop(ctx: CanvasRenderingContext2D, o: PlacedObject, x0: number, y0: number, x1: number, y1: number, z: number, ratio: number, slots: number, size: number): void {
  const p = getProduct(o.productId);
  if (!p) return;
  const cols = slots <= 4 ? 2 : 3;
  const rows = Math.ceil(slots / cols);
  const shown = Math.ceil(ratio * slots - 0.001);
  for (let i = 0; i < slots; i++) {
    const u = ((i % cols) + 0.5) / cols;
    const v = (Math.floor(i / cols) + 0.5) / rows;
    const pt = iso(x0 + (x1 - x0) * u, y0 + (y1 - y0) * v, z);
    if (i < shown) {
      ellipse(ctx, pt.x, pt.y + 1, size * 0.45, size * 0.2, 'rgba(0,0,0,0.18)');
      emoji(ctx, p.icon, pt.x, pt.y - size * 0.35, size);
    } else {
      ellipse(ctx, pt.x, pt.y, size * 0.3, size * 0.14, 'rgba(0,0,0,0.08)');
    }
  }
}

export function drawObject(ctx: CanvasRenderingContext2D, o: PlacedObject, info: ObjectDrawInfo): void {
  const x = o.x;
  const y = o.y;
  const def = OBJECT_MAP[o.kind];
  const c = iso(x + 0.5, y + 0.5);
  ellipse(ctx, c.x, c.y + 2, 26, 12, 'rgba(0,0,0,0.12)');
  switch (o.kind) {
    case 'shelf': {
      const t = SHELF_TIERS[Math.min(o.tier, 4)];
      box(ctx, x + 0.1, y + 0.1, x + 0.9, y + 0.9, t.h, t.color);
      // shelf boards on the visible faces
      for (let k = 1; k <= 2; k++) {
        const z = (t.h * k) / 3;
        ctx.strokeStyle = t.trim;
        ctx.lineWidth = 2;
        const a = iso(x + 0.1, y + 0.9, z);
        const b = iso(x + 0.9, y + 0.9, z);
        const d = iso(x + 0.9, y + 0.1, z);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }
      if (o.tier >= 3) {
        const top = iso(x + 0.5, y + 0.5, t.h + 2);
        ctx.fillStyle = 'rgba(255,230,120,0.25)';
        ctx.beginPath();
        ctx.ellipse(top.x, top.y, 30, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      productsOnTop(ctx, o, x + 0.1, y + 0.1, x + 0.9, y + 0.9, t.h, info.stockRatio, Math.min(9, 4 + o.tier * 2 + (o.tier > 0 ? 1 : 0)), 15);
      break;
    }
    case 'fridge': {
      const h = 44 + o.tier * 4;
      box(ctx, x + 0.12, y + 0.12, x + 0.88, y + 0.88, h, '#cfe9f7');
      // glass doors on the two visible faces
      const glass = (ax: number, ay: number, bx: number, by: number) => {
        const p1 = iso(ax, ay, 6);
        const p2 = iso(bx, by, 6);
        const p3 = iso(bx, by, h - 6);
        const p4 = iso(ax, ay, h - 6);
        ctx.fillStyle = 'rgba(120,200,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        const p = getProduct(o.productId);
        const n = Math.ceil(info.stockRatio * 6);
        for (let i = 0; i < 6; i++) {
          const u = (i % 3 + 0.5) / 3;
          const row = Math.floor(i / 3);
          const q = iso(ax + (bx - ax) * u, ay + (by - ay) * u, 12 + row * (h - 22) / 2);
          ctx.fillStyle = i < n ? p?.color ?? '#fff' : 'rgba(255,255,255,0.25)';
          roundRect(ctx, q.x - 2.5, q.y - 8, 5, 9, 2);
          ctx.fill();
        }
      };
      glass(x + 0.14, y + 0.88, x + 0.86, y + 0.88);
      glass(x + 0.88, y + 0.86, x + 0.88, y + 0.14);
      const top = iso(x + 0.5, y + 0.5, h);
      const p = getProduct(o.productId);
      if (p) emoji(ctx, p.icon, top.x, top.y - 6, 13);
      if (o.tier >= 3) badge(ctx, '❄', top.x + 16, top.y - 4, '#4cc9f0', '#fff', 8);
      break;
    }
    case 'oven': {
      const h = 28 + o.tier * 3;
      box(ctx, x + 0.1, y + 0.1, x + 0.9, y + 0.9, h, info.powerOff ? '#8d6e63' : '#d97b4a');
      const glow = info.producing && !info.powerOff ? 0.6 + 0.4 * Math.sin(info.time * 6) : 0.15;
      const p1 = iso(x + 0.25, y + 0.9, 6);
      const p2 = iso(x + 0.75, y + 0.9, 6);
      const p3 = iso(x + 0.75, y + 0.9, h - 8);
      const p4 = iso(x + 0.25, y + 0.9, h - 8);
      ctx.fillStyle = `rgba(255,${140 + glow * 80},40,${0.4 + glow * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
      productsOnTop(ctx, o, x + 0.1, y + 0.1, x + 0.9, y + 0.9, h, info.stockRatio, 4 + Math.min(5, o.tier * 2), 11);
      break;
    }
    case 'coffee_machine': {
      box(ctx, x + 0.08, y + 0.08, x + 0.92, y + 0.92, 18, '#a47148');
      box(ctx, x + 0.15, y + 0.15, x + 0.55, y + 0.55, 24 + o.tier * 2, info.powerOff ? '#777' : '#555b6e', 18);
      const lamp = iso(x + 0.55, y + 0.35, 34);
      ellipse(ctx, lamp.x, lamp.y, 2.5, 2.5, info.powerOff ? '#555' : info.producing ? '#06d6a0' : '#ffd166');
      productsOnTop(ctx, o, x + 0.55, y + 0.15, x + 0.92, y + 0.92, 18, info.stockRatio, 4 + Math.min(4, o.tier * 2), 10);
      break;
    }
    case 'checkout': {
      const color = CHECKOUT_TIERS[Math.min(o.tier, 3)];
      box(ctx, x + 0.08, y + 0.08, x + 0.92, y + 0.92, 20, color);
      // conveyor belt
      diamond(ctx, x + 0.18, y + 0.18, 0.64, '#2b2d42', 20.5);
      const stripe = (info.time * 0.6) % 1;
      const sp = iso(x + 0.2 + stripe * 0.6, y + 0.5, 21);
      ellipse(ctx, sp.x, sp.y, 3, 1.5, '#8d99ae');
      // register
      box(ctx, x + 0.55, y + 0.15, x + 0.85, y + 0.45, 12, '#edf2f4', 20);
      const scr = iso(x + 0.7, y + 0.3, 36);
      roundRect(ctx, scr.x - 6, scr.y - 5, 12, 7, 2);
      ctx.fillStyle = info.closed ? '#555' : '#06d6a0';
      ctx.fill();
      if (o.tier > 0) {
        const top = iso(x + 0.3, y + 0.7, 24);
        badge(ctx, ['', 'FAST', 'EXPRESS', 'PREMIUM'][Math.min(3, o.tier)], top.x, top.y + 10, shade(color, -0.35), '#fff', 7);
      }
      if (info.closed) {
        const top = iso(x + 0.5, y + 0.5, 46);
        badge(ctx, 'CLOSED', top.x, top.y, '#ef476f', '#fff', 8);
      }
      break;
    }
    case 'plant': {
      box(ctx, x + 0.3, y + 0.3, x + 0.7, y + 0.7, 12, '#bc6c25');
      const t = iso(x + 0.5, y + 0.5, 20);
      ellipse(ctx, t.x, t.y, 12, 10, '#40916c');
      ellipse(ctx, t.x - 6, t.y - 6, 8, 7, '#52b788');
      ellipse(ctx, t.x + 6, t.y - 8, 7, 6, '#74c69d');
      break;
    }
    case 'poster': {
      box(ctx, x + 0.45, y + 0.2, x + 0.55, y + 0.8, 4, '#6c757d');
      const a = iso(x + 0.5, y + 0.2, 8);
      const b = iso(x + 0.5, y + 0.8, 8);
      const tH = 26;
      ctx.fillStyle = '#ffafcc';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - tH);
      ctx.lineTo(a.x, a.y - tH);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      emoji(ctx, '⭐', (a.x + b.x) / 2, (a.y + b.y) / 2 - tH / 2, 12);
      break;
    }
    case 'lamp': {
      const base = iso(x + 0.5, y + 0.5);
      ctx.strokeStyle = '#495057';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x, base.y - 44);
      ctx.stroke();
      const glow = ctx.createRadialGradient(base.x, base.y - 46, 2, base.x, base.y - 46, 26);
      glow.addColorStop(0, 'rgba(255,240,150,0.9)');
      glow.addColorStop(1, 'rgba(255,240,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(base.x, base.y - 46, 26, 0, Math.PI * 2);
      ctx.fill();
      ellipse(ctx, base.x, base.y - 46, 7, 6, '#ffe066');
      break;
    }
    case 'sign': {
      box(ctx, x + 0.45, y + 0.45, x + 0.55, y + 0.55, 18, '#6c584c');
      const p = iso(x + 0.5, y + 0.5, 30);
      roundRect(ctx, p.x - 20, p.y - 10, 40, 18, 5);
      ctx.fillStyle = '#f4a261';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '900 8px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SALE!', p.x, p.y);
      break;
    }
    case 'bench':
      box(ctx, x + 0.15, y + 0.3, x + 0.85, y + 0.7, 10, '#a47148');
      box(ctx, x + 0.15, y + 0.3, x + 0.85, y + 0.38, 12, '#8b5e34', 10);
      break;
    case 'statue': {
      box(ctx, x + 0.25, y + 0.25, x + 0.75, y + 0.75, 12, '#ced4da');
      const t = iso(x + 0.5, y + 0.5, 12);
      ellipse(ctx, t.x, t.y - 14, 8, 12, '#adb5bd');
      ellipse(ctx, t.x, t.y - 30, 6, 6, '#adb5bd');
      emoji(ctx, '👑', t.x, t.y - 38, 10);
      break;
    }
    case 'arcade': {
      box(ctx, x + 0.2, y + 0.2, x + 0.8, y + 0.8, 40, '#7209b7');
      const s1 = iso(x + 0.25, y + 0.8, 20);
      const s2 = iso(x + 0.75, y + 0.8, 34);
      const hue = (info.time * 80) % 360;
      ctx.fillStyle = `hsl(${hue},90%,60%)`;
      ctx.fillRect(Math.min(s1.x, s2.x), Math.min(s1.y, s2.y) - 4, Math.abs(s2.x - s1.x), 12);
      break;
    }
    default:
      box(ctx, x + 0.2, y + 0.2, x + 0.8, y + 0.8, 20, def?.color ?? '#999');
  }
}

// ------------------------------------------------------------------ people

export interface PersonStyle {
  body: string;
  head: string;
  hair: string;
  scale: number;
  hat?: 'chef' | 'cap' | 'tie' | 'hard' | 'star';
  apron?: string;
}

export interface PersonPose {
  moving: boolean;
  phase: number;
  facing: number;
  carrying?: boolean;
  working?: boolean;
  bounce?: number;
  angry?: boolean;
  reach?: boolean;
}

export function drawPerson(ctx: CanvasRenderingContext2D, sx: number, sy: number, st: PersonStyle, pose: PersonPose): void {
  const s = st.scale;
  const walk = pose.moving ? Math.sin(pose.phase * 10) : 0;
  const bob = pose.moving ? Math.abs(Math.sin(pose.phase * 10)) * 1.5 : Math.sin(pose.phase * 2) * 0.5;
  const jump = pose.bounce ? Math.abs(Math.sin(pose.bounce * 12)) * 5 : 0;
  const shake = pose.angry ? Math.sin(pose.phase * 40) * 1 : 0;
  const x = sx + shake;
  const y = sy - bob - jump;
  ellipse(ctx, sx, sy, 8 * s, 3.5 * s, 'rgba(0,0,0,0.2)');
  // legs
  ctx.fillStyle = shade(st.body, -0.5);
  roundRect(ctx, x - 4 * s, y - 7 * s + walk * 1.5 * s, 3 * s, 7 * s, 1.5 * s);
  ctx.fill();
  roundRect(ctx, x + 1 * s, y - 7 * s - walk * 1.5 * s, 3 * s, 7 * s, 1.5 * s);
  ctx.fill();
  // body
  roundRect(ctx, x - 6 * s, y - 20 * s, 12 * s, 14 * s, 5 * s);
  ctx.fillStyle = st.body;
  ctx.fill();
  if (st.apron) {
    roundRect(ctx, x - 4 * s, y - 16 * s, 8 * s, 9 * s, 2 * s);
    ctx.fillStyle = st.apron;
    ctx.fill();
  }
  if (st.hat === 'tie') {
    ctx.fillStyle = '#e63946';
    ctx.fillRect(x - 1 * s, y - 19 * s, 2 * s, 7 * s);
  }
  // arms
  ctx.strokeStyle = st.body;
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  const armSwing = pose.moving ? walk * 3 : pose.working ? Math.sin(pose.phase * 18) * 3 : 0;
  ctx.beginPath();
  if (pose.carrying || pose.reach) {
    ctx.moveTo(x - 5 * s, y - 17 * s);
    ctx.lineTo(x - 3 * s, y - 24 * s);
    ctx.moveTo(x + 5 * s, y - 17 * s);
    ctx.lineTo(x + 3 * s, y - 24 * s);
  } else {
    ctx.moveTo(x - 6 * s, y - 17 * s);
    ctx.lineTo(x - 7 * s, y - 10 * s + armSwing);
    ctx.moveTo(x + 6 * s, y - 17 * s);
    ctx.lineTo(x + 7 * s, y - 10 * s - armSwing);
  }
  ctx.stroke();
  // head
  const hy = y - 26 * s;
  ellipse(ctx, x, hy, 6.5 * s, 6.5 * s, st.head);
  // hair
  ctx.fillStyle = st.hair;
  ctx.beginPath();
  ctx.arc(x, hy - 1 * s, 6.6 * s, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  // face (only when facing the camera: +x or +y)
  if (pose.facing === 0 || pose.facing === 1) {
    const fx = pose.facing === 0 ? 2 * s : -2 * s;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x + fx - 2 * s, hy + 0.5 * s, 0.9 * s, 0, Math.PI * 2);
    ctx.arc(x + fx + 2 * s, hy + 0.5 * s, 0.9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pose.angry ? '#7a0000' : '#a0522d';
    ctx.lineWidth = 0.8 * s;
    ctx.beginPath();
    if (pose.angry) ctx.arc(x + fx, hy + 4.5 * s, 1.6 * s, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(x + fx, hy + 2.2 * s, 1.6 * s, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ellipse(ctx, x + fx - 3.5 * s, hy + 2 * s, 1.2 * s, 0.8 * s, 'rgba(255,120,120,0.35)');
    ellipse(ctx, x + fx + 3.5 * s, hy + 2 * s, 1.2 * s, 0.8 * s, 'rgba(255,120,120,0.35)');
  }
  // hats
  if (st.hat === 'chef') {
    ellipse(ctx, x, hy - 8 * s, 6 * s, 4 * s, '#fff');
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 4 * s, hy - 8 * s, 8 * s, 4 * s);
  } else if (st.hat === 'cap') {
    ctx.fillStyle = '#3a86ff';
    ctx.beginPath();
    ctx.arc(x, hy - 2 * s, 6.8 * s, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 1 * s, hy - 3 * s, 9 * s, 2 * s);
  } else if (st.hat === 'hard') {
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(x, hy - 2 * s, 7.2 * s, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (st.hat === 'star') {
    emoji(ctx, '😎', x, hy, 11 * s);
  }
  if (pose.carrying) drawCrateAt(ctx, x, y - 30 * s, 7 * s);
}

function drawCrateAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  roundRect(ctx, x - r, y - r, r * 2, r * 1.6, 2);
  ctx.fillStyle = '#c68b59';
  ctx.fill();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.2);
  ctx.lineTo(x + r, y - r * 0.2);
  ctx.stroke();
}

export const EMOTE_ICONS: Record<string, string> = {
  happy: '😊',
  love: '😍',
  angry: '😠',
  question: '❓',
  sad: '😞',
  money: '💷',
  wow: '🤩',
  sleep: '💤',
};

export function drawEmote(ctx: CanvasRenderingContext2D, x: number, y: number, kind: string, t: number): void {
  const icon = EMOTE_ICONS[kind];
  if (!icon) return;
  const pop = Math.min(1, t * 6);
  roundRect(ctx, x - 9 * pop, y - 20 * pop, 18 * pop, 16 * pop, 6);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 4 * pop);
  ctx.lineTo(x, y);
  ctx.lineTo(x + 3, y - 4 * pop);
  ctx.fillStyle = '#fff';
  ctx.fill();
  emoji(ctx, icon, x, y - 12 * pop, 11 * pop);
}
