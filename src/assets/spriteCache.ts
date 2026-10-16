import { getAsset, FALLBACK } from './registry';
import { imageFor } from './images';
import { ART } from './spec';
import type { AssetDef } from './types';

/**
 * Bakes assets into offscreen canvases once per resolution bucket and reuses them every frame.
 * The bucket follows the on-screen scale (zoom × device pixel ratio), so sprites stay crisp when
 * zoomed in without re-baking every frame.
 */
type Canvasish = HTMLCanvasElement;

const cache = new Map<string, Canvasish>();
let bakes = 0;
const MAX_ENTRIES = 1500;

function makeCanvas(w: number, h: number): Canvasish | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function scaleBucket(scale: number): number {
  if (!(scale > 0)) return 1;
  return Math.min(6, Math.max(1, Math.ceil(scale * 2) / 2));
}

function bake(def: AssetDef, bucket: number): Canvasish | null {
  const pad = ART.padding;
  const c = makeCanvas((def.size.w + pad * 2) * bucket, (def.size.h + pad * 2) * bucket);
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.scale(bucket, bucket);
  ctx.translate(pad, pad);
  const img = imageFor(def.id);
  try {
    // bundled PNGs cover the asset box plus its transparent padding
    if (img) ctx.drawImage(img, -pad, -pad, def.size.w + pad * 2, def.size.h + pad * 2);
    else (def.draw ?? FALLBACK.draw!)(ctx, def);
  } catch (e) {
    // Broken art never crashes the game: draw the fallback instead.
    if (import.meta.env?.DEV) console.warn(`[assets] ${def.id} failed to draw`, e);
    ctx.setTransform(bucket, 0, 0, bucket, pad * bucket, pad * bucket);
    ctx.clearRect(-pad, -pad, def.size.w + pad * 2, def.size.h + pad * 2);
    FALLBACK.draw!(ctx, FALLBACK);
  }
  bakes++;
  return c;
}

export function sprite(id: string, scale = 1): Canvasish | null {
  const bucket = scaleBucket(scale);
  const key = `${id}@${bucket}`;
  let c = cache.get(key);
  if (!c) {
    const made = bake(getAsset(id), bucket);
    if (!made) return null;
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, made);
    c = made;
  }
  return c;
}

/**
 * Draws asset `id` with its ground anchor at (x, y) in the current transform.
 * `size` optionally scales the asset (1 = its declared size); `flip` mirrors it horizontally.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, opts: { size?: number; flip?: boolean; alpha?: number } = {}): void {
  const def = getAsset(id);
  const k = opts.size ?? 1;
  const t = ctx.getTransform();
  const screenScale = Math.hypot(t.a, t.b) * k;
  const c = sprite(def.id, screenScale);
  const pad = ART.padding;
  const w = (def.size.w + pad * 2) * k;
  const h = (def.size.h + pad * 2) * k;
  const dx = x - (def.anchor.x + pad) * k;
  const dy = y - (def.anchor.y + pad) * k;
  if (!c) return;
  const a = opts.alpha;
  if (a !== undefined) {
    ctx.save();
    ctx.globalAlpha *= a;
  }
  if (opts.flip) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(c, dx - x, dy, w, h);
    ctx.restore();
  } else ctx.drawImage(c, dx, dy, w, h);
  if (a !== undefined) ctx.restore();
}

/** A data-URL thumbnail for DOM UI (cached). */
const thumbs = new Map<string, string>();
export function thumbnail(id: string, px = 48): string {
  const key = `${id}#${px}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const def = getAsset(id);
  const s = Math.min(px / (def.size.w + ART.padding * 2), px / (def.size.h + ART.padding * 2)) * (typeof devicePixelRatio === 'number' ? Math.min(2, devicePixelRatio) : 1);
  const c = sprite(def.id, s);
  const url = c ? c.toDataURL('image/png') : '';
  thumbs.set(key, url);
  return url;
}

export function spriteCacheStats() {
  return { entries: cache.size, bakes };
}

export function clearSpriteCache(): void {
  cache.clear();
  thumbs.clear();
}
