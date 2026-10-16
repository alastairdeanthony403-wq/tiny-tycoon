/**
 * Terrain types. Each is painted on the ground plane (camera strategy 'ground'), so it rotates with
 * the floor. `z` sets the paint order: a higher layer may spill softly over a lower neighbour,
 * which gives natural edges (grass over sand, sand over water) without hand-made transition tiles.
 */
export interface TerrainDef {
  base: string;
  alt: string;
  /** Painted over lower layers with a soft, bumpy edge (true) or a crisp kerb (false). */
  soft: boolean;
  z: number;
  detail: 'tufts' | 'slabs' | 'asphalt' | 'waves' | 'grain' | 'stones' | 'ruts' | 'rows' | 'cobbles' | 'tarmac' | 'boards';
  /** Painted again every frame with a gentle animation (water). */
  animated?: boolean;
}

export const TERRAIN: Record<string, TerrainDef> = {
  water: { base: '#48cae4', alt: '#90e0ef', soft: true, z: 0, detail: 'waves', animated: true },
  sand: { base: '#f6dfa4', alt: '#eccf88', soft: true, z: 1, detail: 'grain' },
  rock: { base: '#a8a29e', alt: '#8d8781', soft: true, z: 2, detail: 'stones' },
  dirt: { base: '#c89f6a', alt: '#b48a57', soft: true, z: 3, detail: 'ruts' },
  field: { base: '#a7c957', alt: '#6a994e', soft: true, z: 4, detail: 'rows' },
  grass: { base: '#8fd16a', alt: '#7cc05a', soft: true, z: 5, detail: 'tufts' },
  boardwalk: { base: '#d4a373', alt: '#bc8a5f', soft: false, z: 6, detail: 'boards' },
  cobble: { base: '#8e7dbe', alt: '#7a6aa8', soft: false, z: 7, detail: 'cobbles' },
  pavement: { base: '#dee2e6', alt: '#ced4da', soft: false, z: 8, detail: 'slabs' },
  tarmac: { base: '#8d99ae', alt: '#7d8799', soft: false, z: 9, detail: 'tarmac' },
  road: { base: '#6c757d', alt: '#5f676e', soft: false, z: 10, detail: 'asphalt' },
};

export const TERRAIN_IDS = Object.keys(TERRAIN);

/** Interior floor finishes (drawn by the shop floor, listed here so they are part of the art set). */
export const FLOOR_FINISHES = ['planks', 'tiles', 'marble'] as const;
