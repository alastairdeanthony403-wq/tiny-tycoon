/** Isometric projection helpers. World tiles → "world-screen" pixels (before camera). */
export const TW = 64;
export const TH = 32;
export const WALL_H = 46;

export interface Pt {
  x: number;
  y: number;
}

export function iso(x: number, y: number, z = 0): Pt {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) - z };
}

/** Inverse projection at z = 0. */
export function unIso(sx: number, sy: number): Pt {
  const a = sx / (TW / 2);
  const b = sy / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  /** Auto-framing targets. */
  tx = 0;
  ty = 0;
  tzoom = 1;
  /** Player adjustments on top of auto framing. */
  userZoom = 1;
  panX = 0;
  panY = 0;
  shake = 0;
  vw = 1;
  vh = 1;
  fitZoom = 1;

  frame(minX: number, minY: number, maxX: number, maxY: number, vw: number, vh: number, insetTop: number, insetBottom: number, insetRight = 0, insetLeft = 0): void {
    this.vw = vw;
    this.vh = vh;
    const availW = Math.max(100, vw - insetRight - insetLeft - 16);
    const availH = Math.max(100, vh - insetTop - insetBottom);
    const bw = maxX - minX;
    const bh = maxY - minY;
    this.fitZoom = Math.min(availW / bw, availH / bh, 2.4);
    this.tzoom = this.fitZoom * this.userZoom;
    // Centre the box inside the area not covered by UI. Screen x = (wx - cam.x)·zoom + vw/2, so to put
    // the box centre at vw/2 + (left - right)/2 the camera sits at cx - (left - right)/(2·zoom).
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const offX = (insetRight - insetLeft) / 2 / this.tzoom;
    const offY = (insetBottom - insetTop) / 2 / this.tzoom;
    this.tx = cx + offX + this.panX;
    this.ty = cy + offY + this.panY;
  }

  update(dt: number): void {
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom += (this.tzoom - this.zoom) * k;
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  snap(): void {
    this.x = this.tx;
    this.y = this.ty;
    this.zoom = this.tzoom;
  }

  /** Screen (CSS px) → world-screen px. */
  toWorld(px: number, py: number): Pt {
    return { x: (px - this.vw / 2) / this.zoom + this.x, y: (py - this.vh / 2) / this.zoom + this.y };
  }

  toScreen(wx: number, wy: number): Pt {
    return { x: (wx - this.x) * this.zoom + this.vw / 2, y: (wy - this.y) * this.zoom + this.vh / 2 };
  }

  zoomBy(f: number): void {
    this.userZoom = Math.max(0.6, Math.min(2.4, this.userZoom * f));
  }

  pan(dx: number, dy: number, limit: number): void {
    this.panX = Math.max(-limit, Math.min(limit, this.panX - dx / this.zoom));
    this.panY = Math.max(-limit, Math.min(limit, this.panY - dy / this.zoom));
  }

  resetUser(): void {
    this.userZoom = 1;
    this.panX = 0;
    this.panY = 0;
  }
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
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
