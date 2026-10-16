import type { AssetDef } from '../types';
import { SHOP_SKINS } from '../../render/skins';
import { THEME_MAP } from '../../config/cosmetics';
import { LOCATION_SETS } from '../locations';
import { TERRAIN } from '../terrain';
import { getAsset } from '../registry';
import { tone } from '../draw';

/**
 * Theme and location entries: a tiny room (floor + two walls + a shelf) in each theme's palette,
 * and a terrain patch with each location's signature prop. Used as previews/thumbnails.
 */
type Pal = { floorA: string; floorB: string; wall: string; wallTop: string; trim: string };

function room(ctx: CanvasRenderingContext2D, p: Pal, shelf: string, trim: string): void {
  const P = (x: number, y: number, z = 0) => ({ x: 24 + (x - y) * 11, y: 18 + (x + y) * 5.5 - z });
  const poly = (pts: { x: number; y: number }[], fill: string) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], (x + y) % 2 ? p.floorA : p.floorB);
  poly([P(0, 0), P(0, 2), P(0, 2, 18), P(0, 0, 18)], tone(p.wall, -0.1));
  poly([P(0, 0), P(2, 0), P(2, 0, 18), P(0, 0, 18)], p.wall);
  poly([P(0, 0, 18), P(2, 0, 18), P(2, 0, 20), P(0, 0, 20)], p.wallTop);
  poly([P(0, 0, 18), P(0, 2, 18), P(0, 2, 20), P(0, 0, 20)], tone(p.wallTop, -0.1));
  poly([P(1.1, 0.2), P(1.8, 0.2), P(1.8, 0.2, 12), P(1.1, 0.2, 12)], shelf);
  poly([P(1.1, 0.2, 6), P(1.8, 0.2, 6), P(1.8, 0.2, 7.5), P(1.1, 0.2, 7.5)], trim);
}

export function themeAssets(): AssetDef[] {
  const out: AssetDef[] = [];
  const def = THEME_MAP.classic;
  const themes: [string, Pal, string, string][] = [
    ['default', def, '#e0a96d', '#a0522d'],
    ...Object.values(SHOP_SKINS).map((s) => [s.id, s.palette, s.shelf?.color ?? '#e0a96d', s.shelf?.trim ?? s.palette.trim] as [string, Pal, string, string]),
  ];
  for (const [id, pal, shelf, trim] of themes) {
    out.push({ id: `theme.${id}`, category: 'theme', size: { w: 48, h: 44 }, anchor: { x: 24, y: 40 }, layer: 'ui', camera: 'billboard', draw: (ctx) => room(ctx, pal, shelf, trim), ref: id });
  }
  for (const set of Object.values(LOCATION_SETS)) {
    out.push({
      id: `location.${set.id}`,
      category: 'location',
      size: { w: 48, h: 44 },
      anchor: { x: 24, y: 40 },
      layer: 'ui',
      camera: 'billboard',
      ref: set.id,
      draw: (ctx) => {
        const t = TERRAIN[set.terrainAt(9, 9, 4)] ?? TERRAIN.grass;
        ctx.beginPath();
        ctx.moveTo(24, 22);
        ctx.lineTo(46, 33);
        ctx.lineTo(24, 44);
        ctx.lineTo(2, 33);
        ctx.closePath();
        ctx.fillStyle = t.base;
        ctx.fill();
        const icon = getAsset(set.icon);
        const k = Math.min(1, 34 / icon.size.h);
        ctx.save();
        ctx.translate(24 - icon.anchor.x * k, 36 - icon.anchor.y * k);
        ctx.scale(k, k);
        icon.draw?.(ctx, icon);
        ctx.restore();
      },
    });
  }
  return out;
}
