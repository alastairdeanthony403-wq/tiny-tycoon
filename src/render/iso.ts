import { CAMERA } from '../config/camera';

/**
 * Projection helpers. World tiles (x, y on the ground, z = height in px) → "world-screen" pixels
 * (before the camera's pan/zoom).
 *
 * This is a real orthographic camera with a yaw (rotation around the vertical axis, unlimited) and
 * a pitch (tilt). Every floor tile, wall and box in the game is built from projected corners, so
 * the geometry genuinely rotates. At yaw 0 / pitch 30° it reproduces the classic 2:1 isometric
 * numbers exactly (TW × TH tiles). People, icons and labels are flat "billboards" that always face
 * the camera.
 */
export const TW = 64;
export const TH = 32;
export const WALL_H = 46;

export interface Pt {
  x: number;
  y: number;
}

const DEG = Math.PI / 180;
/** Ground scale so that yaw 0 gives (x − y)·TW/2. */
const K = TW / Math.SQRT2;
const SIN30 = 0.5;
const COS30 = Math.cos(30 * DEG);

/** The active view (set once per frame by the renderer; picking uses the same view). */
export const view = {
  yaw: 0,
  pitch: 30,
  px: 0,
  py: 0,
  cosA: Math.cos(45 * DEG),
  sinA: Math.sin(45 * DEG),
  sinP: SIN30,
  /** Vertical (z) scale relative to the classic view: cos(pitch)/cos(30°). */
  zs: 1,
};

/** yawDeg: camera rotation (0 = classic view); pitchDeg: tilt; (px, py): ground pivot (shop centre). */
export function setView(yawDeg: number, pitchDeg: number, px: number, py: number): void {
  const a = (45 + yawDeg) * DEG;
  const p = Math.max(5, Math.min(85, pitchDeg)) * DEG;
  view.yaw = yawDeg;
  view.pitch = pitchDeg;
  view.px = px;
  view.py = py;
  view.cosA = Math.cos(a);
  view.sinA = Math.sin(a);
  view.sinP = Math.sin(p);
  view.zs = Math.cos(p) / COS30;
}

export function iso(x: number, y: number, z = 0): Pt {
  const dx = x - view.px;
  const dy = y - view.py;
  const a = dx * view.cosA - dy * view.sinA;
  const b = dx * view.sinA + dy * view.cosA;
  return { x: K * a, y: K * b * view.sinP - z * view.zs };
}

/** Projection of a ground direction vector (no pivot). */
export function isoVec(gx: number, gy: number): Pt {
  return { x: K * (gx * view.cosA - gy * view.sinA), y: K * (gx * view.sinA + gy * view.cosA) * view.sinP };
}

/** Distance toward the viewer of a ground point (larger = nearer). Used for painter's sorting. */
export function depth(x: number, y: number): number {
  return (x - view.px) * view.sinA + (y - view.py) * view.cosA;
}

/** True when a surface whose outward ground normal is (nx, ny) faces the camera. */
export function faces(nx: number, ny: number): boolean {
  return nx * view.sinA + ny * view.cosA > 1e-6;
}

/** Inverse projection at z = 0 (screen → ground tile coordinates). */
export function unIso(sx: number, sy: number): Pt {
  const a = sx / K;
  const b = sy / (K * view.sinP);
  return { x: a * view.cosA + b * view.sinA + view.px, y: -a * view.sinA + b * view.cosA + view.py };
}

/** Screen-space vector → ground vector (for panning in ground space). */
export function unIsoVec(sx: number, sy: number): Pt {
  const a = sx / K;
  const b = sy / (K * view.sinP);
  return { x: a * view.cosA + b * view.sinA, y: -a * view.sinA + b * view.cosA };
}

/** Saved / restorable camera pose. */
export interface CameraPose {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Camera controller: smooth yaw (seamless 360°), pitch, zoom and ground-space pan on top of the
 * automatic "fit the shop" framing. Targets are set by input; `update` eases toward them.
 */
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
  /** Pan offset in ground tiles (rotates with the scene). */
  panX = 0;
  panY = 0;
  /** Unbounded so rotation through 0°/360° never jumps; use `yawDeg` for the wrapped value. */
  yaw = CAMERA.defaultYaw;
  tyaw = CAMERA.defaultYaw;
  pitch = CAMERA.defaultPitch;
  tpitch = CAMERA.defaultPitch;
  shake = 0;
  vw = 1;
  vh = 1;
  fitZoom = 1;
  /** Pan limit in tiles (set from the shop size). */
  panLimit = 5;
  /** Input sensitivity multiplier (Settings). */
  sensitivity = 1;
  /** Reduced motion: transitions finish almost immediately. */
  reduced = false;

  get yawDeg(): number {
    return ((this.yaw % 360) + 360) % 360;
  }

