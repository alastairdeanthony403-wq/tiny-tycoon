import type { AssetDef, DrawFn } from '../types';
import { ART } from '../spec';
import { rr, tone, shadeFill, pack, band, dot, blob, shine, mark } from '../draw';

/**
 * Product artwork: original, fictional packaging drawn in a 32×32 box, anchored at the bottom
 * centre (16, 30). Used on shelves, fridges, machines, deliveries and as UI icons.
 */
const OL = ART.outline.color;

function stroke(ctx: CanvasRenderingContext2D, w = ART.outline.width): void {
  ctx.strokeStyle = OL;
  ctx.lineWidth = w;
  ctx.stroke();
}

function bottle(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, w: number, body: string, cap: string, label?: string): void {
  const neck = w * 0.38;
  ctx.beginPath();
  ctx.moveTo(cx - neck / 2, top + 3);
  ctx.lineTo(cx - neck / 2, top + 6);
  ctx.quadraticCurveTo(cx - w / 2, top + 8, cx - w / 2, top + 12);
  ctx.lineTo(cx - w / 2, bottom - 2);
  ctx.quadraticCurveTo(cx - w / 2, bottom, cx - w / 2 + 2, bottom);
  ctx.lineTo(cx + w / 2 - 2, bottom);
  ctx.quadraticCurveTo(cx + w / 2, bottom, cx + w / 2, bottom - 2);
  ctx.lineTo(cx + w / 2, top + 12);
  ctx.quadraticCurveTo(cx + w / 2, top + 8, cx + neck / 2, top + 6);
  ctx.lineTo(cx + neck / 2, top + 3);
  ctx.closePath();
  shadeFill(ctx, body, cx - w / 2, top, w, bottom - top);
  rr(ctx, cx - neck / 2 - 0.5, top, neck + 1, 4, 1);
  shadeFill(ctx, cap, cx - neck / 2, top, neck, 4);
  if (label) band(ctx, cx - w / 2 + 1, top + 14, w - 2, (bottom - top) * 0.32, label, 1);
  shine(ctx, cx - w / 4, top + 15, 1.2, 4, 0.6);
}

function can(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, w: number, body: string, accent: string): void {
  rr(ctx, cx - w / 2, top + 2, w, bottom - top - 2, 3);
  shadeFill(ctx, body, cx - w / 2, top, w, bottom - top);
  ctx.beginPath();
  ctx.ellipse(cx, top + 2.5, w / 2 - 0.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e9ecef';
  ctx.fill();
  stroke(ctx);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + 1, top + 12);
  ctx.bezierCurveTo(cx - w / 4, top + 8, cx + w / 4, top + 16, cx + w / 2 - 1, top + 11);
  ctx.stroke();
  shine(ctx, cx - w / 4, top + 10, 1.2, 5, 0.5);
}

