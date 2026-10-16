import { ART } from '../spec';
import { rr, tone, shadeFill, dot, contactShadow } from '../draw';

/**
 * Modular chibi characters (big heads, compact bodies). Drawn procedurally every frame so they
 * stay crisp at any zoom; they are camera-facing billboards with a front view and a back view,
 * mirrored for left/right. Feet (ground contact) are at (x, y).
 */
export type HairStyle = 'short' | 'bob' | 'spiky' | 'ponytail' | 'bun' | 'curly' | 'bald' | 'long' | 'side';
export type TopStyle = 'tee' | 'hoodie' | 'jacket' | 'blazer' | 'cardigan' | 'polo' | 'vest' | 'coverall' | 'chef' | 'space' | 'holiday' | 'apron';
export type Headwear = 'cap' | 'beanie' | 'headphones' | 'sunhat' | 'visor' | 'chef' | 'helmet' | 'santa' | 'bucket' | 'beret' | 'paper_hat';
export type Accessory = 'backpack' | 'shopping_bag' | 'camera' | 'glasses' | 'cane' | 'scarf' | 'handbag' | 'badge' | 'lanyard' | 'clipboard' | 'tie' | 'earrings' | 'sunglasses' | 'star_glasses' | 'mop' | 'name_tag' | 'bow';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  topStyle: TopStyle;
  /** Second colour on the top (hood, apron, stripes, lapels…). */
  trim: string;
  bottom: string;
  shoes: string;
  headwear?: Headwear;
  headwearColor?: string;
  accessories: Accessory[];
  /** Colour for bags, straps, emblems. */
  accent: string;
  scale: number;
}

export type PoseState = 'idle' | 'walk' | 'carry' | 'browse' | 'reach' | 'queue' | 'pay' | 'work' | 'restock' | 'clean' | 'celebrate';

export interface Pose {
  state: PoseState;
  /** Animation clock in seconds (any monotonic value). */
  t: number;
  /** True when the character faces the camera. */
  front: boolean;
  /** True when the character's facing points to the right of the screen. */
  right: boolean;
  angry?: boolean;
  /** Carried prop. */
  carrying?: boolean;
}

const OL = ART.outline.color;
const TAU = Math.PI * 2;

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Limb with an outline: a thick round line drawn twice. */
function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number): void {
  line(ctx, x0, y0, x1, y1, OL, w + 1.4);
  line(ctx, x0, y0, x1, y1, color, w);
}

export function poseMotion(pose: Pose) {
  const t = pose.t;
  const c = ART.anim;
  switch (pose.state) {
    case 'walk': {
      const ph = (t / c.walkCycle) * TAU;
      return { legL: Math.sin(ph) * 2.2, legR: -Math.sin(ph) * 2.2, armL: -Math.sin(ph) * 3, armR: Math.sin(ph) * 3, bob: Math.abs(Math.sin(ph)) * 1.4, lift: 0, breathe: 0 };
    }
    case 'celebrate': {
      const ph = (t / c.celebrateCycle) * TAU;
      return { legL: 0, legR: 0, armL: -9, armR: -9, bob: 0, lift: Math.max(0, Math.sin(ph)) * 5, breathe: 0 };
    }
    case 'work':
    case 'pay': {
      const ph = (t / c.workCycle) * TAU;
      return { legL: 0, legR: 0, armL: Math.sin(ph) * 2.5, armR: -Math.sin(ph) * 2.5, bob: Math.abs(Math.sin(ph)) * 0.6, lift: pose.state === 'pay' ? Math.max(0, Math.sin(ph * 0.5)) * 1.5 : 0, breathe: 0 };
    }
    case 'clean': {
      const ph = (t / (c.workCycle * 2)) * TAU;
      return { legL: 0, legR: 0, armL: Math.sin(ph) * 3, armR: Math.sin(ph) * 3, bob: 0.4, lift: 0, breathe: 0, sweep: Math.sin(ph) };
    }
    default: {
      const ph = (t / c.idleCycle) * TAU;
      return { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0, lift: 0, breathe: Math.sin(ph) * 0.5 };
    }
  }
}

