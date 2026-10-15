import { iso, shade, faces } from './iso';

/** Shading per world-facing side (fixed light, so rotating the camera changes which sides look lit). */
const SIDE_SHADE = { px: -0.28, py: -0.12, nx: -0.06, ny: -0.2 };

/**
 * Draws a box. Footprint in tile units, height & elevation in px. Only the side faces turned toward
 * the camera are drawn (plus the top), so it renders correctly from any rotation.
 */
export function box(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, h: number, color: string, z0 = 0, outline = true): void {
  ctx.lineJoin = 'round';
  const sides: [number, number, number, number, number, number, number][] = [
    // ax, ay, bx, by, nx, ny, shade
    [x1, y0, x1, y1, 1, 0, SIDE_SHADE.px],
    [x0, y1, x1, y1, 0, 1, SIDE_SHADE.py],
    [x0, y0, x0, y1, -1, 0, SIDE_SHADE.nx],
    [x0, y0, x1, y0, 0, -1, SIDE_SHADE.ny],
  ];
  const stroke = outline ? shade(color, -0.45) : '';
  for (const [ax, ay, bx, by, nx, ny, sh] of sides) {
    if (!faces(nx, ny)) continue;
    const a = iso(ax, ay, z0);
    const b = iso(bx, by, z0);
    const c = iso(bx, by, z0 + h);
    const d = iso(ax, ay, z0 + h);
    ctx.fillStyle = shade(color, sh);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  const A = iso(x0, y0, z0 + h);
  const B = iso(x1, y0, z0 + h);
  const C = iso(x1, y1, z0 + h);
  const D = iso(x0, y1, z0 + h);
  ctx.fillStyle = shade(color, 0.12);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.lineTo(C.x, C.y);
  ctx.lineTo(D.x, D.y);
  ctx.closePath();
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/**
 * The corner chain along the camera-facing sides of a footprint, left to right on screen
 * (2 points when one side faces the camera, 3 when two do). Used for trims and decals.
 */
export function frontChain(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  // sides between consecutive corners: -y, +x, +y, -x
  const normals: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const vis = normals.map(([nx, ny]) => faces(nx, ny));
  // find the start of the visible run (a visible side whose predecessor is hidden)
  let start = vis.findIndex((v, i) => v && !vis[(i + 3) % 4]);
  if (start < 0) start = 0;
  const chain: [number, number][] = [corners[start]];
  for (let k = 0; k < 4 && vis[(start + k) % 4]; k++) chain.push(corners[(start + k + 1) % 4]);
  // order left → right on screen
  if (chain.length > 1 && iso(chain[0][0], chain[0][1]).x > iso(chain[chain.length - 1][0], chain[chain.length - 1][1]).x) chain.reverse();
  return chain;
}

/** Camera-facing side edges of a footprint as [ax, ay, bx, by] (for windows, glass doors…). */
export function frontSides(x0: number, y0: number, x1: number, y1: number): [number, number, number, number][] {
  const c = frontChain(x0, y0, x1, y1);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i + 1 < c.length; i++) out.push([c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]]);
  return out;
}

/** Flat diamond on the floor. */
export function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, z = 0, inset = 0): void {
  const a = iso(x + inset, y + inset, z);
  const b = iso(x + w - inset, y + inset, z);
  const c = iso(x + w - inset, y + w - inset, z);
  const d = iso(x + inset, y + w - inset, z);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

export function diamondPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, z = 0): void {
  const a = iso(x, y, z);
  const b = iso(x + w, y, z);
  const c = iso(x + w, y + h, z);
  const d = iso(x, y + h, z);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (!(w > 0) || !(h > 0)) return; // empty path: nothing to fill (never throws)
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function emoji(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number): void {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}

/** Small rounded label with text (used for LOW/OUT badges, prices, timers). */
export function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg = '#fff', size = 9): void {
  ctx.font = `800 ${size}px Nunito, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size;
  roundRect(ctx, x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.8);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}
