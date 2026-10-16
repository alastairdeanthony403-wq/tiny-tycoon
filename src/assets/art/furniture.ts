import type { AssetDef } from '../types';
import { getAsset } from '../registry';
import { OBJECT_MAP, OBJECTS } from '../../config/objects';
import { drawObject } from '../../render/sprites';
import { iso, setView, view } from '../../render/iso';
import type { PlacedObject } from '../../core/types';

/**
 * Furniture & fixture entries. In the world these are real box geometry (render/sprites.ts) so they
 * rotate with the camera; the registry entry adds metadata (footprint, label, link to the object
 * config) and a thumbnail drawn by the same geometry code from the default camera angle.
 * Footprints must agree with placement in sim/grid.ts (a test checks this).
 */
export const FURNITURE_FOOTPRINT = { w: 1, h: 1 };

export function furnitureAssets(): AssetDef[] {
  return OBJECTS.map((def) => ({
    id: `furniture.${def.id}`,
    category: 'furniture' as const,
    size: { w: 64, h: 104 },
    anchor: { x: 32, y: 88 },
    footprint: { ...FURNITURE_FOOTPRINT },
    layer: 'object' as const,
    camera: 'geometry' as const,
    label: `object.${def.id}`,
    ref: def.id,
    draw: (ctx) => {
      const prev = { yaw: view.yaw, pitch: view.pitch, px: view.px, py: view.py };
      setView(0, 30, 0, 0);
      try {
        const sp = def.sprite ? getAsset(def.sprite.id) : null;
        if (def.sprite && sp?.draw) {
          // decorations drawn as a registry sprite: the same drawing, scaled, standing on the tile centre
          const k = def.sprite.size;
          ctx.translate(32 - sp.anchor.x * k, 74 - sp.anchor.y * k);
          ctx.scale(k, k);
          sp.draw(ctx, sp);
          return;
        }
        const c = iso(0.5, 0.5);
        ctx.translate(32 - c.x, 74 - c.y);
        const o: PlacedObject = { uid: -1, kind: def.id, x: 0, y: 0, dir: 2, tier: 0, stock: 99, progress: 0, productId: OBJECT_MAP[def.id]?.display ? 'crisps' : undefined };
        drawObject(ctx, o, { stockRatio: 1, time: 0, sparkle: false });
      } finally {
        setView(prev.yaw, prev.pitch, prev.px, prev.py);
      }
    },
  }));
}
