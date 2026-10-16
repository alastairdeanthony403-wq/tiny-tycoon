import type { Appearance, PoseState } from './art/characters';
import { drawCharacter } from './art/characters';
import { ART } from './spec';
import { ARCHETYPES, ARCHETYPE_IDS, LOOKS, STAFF_LOOKS, customerLook, customerSheetId, staffLook, staffSheetId } from './characters';

/**
 * Character sprite sheets: PNG files in src/assets/sheets/, one per character look, each holding
 * every animation frame from the front and the back. The layout below is the single source of
 * truth: the exporter (src/tools/exportArt.ts) renders frames into it and the renderer reads them.
 *
 * Frames are packed densely in rows of SHEET_COLS: each animation's front frames, then its back
 * frames, in the order of the animation list. Frames are drawn facing right and
 * mirrored at runtime for left-facing characters.
 */
export const SHEET = {
  /** Frame box at scale 1 (world px), with the feet at (ax, ay). */
  w: 48,
  h: 64,
  ax: 24,
  ay: 58,
  /** Pixel density of the files (frames are w*scale × h*scale). */
  scale: 2,
} as const;

export interface SheetAnim {
  name: string;
  state: PoseState;
  frames: number;
  /** Seconds per loop; frames are sampled evenly across it. */
  period: number;
  carrying?: boolean;
}

const A = ART.anim;
export const CUSTOMER_ANIMS: SheetAnim[] = [
  { name: 'idle', state: 'idle', frames: 2, period: A.idleCycle },
  { name: 'walk', state: 'walk', frames: 6, period: A.walkCycle },
  { name: 'browse', state: 'browse', frames: 2, period: A.idleCycle },
  { name: 'reach', state: 'reach', frames: 2, period: A.idleCycle },
  { name: 'queue', state: 'queue', frames: 4, period: (Math.PI * 2) / 0.9 },
  { name: 'pay', state: 'pay', frames: 2, period: A.workCycle * 2 },
  { name: 'celebrate', state: 'celebrate', frames: 4, period: A.celebrateCycle },
];

export const STAFF_ANIMS: SheetAnim[] = [
  { name: 'idle', state: 'idle', frames: 2, period: A.idleCycle },
  { name: 'idle_carry', state: 'idle', frames: 2, period: A.idleCycle, carrying: true },
  { name: 'walk', state: 'walk', frames: 6, period: A.walkCycle },
  { name: 'walk_carry', state: 'walk', frames: 6, period: A.walkCycle, carrying: true },
  { name: 'work', state: 'work', frames: 4, period: A.workCycle },
  { name: 'restock', state: 'restock', frames: 2, period: A.idleCycle },
  { name: 'clean', state: 'clean', frames: 4, period: A.workCycle * 2 },
];

export type SheetKind = 'customer' | 'staff';
export const animsFor = (kind: SheetKind) => (kind === 'customer' ? CUSTOMER_ANIMS : STAFF_ANIMS);
/** Frames are packed densely, left to right and top to bottom, this many per row. */
export const SHEET_COLS = 8;

/** Total frames in a sheet: every animation, front view then back view. */
export const frameCount = (kind: SheetKind) => animsFor(kind).reduce((n, a) => n + a.frames * 2, 0);

/** Pixel size of a sheet file. */
export function sheetSize(kind: SheetKind): { w: number; h: number } {
  return { w: SHEET_COLS * SHEET.w * SHEET.scale, h: Math.ceil(frameCount(kind) / SHEET_COLS) * SHEET.h * SHEET.scale };
}

/** Source rectangle (file pixels) of one frame. */
export function frameRect(kind: SheetKind, animIndex: number, front: boolean, frame: number) {
  const anims = animsFor(kind);
  let idx = 0;
  for (let i = 0; i < animIndex; i++) idx += anims[i].frames * 2;
  idx += (front ? 0 : anims[animIndex].frames) + frame;
  const fw = SHEET.w * SHEET.scale;
  const fh = SHEET.h * SHEET.scale;
  return { x: (idx % SHEET_COLS) * fw, y: Math.floor(idx / SHEET_COLS) * fh, w: fw, h: fh };
}

export interface SheetDef {
  id: string;
  kind: SheetKind;
  appearance: Appearance;
}

/** Every sprite sheet the game expects (36 customer looks + 10 staff looks). */
export function sheetDefs(): SheetDef[] {
  const out: SheetDef[] = [];
  for (const a of ARCHETYPE_IDS) {
    for (let v = 0; v < ARCHETYPES[a].variants.length; v++) for (let l = 0; l < LOOKS; l++) out.push({ id: customerSheetId(a, v, l), kind: 'customer', appearance: customerLook(a, v, l) });
  }
  for (const role of Object.keys(STAFF_LOOKS)) for (let l = 0; l < LOOKS; l++) out.push({ id: staffSheetId(role, l), kind: 'staff', appearance: { ...staffLook(role, l), scale: 1 } });
  return out;
}

/** Draws one frame (feet at SHEET.ax/ay of a frame box at scale 1). Used by the exporter. */
export function renderFrame(ctx: CanvasRenderingContext2D, d: SheetDef, animIndex: number, front: boolean, frame: number): void {
  const anim = animsFor(d.kind)[animIndex];
  const t = (frame / anim.frames) * anim.period;
  drawCharacter(ctx, SHEET.ax, SHEET.ay, d.appearance, { state: anim.state, t, front, right: true, carrying: anim.carrying });
}

/** Picks the animation row and frame for a live character, or null if the sheet has no such animation. */
export function pickFrame(kind: SheetKind, state: PoseState, carrying: boolean, t: number): { anim: number; frame: number } | null {
  const anims = animsFor(kind);
  let i = anims.findIndex((a) => a.state === state && !!a.carrying === carrying);
  if (i < 0) i = anims.findIndex((a) => a.state === state);
  if (i < 0) return null;
  const a = anims[i];
  const ph = (((t % a.period) + a.period) % a.period) / a.period;
  return { anim: i, frame: Math.min(a.frames - 1, Math.floor(ph * a.frames)) };
}