const P: Record<string, DrawFn> = {
  crisps: (ctx) => {
    // pillow bag
    ctx.beginPath();
    ctx.moveTo(7, 7);
    ctx.quadraticCurveTo(16, 4, 25, 7);
    ctx.lineTo(26, 27);
    ctx.quadraticCurveTo(16, 30, 6, 27);
    ctx.closePath();
    shadeFill(ctx, '#ffd23f', 6, 4, 20, 26);
    band(ctx, 8, 13, 16, 7, '#e63946', 2);
    mark(ctx, 'CRUNCH', 16, 16.5, 4.2);
    for (const [x, y] of [[12, 24], [17, 23], [21, 25]]) blob(ctx, x, y, 2.6, 1.6, '#f4a261', false);
    ctx.strokeStyle = tone('#ffd23f', -0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 8.5);
    ctx.lineTo(24, 8.5);
    ctx.stroke();
  },
  candy: (ctx) => {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(16 + s * 7, 18);
      ctx.lineTo(16 + s * 14, 12);
      ctx.lineTo(16 + s * 13, 18);
      ctx.lineTo(16 + s * 14, 24);
      ctx.closePath();
      shadeFill(ctx, '#c77dff', 0, 12, 32, 12);
    }
    blob(ctx, 16, 18, 8, 6.5, '#ff70a6');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6;
    for (const dx of [-3, 1, 5]) {
      ctx.beginPath();
      ctx.moveTo(16 + dx - 2, 12.5);
      ctx.lineTo(16 + dx + 1, 23.5);
      ctx.stroke();
    }
    shine(ctx, 13, 15, 2, 1.2);
  },
  soda: (ctx) => can(ctx, 16, 6, 29, 13, '#e63946', '#ffffff'),
  water: (ctx) => bottle(ctx, 16, 3, 29, 12, '#a9def9', '#3a86ff', '#ffffff'),
  chocolate: (ctx) => {
    pack(ctx, 6, 10, 18, 18, '#8b5a2b', 4);
    band(ctx, 6, 18, 18, 10, '#c1121f', 1);
    mark(ctx, 'COCO', 15, 23, 4.5);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      rr(ctx, 8 + i * 8, 11 + j * 3.4, 6.5, 2.6, 0.8);
      ctx.fillStyle = tone('#8b5a2b', 0.18);
      ctx.fill();
    }
  },
  milk: (ctx) => {
    pack(ctx, 8, 11, 14, 18, '#ffffff', 4);
    // gable roof
    ctx.beginPath();
    ctx.moveTo(8, 11);
    ctx.lineTo(15, 5);
    ctx.lineTo(22, 11);
    ctx.closePath();
    shadeFill(ctx, '#f8f9fa', 8, 5, 14, 6);
    band(ctx, 8, 16, 14, 8, '#4cc9f0', 1);
    mark(ctx, 'MOO', 15, 20, 4.5);
  },
  bread: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(4, 26);
    ctx.lineTo(4, 17);
    ctx.quadraticCurveTo(4, 9, 16, 9);
    ctx.quadraticCurveTo(28, 9, 28, 17);
    ctx.lineTo(28, 26);
    ctx.quadraticCurveTo(16, 29, 4, 26);
    ctx.closePath();
    shadeFill(ctx, '#d9a066', 4, 9, 24, 20);
    ctx.strokeStyle = tone('#d9a066', -0.3);
    ctx.lineWidth = 1.4;
    for (const x of [10, 15, 20]) {
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x + 3, 17);
      ctx.stroke();
    }
    shine(ctx, 10, 13, 3, 1.4, 0.4);
  },
  donuts: (ctx) => {
    blob(ctx, 16, 19, 12, 8.5, '#d9a066');
    ctx.beginPath();
    ctx.ellipse(16, 18, 10.5, 7, 0, 0, Math.PI * 2);
    shadeFill(ctx, '#ff8fab', 5.5, 11, 21, 14, false);
    ctx.beginPath();
    ctx.ellipse(16, 18.5, 3.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = tone('#d9a066', -0.25);
    ctx.fill();
    const sp = ['#ffd60a', '#4cc9f0', '#ffffff', '#8ac926'];
    [[9, 16], [12, 13], [20, 13], [23, 17], [11, 21], [21, 21], [16, 13]].forEach(([x, y], i) => {
      ctx.fillStyle = sp[i % sp.length];
      ctx.fillRect(x, y, 2, 1);
    });
  },
  coffee: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(8, 9);
    ctx.lineTo(24, 9);
    ctx.lineTo(22, 29);
    ctx.lineTo(10, 29);
    ctx.closePath();
    shadeFill(ctx, '#ffffff', 8, 9, 16, 20);
    ctx.beginPath();
    ctx.moveTo(8.6, 15);
    ctx.lineTo(23.4, 15);
    ctx.lineTo(22.6, 23);
    ctx.lineTo(9.4, 23);
    ctx.closePath();
    ctx.fillStyle = '#8b5e34';
    ctx.fill();
    rr(ctx, 6.5, 5, 19, 5, 2);
    shadeFill(ctx, '#6f4e37', 6.5, 5, 19, 5);
    mark(ctx, '☕', 16, 19, 5, '#ffe8d6');
  },
  sandwich: (ctx) => {
    const tri = (dy: number, color: string) => {
      ctx.beginPath();
      ctx.moveTo(4, 26 + dy);
      ctx.lineTo(16, 8 + dy);
      ctx.lineTo(28, 26 + dy);
      ctx.closePath();
      shadeFill(ctx, color, 4, 8 + dy, 24, 18);
    };
    tri(2, '#e9c46a');
    ctx.fillStyle = '#7bc950';
    ctx.fillRect(6, 25, 20, 2.4);
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(8, 23, 16, 2);
    tri(-2, '#f4d58d');
    shine(ctx, 13, 15, 2.4, 1.2, 0.5);
  },
  cake: (ctx) => {
    rr(ctx, 6, 14, 20, 14, 3);
    shadeFill(ctx, '#ffd6e8', 6, 14, 20, 14);
    band(ctx, 6, 20, 20, 3, '#ff8fab', 0);
    ctx.beginPath();
    ctx.ellipse(16, 14.5, 10, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff0f6';
    ctx.fill();
    stroke(ctx);
    rr(ctx, 15, 6, 2.4, 8, 1);
    ctx.fillStyle = '#4cc9f0';
    ctx.fill();
    dot(ctx, 16.2, 5, 1.8, '#ffbe0b');
    dot(ctx, 11, 13.5, 1.6, '#e63946');
    dot(ctx, 21, 13.5, 1.6, '#e63946');
  },
  fruit: (ctx) => {
    blob(ctx, 16, 19, 10, 10, '#e63946');
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(16, 10);
    ctx.lineTo(17, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(21, 7, 4, 2, -0.5, 0, Math.PI * 2);
    shadeFill(ctx, '#52b788', 17, 5, 8, 4);
    shine(ctx, 12, 15, 2.4, 3.4);
  },
  premium_choc: (ctx) => {
    pack(ctx, 5, 12, 20, 16, '#5c2e0e', 4);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(14, 12, 3, 16);
    ctx.fillRect(5, 18.5, 20, 3);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(15.5 + s * 4, 9.5, 4, 2.4, s * 0.5, 0, Math.PI * 2);
      shadeFill(ctx, '#ffd166', 11, 7, 9, 5);
    }
  },
  salad: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(4, 17);
    ctx.quadraticCurveTo(16, 33, 28, 17);
    ctx.closePath();
    shadeFill(ctx, '#ffffff', 4, 17, 24, 12);
    for (const [x, y, c] of [[9, 16, '#52b788'], [15, 13, '#7bc950'], [21, 16, '#40916c'], [12, 17, '#ef476f'], [19, 17, '#ffbe0b']] as [number, number, string][]) blob(ctx, x, y, 4, 3, c, false);
  },
  toys: (ctx) => {
    // teddy bear
    for (const s of [-1, 1]) blob(ctx, 16 + s * 6.5, 7.5, 3, 3, '#c68b59');
    blob(ctx, 16, 22, 8, 7, '#c68b59');
    blob(ctx, 16, 12, 7.5, 6.5, '#d4a373');
    blob(ctx, 16, 14, 3.4, 2.4, '#f2d6b3', false);
    dot(ctx, 13.4, 11, 1.1, '#2b2d42');
    dot(ctx, 18.6, 11, 1.1, '#2b2d42');
    dot(ctx, 16, 13.3, 1, '#2b2d42');
    band(ctx, 12, 18.5, 8, 2.2, '#ef476f', 1);
  },
  mystery_box: (ctx) => {
    pack(ctx, 6, 11, 18, 17, '#9b5de5', 4);
    mark(ctx, '?', 15, 20, 12, '#ffd60a');
    for (const [x, y] of [[8, 13], [21, 25]]) dot(ctx, x, y, 1, '#fff');
  },
  headphones: (ctx) => {
    ctx.strokeStyle = '#3a86ff';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(16, 17, 10, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = OL;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    for (const s of [-1, 1]) {
      rr(ctx, 16 + s * 10 - 4, 15, 8, 12, 3.5);
      shadeFill(ctx, '#1d3557', 16 + s * 10 - 4, 15, 8, 12);
      rr(ctx, 16 + s * 10 - 2.2, 17, 4.4, 8, 2);
      ctx.fillStyle = '#4cc9f0';
      ctx.fill();
    }
  },
  console: (ctx) => {
    rr(ctx, 3, 11, 26, 15, 7);
    shadeFill(ctx, '#3d405b', 3, 11, 26, 15);
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(7, 17, 6, 2);
    ctx.fillRect(9, 15, 2, 6);
    dot(ctx, 22, 16.5, 1.6, '#ef476f');
    dot(ctx, 25, 19, 1.6, '#4cc9f0');
    dot(ctx, 19, 19, 1.6, '#ffd60a');
    dot(ctx, 22, 21.5, 1.6, '#8ac926');
    shine(ctx, 9, 13, 4, 1, 0.35);
  },
  tshirt: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(11, 6);
    ctx.quadraticCurveTo(16, 10, 21, 6);
    ctx.lineTo(29, 11);
    ctx.lineTo(26, 16);
    ctx.lineTo(23, 14.5);
    ctx.lineTo(23, 28);
    ctx.lineTo(9, 28);
    ctx.lineTo(9, 14.5);
    ctx.lineTo(6, 16);
    ctx.lineTo(3, 11);
    ctx.closePath();
    shadeFill(ctx, '#06d6a0', 3, 6, 26, 22);
    mark(ctx, '★', 16, 19, 8, '#ffffff');
  },
  sneakers: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(4, 25);
    ctx.lineTo(4, 14);
    ctx.quadraticCurveTo(10, 11, 13, 14);
    ctx.quadraticCurveTo(20, 17, 27, 20);
    ctx.quadraticCurveTo(30, 22, 29, 25);
    ctx.closePath();
    shadeFill(ctx, '#ef476f', 4, 11, 26, 14);
    rr(ctx, 3, 24, 27, 4, 2);
    shadeFill(ctx, '#ffffff', 3, 24, 27, 4);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    for (const x of [9, 12, 15]) {
      ctx.beginPath();
      ctx.moveTo(x, 15 + (x - 9) * 0.3);
      ctx.lineTo(x + 2.5, 17 + (x - 9) * 0.3);
      ctx.stroke();
    }
  },
  perfume: (ctx) => {
    rr(ctx, 7, 12, 18, 16, 5);
    shadeFill(ctx, '#cdb4db', 7, 12, 18, 16);
    rr(ctx, 13, 7, 6, 5, 1);
    shadeFill(ctx, '#ffd166', 13, 7, 6, 5);
    blob(ctx, 16, 5, 4, 2.4, '#b388eb');
    mark(ctx, 'Lumi', 16, 20, 4.6, '#5a189a');
    shine(ctx, 11, 16, 1.4, 3.4);
  },
  watch: (ctx) => {
    rr(ctx, 12, 3, 8, 26, 3);
    shadeFill(ctx, '#8d6e63', 12, 3, 8, 26);
    blob(ctx, 16, 16, 8, 8, '#ffd166');
    ctx.beginPath();
    ctx.arc(16, 16, 5.6, 0, Math.PI * 2);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(16, 12.2);
    ctx.moveTo(16, 16);
    ctx.lineTo(18.8, 17);
    ctx.stroke();
  },
  pumpkin_pie: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(4, 24);
    ctx.lineTo(16, 10);
    ctx.lineTo(28, 24);
    ctx.quadraticCurveTo(16, 29, 4, 24);
    ctx.closePath();
    shadeFill(ctx, '#f77f00', 4, 10, 24, 18);
    ctx.beginPath();
    ctx.moveTo(4, 24);
    ctx.quadraticCurveTo(16, 29, 28, 24);
    ctx.lineTo(28, 27);
    ctx.quadraticCurveTo(16, 32, 4, 27);
    ctx.closePath();
    shadeFill(ctx, '#d9a066', 4, 24, 24, 6);
    blob(ctx, 16, 16, 3, 2, '#ffffff', false);
  },
  hot_cocoa: (ctx) => {
    rr(ctx, 7, 11, 16, 17, 4);
    shadeFill(ctx, '#e76f51', 7, 11, 16, 17);
    ctx.beginPath();
    ctx.arc(24.5, 19, 4.5, -Math.PI / 2, Math.PI / 2);
    ctx.strokeStyle = tone('#e76f51', -0.15);
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(15, 11.5, 7.4, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7f5539';
    ctx.fill();
    for (const [x, y] of [[12, 10], [16, 9.5], [18.5, 11]]) {
      rr(ctx, x, y, 3, 2.4, 0.8);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  },
  ice_lolly: (ctx) => {
    rr(ctx, 14.5, 20, 3, 10, 1.4);
    shadeFill(ctx, '#e9c46a', 14.5, 20, 3, 10);
    rr(ctx, 9, 3, 14, 19, 6);
    shadeFill(ctx, '#a0e7e5', 9, 3, 14, 19);
    band(ctx, 9, 8, 14, 4, '#ff8fab', 0);
    band(ctx, 9, 14, 14, 3, '#ffd60a', 0);
    shine(ctx, 12.4, 7, 1.2, 3);
  },
  eggs: (ctx) => {
    pack(ctx, 3, 18, 24, 10, '#c9ada7', 4, 2);
    for (let i = 0; i < 3; i++) blob(ctx, 8 + i * 7, 15.5, 3.2, 4, '#fff8e7');
    for (let i = 0; i < 3; i++) blob(ctx, 11 + i * 7, 12.5, 3, 3.6, '#fdf0d5');
  },
  toilet_paper: (ctx) => {
    for (const [x, y] of [[9, 18], [20, 18], [14.5, 7]] as [number, number][]) {
      rr(ctx, x - 5, y, 10, 11, 2);
      shadeFill(ctx, '#ffffff', x - 5, y, 10, 11);
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f1f3f5';
      ctx.fill();
      stroke(ctx);
      dot(ctx, x, y, 1.4, '#ced4da');
    }
    band(ctx, 4, 22, 21, 3, '#a0c4ff', 1);
  },
  laundry: (ctx) => {
    rr(ctx, 6, 9, 20, 20, 4);
    shadeFill(ctx, '#3a86ff', 6, 9, 20, 20);
    ctx.beginPath();
    ctx.arc(20, 10, 4, Math.PI, 0);
    ctx.strokeStyle = tone('#3a86ff', -0.2);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    rr(ctx, 9, 5, 6, 4.5, 1);
    shadeFill(ctx, '#ffbe0b', 9, 5, 6, 4.5);
    blob(ctx, 16, 19, 6, 5, '#ffffff', false);
    mark(ctx, 'FRESH', 16, 19.5, 3.6, '#3a86ff');
  },
  soap: (ctx) => {
    rr(ctx, 5, 15, 22, 12, 5);
    shadeFill(ctx, '#ff8fab', 5, 15, 22, 12);
    mark(ctx, 'suds', 16, 21.5, 4.4, '#ffffff');
    for (const [x, y, r] of [[9, 11, 3], [15, 8, 2.2], [21, 11, 2.6], [24, 6, 1.6]] as [number, number, number][]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160,231,229,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  },
  books: (ctx) => {
    const cols = ['#3a86ff', '#ef476f', '#ffbe0b'];
    cols.forEach((c, i) => {
      const y = 22 - i * 6;
      pack(ctx, 5 + (i % 2) * 2, y, 19, 5, c, 3, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(8 + (i % 2) * 2, y + 2, 9, 1);
    });
  },
  pet_food: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(7, 9);
    ctx.lineTo(25, 9);
    ctx.lineTo(26, 28);
    ctx.lineTo(6, 28);
    ctx.closePath();
    shadeFill(ctx, '#2ec4b6', 6, 9, 20, 19);
    ctx.fillStyle = tone('#2ec4b6', -0.25);
    ctx.fillRect(7, 9, 18, 3);
    // paw print
    blob(ctx, 16, 21, 3.4, 2.8, '#ffffff', false);
    for (const [x, y] of [[12.5, 17], [15, 15.5], [17.5, 15.5], [20, 17]]) dot(ctx, x, y, 1.3, '#ffffff');
  },
  flowers: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(10, 18);
    ctx.lineTo(22, 18);
    ctx.lineTo(18, 29);
    ctx.lineTo(14, 29);
    ctx.closePath();
    shadeFill(ctx, '#bde0fe', 10, 18, 12, 11);
    for (const [x, y, c] of [[11, 12, '#ff70a6'], [16, 8, '#ffd60a'], [21, 12, '#c77dff'], [16, 15, '#ef476f']] as [number, number, string][]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        blob(ctx, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.8, 1.8, c, false);
      }
      dot(ctx, x, y, 1.3, '#ffbe0b');
    }
    ctx.fillStyle = '#52b788';
    ctx.fillRect(13, 16, 2, 3);
    ctx.fillRect(18, 16, 2, 3);
  },
};

/** Fallback art for a product id without a drawing: a neutral labelled box in the product colour. */
function generic(color: string): DrawFn {
  return (ctx) => {
    pack(ctx, 7, 11, 17, 17, color, 4);
    band(ctx, 7, 17, 17, 5, '#ffffff', 1);
  };
}

export function productArtIds(): string[] {
  return Object.keys(P);
}

export function productAssets(products: { id: string; color: string }[]): AssetDef[] {
  return products.map((p) => ({
    id: `product.${p.id}`,
    category: 'product',
    size: { w: 32, h: 32 },
    anchor: { x: 16, y: 30 },
    layer: 'object',
    camera: 'billboard',
    draw: P[p.id] ?? generic(p.color),
    label: `product.${p.id}`,
    ref: p.id,
  }));
}
