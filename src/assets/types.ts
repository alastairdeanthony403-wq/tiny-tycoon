/** Families of visual assets. */
export type AssetCategory = 'product' | 'character' | 'staff' | 'outfit' | 'furniture' | 'terrain' | 'decoration' | 'environment' | 'location' | 'theme' | 'ui' | 'fallback';

/** Where an asset is drawn in the frame. */
export type RenderLayer = 'ground' | 'floor' | 'object' | 'character' | 'overlay' | 'ui';

/**
 * How an asset copes with the 360° camera:
 *  - geometry: drawn from projected 3D corners every frame (rotates for real)
 *  - billboard: a flat sprite that always faces the camera (people, icons, small props)
 *  - ground: painted flat on the ground plane (rotates with the floor)
 */
export type CameraStrategy = 'geometry' | 'billboard' | 'ground';

export interface AnimationDef {
  /** Named states this asset can show, e.g. walk, idle, carry. */
  states: string[];
  /** Seconds per cycle. */
  cycle: number;
}

/** Draws an asset into a local box: (0,0) is the box's top-left, size = def.size. */
export type DrawFn = (ctx: CanvasRenderingContext2D, def: AssetDef) => void;

export interface AssetDef {
  id: string;
  category: AssetCategory;
  /** Visual box in world-screen px at zoom 1. */
  size: { w: number; h: number };
  /** Ground-contact point inside the box (sprites are positioned by this point). */
  anchor: { x: number; y: number };
  /** Footprint in tiles for placeable objects (must agree with the simulation's placement). */
  footprint?: { w: number; h: number };
  layer: RenderLayer;
  camera: CameraStrategy;
  /** Procedural artwork (always present so a missing PNG never leaves a hole). */
  draw?: DrawFn;
  /** Optional bundled PNG that replaces the procedural art when it loads (see assets/images). */
  image?: string;
  animation?: AnimationDef;
  /** Locale key for the display name. */
  label?: string;
  /** Free-form unlock requirement description (gameplay data stays in src/config). */
  unlock?: string;
  /** Shop themes this asset has variants for. */
  themes?: string[];
  /** Links to simulation data (product id, object kind, staff role…) without duplicating it. */
  ref?: string;
}
