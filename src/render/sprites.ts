import type { PlacedObject } from '../core/types';
import { iso, shade, faces, depth, isoVec } from './iso';
import { box, ellipse, emoji, roundRect, badge, diamond, frontChain, frontSides } from './shapes';
import { getProduct } from '../config/products';
import type { ShopSkin } from './skins';
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
  /** Active premium shop theme (visual only). */
  skin?: ShopSkin | null;
  /** Small animated sparkles allowed (false under reduced motion). */
  sparkle?: boolean;
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
  // Draw back-to-front for the current camera angle.
  const order = Array.from({ length: slots }, (_, i) => i).sort((a, b) => {
    const pa = slotPos(a);
    const pb = slotPos(b);
    return depth(pa[0], pa[1]) - depth(pb[0], pb[1]);
  });
  function slotPos(i: number): [number, number] {
    return [x0 + (x1 - x0) * (((i % cols) + 0.5) / cols), y0 + (y1 - y0) * ((Math.floor(i / cols) + 0.5) / rows)];
  }
  for (const i of order) {
    const [gx, gy] = slotPos(i);
    const pt = iso(gx, gy, z);
    if (i < shown) {
      ellipse(ctx, pt.x, pt.y + 1, size * 0.45, size * 0.2, 'rgba(0,0,0,0.18)');
      emoji(ctx, p.icon, pt.x, pt.y - size * 0.35, size);
    } else {
      ellipse(ctx, pt.x, pt.y, size * 0.3, size * 0.14, 'rgba(0,0,0,0.08)');
    }
  }
}

/** Thin outline of an object's footprint at height z (gold trims etc.). */
function diamondOutline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, z: number, color: string, width: number): void {
  const a = iso(x, y, z);
  const b = iso(x + w, y, z);
  const c = iso(x + w, y + w, z);
  const d = iso(x, y + w, z);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.stroke();
}

export function drawObject(ctx: CanvasRenderingContext2D, o: PlacedObject, info: ObjectDrawInfo): void {
  drawObjectBody(ctx, o, info);
  // Theme trim around product displays other than shelves (shelves get a full frame above).
  const trim = info.skin?.displayTrim;
  if (trim && o.kind !== 'shelf' && OBJECT_MAP[o.kind]?.category === 'display') {
    diamondOutline(ctx, o.x + 0.1, o.y + 0.1, 0.8, 1, trim, 2);
    diamondOutline(ctx, o.x + 0.12, o.y + 0.12, 0.76, objectHeight(o) - 14, trim, 2);
  }
}