function drawHairBack(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, r: number, front: boolean): void {
  const c = a.hair;
  if (a.hairStyle === 'bald') return;
  if (a.hairStyle === 'long' || a.hairStyle === 'bob' || (!front && a.hairStyle !== 'spiky')) {
    // hair mass behind the head (shoulder length for long)
    const len = a.hairStyle === 'long' ? r * 1.25 : a.hairStyle === 'bob' ? r * 0.6 : r * 0.35;
    rr(ctx, hx - r * 1.05, hy - r * 0.6, r * 2.1, r * 0.6 + len, r * 0.9);
    shadeFill(ctx, c, hx - r, hy - r, r * 2, r * 2);
  }
  if (a.hairStyle === 'ponytail') {
    ctx.beginPath();
    ctx.ellipse(hx + (front ? r * 0.95 : -r * 0.2), hy + r * 0.1, r * 0.35, r * 0.75, 0.3, 0, TAU);
    shadeFill(ctx, c, hx, hy, r, r);
  }
}

function drawHairFront(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, r: number, front: boolean): void {
  const c = a.hair;
  if (a.hairStyle === 'bald') {
    if (front) {
      // fringe of hair on the sides
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(hx + s * r * 0.9, hy + r * 0.05, r * 0.25, r * 0.4, 0, 0, TAU);
        ctx.fillStyle = c;
        ctx.fill();
      }
    }
    return;
  }
  if (!front) {
    // back of the head: hair covers it
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.02, 0, TAU);
    shadeFill(ctx, c, hx - r, hy - r, r * 2, r * 2);
    if (a.hairStyle === 'bun') {
      ctx.beginPath();
      ctx.arc(hx, hy - r * 0.95, r * 0.42, 0, TAU);
      shadeFill(ctx, c, hx - r, hy - r * 1.4, r, r);
    }
    return;
  }
  // cap of hair over the top of the head
  ctx.beginPath();
  ctx.arc(hx, hy, r * 1.04, Math.PI * 1.02, Math.PI * 1.98);
  if (a.hairStyle === 'spiky') {
    for (let i = 0; i <= 5; i++) {
      const ang = Math.PI * 1.98 - (i / 5) * Math.PI * 0.96;
      const rr2 = i % 2 ? r * 1.35 : r * 1.0;
      ctx.lineTo(hx + Math.cos(ang) * rr2, hy + Math.sin(ang) * rr2);
    }
  } else if (a.hairStyle === 'curly') {
    for (let i = 0; i <= 6; i++) {
      const ang = Math.PI * 1.98 - (i / 6) * Math.PI * 0.96;
      ctx.quadraticCurveTo(hx + Math.cos(ang - 0.15) * r * 1.4, hy + Math.sin(ang - 0.15) * r * 1.4, hx + Math.cos(ang) * r * 1.06, hy + Math.sin(ang) * r * 1.06);
    }
  }
  // fringe line
  ctx.quadraticCurveTo(hx + r * 0.3, hy - r * 0.15, hx - r * 0.15, hy - r * 0.45);
  ctx.quadraticCurveTo(hx - r * 0.55, hy - r * 0.05, hx - r * 1.02, hy + r * 0.05);
  ctx.closePath();
  shadeFill(ctx, c, hx - r, hy - r * 1.3, r * 2, r * 1.6);
  if (a.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.arc(hx, hy - r * 1.05, r * 0.42, 0, TAU);
    shadeFill(ctx, c, hx - r, hy - r * 1.5, r, r);
  }
  if (a.hairStyle === 'side') {
    ctx.beginPath();
    ctx.ellipse(hx - r * 0.55, hy - r * 0.35, r * 0.6, r * 0.3, -0.4, 0, TAU);
    ctx.fillStyle = tone(c, 0.12);
    ctx.fill();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, r: number, dir: number, angry: boolean): void {
  const fx = hx + dir * r * 0.18;
  const ey = hy + r * 0.12;
  for (const s of [-1, 1]) {
    const ex = fx + s * r * 0.36;
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.17, r * 0.22, 0, 0, TAU);
    ctx.fillStyle = '#2b2d42';
    ctx.fill();
    dot(ctx, ex - r * 0.05, ey - r * 0.08, r * 0.07, '#ffffff');
    if (angry) line(ctx, ex - s * r * 0.2, ey - r * 0.38, ex + s * r * 0.15, ey - r * 0.28, '#2b2d42', r * 0.1);
  }
  // blush
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(fx + s * r * 0.62, ey + r * 0.32, r * 0.17, r * 0.1, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,120,130,0.45)';
    ctx.fill();
  }
  // mouth
  ctx.strokeStyle = angry ? '#7a0000' : '#7f3b2d';
  ctx.lineWidth = r * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (angry) ctx.arc(fx, ey + r * 0.6, r * 0.18, Math.PI * 1.15, Math.PI * 1.85);
  else ctx.arc(fx, ey + r * 0.28, r * 0.2, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  if (a.accessories.includes('glasses')) {
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = r * 0.09;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(fx + s * r * 0.36, ey, r * 0.3, 0, TAU);
      ctx.stroke();
    }
    line(ctx, fx - r * 0.06, ey, fx + r * 0.06, ey, '#2b2d42', r * 0.08);
  }
  if (a.accessories.includes('sunglasses') || a.accessories.includes('star_glasses')) {
    const star = a.accessories.includes('star_glasses');
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(fx + s * r * 0.36, ey, r * 0.32, r * 0.24, 0, 0, TAU);
      ctx.fillStyle = star ? '#ff006e' : '#1d1d2c';
      ctx.fill();
    }
    line(ctx, fx - r * 0.1, ey - r * 0.05, fx + r * 0.1, ey - r * 0.05, '#1d1d2c', r * 0.1);
  }
  if (a.accessories.includes('earrings')) for (const s of [-1, 1]) dot(ctx, hx + s * r * 0.98, hy + r * 0.45, r * 0.12, '#ffd166');
}

