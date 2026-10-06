import { el, setText, toggle, pulse, guarded } from './dom';
import { formatMoney } from '../core/format';
import { t } from '../core/i18n';

/** Shared UI context so components can play sounds / haptics without importing the app. */
export interface UICtx {
  sfx: (name: any) => void;
  haptic: (p: number | number[]) => void;
}

let ctx: UICtx = { sfx: () => {}, haptic: () => {} };
export function setUICtx(c: UICtx): void {
  ctx = c;
}
export function uiCtx(): UICtx {
  return ctx;
}

// ----------------------------------------------------------- ProgressBar
export class ProgressBar {
  el: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;
  constructor(cls = '') {
    this.fill = el('div', { class: 'pb-fill' });
    this.label = el('div', { class: 'pb-label' });
    this.el = el('div', { class: `pb ${cls}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, this.fill, this.label);
  }
  set(ratio: number, text?: string): void {
    const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    const w = `${(r * 100).toFixed(1)}%`;
    if (this.fill.style.width !== w) this.fill.style.width = w;
    this.el.setAttribute('aria-valuenow', String(Math.round(r * 100)));
    setText(this.label, text ?? '');
  }
}

// ------------------------------------------------------- CurrencyDisplay
/** Animated currency counter with a pulse when it changes. */
export class CurrencyDisplay {
  el: HTMLElement;
  private value: HTMLElement;
  private sub: HTMLElement;
  private shown = 0;
  private target = 0;
  constructor(icon: string, label: string, private fmt: (n: number) => string = formatMoney) {
    this.value = el('span', { class: 'cur-value' });
    this.sub = el('span', { class: 'cur-sub' });
    this.el = el('div', { class: 'currency', 'aria-label': label }, el('span', { class: 'cur-icon', 'aria-hidden': 'true' }, icon), el('span', { class: 'cur-text' }, this.value, this.sub));
  }
  set(n: number, sub?: string): void {
    if (n !== this.target) {
      if (n > this.target + 0.5) pulse(this.el, 'pulse-up');
      else if (n < this.target - 0.5) pulse(this.el, 'pulse-down');
      this.target = n;
    }
    setText(this.sub, sub ?? '');
  }
  tick(dt: number): void {
    const diff = this.target - this.shown;
    if (Math.abs(diff) < 0.5) this.shown = this.target;
    else this.shown += diff * Math.min(1, dt * 10);
    setText(this.value, this.fmt(this.shown));
  }
  snap(): void {
    this.shown = this.target;
  }
}

// ------------------------------------------------------- UpgradeButton
export interface CostButtonOpts {
  label: () => string;
  cost: () => number | null; // null = maxed / not applicable
  can: () => { ok: boolean; reason?: string };
  onBuy: () => boolean;
  currency?: 'money' | 'stars';
  key: string;
  tut?: string;
  free?: boolean;
}

/** A purchase button that shows price, greys out when unaffordable, explains why, and guards double taps. */
export class UpgradeButton {
  el: HTMLButtonElement;
  private lbl: HTMLElement;
  private price: HTMLElement;
  constructor(private o: CostButtonOpts) {
    this.lbl = el('span', { class: 'ub-label' });
    this.price = el('span', { class: 'ub-price' });
    this.el = el('button', { class: 'btn btn-buy', 'data-tut': o.tut }, this.lbl, this.price);
    this.el.addEventListener(
      'click',
      guarded(o.key, () => {
        const c = o.can();
        if (!c.ok) {
          ctx.sfx('error');
          ctx.haptic(40);
          pulse(this.el, 'shake');
          return;
        }
        if (o.onBuy()) {
          ctx.haptic(20);
          pulse(this.el, 'pop');
        } else {
          ctx.sfx('error');
          pulse(this.el, 'shake');
        }
      }),
    );
    this.update();
  }
  update(): void {
    const cost = this.o.cost();
    const c = this.o.can();
    setText(this.lbl, this.o.label());
    if (cost === null) {
      setText(this.price, t('ui.max'));
      this.el.disabled = true;
      toggle(this.el, 'maxed', true);
      return;
    }
    toggle(this.el, 'maxed', false);
    this.el.disabled = false;
    const cur = this.o.currency === 'stars' ? `🌟 ${cost}` : this.o.free || cost === 0 ? t('ui.free') : formatMoney(cost);
    const reason = !c.ok && c.reason && c.reason !== 'money' ? ` · ${t('reason.' + c.reason)}` : '';
    setText(this.price, cur + reason);
    toggle(this.el, 'cant', !c.ok);
    toggle(this.el, 'affordable', c.ok);
    this.el.setAttribute('aria-disabled', String(!c.ok));
  }
}

// ----------------------------------------------------------------- Cards
export function card(cls: string, ...children: (Node | string | null | false)[]): HTMLElement {
  return el('div', { class: `card ${cls}` }, ...children);
}

export function iconBox(icon: string, cls = ''): HTMLElement {
  return el('div', { class: `icon-box ${cls}`, 'aria-hidden': 'true' }, icon);
}

export function tag(text: string, cls = ''): HTMLElement {
  return el('span', { class: `tag ${cls}` }, text);
}

/** Before → after stat preview, e.g. "Capacity 10 → 15". */
export function statPreview(label: string, from: string, to: string | null): HTMLElement {
  return el('div', { class: 'stat-preview' }, el('span', { class: 'sp-label' }, label), el('span', { class: 'sp-from' }, from), to !== null ? el('span', { class: 'sp-arrow' }, '→') : null, to !== null ? el('span', { class: 'sp-to' }, to) : null);
}

export function sectionTitle(text: string, icon = ''): HTMLElement {
  return el('h3', { class: 'section-title' }, icon ? `${icon} ${text}` : text);
}

// ------------------------------------------------------- NotificationToast
export class Toasts {
  el: HTMLElement;
  constructor() {
    this.el = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  }
  show(text: string, icon = 'ℹ️', kind: 'info' | 'good' | 'bad' | 'gold' = 'info', ms = 2600, action?: { label: string; fn: () => void }): void {
    while (this.el.children.length >= 4) this.el.firstElementChild?.remove();
    const btn = action ? el('button', { class: 'btn btn-small', onclick: () => { action.fn(); node.remove(); } }, action.label) : null;
    const node = el('div', { class: `toast toast-${kind}` }, el('span', { class: 'toast-icon' }, icon), el('span', { class: 'toast-text' }, text), btn);
    this.el.append(node);
    setTimeout(() => node.classList.add('out'), ms);
    setTimeout(() => node.remove(), ms + 400);
  }
}

// ---------------------------------------------------------- TimerDisplay
export class TimerDisplay {
  el: HTMLElement;
  private bar = new ProgressBar('timer');
  private txt: HTMLElement;
  constructor(icon: string, title: string, desc: string) {
    this.txt = el('span', { class: 'timer-left' });
    this.el = el('div', { class: 'timer-display' }, el('div', { class: 'timer-head' }, el('span', { class: 'timer-icon' }, icon), el('b', {}, title), this.txt), el('div', { class: 'timer-desc' }, desc), this.bar.el);
  }
  set(remaining: number, total: number): void {
    setText(this.txt, `${Math.ceil(remaining)}s`);
    this.bar.set(remaining / total);
  }
}

/** Floating "-£250" style text attached to an element (DOM purchase feedback). */
export function floatText(anchor: HTMLElement, text: string, cls: string): void {
  const r = anchor.getBoundingClientRect();
  const f = el('div', { class: `float-text ${cls}`, style: { left: `${r.left + r.width / 2}px`, top: `${r.bottom}px` } }, text);
  document.body.append(f);
  setTimeout(() => f.remove(), 1200);
}
