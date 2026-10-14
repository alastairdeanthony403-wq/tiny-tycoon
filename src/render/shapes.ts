import { iso, shade } from './iso';

/** Draws an isometric box. Footprint in tile units, height & elevation in px. */
export function box(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, h: number, color: string, z0 = 0, outline = true): void {
  const A = iso(x0, y0, z0 + h);
  const B = iso(x1, y0, z0 + h);
  const C = iso(x1, y1, z0 + h);
  const D = iso(x0, y1, z0 + h);
  const Bg = iso(x1, y0, z0);
  const Cg = iso(x1, y1, z0);
  const Dg = iso(x0, y1, z0);
  ctx.lineJoin = 'round';
  // left (+y) face
  ctx.fillStyle = shade(color, -0.12);
  ctx.beginPath();
  ctx.moveTo(D.x, D.y);
  ctx.lineTo(C.x, C.y);
  ctx.lineTo(Cg.x, Cg.y);
  ctx.lineTo(Dg.x, Dg.y);
  ctx.closePath();
  ctx.fill();
  // right (+x) face
  ctx.fillStyle = shade(color, -0.28);
  ctx.beginPath();
  ctx.moveTo(B.x, B.y);
  ctx.lineTo(C.x, C.y);
  ctx.lineTo(Cg.x, Cg.y);
  ctx.lineTo(Bg.x, Bg.y);
  ctx.closePath();
  ctx.fill();
  // top
  ctx.fillStyle = shade(color, 0.12);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.lineTo(C.x, C.y);
  ctx.lineTo(D.x, D.y);
  ctx.closePath();
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = shade(color, -0.45);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(Bg.x, Bg.y);
    ctx.lineTo(Cg.x, Cg.y);
    ctx.lineTo(Dg.x, Dg.y);
    ctx.lineTo(D.x, D.y);
    ctx.closePath();
    ctx.moveTo(D.x, D.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(B.x, B.y);
    ctx.moveTo(C.x, C.y);
    ctx.lineTo(Cg.x, Cg.y);
    ctx.stroke();
  }
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
