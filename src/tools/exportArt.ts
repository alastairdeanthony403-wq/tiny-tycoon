import { registerBuiltinAssets } from '../assets';
import { listAssets } from '../assets/registry';
import { ART } from '../assets/spec';
import { SHEET, animsFor, frameRect, renderFrame, sheetDefs, sheetSize } from '../assets/sheets';
import { TERRAIN_IDS } from '../assets/terrain';
import { TEXTURE_CELL } from '../assets/images';
import { paintTerrainTexture } from '../render/world';

/**
 * Development-only art exporter (opened by scripts/export-art.mjs at /tools/export-art.html).
 * Rasterizes the procedural art into the PNG files the game loads at runtime. It always draws
 * from the procedural source, never from previously exported PNGs.
 */
export const SPRITE_SCALE = 4;

interface Out {
  dir: 'images' | 'sheets' | 'textures';
  name: string;
  w: number;
  h: number;
  data: string;
  meta?: Record<string, unknown>;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Billboard and thumbnail families get sprite files; terrain swatches too (they are UI previews). */
const SPRITE_FAMILIES = new Set(['product', 'character', 'staff', 'outfit', 'furniture', 'terrain', 'decoration', 'theme', 'location', 'ui']);

function exportAll(): Out[] {
  registerBuiltinAssets();
  const out: Out[] = [];
  const pad = ART.padding;
  for (const def of listAssets()) {
    if (!SPRITE_FAMILIES.has(def.category) || !def.draw) continue;
    const w = Math.round((def.size.w + pad * 2) * SPRITE_SCALE);
    const h = Math.round((def.size.h + pad * 2) * SPRITE_SCALE);
    const [c, ctx] = canvas(w, h);
    ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    ctx.translate(pad, pad);
    def.draw(ctx, def);
    out.push({ dir: 'images', name: def.id, w, h, data: c.toDataURL('image/png'), meta: { category: def.category, size: def.size, anchor: def.anchor, scale: SPRITE_SCALE, padding: pad } });
  }
  for (const d of sheetDefs()) {
    const size = sheetSize(d.kind);
    const [c, ctx] = canvas(size.w, size.h);
    const anims = animsFor(d.kind);
    anims.forEach((a, ai) => {
      for (const front of [true, false]) {
        for (let f = 0; f < a.frames; f++) {
          const r = frameRect(d.kind, ai, front, f);
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.w, r.h);
          ctx.clip();
          ctx.setTransform(SHEET.scale, 0, 0, SHEET.scale, r.x, r.y);
          renderFrame(ctx, d, ai, front, f);
          ctx.restore();
        }
      }
    });
    out.push({ dir: 'sheets', name: d.id, w: size.w, h: size.h, data: c.toDataURL('image/png'), meta: { kind: d.kind, frame: { w: SHEET.w * SHEET.scale, h: SHEET.h * SHEET.scale, anchorX: SHEET.ax * SHEET.scale, anchorY: SHEET.ay * SHEET.scale }, frames: anims.flatMap((a, ai) => [true, false].flatMap((front) => Array.from({ length: a.frames }, (_, f) => ({ anim: a.name, view: front ? 'front' : 'back', frame: f, ...frameRect(d.kind, ai, front, f) })))) } });
  }
  for (const id of TERRAIN_IDS) {
    const [c, ctx] = canvas(TEXTURE_CELL * 2, TEXTURE_CELL * 2);
    paintTerrainTexture(ctx, id);
    out.push({ dir: 'textures', name: id, w: TEXTURE_CELL * 2, h: TEXTURE_CELL * 2, data: c.toDataURL('image/png'), meta: { cells: 4, cell: TEXTURE_CELL } });
  }
  return out;
}

(window as unknown as { __exportArt: () => Out[] }).__exportArt = exportAll;
document.body.textContent = 'art exporter ready';
