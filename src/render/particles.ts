/** Pooled particles & floating texts (no per-frame allocation once warmed up). */
export type ParticleKind = 'coin' | 'sparkle' | 'confetti' | 'dust' | 'star' | 'heart' | 'steam';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  /** Screen-space particles ignore the camera (e.g. level-up confetti). */
  screen: boolean;
}

export interface FloatText {
  active: boolean;
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

const CONFETTI = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff8fab'];

export class ParticleSystem {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  maxParticles = 400;
  enabled = true;

  constructor() {
    for (let i = 0; i < 400; i++) this.particles.push({ active: false, kind: 'coin', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, color: '#fff', rot: 0, vr: 0, screen: false });
    for (let i = 0; i < 40; i++) this.texts.push({ active: false, text: '', x: 0, y: 0, life: 0, max: 1, color: '#fff', size: 14 });
  }

  private alloc(): Particle | null {
    let used = 0;
    for (const p of this.particles) {
      if (!p.active) return p;
      used++;
      if (used >= this.maxParticles) break;
    }
    return null;
  }

  emit(kind: ParticleKind, x: number, y: number, n: number, opts: { spread?: number; up?: number; screen?: boolean; color?: string; life?: number } = {}): void {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      if (!p) return;
      const spread = opts.spread ?? 40;
      p.active = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = (Math.random() - 0.5) * spread * 2;
      p.vy = -(opts.up ?? 60) * (0.6 + Math.random() * 0.8);
      p.max = p.life = (opts.life ?? 0.9) * (0.7 + Math.random() * 0.6);
      p.size = kind === 'confetti' ? 4 + Math.random() * 4 : kind === 'dust' ? 5 + Math.random() * 6 : 3 + Math.random() * 3;
      p.color = opts.color ?? (kind === 'confetti' ? CONFETTI[(Math.random() * CONFETTI.length) | 0] : kind === 'coin' ? '#ffd23f' : kind === 'dust' ? '#d6c7a1' : kind === 'heart' ? '#ff5d8f' : kind === 'steam' ? '#ffffff' : '#fff6a6');
      p.rot = Math.random() * 6;
      p.vr = (Math.random() - 0.5) * 10;
      p.screen = !!opts.screen;
    }
  }

  text(text: string, x: number, y: number, color = '#2bb673', size = 14): void {
    let t = this.texts.find((q) => !q.active);
    if (!t) t = this.texts.reduce((a, b) => (a.life < b.life ? a : b));
    t.active = true;
    t.text = text;
    t.x = x;
    t.y = y;
    t.max = t.life = 1.3;
    t.color = color;
    t.size = size;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const grav = p.kind === 'dust' || p.kind === 'steam' ? -20 : p.kind === 'heart' ? -10 : p.kind === 'confetti' ? 120 : 200;
      p.vy += grav * dt;
      if (p.kind === 'confetti') p.vx *= 0.98;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (const t of this.texts) {
      if (!t.active) continue;
      t.life -= dt;
      t.y -= 28 * dt;
      if (t.life <= 0) t.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, screen: boolean): void {
    for (const p of this.particles) {
      if (!p.active || p.screen !== screen) continue;
      const a = Math.min(1, p.life / (p.max * 0.4));
      ctx.globalAlpha = a;
      switch (p.kind) {
        case 'coin':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.rot)) + 0.8, p.size, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#c99700';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'dust':
        case 'steam':
          ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - p.life / p.max), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'heart':
          ctx.font = `${p.size * 3}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = p.color;
          ctx.fillText('♥', p.x, p.y);
          break;
        default: {
          // sparkle / star: 4-point star
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(0, -s * 1.6);
          ctx.lineTo(s * 0.4, -s * 0.4);
          ctx.lineTo(s * 1.6, 0);
          ctx.lineTo(s * 0.4, s * 0.4);
          ctx.lineTo(0, s * 1.6);
          ctx.lineTo(-s * 0.4, s * 0.4);
          ctx.lineTo(-s * 1.6, 0);
          ctx.lineTo(-s * 0.4, -s * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
    if (screen) return;
    for (const t of this.texts) {
      if (!t.active) continue;
      const a = Math.min(1, t.life / 0.5);
      const pop = t.life > t.max - 0.15 ? 1 + (t.life - (t.max - 0.15)) * 3 : 1;
      ctx.globalAlpha = a;
      ctx.font = `900 ${t.size * pop}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    for (const t of this.texts) t.active = false;
  }
}
