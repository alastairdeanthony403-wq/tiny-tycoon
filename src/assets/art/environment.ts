import type { AssetDef, DrawFn } from '../types';
import { ART } from '../spec';
import { rr, tone, shadeFill, contactShadow, dot, blob, shine, mark } from '../draw';
import { TERRAIN, TERRAIN_IDS } from '../terrain';

/**
 * Outdoor props (billboards that always face the camera) and terrain swatches.
 * Every prop is drawn in its own box with the ground contact point at `anchor`.
 * Big rotating structures (houses, towers, barns, stalls, cars, the plane) are real box geometry
 * drawn by render/world.ts, so they turn correctly with the 360° camera.
 */
const OL = ART.outline.color;

function line(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, w: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function trunk(ctx: CanvasRenderingContext2D, cx: number, base: number, top: number, w: number, color = '#8b5e34'): void {
  rr(ctx, cx - w / 2, top, w, base - top, w / 2);
  shadeFill(ctx, color, cx - w / 2, top, w, base - top);
}

/** A rounded foliage canopy made of overlapping blobs, lit from the top left. */
function canopy(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  blob(ctx, cx, cy + r * 0.15, r, r * 0.85, tone(color, -0.12));
  blob(ctx, cx - r * 0.45, cy + r * 0.05, r * 0.6, r * 0.55, color, false);
  blob(ctx, cx + r * 0.4, cy - r * 0.1, r * 0.6, r * 0.55, color, false);
  blob(ctx, cx - r * 0.1, cy - r * 0.45, r * 0.62, r * 0.5, tone(color, 0.12), false);
  shine(ctx, cx - r * 0.35, cy - r * 0.45, r * 0.22, r * 0.12, 0.35);
}

const tree = (leaf: string, fruit?: string): DrawFn => (ctx) => {
  contactShadow(ctx, 22, 57, 34);
  trunk(ctx, 22, 57, 34, 7);
  canopy(ctx, 22, 24, 18, leaf);
  if (fruit) for (const [x, y] of [[14, 22], [27, 17], [30, 30], [18, 33]]) dot(ctx, x, y, 2.2, fruit);
};

const PROPS: Record<string, { size: [number, number]; anchor: [number, number]; draw: DrawFn; anim?: string[] }> = {
  tree_round: { size: [44, 60], anchor: [22, 57], draw: tree('#52b788') },
  tree_fruit: { size: [44, 60], anchor: [22, 57], draw: tree('#40916c', '#ef476f') },
  tree_autumn: { size: [44, 60], anchor: [22, 57], draw: tree('#e76f51', '#f4a261') },
  tree_pine: {
    size: [36, 62],
    anchor: [18, 59],
    draw: (ctx) => {
      contactShadow(ctx, 18, 59, 28);
      trunk(ctx, 18, 59, 48, 6);
      for (const [y, w, c] of [[50, 30, '#1b4332'], [38, 25, '#2d6a4f'], [26, 19, '#40916c']] as [number, number, string][]) {
        ctx.beginPath();
        ctx.moveTo(18 - w / 2, y);
        ctx.quadraticCurveTo(18, y + 3, 18 + w / 2, y);
        ctx.lineTo(18, y - 20);
        ctx.closePath();
        shadeFill(ctx, c, 18 - w / 2, y - 20, w, 22);
      }
    },
  },
  palm: {
    size: [50, 70],
    anchor: [22, 67],
    draw: (ctx) => {
      contactShadow(ctx, 22, 67, 26);
      ctx.beginPath();
      ctx.moveTo(19, 67);
      ctx.quadraticCurveTo(24, 40, 29, 18);
      ctx.lineTo(33, 19);
      ctx.quadraticCurveTo(29, 42, 26, 67);
      ctx.closePath();
      shadeFill(ctx, '#a47148', 19, 18, 14, 50);
      for (let y = 26; y < 64; y += 6) line(ctx, [[24 - (64 - y) * 0.05, y], [28 - (64 - y) * 0.05, y - 1]], 'rgba(60,35,20,0.35)', 1);
      const frond = (a: number, len: number, c: string) => {
        const ex = 31 + Math.cos(a) * len;
        const ey = 18 + Math.sin(a) * len * 0.7;
        ctx.beginPath();
        ctx.moveTo(31, 18);
        ctx.quadraticCurveTo(31 + Math.cos(a - 0.5) * len * 0.6, 12 + Math.sin(a - 0.5) * len * 0.5, ex, ey);
        ctx.quadraticCurveTo(31 + Math.cos(a + 0.3) * len * 0.5, 20 + Math.sin(a + 0.3) * len * 0.35, 31, 20);
        ctx.closePath();
        shadeFill(ctx, c, Math.min(31, ex), Math.min(12, ey), Math.abs(ex - 31) + 2, Math.abs(ey - 12) + 8);
      };
      frond(Math.PI + 0.5, 22, '#2d6a4f');
      frond(0.5, 20, '#2d6a4f');
      frond(Math.PI - 0.1, 24, '#40916c');
      frond(0.1, 22, '#40916c');
      frond(-Math.PI / 2 - 0.4, 16, '#52b788');
      frond(-Math.PI / 2 + 0.5, 16, '#52b788');
      dot(ctx, 29, 21, 2.6, '#7f5539');
      dot(ctx, 33, 22, 2.6, '#6f4518');
    },
  },
  bush: {
    size: [30, 22],
    anchor: [15, 20],
    draw: (ctx) => {
      contactShadow(ctx, 15, 20, 28);
      blob(ctx, 15, 13, 13, 8, '#40916c');
      blob(ctx, 9, 11, 7, 6, '#52b788', false);
      blob(ctx, 19, 9, 7, 6, '#74c69d', false);
      shine(ctx, 10, 8, 3, 1.6, 0.3);
    },
  },
  hedge: {
    size: [40, 30],
    anchor: [20, 22],
    draw: (ctx) => {
      contactShadow(ctx, 20, 22, 38);
      rr(ctx, 3, 6, 34, 15, 6);
      shadeFill(ctx, '#2d6a4f', 3, 6, 34, 15);
      for (let x = 7; x < 36; x += 6) dot(ctx, x, 8, 3.2, '#40916c');
    },
  },
  flower_bed: {
    size: [34, 18],
    anchor: [17, 15],
    draw: (ctx) => {
      ctx.beginPath();
      ctx.ellipse(17, 12, 15, 5.5, 0, 0, Math.PI * 2);
      shadeFill(ctx, '#7f5539', 2, 6, 30, 12);
      const cs = ['#ef476f', '#ffd166', '#f72585', '#ffffff', '#9d4edd', '#ff9f1c'];
      let i = 0;
      for (let x = 6; x <= 28; x += 4.4) for (const y of [9, 12.5]) {
        line(ctx, [[x, y + 2], [x, y]], '#2d6a4f', 1.2);
        dot(ctx, x, y - 1, 2.2, cs[i++ % cs.length]);
        dot(ctx, x, y - 1, 0.8, '#ffe066');
      }
    },
  },
  planter: {
    size: [30, 30],
    anchor: [15, 28],
    draw: (ctx) => {
      contactShadow(ctx, 15, 28, 26);
      ctx.beginPath();
      ctx.moveTo(5, 16);
      ctx.lineTo(25, 16);
      ctx.lineTo(22, 28);
      ctx.lineTo(8, 28);
      ctx.closePath();
      shadeFill(ctx, '#d4a373', 5, 16, 20, 12);
      rr(ctx, 4, 14, 22, 3.5, 1.5);
      shadeFill(ctx, '#bc8a5f', 4, 14, 22, 3.5);
      blob(ctx, 15, 10, 10, 6.5, '#52b788');
      dot(ctx, 10, 8, 2, '#ff70a6');
      dot(ctx, 19, 7, 2, '#ffd166');
      dot(ctx, 15, 5, 2, '#ef476f');
    },
  },
  bench: {
    size: [38, 31],
    anchor: [19, 24],
    draw: (ctx) => {
      contactShadow(ctx, 19, 24, 34);
      for (const x of [6, 30]) {
        rr(ctx, x, 14, 3, 10, 1);
        shadeFill(ctx, '#495057', x, 14, 3, 10);
      }
      rr(ctx, 3, 12, 32, 4, 1.5);
      shadeFill(ctx, '#bc6c25', 3, 12, 32, 4);
      for (const y of [3, 7.5]) {
        rr(ctx, 3, y, 32, 3.4, 1.5);
        shadeFill(ctx, '#dda15e', 3, y, 32, 3.4);
      }
    },
  },
  streetlight: {
    size: [20, 66],
    anchor: [10, 63],
    draw: (ctx) => {
      contactShadow(ctx, 10, 63, 14);
      rr(ctx, 6.5, 58, 7, 5, 2);
      shadeFill(ctx, '#343a40', 6.5, 58, 7, 5);
      rr(ctx, 8.6, 12, 2.8, 47, 1.4);
      shadeFill(ctx, '#495057', 8.6, 12, 2.8, 47);
      rr(ctx, 4, 6, 12, 8, 3);
      shadeFill(ctx, '#343a40', 4, 6, 12, 8);
      rr(ctx, 5.5, 9, 9, 4, 1.5);
      ctx.fillStyle = '#fff3b0';
      ctx.fill();
    },
  },
  lantern_post: {
    size: [22, 62],
    anchor: [11, 59],
    draw: (ctx) => {
      contactShadow(ctx, 11, 59, 14);
      rr(ctx, 9.5, 14, 3, 45, 1.5);
      shadeFill(ctx, '#6c3b1d', 9.5, 14, 3, 45);
      ctx.beginPath();
      ctx.ellipse(11, 16, 7, 8.5, 0, 0, Math.PI * 2);
      shadeFill(ctx, '#e63946', 4, 7.5, 14, 17);
      line(ctx, [[4.6, 16], [17.4, 16]], 'rgba(255,214,102,0.8)', 1.2);
      rr(ctx, 8, 6, 6, 2.6, 1);
      shadeFill(ctx, '#3d2c1e', 8, 6, 6, 2.6);
      rr(ctx, 8, 23.6, 6, 2.4, 1);
      shadeFill(ctx, '#3d2c1e', 8, 23.6, 6, 2.4);
      line(ctx, [[11, 26], [11, 30]], '#ffd166', 1.2);
    },
  },
  rock: {
    size: [28, 18],
    anchor: [14, 16],
    draw: (ctx) => {
      contactShadow(ctx, 14, 16, 26);
      ctx.beginPath();
      ctx.moveTo(3, 15);
      ctx.quadraticCurveTo(4, 6, 12, 4);
      ctx.quadraticCurveTo(22, 3, 25, 11);
      ctx.quadraticCurveTo(26, 15, 22, 16);
      ctx.closePath();
      shadeFill(ctx, '#adb5bd', 3, 3, 23, 13);
      line(ctx, [[12, 6], [15, 11], [21, 12]], 'rgba(73,80,87,0.35)', 1);
      shine(ctx, 10, 7, 3, 1.3, 0.4);
    },
  },
  rocks_small: {
    size: [26, 14],
    anchor: [13, 12],
    draw: (ctx) => {
      contactShadow(ctx, 13, 12, 24);
      blob(ctx, 8, 9, 6, 3.8, '#ced4da');
      blob(ctx, 17, 8, 7, 4.5, '#adb5bd');
      blob(ctx, 13, 11, 3.5, 2.2, '#dee2e6');
    },
  },
  trash_bin: {
    size: [18, 26],
    anchor: [9, 24],
    draw: (ctx) => {
      contactShadow(ctx, 9, 24, 16);
      ctx.beginPath();
      ctx.moveTo(3, 8);
      ctx.lineTo(15, 8);
      ctx.lineTo(14, 24);
      ctx.lineTo(4, 24);
      ctx.closePath();
      shadeFill(ctx, '#2a9d8f', 3, 8, 12, 16);
      for (const x of [6.5, 9, 11.5]) line(ctx, [[x, 11], [x, 21]], 'rgba(0,0,0,0.18)', 1);
      rr(ctx, 2, 5, 14, 3.6, 1.6);
      shadeFill(ctx, '#264653', 2, 5, 14, 3.6);
      rr(ctx, 7, 3, 4, 2.4, 1);
      shadeFill(ctx, '#264653', 7, 3, 4, 2.4);
    },
  },
  road_sign: {
    size: [22, 46],
    anchor: [11, 44],
    draw: (ctx) => {
      contactShadow(ctx, 11, 44, 10);
      rr(ctx, 9.8, 16, 2.4, 28, 1.2);
      shadeFill(ctx, '#adb5bd', 9.8, 16, 2.4, 28);
      ctx.beginPath();
      ctx.arc(11, 11, 9, 0, Math.PI * 2);
      shadeFill(ctx, '#ffffff', 2, 2, 18, 18);
      ctx.beginPath();
      ctx.arc(11, 11, 7.2, 0, Math.PI * 2);
      ctx.fillStyle = '#e63946';
      ctx.fill();
      mark(ctx, '20', 11, 11.5, 7.5, '#fff');
    },
  },
  bus_stop: {
    size: [34, 50],
    anchor: [17, 48],
    draw: (ctx) => {
      contactShadow(ctx, 17, 48, 30);
      for (const x of [4, 28]) {
        rr(ctx, x, 12, 2.6, 36, 1);
        shadeFill(ctx, '#6c757d', x, 12, 2.6, 36);
      }
      rr(ctx, 2, 8, 30, 5, 2);
      shadeFill(ctx, '#3a86ff', 2, 8, 30, 5);
      rr(ctx, 6, 14, 22, 20, 2);
      ctx.fillStyle = 'rgba(202,240,248,0.55)';
      ctx.fill();
      ctx.strokeStyle = OL;
      ctx.lineWidth = 1;
      ctx.stroke();
      rr(ctx, 6, 36, 22, 3, 1);
      shadeFill(ctx, '#bc6c25', 6, 36, 22, 3);
      mark(ctx, 'BUS', 17, 10.6, 4.4, '#fff');
    },
  },
  mailbox: {
    size: [16, 30],
    anchor: [8, 28],
    draw: (ctx) => {
      contactShadow(ctx, 8, 28, 12);
      rr(ctx, 6.8, 14, 2.4, 14, 1);
      shadeFill(ctx, '#6c584c', 6.8, 14, 2.4, 14);
      ctx.beginPath();
      ctx.moveTo(2, 15);
      ctx.lineTo(2, 8);
      ctx.arc(8, 8, 6, Math.PI, 0);
      ctx.lineTo(14, 15);
      ctx.closePath();
      shadeFill(ctx, '#e63946', 2, 2, 12, 13);
      rr(ctx, 12.5, 4, 1.6, 6, 0.6);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
    },
  },
  hay_bale: {
    size: [32, 24],
    anchor: [16, 22],
    draw: (ctx) => {
      contactShadow(ctx, 16, 22, 30);
      rr(ctx, 3, 7, 26, 15, 5);
      shadeFill(ctx, '#e9c46a', 3, 7, 26, 15);
      for (let x = 7; x < 28; x += 4) line(ctx, [[x, 9], [x - 1, 20]], 'rgba(160,110,30,0.35)', 1);
      line(ctx, [[10, 7.5], [10, 21.5]], '#bc6c25', 1.4);
      line(ctx, [[22, 7.5], [22, 21.5]], '#bc6c25', 1.4);
    },
  },
  scarecrow: {
    size: [30, 50],
    anchor: [15, 48],
    draw: (ctx) => {
      contactShadow(ctx, 15, 48, 12);
      line(ctx, [[15, 48], [15, 14]], '#7f5539', 2.4);
      line(ctx, [[3, 24], [27, 24]], '#7f5539', 2.2);
      rr(ctx, 8, 20, 14, 14, 3);
      shadeFill(ctx, '#457b9d', 8, 20, 14, 14);
      rr(ctx, 9, 21, 12, 3, 1);
      ctx.fillStyle = '#e63946';
      ctx.fill();
      dot(ctx, 15, 13, 5.5, '#f4d58d');
      ctx.beginPath();
      ctx.ellipse(15, 8.5, 9, 2.4, 0, 0, Math.PI * 2);
      shadeFill(ctx, '#bc6c25', 6, 6, 18, 5);
      rr(ctx, 11, 3, 8, 6, 2);
      shadeFill(ctx, '#bc6c25', 11, 3, 8, 6);
      dot(ctx, 13.2, 13, 0.9, '#2b2d42');
      dot(ctx, 16.8, 13, 0.9, '#2b2d42');
    },
  },
  umbrella: {
    size: [46, 60],
    anchor: [23, 52],
    draw: (ctx) => {
      contactShadow(ctx, 23, 52, 40);
      line(ctx, [[23, 52], [23, 12]], '#f8f9fa', 2);
      const cols = ['#ef476f', '#ffffff', '#ef476f', '#ffffff', '#ef476f', '#ffffff'];
      for (let i = 0; i < 6; i++) {
        const a0 = Math.PI + (i / 6) * Math.PI;
        const a1 = Math.PI + ((i + 1) / 6) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(23, 8);
        ctx.lineTo(23 + Math.cos(a0) * 21, 18 + Math.sin(a0) * 4);
        ctx.lineTo(23 + Math.cos(a1) * 21, 18 + Math.sin(a1) * 4);
        ctx.closePath();
        ctx.fillStyle = cols[i];
        ctx.fill();
        ctx.strokeStyle = OL;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(23, 18, 21, 4, 0, 0, Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fill();
    },
  },
  beach_towel: {
    size: [36, 16],
    anchor: [18, 12],
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(4, 10);
      ctx.lineTo(20, 4);
      ctx.lineTo(32, 7);
      ctx.lineTo(16, 13);
      ctx.closePath();
      shadeFill(ctx, '#4cc9f0', 4, 4, 28, 9);
      line(ctx, [[9, 8.2], [24, 4.9]], '#ffd166', 1.6);
      line(ctx, [[13, 10], [28, 6.4]], '#ffd166', 1.6);
    },
  },
  lifebuoy: {
    size: [22, 40],
    anchor: [11, 38],
    draw: (ctx) => {
      contactShadow(ctx, 11, 38, 10);
      line(ctx, [[11, 38], [11, 6]], '#ffffff', 2.4);
      ctx.beginPath();
      ctx.arc(11, 18, 8, 0, Math.PI * 2);
      ctx.arc(11, 18, 4, 0, Math.PI * 2, true);
      shadeFill(ctx, '#e63946', 3, 10, 16, 16);
      for (const a of [0.4, 2, 3.6, 5.2]) {
        ctx.beginPath();
        ctx.arc(11, 18, 6, a, a + 0.6);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    },
  },
  boat: {
    size: [50, 34],
    anchor: [25, 30],
    anim: ['bob'],
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(4, 20);
      ctx.lineTo(46, 20);
      ctx.quadraticCurveTo(42, 30, 36, 30);
      ctx.lineTo(13, 30);
      ctx.quadraticCurveTo(7, 30, 4, 20);
      ctx.closePath();
      shadeFill(ctx, '#f8f9fa', 4, 20, 42, 10);
      line(ctx, [[6, 23], [44, 23]], '#e63946', 2);
      line(ctx, [[24, 20], [24, 2]], '#6c584c', 1.6);
      ctx.beginPath();
      ctx.moveTo(25.5, 3);
      ctx.lineTo(40, 18);
      ctx.lineTo(25.5, 18);
      ctx.closePath();
      shadeFill(ctx, '#ffd166', 25, 3, 15, 15);
    },
  },
  fountain: {
    size: [60, 52],
    anchor: [30, 40],
    anim: ['flow'],
    draw: (ctx) => {
      contactShadow(ctx, 30, 40, 58);
      ctx.beginPath();
      ctx.ellipse(30, 34, 27, 9, 0, 0, Math.PI * 2);
      shadeFill(ctx, '#ced4da', 3, 25, 54, 18);
      ctx.beginPath();
      ctx.ellipse(30, 32, 22, 6.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#48cae4';
      ctx.fill();
      rr(ctx, 27, 14, 6, 18, 2);
      shadeFill(ctx, '#adb5bd', 27, 14, 6, 18);
      ctx.beginPath();
      ctx.ellipse(30, 15, 9, 3, 0, 0, Math.PI * 2);
      shadeFill(ctx, '#ced4da', 21, 12, 18, 6);
      ctx.strokeStyle = 'rgba(202,240,248,0.9)';
      ctx.lineWidth = 1.6;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(30, 11);
        ctx.quadraticCurveTo(30 + s * 10, 2, 30 + s * 16, 30);
        ctx.stroke();
      }
      dot(ctx, 30, 9, 2.4, '#caf0f8');
    },
  },
  pumpkin: {
    size: [20, 18],
    anchor: [10, 16],
    draw: (ctx) => {
      contactShadow(ctx, 10, 16, 18);
      blob(ctx, 10, 10.5, 8.5, 6, '#f77f00');
      line(ctx, [[10, 5], [10, 15.5]], 'rgba(150,60,0,0.4)', 1);
      line(ctx, [[5.5, 6.5], [5.5, 14.5]], 'rgba(150,60,0,0.3)', 1);
      line(ctx, [[14.5, 6.5], [14.5, 14.5]], 'rgba(150,60,0,0.3)', 1);
      rr(ctx, 9, 2, 2.4, 4, 1);
      shadeFill(ctx, '#2d6a4f', 9, 2, 2.4, 4);
    },
  },
  leaf_pile: {
    size: [30, 14],
    anchor: [15, 12],
    draw: (ctx) => {
      blob(ctx, 15, 9, 13, 4.5, '#d68c45', false);
      for (const [x, y, c] of [[8, 8, '#e76f51'], [14, 6, '#f4a261'], [20, 8, '#a44a3f'], [11, 10, '#ffb703'], [19, 10, '#e76f51']] as [number, number, string][]) blob(ctx, x, y, 3.2, 1.8, c, false);
    },
  },
  snow_pile: {
    size: [32, 14],
    anchor: [16, 12],
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(2, 12);
      ctx.quadraticCurveTo(6, 3, 13, 5);
      ctx.quadraticCurveTo(18, 1, 23, 5);
      ctx.quadraticCurveTo(30, 5, 30, 12);
      ctx.closePath();
      shadeFill(ctx, '#ffffff', 2, 1, 28, 11);
      shine(ctx, 12, 6, 3, 1.2, 0.8);
    },
  },
  string_lights: {
    size: [40, 18],
    anchor: [20, 16],
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(2, 4);
      ctx.quadraticCurveTo(20, 18, 38, 4);
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 1;
      ctx.stroke();
      const cs = ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0'];
      for (let i = 1; i < 8; i++) {
        const t = i / 8;
        const x = 2 + 36 * t;
        const y = 4 + 2 * (1 - t) * t * 14;
        dot(ctx, x, y + 1.5, 1.8, cs[i % 4]);
      }
    },
  },
  crate_stack: {
    size: [30, 30],
    anchor: [15, 28],
    draw: (ctx) => {
      contactShadow(ctx, 15, 28, 28);
      for (const [x, y] of [[3, 16], [15, 16], [9, 4]] as [number, number][]) {
        rr(ctx, x, y, 12, 12, 1);
        shadeFill(ctx, '#c08552', x, y, 12, 12);
        line(ctx, [[x + 1, y + 1], [x + 11, y + 11]], 'rgba(90,50,20,0.35)', 1);
      }
    },
  },
  cone: {
    size: [14, 18],
    anchor: [7, 16],
    draw: (ctx) => {
      contactShadow(ctx, 7, 16, 12);
      ctx.beginPath();
      ctx.moveTo(7, 2);
      ctx.lineTo(11, 15);
      ctx.lineTo(3, 15);
      ctx.closePath();
      shadeFill(ctx, '#fb8500', 3, 2, 8, 13);
      line(ctx, [[5, 9], [9, 9]], '#ffffff', 1.8);
      rr(ctx, 1.5, 14.5, 11, 2, 0.8);
      shadeFill(ctx, '#fb8500', 1.5, 14.5, 11, 2);
    },
  },
  windsock: {
    size: [30, 44],
    anchor: [6, 42],
    anim: ['wave'],
    draw: (ctx) => {
      contactShadow(ctx, 6, 42, 8);
      line(ctx, [[6, 42], [6, 4]], '#adb5bd', 2);
      ctx.beginPath();
      ctx.moveTo(6, 5);
      ctx.lineTo(27, 9);
      ctx.lineTo(27, 12);
      ctx.lineTo(6, 14);
      ctx.closePath();
      shadeFill(ctx, '#fb8500', 6, 5, 21, 9);
      for (const x of [13, 20]) line(ctx, [[x, 6.5], [x, 13]], '#ffffff', 2.2);
    },
  },
  runway_light: {
    size: [10, 10],
    anchor: [5, 8],
    draw: (ctx) => {
      blob(ctx, 5, 7, 3.4, 1.8, '#495057');
      dot(ctx, 5, 5, 2.2, '#ffd166');
    },
  },
};

