import type { Appearance, Accessory, Headwear, HairStyle, TopStyle } from './art/characters';
import { ART } from './spec';

/**
 * Character appearance data: six customer archetypes, staff role looks and staff outfits.
 * Appearances are picked deterministically from the character's simulation id (a hash), so the
 * same customer always looks the same and the simulation's random-number stream is never touched.
 */
export type ArchetypeId = 'student' | 'shopper' | 'gamer' | 'senior' | 'tourist' | 'trendy';

interface Variant {
  top: string;
  trim: string;
  topStyle: TopStyle;
  bottom: string;
  hairStyle: HairStyle[];
  headwear?: Headwear;
  headwearColor?: string;
  accessories: Accessory[];
  accent: string;
  hair?: string[];
}

export const ARCHETYPES: Record<ArchetypeId, { variants: Variant[] }> = {
  student: {
    variants: [
      { top: '#4cc9f0', trim: '#ffffff', topStyle: 'hoodie', bottom: '#3d5a80', hairStyle: ['short', 'spiky'], accessories: ['backpack'], accent: '#ef476f' },
      { top: '#ffd166', trim: '#06d6a0', topStyle: 'tee', bottom: '#2b2d42', hairStyle: ['ponytail', 'bob'], accessories: ['backpack', 'bow'], accent: '#3a86ff' },
      { top: '#90be6d', trim: '#ffffff', topStyle: 'hoodie', bottom: '#495057', hairStyle: ['curly', 'short'], headwear: 'beanie', headwearColor: '#ef476f', accessories: ['backpack'], accent: '#f8961e' },
    ],
  },
  shopper: {
    variants: [
      { top: '#f28482', trim: '#ffe5d9', topStyle: 'cardigan', bottom: '#5c677d', hairStyle: ['bob', 'bun'], accessories: ['shopping_bag'], accent: '#8ac926' },
      { top: '#84a59d', trim: '#f7ede2', topStyle: 'tee', bottom: '#3d405b', hairStyle: ['short', 'side'], accessories: ['shopping_bag'], accent: '#ffbe0b' },
      { top: '#cdb4db', trim: '#ffffff', topStyle: 'jacket', bottom: '#6d6875', hairStyle: ['long', 'ponytail'], accessories: ['shopping_bag', 'earrings'], accent: '#2ec4b6' },
    ],
  },
  gamer: {
    variants: [
      { top: '#3a0ca3', trim: '#4cc9f0', topStyle: 'hoodie', bottom: '#2b2d42', hairStyle: ['spiky', 'short'], headwear: 'headphones', headwearColor: '#06d6a0', accessories: [], accent: '#06d6a0' },
      { top: '#2b2d42', trim: '#ef476f', topStyle: 'hoodie', bottom: '#495057', hairStyle: ['curly', 'side'], headwear: 'headphones', headwearColor: '#9d4edd', accessories: [], accent: '#9d4edd' },
      { top: '#06d6a0', trim: '#073b4c', topStyle: 'tee', bottom: '#3d5a80', hairStyle: ['bob', 'ponytail'], headwear: 'headphones', headwearColor: '#ff006e', accessories: [], accent: '#ff006e' },
    ],
  },
  senior: {
    variants: [
      { top: '#a68a64', trim: '#ede0d4', topStyle: 'cardigan', bottom: '#5e503f', hairStyle: ['bald', 'short'], hair: ['#d4d4d4', '#bdbdbd'], accessories: ['glasses', 'cane'], accent: '#6b4226' },
      { top: '#b5838d', trim: '#ffe5d9', topStyle: 'cardigan', bottom: '#6d6875', hairStyle: ['bun', 'bob'], hair: ['#e5e5e5', '#d4d4d4'], accessories: ['glasses', 'handbag'], accent: '#7b2cbf' },
      { top: '#457b9d', trim: '#f1faee', topStyle: 'jacket', bottom: '#3d405b', hairStyle: ['side', 'short'], hair: ['#bdbdbd', '#e5e5e5'], headwear: 'beret', headwearColor: '#6c584c', accessories: ['glasses', 'scarf'], accent: '#e63946' },
    ],
  },
  tourist: {
    variants: [
      { top: '#ffbe0b', trim: '#fb5607', topStyle: 'tee', bottom: '#8ecae6', hairStyle: ['short', 'curly'], headwear: 'bucket', headwearColor: '#90be6d', accessories: ['camera', 'backpack'], accent: '#fb5607' },
      { top: '#ff70a6', trim: '#ffffff', topStyle: 'tee', bottom: '#ffd670', hairStyle: ['long', 'bob'], headwear: 'sunhat', headwearColor: '#f6e7cb', accessories: ['camera', 'sunglasses'], accent: '#ef476f' },
      { top: '#2ec4b6', trim: '#ffe66d', topStyle: 'polo', bottom: '#e9c46a', hairStyle: ['side', 'spiky'], headwear: 'cap', headwearColor: '#e76f51', accessories: ['camera'], accent: '#264653' },
    ],
  },
  trendy: {
    variants: [
      { top: '#2b2d42', trim: '#ff006e', topStyle: 'jacket', bottom: '#e9ecef', hairStyle: ['long', 'side'], hair: ['#9d4edd', '#ef476f'], accessories: ['sunglasses', 'handbag', 'earrings'], accent: '#ff006e' },
      { top: '#fb5607', trim: '#ffbe0b', topStyle: 'blazer', bottom: '#2b2d42', hairStyle: ['bun', 'spiky'], accessories: ['earrings', 'scarf'], accent: '#3a86ff' },
      { top: '#7b2cbf', trim: '#ffd166', topStyle: 'jacket', bottom: '#14213d', hairStyle: ['bob', 'curly'], hair: ['#ffd60a', '#06d6a0'], accessories: ['handbag'], accent: '#ffd166' },
    ],
  },
};