function drawObjectBody(ctx: CanvasRenderingContext2D, o: PlacedObject, info: ObjectDrawInfo): void {
  const x = o.x;
  const y = o.y;
  const def = OBJECT_MAP[o.kind];
  const c = iso(x + 0.5, y + 0.5);
  ellipse(ctx, c.x, c.y + 2, 26, 12, 'rgba(0,0,0,0.12)');
  switch (o.kind) {
    case 'shelf': {
      const base = SHELF_TIERS[Math.min(o.tier, 4)];
      const sk = info.skin?.shelf;
      const t = sk ? { ...base, color: sk.color, trim: sk.trim } : base;
      box(ctx, x + 0.1, y + 0.1, x + 0.9, y + 0.9, t.h, t.color);
      if (sk?.rim) {
        // gold frame: vertical posts on the visible corners + a rim around the top
        ctx.strokeStyle = sk.rim;
        ctx.lineWidth = 2.5;
        for (const [px, py] of frontChain(x + 0.1, y + 0.1, x + 0.9, y + 0.9)) {
          const a = iso(px, py, 0);
          const b2 = iso(px, py, t.h);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.stroke();
        }
        diamondOutline(ctx, x + 0.1, y + 0.1, 0.8, t.h, sk.rim, 2.5);
      }
      if (info.skin?.effect === 'golden' && info.sparkle) {
        const fc = frontChain(x + 0.1, y + 0.1, x + 0.9, y + 0.9);
        const mid = fc[Math.min(1, fc.length - 1)];
        const sp = iso(mid[0] + Math.sin(info.time * 2 + o.uid) * 0.1, mid[1], t.h * (0.5 + 0.4 * Math.sin(info.time * 3 + o.uid)));
        ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(info.time * 6 + o.uid)})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // shelf boards on the visible faces
      const chain = frontChain(x + 0.1, y + 0.1, x + 0.9, y + 0.9);
      for (let k = 1; k <= 2; k++) {
        const z = (t.h * k) / 3;
        ctx.strokeStyle = t.trim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        chain.forEach(([cx, cy], i) => {
          const p = iso(cx, cy, z);
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        });
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
      for (const [ax, ay, bx, by] of frontSides(x + 0.12, y + 0.12, x + 0.88, y + 0.88)) {
        const ux = (bx - ax) * 0.03;
        const uy = (by - ay) * 0.03;
        glass(ax + ux, ay + uy, bx - ux, by - uy);
      }
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
      // The oven door is on its +y side: only visible when that side faces the camera.
      if (!faces(0, 1)) {
        productsOnTop(ctx, o, x + 0.1, y + 0.1, x + 0.9, y + 0.9, h, info.stockRatio, 4 + Math.min(5, o.tier * 2), 11);
        break;
      }
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
      const color = info.skin?.checkout?.color ?? CHECKOUT_TIERS[Math.min(o.tier, 3)];
      box(ctx, x + 0.08, y + 0.08, x + 0.92, y + 0.92, 20, color);
      if (info.skin?.checkout) {
        // warm accent strip along the visible faces of the counter
        const acc = info.skin.checkout.accent;
        ctx.strokeStyle = acc;
        ctx.lineWidth = 3;
        ctx.beginPath();
        frontChain(x + 0.08, y + 0.08, x + 0.92, y + 0.92).forEach(([cx, cy], i) => {
          const p = iso(cx, cy, 13);
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        });
        ctx.stroke();
        diamondOutline(ctx, x + 0.08, y + 0.08, 0.84, 20, acc, 2);
      }
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
    case 'snowman': {
      const b = iso(x + 0.5, y + 0.5);
      ellipse(ctx, b.x, b.y - 9, 11, 10, '#f8f9fa');
      ellipse(ctx, b.x, b.y - 25, 8, 8, '#ffffff');
      ellipse(ctx, b.x - 3, b.y - 27, 1.2, 1.2, '#222');
      ellipse(ctx, b.x + 3, b.y - 27, 1.2, 1.2, '#222');
      ctx.fillStyle = '#f77f00';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 24);
      ctx.lineTo(b.x + 7, b.y - 23);
      ctx.lineTo(b.x, b.y - 22);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.fillRect(b.x - 8, b.y - 19, 16, 3);
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(b.x - 6, b.y - 38, 12, 6);
      ctx.fillRect(b.x - 9, b.y - 33, 18, 2);
      break;
    }
    case 'pumpkin_lantern': {
      const b = iso(x + 0.5, y + 0.5);
      const glow = 0.6 + 0.4 * Math.sin(info.time * 5 + o.uid);
      ellipse(ctx, b.x, b.y - 8, 20, 10, `rgba(255,160,40,${0.18 * glow})`);
      ellipse(ctx, b.x, b.y - 9, 12, 9, '#f77f00');
      ellipse(ctx, b.x - 5, b.y - 9, 5, 9, '#fb8500');
      ellipse(ctx, b.x + 5, b.y - 9, 5, 9, '#fb8500');
      ctx.fillStyle = '#386641';
      ctx.fillRect(b.x - 1.5, b.y - 21, 3, 5);
      ctx.fillStyle = `rgba(255,230,120,${glow})`;
      ctx.beginPath();
      ctx.moveTo(b.x - 6, b.y - 12);
      ctx.lineTo(b.x - 3, b.y - 15);
      ctx.lineTo(b.x - 1, b.y - 12);
      ctx.moveTo(b.x + 1, b.y - 12);
      ctx.lineTo(b.x + 3, b.y - 15);
      ctx.lineTo(b.x + 6, b.y - 12);
      ctx.fill();
      ctx.fillRect(b.x - 5, b.y - 8, 10, 2);
      break;
    }
    case 'fairy_lights': {
      const b = iso(x + 0.5, y + 0.5);
      ctx.strokeStyle = '#6c584c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - 14, b.y);
      ctx.lineTo(b.x - 14, b.y - 34);
      ctx.moveTo(b.x + 14, b.y);
      ctx.lineTo(b.x + 14, b.y - 34);
      ctx.stroke();
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x - 14, b.y - 32);
      ctx.quadraticCurveTo(b.x, b.y - 18, b.x + 14, b.y - 32);
      ctx.stroke();
      const cols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6;
        const px = b.x - 14 + 28 * u;
        const py = b.y - 32 + 14 * 4 * u * (1 - u) * 0.5 * 2;
        const on = Math.sin(info.time * 4 + i * 1.3) > -0.3;
        ellipse(ctx, px, py + 2, on ? 3 : 2, on ? 3 : 2, on ? cols[i % 5] : '#555');
        if (on) ellipse(ctx, px, py + 2, 6, 6, 'rgba(255,240,180,0.18)');
      }
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
      if (!faces(0, 1)) break; // screen is on the +y side
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
  // face (only when the person is turned toward the camera, whatever its rotation)
  const fdir: [number, number] = ([[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][])[((pose.facing % 4) + 4) % 4];
  if (faces(fdir[0], fdir[1])) {
    const fx = isoVec(fdir[0], fdir[1]).x >= 0 ? 2 * s : -2 * s;
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
