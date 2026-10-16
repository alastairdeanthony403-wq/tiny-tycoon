import type { PoseState } from './art/characters';
import { sheetImage } from './images';
import { SHEET, frameRect, pickFrame, type SheetKind } from './sheets';

/**
 * Draws a character from its PNG sprite sheet with the feet at (x, y). Returns false when the sheet
 * isn't loaded or has no frame for this state, so the caller can draw the character procedurally.
 */
export function drawSheetCharacter(ctx: CanvasRenderingContext2D, sheetId: string | null, kind: SheetKind, x: number, y: number, pose: { state: PoseState; t: number; front: boolean; right: boolean; carrying?: boolean }, scale = 1): boolean {
  if (!sheetId) return false;
  const img = sheetImage(sheetId);
  if (!img) return false;
  const f = pickFrame(kind, pose.state, !!pose.carrying, pose.t);
  if (!f) return false;
  const r = frameRect(kind, f.anim, pose.front, f.frame);
  const w = SHEET.w * scale;
  const h = SHEET.h * scale;
  if (pose.right) ctx.drawImage(img, r.x, r.y, r.w, r.h, x - SHEET.ax * scale, y - SHEET.ay * scale, w, h);
  else {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, -SHEET.ax * scale, -SHEET.ay * scale, w, h);
    ctx.restore();
  }
  return true;
}
