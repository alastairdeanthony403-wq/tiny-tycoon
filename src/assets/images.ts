import { listAssets } from './registry';
import type { AssetDef } from './types';

/**
 * Optional bundled PNG artwork. Drop a transparent PNG named after an asset id
 * (e.g. src/assets/images/product.soda.png) and it replaces the procedural art once it loads.
 * Nothing is fetched from remote URLs. Missing or invalid files simply keep the procedural art.
 */
const files: Record<string, string> = (() => {
  try {
    return import.meta.glob('./images/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
  } catch {
    return {};
  }
})();

export function bundledImageIds(): string[] {
  return Object.keys(files).map((p) => p.replace(/^.*\//, '').replace(/\.png$/, ''));
}

const loaded = new Map<string, HTMLImageElement>();
const rejected = new Map<string, string>();

/** Aspect ratio of the image must match the asset box (±10%) or it is rejected. */
export function imageFits(def: AssetDef, w: number, h: number): boolean {
  if (!(w > 0 && h > 0)) return false;
  const a = w / h;
  const b = def.size.w / def.size.h;
  return Math.abs(a - b) / b <= 0.1;
}

export function loadBundledImages(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve();
  const byId = new Map(listAssets().map((a) => [a.id, a]));
  const entries = Object.entries(files);
  let done = 0;
  return Promise.all(
    entries.map(
      ([path, url]) =>
        new Promise<void>((resolve) => {
          const id = path.replace(/^.*\//, '').replace(/\.png$/, '');
          const def = byId.get(id);
          const finish = () => {
            onProgress?.(++done, entries.length);
            resolve();
          };
          if (!def) {
            rejected.set(id, 'no asset with this id');
            return finish();
          }
          const img = new Image();
          img.onload = () => {
            if (imageFits(def, img.naturalWidth, img.naturalHeight)) loaded.set(id, img);
            else rejected.set(id, `aspect ${img.naturalWidth}×${img.naturalHeight} does not match ${def.size.w}×${def.size.h}`);
            finish();
          };
          img.onerror = () => {
            rejected.set(id, 'failed to decode');
            finish();
          };
          img.src = url;
        }),
    ),
  ).then(() => {
    if (rejected.size && import.meta.env?.DEV) console.warn('[assets] rejected images', Object.fromEntries(rejected));
  });
}

export function imageFor(id: string): HTMLImageElement | undefined {
  return loaded.get(id);
}

export function imageDiagnostics() {
  return { loaded: [...loaded.keys()], rejected: Object.fromEntries(rejected) };
}