/** Ids of every outdoor prop, e.g. `deco.tree_round`. */
export const PROP_IDS = Object.keys(PROPS).map((k) => `deco.${k}`);

/** Terrain swatches (a flat diamond) so terrain can be previewed in the UI and listed in the registry. */
function terrainSwatch(id: string): DrawFn {
  return (ctx) => {
    const t = TERRAIN[id];
    ctx.beginPath();
    ctx.moveTo(16, 1);
    ctx.lineTo(31, 8.5);
    ctx.lineTo(16, 16);
    ctx.lineTo(1, 8.5);
    ctx.closePath();
    ctx.fillStyle = t.base;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = t.alt;
    for (let i = 0; i < 6; i++) ctx.fillRect(4 + ((i * 7) % 24), 3 + ((i * 5) % 11), 3, 1.5);
    ctx.restore();
    ctx.strokeStyle = OL;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
}

export function environmentAssets(): AssetDef[] {
  const out: AssetDef[] = [];
  for (const [k, p] of Object.entries(PROPS)) {
    out.push({
      id: `deco.${k}`,
      category: 'decoration',
      size: { w: p.size[0], h: p.size[1] },
      anchor: { x: p.anchor[0], y: p.anchor[1] },
      layer: 'object',
      camera: 'billboard',
      draw: p.draw,
      animation: p.anim ? { states: p.anim, cycle: 2 } : undefined,
    });
  }
  for (const id of TERRAIN_IDS) {
    out.push({ id: `terrain.${id}`, category: 'terrain', size: { w: 32, h: 17 }, anchor: { x: 16, y: 8.5 }, layer: 'ground', camera: 'ground', draw: terrainSwatch(id) });
  }
  return out;
}
