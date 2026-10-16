import type { AssetDef, DrawFn } from '../types';
import { ART } from '../spec';
import { dot, shadeFill, mark } from '../draw';

/**
 * Small procedural icons used inside the world: customer emotes and furniture ornaments.
 * Drawn in a 16×16 box anchored at the bottom centre.
 */
const OL = ART.outline.color;

function face(color: string, mouth: (ctx: CanvasRenderingContext2D) => void, eyes?: (ctx: CanvasRenderingContext2D) => void): DrawFn {
  return (ctx) => {
    ctx.beginPath();
    ctx.arc(8, 8, 7, 0, Math.PI * 2);
    shadeFill(ctx, color, 1, 1, 14, 14);
    if (eyes) eyes(ctx);
    else {
      dot(ctx, 5.6, 6.6, 1.1, '#2b2d42');
      dot(ctx, 10.4, 6.6, 1.1, '#2b2d42');
    }
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    mouth(ctx);
  };
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
  }
  ctx.closePath();
  shadeFill(ctx, fill, cx - r, cy - r, r * 2, r * 2);
}

function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.3, cy, cx - r * 0.7, cy - r * 1.1, cx, cy - r * 0.35);
  ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.1, cx + r * 1.3, cy, cx, cy + r * 0.9);
  ctx.closePath();
  shadeFill(ctx, fill, cx - r, cy - r, r * 2, r * 2);
}

const ICONS: Record<string, DrawFn> = {
  emote_happy: face('#ffd166', (c) => {
    c.beginPath();
    c.arc(8, 8.5, 3.4, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }),
  emote_sad: face('#a0c4ff', (c) => {
    c.beginPath();
    c.arc(8, 12.6, 3, 1.2 * Math.PI, 1.8 * Math.PI);
    c.stroke();
  }),
  emote_angry: face(
    '#ff6b6b',
    (c) => {
      c.beginPath();
      c.moveTo(5.5, 11.5);
      c.lineTo(10.5, 11.5);
      c.stroke();
    },
    (c) => {
      c.strokeStyle = '#2b2d42';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(4, 4.8);
      c.lineTo(7, 6.2);
      c.moveTo(12, 4.8);
      c.lineTo(9, 6.2);
      c.stroke();
      dot(c, 5.8, 7.6, 1, '#2b2d42');
      dot(c, 10.2, 7.6, 1, '#2b2d42');
    },
  ),
  emote_wow: face(
    '#ffd166',
    (c) => {
      c.beginPath();
      c.ellipse(8, 11, 1.6, 1.9, 0, 0, Math.PI * 2);
      c.fillStyle = '#2b2d42';
      c.fill();
    },
    (c) => {
      star(c, 5.4, 6.4, 2.2, '#ff9f1c');
      star(c, 10.6, 6.4, 2.2, '#ff9f1c');
    },
  ),
  emote_love: (c) => heart(c, 8, 8.5, 7, '#ef476f'),
  emote_question: (c) => {
    c.beginPath();
    c.arc(8, 8, 7, 0, Math.PI * 2);
    shadeFill(c, '#4cc9f0', 1, 1, 14, 14);
    mark(c, '?', 8, 8.6, 11, '#ffffff');
  },
  emote_money: (c) => {
    c.beginPath();
    c.arc(8, 8, 7, 0, Math.PI * 2);
    shadeFill(c, '#ffd166', 1, 1, 14, 14);
    c.beginPath();
    c.arc(8, 8, 5, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(160,110,0,0.5)';
    c.lineWidth = 1;
    c.stroke();
    mark(c, '£', 8, 8.6, 8.5, '#9a6700');
  },
  emote_sleep: (c) => {
    mark(c, 'z', 5, 11, 8, '#6c757d');
    mark(c, 'Z', 10.5, 5.5, 10, '#495057');
  },
  star: (c) => star(c, 8, 8.5, 7, '#ffd166'),
  crown: (c) => {
    c.beginPath();
    c.moveTo(2, 13);
    c.lineTo(2, 5);
    c.lineTo(5.5, 8.5);
    c.lineTo(8, 3);
    c.lineTo(10.5, 8.5);
    c.lineTo(14, 5);
    c.lineTo(14, 13);
    c.closePath();
    shadeFill(c, '#ffd166', 2, 3, 12, 10);
    dot(c, 8, 10, 1.3, '#ef476f');
  },
  drop: (c) => {
    c.beginPath();
    c.moveTo(8, 2);
    c.quadraticCurveTo(13, 9, 12, 11);
    c.arc(8, 11, 4, 0, Math.PI);
    c.quadraticCurveTo(3, 9, 8, 2);
    c.closePath();
    shadeFill(c, '#4cc9f0', 4, 2, 8, 13);
  },
  barrier: (c) => {
    c.strokeStyle = OL;
    for (const x of [3, 13]) {
      c.fillStyle = '#6c757d';
      c.fillRect(x - 0.8, 6, 1.6, 9);
    }
    c.beginPath();
    c.rect(1, 4, 14, 5);
    c.fillStyle = '#ffd166';
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = '#2b2d42';
    for (let x = 1; x < 13; x += 4) {
      c.beginPath();
      c.moveTo(x, 9);
      c.lineTo(x + 2, 9);
      c.lineTo(x + 5, 4);
      c.lineTo(x + 3, 4);
      c.closePath();
      c.fill();
    }
    c.restore();
    c.lineWidth = 1;
    c.strokeRect(1, 4, 14, 5);
  },
};

export const EMOTE_KINDS = ['happy', 'love', 'angry', 'question', 'sad', 'money', 'wow', 'sleep'];

export function uiAssets(): AssetDef[] {
  return Object.entries(ICONS).map(([k, draw]) => ({
    id: `ui.${k}`,
    category: 'ui' as const,
    size: { w: 16, h: 16 },
    anchor: { x: 8, y: 16 },
    layer: 'overlay' as const,
    camera: 'billboard' as const,
    draw,
  }));
}
