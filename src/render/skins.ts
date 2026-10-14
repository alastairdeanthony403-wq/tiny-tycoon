/**
 * Premium shop themes ("skins"). Purely visual: nothing here is read by the simulation,
 * so a skin can never change revenue, stock, customer paths or collisions.
 * Adding a future theme = one entry here (+ a catalog product granting `{ kind: 'skin', skin: id }`).
 */
export interface ShopSkin {
  id: string;
  /** Floor / wall palette (same shape as the Star-bought themes). */
  palette: { floorA: string; floorB: string; wall: string; wallTop: string; trim: string };
  /** Shelf body + frame colours. */
  shelf?: { color: string; trim: string; rim?: string };
  /** Outline drawn around every product display (shelves, fridges, machines). */
  displayTrim?: string;
  /** Checkout counter body + accent strip. */
  checkout?: { color: string; accent: string };
  /** Shop-name sign and OPEN sign styling. */
  sign?: { fill: string; border: string; text: string; glow?: string };
  /** Staff uniform used when no staff outfit is equipped. */
  uniform?: { body: string; apron: string };
  /** Extra scene treatment drawn by the renderer. */
  effect: 'neon' | 'golden' | null;
}

export const SHOP_SKINS: Record<string, ShopSkin> = {
  neon_nights: {
    id: 'neon_nights',
    palette: { floorA: '#1d1238', floorB: '#271a4d', wall: '#2b1055', wallTop: '#ff2bd6', trim: '#00f0ff' },
    shelf: { color: '#2b1055', trim: '#00f0ff' },
    sign: { fill: '#ff2bd6', border: '#ffffff', text: '#ffffff', glow: '#ff2bd6' },
    effect: 'neon',
  },
  golden_shelves: {
    id: 'golden_shelves',
    // warm gold, amber, cream and dark brown
    palette: { floorA: '#fff3d6', floorB: '#f6e2b3', wall: '#3b2412', wallTop: '#c8891e', trim: '#e0a526' },
    shelf: { color: '#4a2c17', trim: '#ffd166', rim: '#f2b632' },
    displayTrim: '#f2b632',
    checkout: { color: '#c8891e', accent: '#ffd166' },
    sign: { fill: '#3b2412', border: '#ffd166', text: '#ffd166', glow: 'rgba(255,209,102,0.55)' },
    uniform: { body: '#4a2c17', apron: '#ffd166' },
    effect: 'golden',
  },
};

export function getSkin(id: string | null | undefined): ShopSkin | null {
  return id ? SHOP_SKINS[id] ?? null : null;
}