function drawHeadwear(ctx: CanvasRenderingContext2D, a: Appearance, hx: number, hy: number, r: number, front: boolean, dir: number): void {
  const c = a.headwearColor ?? a.accent;
  switch (a.headwear) {
    case 'cap':
    case 'visor': {
      if (a.headwear === 'cap') {
        ctx.beginPath();
        ctx.arc(hx, hy - r * 0.15, r * 1.04, Math.PI, 0);
        ctx.closePath();
        shadeFill(ctx, c, hx - r, hy - r * 1.2, r * 2, r);
      } else {
        rr(ctx, hx - r, hy - r * 0.5, r * 2, r * 0.32, r * 0.15);
        shadeFill(ctx, c, hx - r, hy - r * 0.5, r * 2, r * 0.32);
      }
      if (front) {
        ctx.beginPath();
        ctx.ellipse(hx + dir * r * 0.55, hy - r * 0.18, r * 0.72, r * 0.2, 0, 0, TAU);
        shadeFill(ctx, tone(c, -0.12), hx, hy - r * 0.4, r, r * 0.4);
      }
      break;
    }
    case 'beanie': {
      ctx.beginPath();
      ctx.arc(hx, hy - r * 0.1, r * 1.06, Math.PI, 0);
      ctx.closePath();
      shadeFill(ctx, c, hx - r, hy - r * 1.2, r * 2, r);
      rr(ctx, hx - r * 1.08, hy - r * 0.35, r * 2.16, r * 0.4, r * 0.2);
      shadeFill(ctx, tone(c, -0.15), hx - r, hy - r * 0.35, r * 2, r * 0.4);
      dot(ctx, hx, hy - r * 1.18, r * 0.25, tone(c, 0.35));
      break;
    }
    case 'headphones': {
      ctx.strokeStyle = OL;
      ctx.lineWidth = r * 0.34;
      ctx.beginPath();
      ctx.arc(hx, hy - r * 0.05, r * 1.12, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = c;
      ctx.lineWidth = r * 0.22;
      ctx.stroke();
      for (const s of [-1, 1]) {
        rr(ctx, hx + s * r * 1.02 - r * 0.25, hy - r * 0.2, r * 0.5, r * 0.75, r * 0.2);
        shadeFill(ctx, c, hx + s * r - r * 0.25, hy - r * 0.2, r * 0.5, r * 0.75);
      }
      break;
    }
    case 'sunhat':
    case 'bucket': {
      const wide = a.headwear === 'sunhat' ? 1.7 : 1.3;
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.45, r * wide, r * 0.38, 0, 0, TAU);
      shadeFill(ctx, c, hx - r * wide, hy - r * 0.8, r * 2 * wide, r * 0.7);
      rr(ctx, hx - r * 0.82, hy - r * 1.25, r * 1.64, r * 0.85, r * 0.4);
      shadeFill(ctx, c, hx - r, hy - r * 1.25, r * 2, r * 0.85);
      if (a.headwear === 'sunhat') {
        rr(ctx, hx - r * 0.82, hy - r * 0.68, r * 1.64, r * 0.22, 0);
        ctx.fillStyle = a.accent === c ? '#ef476f' : a.accent;
        ctx.fill();
      }
      break;
    }
    case 'chef': {
      rr(ctx, hx - r * 0.75, hy - r * 1.35, r * 1.5, r * 0.85, r * 0.2);
      shadeFill(ctx, '#ffffff', hx - r, hy - r * 1.4, r * 2, r);
      for (const dx of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.arc(hx + dx * r, hy - r * 1.55, r * 0.5, 0, TAU);
        shadeFill(ctx, '#ffffff', hx - r, hy - r * 2, r * 2, r);
      }
      break;
    }
    case 'paper_hat': {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.95, hy - r * 0.55);
      ctx.lineTo(hx, hy - r * 1.5);
      ctx.lineTo(hx + r * 0.95, hy - r * 0.55);
      ctx.closePath();
      shadeFill(ctx, '#ffffff', hx - r, hy - r * 1.5, r * 2, r);
      rr(ctx, hx - r * 0.95, hy - r * 0.75, r * 1.9, r * 0.22, 0);
      ctx.fillStyle = c;
      ctx.fill();
      break;
    }
    case 'beret': {
      ctx.beginPath();
      ctx.ellipse(hx - r * 0.15, hy - r * 0.7, r * 1.05, r * 0.45, -0.15, 0, TAU);
      shadeFill(ctx, c, hx - r, hy - r * 1.2, r * 2, r);
      dot(ctx, hx - r * 0.1, hy - r * 1.15, r * 0.12, tone(c, -0.3));
      break;
    }
    case 'santa': {
      ctx.beginPath();
      ctx.moveTo(hx - r * 1.0, hy - r * 0.45);
      ctx.quadraticCurveTo(hx - r * 0.2, hy - r * 2.0, hx + r * 1.15, hy - r * 1.05);
      ctx.lineTo(hx + r * 1.0, hy - r * 0.45);
      ctx.closePath();
      shadeFill(ctx, '#d62828', hx - r, hy - r * 2, r * 2, r * 1.5);
      rr(ctx, hx - r * 1.08, hy - r * 0.62, r * 2.16, r * 0.4, r * 0.2);
      shadeFill(ctx, '#ffffff', hx - r, hy - r * 0.62, r * 2, r * 0.4);
      dot(ctx, hx + r * 1.15, hy - r * 1.05, r * 0.28, '#ffffff');
      break;
    }
    case 'helmet': {
      ctx.beginPath();
      ctx.arc(hx, hy, r * 1.32, 0, TAU);
      ctx.fillStyle = 'rgba(200,236,255,0.35)';
      ctx.fill();
      ctx.strokeStyle = '#e9ecef';
      ctx.lineWidth = r * 0.22;
      ctx.stroke();
      ctx.strokeStyle = OL;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(hx - r * 0.55, hy - r * 0.6, r * 0.35, r * 0.18, -0.6, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

function drawTorso(ctx: CanvasRenderingContext2D, a: Appearance, x: number, top: number, bottom: number, w: number, front: boolean, dir: number): void {
  const style = a.topStyle;
  rr(ctx, x - w / 2, top, w, bottom - top, w * 0.4);
  shadeFill(ctx, a.top, x - w / 2, top, w, bottom - top);
  const h = bottom - top;
  if (!front) {
    if (style === 'hoodie') {
      ctx.beginPath();
      ctx.ellipse(x, top + 1.5, w * 0.36, 2.4, 0, 0, Math.PI);
      ctx.fillStyle = tone(a.top, -0.2);
      ctx.fill();
    }
    return;
  }
  switch (style) {
    case 'hoodie':
      line(ctx, x - 1.4, top + 2, x - 1.2, top + 6, a.trim, 0.9);
      line(ctx, x + 1.4, top + 2, x + 1.2, top + 6, a.trim, 0.9);
      rr(ctx, x - w * 0.3, top + h * 0.55, w * 0.6, h * 0.28, 1.5);
      ctx.fillStyle = tone(a.top, -0.12);
      ctx.fill();
      break;
    case 'jacket':
    case 'blazer':
    case 'cardigan': {
      // open front showing the shirt
      ctx.beginPath();
      ctx.moveTo(x - w * 0.18, top + 0.5);
      ctx.lineTo(x + w * 0.18, top + 0.5);
      ctx.lineTo(x + w * 0.1, bottom - 0.5);
      ctx.lineTo(x - w * 0.1, bottom - 0.5);
      ctx.closePath();
      ctx.fillStyle = a.trim;
      ctx.fill();
      if (style === 'cardigan') for (const yy of [top + h * 0.4, top + h * 0.7]) dot(ctx, x - w * 0.22, yy, 0.7, tone(a.top, -0.35));
      break;
    }
    case 'polo':
      ctx.beginPath();
      ctx.moveTo(x - 2.6, top);
      ctx.lineTo(x, top + 3);
      ctx.lineTo(x + 2.6, top);
      ctx.fillStyle = a.trim;
      ctx.fill();
      break;
    case 'vest':
      for (const s of [-1, 1]) {
        rr(ctx, x + s * w * 0.25 - 1.1, top, 2.2, h, 0.6);
        ctx.fillStyle = '#fff3b0';
        ctx.fill();
      }
      rr(ctx, x - w / 2, top + h * 0.55, w, 1.6, 0);
      ctx.fillStyle = '#fff3b0';
      ctx.fill();
      break;
    case 'coverall':
      rr(ctx, x - w * 0.3, top + 1, w * 0.6, h * 0.45, 1.5);
      ctx.fillStyle = a.trim;
      ctx.fill();
      break;
    case 'apron':
      rr(ctx, x - w * 0.34, top + h * 0.25, w * 0.68, h * 0.8, 2);
      shadeFill(ctx, a.trim, x - w * 0.34, top + h * 0.25, w * 0.68, h * 0.8, false);
      break;
    case 'chef':
      for (const s of [-1, 1]) for (const yy of [0.35, 0.65]) dot(ctx, x + s * w * 0.16, top + h * yy, 0.8, a.trim);
      break;
    case 'space':
      rr(ctx, x - w * 0.28, top + h * 0.3, w * 0.56, h * 0.3, 1.2);
      ctx.fillStyle = a.trim;
      ctx.fill();
      dot(ctx, x - w * 0.1, top + h * 0.45, 0.8, '#ef476f');
      dot(ctx, x + w * 0.1, top + h * 0.45, 0.8, '#06d6a0');
      break;
    case 'holiday':
      rr(ctx, x - 0.9, top, 1.8, h, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      rr(ctx, x - w / 2, bottom - 2.2, w, 2.2, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    case 'tee':
    default:
      // small emblem
      dot(ctx, x + dir * 1.5, top + h * 0.45, 1.5, a.trim);
      break;
  }
  if (a.accessories.includes('tie')) {
    ctx.beginPath();
    ctx.moveTo(x - 1, top + 1);
    ctx.lineTo(x + 1, top + 1);
    ctx.lineTo(x + 1.4, top + h * 0.7);
    ctx.lineTo(x, top + h * 0.85);
    ctx.lineTo(x - 1.4, top + h * 0.7);
    ctx.closePath();
    ctx.fillStyle = '#e63946';
    ctx.fill();
  }
  if (a.accessories.includes('scarf')) {
    rr(ctx, x - w / 2 - 0.5, top - 0.5, w + 1, 3, 1.5);
    shadeFill(ctx, a.accent, x - w / 2, top, w, 3);
  }
  if (a.accessories.includes('badge') || a.accessories.includes('name_tag')) {
    rr(ctx, x + dir * w * 0.12 - 1.8, top + h * 0.25, 3.6, 2.4, 0.6);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = a.accent;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  if (a.accessories.includes('lanyard')) {
    line(ctx, x - 2, top, x, top + h * 0.55, a.accent, 0.8);
    line(ctx, x + 2, top, x, top + h * 0.55, a.accent, 0.8);
    rr(ctx, x - 1.5, top + h * 0.55, 3, 3.4, 0.6);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  if (a.accessories.includes('backpack')) {
    line(ctx, x - w * 0.32, top + 0.5, x - w * 0.36, top + h * 0.8, a.accent, 1.3);
    line(ctx, x + w * 0.32, top + 0.5, x + w * 0.36, top + h * 0.8, a.accent, 1.3);
  }
  if (a.accessories.includes('camera')) {
    line(ctx, x - w * 0.35, top + 0.5, x + 1, top + h * 0.5, '#2b2d42', 0.7);
    rr(ctx, x - 2.6, top + h * 0.45, 5.2, 3.6, 0.8);
    ctx.fillStyle = '#343a40';
    ctx.fill();
    dot(ctx, x, top + h * 0.45 + 1.8, 1.1, '#8ecae6');
  }
}

/**
 * Draws one character. (x, y) = feet. `ctx` is in world-screen pixels.
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, a: Appearance, pose: Pose): void {
  const s = a.scale;
  const m = poseMotion(pose);
  const dir = pose.right ? 1 : -1;
  const front = pose.front;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  contactShadow(ctx, 0, 0, 18);
  const lift = m.lift ?? 0;
  const by = -(m.bob + lift);
  // body landmarks (local, feet at 0)
  const hipY = -7 + by;
  const shoulderY = -17 + by - (m.breathe ?? 0) * 0.4;
  const headR = 8.8;
  const headY = -27 + by - (m.breathe ?? 0) * 0.3;
  const tilt = pose.state === 'browse' ? dir * 1.2 : pose.state === 'queue' ? Math.sin(pose.t * 0.9) * 0.8 : 0;
  // back-view accessories behind the body
  if (!front && a.accessories.includes('backpack')) {
    rr(ctx, -5.5, shoulderY + 1, 11, 10, 3);
    shadeFill(ctx, a.accent, -5.5, shoulderY + 1, 11, 10);
    rr(ctx, -3.5, shoulderY + 6, 7, 3.5, 1.5);
    ctx.fillStyle = tone(a.accent, -0.18);
    ctx.fill();
  }
  if (front) drawHairBack(ctx, a, tilt, headY, headR, true);
  // legs + shoes
  for (const [lx, sw] of [[-2.3, m.legL], [2.3, m.legR]] as [number, number][]) {
    limb(ctx, lx, hipY, lx + sw * 0.4, -2.4 + Math.min(0, -Math.abs(sw) * 0.2) - lift, a.bottom, 3.4);
    ctx.beginPath();
    ctx.ellipse(lx + sw * 0.4 + dir * 0.6, -1.4 - lift, 2.4, 1.6, 0, 0, TAU);
    shadeFill(ctx, a.shoes, lx - 2, -3 - lift, 5, 3);
  }
  // arms (behind the torso when seen from the back)
  const armTarget = (side: number, swing: number): [number, number] => {
    switch (pose.state) {
      case 'carry':
      case 'restock':
        return [side * 2.8, shoulderY + 2];
      case 'reach':
      case 'browse':
        return side === dir ? [side * 7.5, shoulderY - (pose.state === 'reach' ? 6 : 1)] : [side * 6, shoulderY + 8 + swing * 0.3];
      case 'celebrate':
        return [side * 7, shoulderY - 9];
      case 'work':
      case 'pay':
        return [side * 4.5 + dir * 2, shoulderY + 5 + swing];
      case 'clean':
        return [dir * 4 + side * 1.5, shoulderY + 6 + swing * 0.5];
      default:
        return [side * 6.4, shoulderY + 9 + swing * 0.5];
    }
  };
  const drawArms = () => {
    for (const [side, sw] of [[-1, m.armL], [1, m.armR]] as [number, number][]) {
      const [ex, ey] = armTarget(side, sw);
      limb(ctx, side * 4.6, shoulderY + 1.5, ex, ey, a.top, 3);
      dot(ctx, ex, ey, 1.6, a.skin);
    }
  };
  if (!front) drawArms();
  drawTorso(ctx, a, 0, shoulderY, hipY + 1, 12, front, dir);
  // hand-held props
  const sweep = (m as { sweep?: number }).sweep ?? 0;
  if (a.accessories.includes('mop') && (pose.state === 'clean' || pose.state === 'walk' || pose.state === 'idle')) {
    const hx = dir * 6;
    const fx = dir * (8 + sweep * 3);
    line(ctx, hx, shoulderY - 3, fx, -1, OL, 2.2);
    line(ctx, hx, shoulderY - 3, fx, -1, '#c9a227', 1.4);
    rr(ctx, fx - 3.2, -2.4, 6.4, 2.6, 1);
    ctx.fillStyle = '#a0c4ff';
    ctx.fill();
  }
  if (a.accessories.includes('cane')) line(ctx, -dir * 6.4, shoulderY + 9, -dir * 7.4, 0, '#6b4226', 1.4);
  if (front) drawArms();
  if (a.accessories.includes('shopping_bag') || a.accessories.includes('handbag')) {
    const hand = armTarget(-dir, 0);
    const bag = a.accessories.includes('handbag');
    rr(ctx, hand[0] - (bag ? 3 : 3.6), hand[1] + 0.5, bag ? 6 : 7.2, bag ? 4.5 : 7, 1.6);
    shadeFill(ctx, a.accent, hand[0] - 3.6, hand[1], 7.2, 7);
    if (!bag) {
      ctx.strokeStyle = tone(a.accent, -0.3);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(hand[0], hand[1] + 0.8, 1.8, Math.PI, 0);
      ctx.stroke();
    }
  }
  if (a.accessories.includes('clipboard') && front) {
    const hand = armTarget(dir, 0);
    rr(ctx, hand[0] - 2.6, hand[1] - 3.5, 5.2, 6.5, 0.8);
    shadeFill(ctx, '#c68b59', hand[0] - 2.6, hand[1] - 3.5, 5.2, 6.5);
    rr(ctx, hand[0] - 1.8, hand[1] - 2.4, 3.6, 4.6, 0.4);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  if (pose.carrying) {
    // a delivery box held in front of the chest
    const cy = shoulderY - 1;
    rr(ctx, -5.5, cy - 4, 11, 8, 1.4);
    shadeFill(ctx, '#d4a373', -5.5, cy - 4, 11, 8);
    line(ctx, -5.5, cy - 1, 5.5, cy - 1, tone('#d4a373', -0.3), 0.8);
  }
  // head
  ctx.beginPath();
  ctx.arc(tilt, headY, headR, 0, TAU);
  shadeFill(ctx, a.skin, tilt - headR, headY - headR, headR * 2, headR * 2);
  if (front) {
    // ears
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(tilt + sd * headR * 0.97, headY + headR * 0.12, headR * 0.18, headR * 0.26, 0, 0, TAU);
      ctx.fillStyle = tone(a.skin, -0.06);
      ctx.fill();
    }
    drawFace(ctx, a, tilt, headY, headR, dir, !!pose.angry);
  }
  drawHairFront(ctx, a, tilt, headY, headR, front);
  if (!front) drawHairBack(ctx, a, tilt, headY, headR, false);
  if (a.accessories.includes('bow') && a.hairStyle !== 'bald') {
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(tilt + headR * 0.55 + sd * 1.6, headY - headR * 0.75, 1.8, 1.2, sd * 0.4, 0, TAU);
      ctx.fillStyle = a.accent;
      ctx.fill();
    }
  }
  drawHeadwear(ctx, a, tilt, headY, headR, front, dir);
  ctx.restore();
}

/** Bounding box of a character in local units (feet at 0,0) for hit-testing and badges. */
export const CHARACTER_BOX = { w: 26, h: 44, anchorX: 13, anchorY: 42 };
