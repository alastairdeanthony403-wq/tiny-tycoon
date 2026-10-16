import type { ShopSkin } from './skins';
import type { StyleSlot } from '../config/store';

/**
 * Cosmetic styles sold in the Premium Store (one per slot can be equipped). Purely visual:
 * the simulation never reads any of this. A style overrides the shop theme for its slot only.
 */
export const DISPLAY_STYLES: Record<string, { shelf: NonNullable<ShopSkin['shelf']>; displayTrim?: string }> = {
  pastel: { shelf: { color: '#ffd6e0', trim: '#cdb4db', rim: '#bde0fe' }, displayTrim: '#cdb4db' },
  rustic: { shelf: { color: '#7f5539', trim: '#e6ccb2', rim: '#b08968' }, displayTrim: '#b08968' },
  chrome: { shelf: { color: '#ced4da', trim: '#4cc9f0', rim: '#f8f9fa' }, displayTrim: '#4cc9f0' },
};

export const CHECKOUT_STYLES: Record<string, NonNullable<ShopSkin['checkout']>> = {
  mint: { color: '#95d5b2', accent: '#ffffff' },
  arcade: { color: '#7209b7', accent: '#4cc9f0' },
  marble: { color: '#e9ecef', accent: '#ffd166' },
};

export const SIGN_STYLES: Record<string, NonNullable<ShopSkin['sign']>> = {
  wood: { fill: '#7f5539', border: '#ffe8d6', text: '#ffe8d6' },
  marquee: { fill: '#2b2d42', border: '#ffd166', text: '#fff3b0', glow: 'rgba(255,214,102,0.85)' },
  neon_pink: { fill: '#1a1033', border: '#ff70a6', text: '#ff70a6', glow: '#ff70a6' },
};

/** Staff accessory added to every staff member's look. */
export const ACCESSORY_STYLES: Record<string, 'scarf' | 'sunglasses' | 'bow'> = {
  scarf: 'scarf',
  shades: 'sunglasses',
  bow: 'bow',
};

/** Entrance: a doormat colour and props either side of the door (registry sprite ids). */
export const ENTRANCE_STYLES: Record<string, { mat: string; matTrim: string; props: string[] }> = {
  garden: { mat: '#52b788', matTrim: '#ffd6a5', props: ['deco.planter', 'deco.planter'] },
  seaside: { mat: '#48cae4', matTrim: '#f8f9fa', props: ['deco.lifebuoy', 'deco.lifebuoy'] },
  red_carpet: { mat: '#c1121f', matTrim: '#ffd166', props: ['deco.streetlight', 'deco.streetlight'] },
  flagship: { mat: '#3b2412', matTrim: '#ffd166', props: ['deco.tree_pine', 'deco.tree_pine'] },
  franchise: { mat: '#1d3557', matTrim: '#ffd166', props: ['deco.lantern_post', 'deco.lantern_post'] },
};

export type EquippedStyles = Partial<Record<StyleSlot, string | null>>;

/** The theme with the equipped styles laid over it (null when nothing changes the defaults). */
export function styledSkin(base: ShopSkin | null, styles: EquippedStyles): ShopSkin | null {
  const display = styles.display ? DISPLAY_STYLES[styles.display] : undefined;
  const checkout = styles.checkout ? CHECKOUT_STYLES[styles.checkout] : undefined;
  const sign = styles.sign ? SIGN_STYLES[styles.sign] : undefined;
  if (!display && !checkout && !sign) return base;
  const out: ShopSkin = base ? { ...base } : { id: 'styles', palette: { floorA: '', floorB: '', wall: '', wallTop: '', trim: '' }, effect: null };
  if (display) {
    out.shelf = display.shelf;
    out.displayTrim = display.displayTrim;
  }
  if (checkout) out.checkout = checkout;
  if (sign) out.sign = sign;
  return out;
}
