/**
 * Tiny Tycoon — "Cute Isometric Diorama" art specification (shared by every asset).
 * See docs/ART.md for the full write-up. All numbers are in world-screen pixels at zoom 1
 * (the renderer scales them by camera zoom × device pixel ratio).
 */
export const ART = {
  /** Projection (from render/iso.ts): a floor tile is TW × TH at the default camera. */
  tileW: 64,
  tileH: 32,
  /** Character height (feet to top of head) — about 0.55 of a tile width, so shelves read as waist/shoulder height. */
  characterH: 36,
  /** Products drawn on displays fit a 32 × 32 box; UI icons are baked at 32, 48 or 64 px. */
  productBox: 32,
  uiIconSizes: [32, 48, 64] as const,
  /** Light comes from the upper left of the screen: highlights top-left, shade bottom-right. */
  light: { x: -0.6, y: -0.8 },
  /** Soft contact shadow: an ellipse under the ground anchor. */
  shadow: { color: 'rgba(43,45,66,0.22)', rxPerW: 0.42, ryPerRx: 0.42 },
  /** Edge treatment: a soft dark-tinted outline (never pure black). */
  outline: { color: 'rgba(43,30,45,0.55)', width: 1.2 },
  /** Sprites keep a transparent margin so outlines and glows are never clipped. */
  padding: 2,
  /** Ids are lower_snake_case and prefixed by family: product.*, char.*, staff.*, outfit.*, furniture.*, terrain.*, deco.*, env.*, theme.*, location.*, ui.* */
  idPattern: /^(product|char|staff|outfit|furniture|terrain|deco|env|theme|location|ui|fallback)\.[a-z0-9_]+$/,
  /** Procedural animation timing (seconds per cycle). */
  anim: { walkCycle: 0.5, idleCycle: 2.6, workCycle: 0.35, celebrateCycle: 0.6 },
  palette: {
    primary: ['#ffbe0b', '#c9a227', '#8ac926', '#2ec4b6', '#3a86ff'],
    secondary: ['#ff8fab', '#b388eb', '#1d4e89', '#0096c7', '#48cae4'],
    neutral: ['#2b2d42', '#495057', '#8d99ae', '#ced4da', '#e9d8c4'],
    accent: ['#ef233c', '#fb8500', '#ffd60a', '#52b788', '#4361ee'],
    skin: ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'],
    hair: ['#3d2b1f', '#6b4226', '#a0522d', '#f6bd60', '#2b2d42', '#d4d4d4', '#9d4edd', '#ef476f'],
  },
} as const;
