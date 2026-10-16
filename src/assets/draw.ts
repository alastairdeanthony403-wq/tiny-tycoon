import { ART } from './spec';

/** Shared drawing helpers so every asset uses the same shading, outline and shadow rules. */

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/.exec(hex);
  if (m) return [+m[1], +m[2], +m[3]];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amt > 0) / darken (amt < 0). */
export function tone(hex: string, amt: number): string {
  let [r, g, b] = hexToRgb(hex);
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Fill the current path with a top-left lit gradient of `color`, then the standard outline. */
export function shadeFill(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number, outline = true): void {
  const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  g.addColorStop(0, tone(color, 0.22));
  g.addColorStop(0.55, color);
  g.addColorStop(1, tone(color, -0.18));
  ctx.fillStyle = g;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = ART.outline.color;
    ctx.lineWidth = ART.outline.width;
    ctx.stroke();
  }
}

export function contactShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
  const rx = w * ART.shadow.rxPerW;
  ctx.fillStyle = ART.shadow.color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, rx * ART.shadow.ryPerRx, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Small specular highlight. */
export function shine(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 0.55): void {
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** A front-facing box with a lit top and a shaded right side (the 3/4 "toy" look used for packaging). */
export function pack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, depth = 4, r = 2): void {
  // right side
  ctx.beginPath();
  ctx.moveTo(x + w, y + depth * 0.2);
  ctx.lineTo(x + w + depth, y - depth * 0.6);
  ctx.lineTo(x + w + depth, y + h - depth * 0.8);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fillStyle = tone(color, -0.28);
  ctx.fill();
  ctx.strokeStyle = ART.outline.color;
  ctx.lineWidth = ART.outline.width;
  ctx.stroke();
  // top
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + depth, y - depth * 0.8);
  ctx.lineTo(x + w + depth, y - depth * 0.8);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fillStyle = tone(color, 0.3);
  ctx.fill();
  ctx.stroke();
  // front
  rr(ctx, x, y, w, h, r);
  shadeFill(ctx, color, x, y, w, h);
}

/** A label band across a front face. */
export function band(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, r = 1.5): void {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, outline = true): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  shadeFill(ctx, color, x - rx, y - ry, rx * 2, ry * 2, outline);
}

/** Tiny fictional brand mark (never a real logo). */
export function mark(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#fff'): void {
  ctx.fillStyle = color;
  ctx.font = `900 ${size}px Nunito, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
