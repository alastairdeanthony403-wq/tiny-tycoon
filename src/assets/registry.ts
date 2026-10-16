import type { AssetDef, AssetCategory } from './types';
import { ART } from './spec';
import { rr, mark } from './draw';

/** Validation problems for one definition (empty = valid). */
export function validateAsset(def: AssetDef): string[] {
  const errs: string[] = [];
  if (!ART.idPattern.test(def.id)) errs.push(`bad id "${def.id}"`);
  const { w, h } = def.size;
  if (!(w > 0 && h > 0 && w <= 512 && h <= 512 && Number.isFinite(w) && Number.isFinite(h))) errs.push(`bad size ${w}×${h}`);
  if (!(def.anchor.x >= 0 && def.anchor.x <= w && def.anchor.y >= 0 && def.anchor.y <= h)) errs.push('anchor outside the box');
  if (def.footprint && !(Number.isInteger(def.footprint.w) && Number.isInteger(def.footprint.h) && def.footprint.w > 0 && def.footprint.h > 0)) errs.push('footprint must be whole positive tiles');
  if (!def.draw && !def.image) errs.push('needs procedural art or an image');
  if (def.animation && (!(def.animation.cycle > 0) || def.animation.states.length === 0)) errs.push('bad animation');
  return errs;
}

/** Drawn when an id is unknown or broken: a neutral crate with a "?" in the house style. */
export const FALLBACK: AssetDef = {
  id: 'fallback.missing',
  category: 'fallback',
  size: { w: 28, h: 28 },
  anchor: { x: 14, y: 26 },
  layer: 'object',
  camera: 'billboard',
  draw: (ctx) => {
    rr(ctx, 4, 6, 20, 19, 4);
    ctx.fillStyle = '#ced4da';
    ctx.fill();
    ctx.strokeStyle = ART.outline.color;
    ctx.lineWidth = ART.outline.width;
    ctx.stroke();
    mark(ctx, '?', 14, 16, 13, '#495057');
  },
};

const assets = new Map<string, AssetDef>();
const problems: { id: string; errors: string[] }[] = [];
const missing = new Set<string>();

export function registerAsset(def: AssetDef): void {
  const errors = validateAsset(def);
  if (assets.has(def.id)) errors.push('duplicate id');
  if (errors.length) {
    problems.push({ id: def.id, errors });
    if (import.meta.env?.DEV) console.warn(`[assets] ${def.id}: ${errors.join('; ')}`);
    return;
  }
  assets.set(def.id, def);
}

export function registerAll(defs: AssetDef[]): void {
  for (const d of defs) registerAsset(d);
}

export function hasAsset(id: string): boolean {
  return assets.has(id);
}

/** Never throws: unknown ids get the fallback and are recorded for diagnostics. */
export function getAsset(id: string): AssetDef {
  const a = assets.get(id);
  if (a) return a;
  if (!missing.has(id)) {
    missing.add(id);
    if (import.meta.env?.DEV) console.warn(`[assets] missing asset "${id}" — using fallback`);
  }
  return FALLBACK;
}

export function listAssets(category?: AssetCategory): AssetDef[] {
  return [...assets.values()].filter((a) => !category || a.category === category);
}

export function assetDiagnostics() {
  return { count: assets.size, invalid: [...problems], missing: [...missing] };
}