  frame(minX: number, minY: number, maxX: number, maxY: number, vw: number, vh: number, insetTop: number, insetBottom: number, insetRight = 0, insetLeft = 0, fit?: { w: number; h: number }, panPx: Pt = { x: 0, y: 0 }): void {
    this.vw = vw;
    this.vh = vh;
    const availW = Math.max(100, vw - insetRight - insetLeft - 16);
    const availH = Math.max(100, vh - insetTop - insetBottom);
    const bw = fit?.w ?? maxX - minX;
    const bh = fit?.h ?? maxY - minY;
    this.fitZoom = Math.min(availW / bw, availH / bh, 2.4);
    this.tzoom = Math.min(CAMERA.maxAbsoluteZoom, this.fitZoom * this.userZoom);
    // Centre the box inside the area not covered by UI. Screen x = (wx - cam.x)·zoom + vw/2, so to put
    // the box centre at vw/2 + (left - right)/2 the camera sits at cx - (left - right)/(2·zoom).
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const offX = (insetRight - insetLeft) / 2 / this.tzoom;
    const offY = (insetBottom - insetTop) / 2 / this.tzoom;
    this.tx = cx + offX + panPx.x;
    this.ty = cy + offY + panPx.y;
  }

  update(dt: number): void {
    const k = this.reduced ? 1 : 1 - Math.pow(CAMERA.smoothing, dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom += (this.tzoom - this.zoom) * k;
    this.yaw += (this.tyaw - this.yaw) * k;
    this.pitch += (this.tpitch - this.pitch) * k;
    if (Math.abs(this.tyaw - this.yaw) < 0.01) this.yaw = this.tyaw;
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  snap(): void {
    this.x = this.tx;
    this.y = this.ty;
    this.zoom = this.tzoom;
    this.yaw = this.tyaw;
    this.pitch = this.tpitch;
  }

  /** Screen (CSS px) → world-screen px. */
  toWorld(px: number, py: number): Pt {
    return { x: (px - this.vw / 2) / this.zoom + this.x, y: (py - this.vh / 2) / this.zoom + this.y };
  }

  toScreen(wx: number, wy: number): Pt {
    return { x: (wx - this.x) * this.zoom + this.vw / 2, y: (wy - this.y) * this.zoom + this.vh / 2 };
  }

  zoomBy(f: number): void {
    this.userZoom = clamp(this.userZoom * f, CAMERA.minZoom, CAMERA.maxZoom);
  }

  rotateBy(deg: number): void {
    this.tyaw += deg;
  }

  tiltBy(deg: number): void {
    this.tpitch = clamp(this.tpitch + deg, CAMERA.minPitch, CAMERA.maxPitch);
  }

  /** Orbit from a drag in CSS px: horizontal = yaw, vertical = tilt. */
  orbit(dx: number, dy: number): void {
    this.rotateBy(-dx * CAMERA.dragYawPerPx * this.sensitivity);
    this.tiltBy(-dy * CAMERA.dragPitchPerPx * this.sensitivity);
    // Dragging should feel attached to the finger, not eased.
    this.yaw = this.tyaw;
    this.pitch = this.tpitch;
  }

  /** Pan from a drag in CSS px: the ground moves with the finger, whatever the rotation. */
  pan(dx: number, dy: number): void {
    const g = unIsoVec(-dx / this.zoom, -dy / this.zoom);
    this.panX = clamp(this.panX + g.x, -this.panLimit, this.panLimit);
    this.panY = clamp(this.panY + g.y, -this.panLimit, this.panLimit);
  }

  /** Frame the whole shop: keep the viewing angle, clear zoom and pan. */
  resetUser(): void {
    this.userZoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  /** Back to the default gameplay camera, rotating the short way round. */
  resetView(): void {
    this.resetUser();
    const turns = Math.round((this.yaw - CAMERA.defaultYaw) / 360);
    this.tyaw = CAMERA.defaultYaw + turns * 360;
    this.tpitch = CAMERA.defaultPitch;
  }

  pose(): CameraPose {
    return { yaw: this.yawDeg, pitch: this.tpitch, zoom: this.userZoom, panX: this.panX, panY: this.panY };
  }

  restore(p: CameraPose): void {
    this.yaw = this.tyaw = Number.isFinite(p.yaw) ? p.yaw : CAMERA.defaultYaw;
    this.pitch = this.tpitch = clamp(Number.isFinite(p.pitch) ? p.pitch : CAMERA.defaultPitch, CAMERA.minPitch, CAMERA.maxPitch);
    this.userZoom = clamp(Number.isFinite(p.zoom) ? p.zoom : 1, CAMERA.minZoom, CAMERA.maxZoom);
    this.panX = clamp(Number.isFinite(p.panX) ? p.panX : 0, -this.panLimit, this.panLimit);
    this.panY = clamp(Number.isFinite(p.panY) ? p.panY : 0, -this.panLimit, this.panLimit);
  }
}

/** Lighten (amt > 0) or darken (amt < 0) a colour. Accepts #rrggbb or rgb(r,g,b) (its own output). */
export function shade(hex: string, amt: number): string {
  let r: number;
  let g: number;
  let b: number;
  const m = /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/.exec(hex);
  if (m) {
    r = +m[1];
    g = +m[2];
    b = +m[3];
  } else {
    const n = parseInt(hex.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  }
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