/** Which looks each gameplay customer type may wear (purely visual; behaviour stays with the type). */
export const TYPE_ARCHETYPES: Record<string, ArchetypeId[]> = {
  student: ['student', 'gamer'],
  regular: ['shopper', 'senior'],
  child: ['student', 'gamer'],
  office: ['shopper', 'trendy'],
  impatient: ['gamer', 'shopper'],
  foodie: ['shopper', 'senior'],
  rich: ['trendy', 'senior'],
  tourist: ['tourist'],
  celebrity: ['trendy'],
};

export function hash32(n: number, salt = 0): number {
  let h = (n ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function pick<T>(arr: readonly T[], h: number): T {
  return arr[h % arr.length];
}

/** Each archetype variant comes in this many fixed looks (skin, hair, shoes), so sprite sheets can cover every customer. */
export const LOOKS = 2;
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as ArchetypeId[];

/** The exact appearance for (archetype, variant, look), at scale 1. Shared by the renderer and the sheet exporter. */
export function customerLook(archetype: ArchetypeId, variant: number, look: number): Appearance {
  const ai = ARCHETYPE_IDS.indexOf(archetype);
  const v = ARCHETYPES[archetype].variants[variant];
  return {
    skin: ART.palette.skin[(ai + variant * 2 + look * 3) % ART.palette.skin.length],
    hair: v.hair ? v.hair[look % v.hair.length] : ART.palette.hair[(ai * 3 + variant + look * 2) % 5],
    hairStyle: v.hairStyle[look % v.hairStyle.length],
    top: v.top,
    topStyle: v.topStyle,
    trim: v.trim,
    bottom: v.bottom,
    shoes: ['#2b2d42', '#ffffff', '#e63946', '#6b4226'][(variant + look * 2 + ai) % 4],
    headwear: v.headwear,
    headwearColor: v.headwearColor,
    accessories: [...v.accessories],
    accent: v.accent,
    scale: 1,
  };
}

export const customerSheetId = (archetype: ArchetypeId, variant: number, look: number) => `char_${archetype}_${variant}_${look}`;

/**
 * Deterministic customer look (from the simulation id, never the sim's RNG). `sheet` names the sprite
 * sheet that shows exactly this look, or null when the look has extras no sheet covers (celebrity glasses).
 */
export function customerAppearance(type: string, id: number): Appearance & { archetype: ArchetypeId; sheet: string | null } {
  const archetypes = TYPE_ARCHETYPES[type] ?? ['shopper'];
  const archetype = pick(archetypes, hash32(id, 1));
  const variant = hash32(id, 2) % ARCHETYPES[archetype].variants.length;
  const look = hash32(id, 3) % LOOKS;
  const a = customerLook(archetype, variant, look);
  if (type === 'celebrity') a.accessories.push('star_glasses');
  if (type === 'child') a.scale = 0.78;
  return { ...a, archetype, sheet: type === 'celebrity' ? null : customerSheetId(archetype, variant, look) };
}

/** Staff role uniforms: each role keeps a recognisable prop whatever the outfit. */
export const STAFF_LOOKS: Record<string, { top: string; trim: string; topStyle: TopStyle; bottom: string; headwear?: Headwear; headwearColor?: string; accessories: Accessory[]; accent: string }> = {
  cashier: { top: '#3a86ff', trim: '#ffffff', topStyle: 'polo', bottom: '#2b2d42', headwear: 'visor', headwearColor: '#ffbe0b', accessories: ['name_tag'], accent: '#ffbe0b' },
  stocker: { top: '#fb8500', trim: '#ffffff', topStyle: 'vest', bottom: '#3d405b', headwear: 'cap', headwearColor: '#1d3557', accessories: ['name_tag'], accent: '#1d3557' },
  cleaner: { top: '#2a9d8f', trim: '#e9f5db', topStyle: 'coverall', bottom: '#2a9d8f', accessories: ['mop'], accent: '#e9c46a' },
  chef: { top: '#ffffff', trim: '#2b2d42', topStyle: 'chef', bottom: '#495057', headwear: 'chef', accessories: ['name_tag'], accent: '#ef476f' },
  manager: { top: '#2b2d42', trim: '#f1faee', topStyle: 'blazer', bottom: '#2b2d42', accessories: ['tie', 'lanyard', 'clipboard'], accent: '#ffd166' },
};

/** Cosmetic staff outfits. `null` (standard uniform) is always available. */
export interface OutfitDef {
  id: string;
  top: string;
  trim: string;
  topStyle: TopStyle;
  bottom: string;
  headwear?: Headwear;
  headwearColor?: string;
}

export const OUTFITS: Record<string, OutfitDef> = {
  smart: { id: 'smart', top: '#1d3557', trim: '#ffd166', topStyle: 'blazer', bottom: '#1d3557' },
  diner: { id: 'diner', top: '#ff6b9a', trim: '#2ec4b6', topStyle: 'apron', bottom: '#2b2d42', headwear: 'paper_hat', headwearColor: '#ff6b9a' },
  barista: { id: 'barista', top: '#f5ebe0', trim: '#6f4e37', topStyle: 'apron', bottom: '#3d2b1f', headwear: 'beret', headwearColor: '#6f4e37' },
  chef_whites: { id: 'chef_whites', top: '#ffffff', trim: '#2b2d42', topStyle: 'chef', bottom: '#2b2d42', headwear: 'chef' },
  space: { id: 'space', top: '#e9ecef', trim: '#3a86ff', topStyle: 'space', bottom: '#ced4da', headwear: 'helmet' },
  holiday: { id: 'holiday', top: '#d62828', trim: '#ffffff', topStyle: 'holiday', bottom: '#2d6a4f', headwear: 'santa' },
};

export const staffSheetId = (role: string, look: number) => `staff_${role}_${look}`;

/** The standard-uniform look for a role (look = 0..LOOKS-1), at the staff scale. */
export function staffLook(role: string, look: number): Appearance {
  const lk = STAFF_LOOKS[role] ?? STAFF_LOOKS.stocker;
  const ri = Math.max(0, Object.keys(STAFF_LOOKS).indexOf(role));
  const styles: HairStyle[] = ['short', 'bob', 'ponytail', 'side', 'bun', 'curly'];
  return {
    skin: ART.palette.skin[(ri * 2 + look * 3) % ART.palette.skin.length],
    hair: ART.palette.hair[(ri + look * 3) % 6],
    hairStyle: styles[(ri * 2 + look) % styles.length],
    top: lk.top,
    trim: lk.trim,
    topStyle: lk.topStyle,
    bottom: lk.bottom,
    shoes: '#2b2d42',
    headwear: lk.headwear,
    headwearColor: lk.headwearColor,
    accessories: [...lk.accessories],
    accent: lk.accent,
    scale: 1.04,
  };
}

/** Sprite sheet for a staff member, or null when an outfit or theme uniform changes the clothes (drawn live instead). */
export function staffSheet(role: string, id: number, outfitId: string | null, themeUniform?: { body: string; apron: string }): string | null {
  if ((outfitId && OUTFITS[outfitId]) || themeUniform || !STAFF_LOOKS[role]) return null;
  return staffSheetId(role, hash32(id, 7) % LOOKS);
}

/** Staff look = role uniform, optionally re-dressed by an equipped outfit or a theme uniform. */
export function staffAppearance(role: string, id: number, outfitId: string | null, themeUniform?: { body: string; apron: string }): Appearance {
  const o = outfitId ? OUTFITS[outfitId] : undefined;
  const base = staffLook(role, hash32(id, 7) % LOOKS);
  if (o) {
    base.top = o.top;
    base.trim = o.trim;
    base.topStyle = o.topStyle;
    base.bottom = o.bottom;
    // The role's prop/headwear stays recognisable: the outfit hat replaces it only when it has one.
    if (o.headwear) {
      base.headwear = o.headwear;
      base.headwearColor = o.headwearColor;
    }
  } else if (themeUniform) {
    base.top = themeUniform.body;
    base.trim = themeUniform.apron;
    base.topStyle = 'apron';
  }
  return base;
}
