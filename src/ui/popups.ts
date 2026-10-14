import { el, clear } from './dom';
import { t } from '../core/i18n';

export interface PopupSpec {
  id?: string;
  icon: string;
  title: string;
  subtitle?: string;
  body?: Node | string;
  kind?: 'celebrate' | 'info' | 'confirm' | 'gold';
  buttons: { label: string; primary?: boolean; danger?: boolean; onClick?: () => void }[];
  /** Pauses the simulation while open (menus); celebrations don't. */
  pauses?: boolean;
}

/** Modal queue: one popup at a time, big reveal animation, keyboard accessible. */
export class Popups {
  el: HTMLElement;
  private queue: PopupSpec[] = [];
  private current: PopupSpec | null = null;
  onOpenChange: (open: boolean, spec: PopupSpec | null) => void = () => {};

  constructor() {
    this.el = el('div', { class: 'modal-layer hidden' });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current?.kind !== 'confirm') this.close();
    });
  }

  get open(): boolean {
    return !!this.current;
  }

  push(p: PopupSpec, front = false): void {
    if (p.id && (this.current?.id === p.id || this.queue.some((q) => q.id === p.id))) return;
    if (front) this.queue.unshift(p);
    else this.queue.push(p);
    if (!this.current) this.next();
  }

  private next(): void {
    this.current = this.queue.shift() ?? null;
    clear(this.el);
    if (!this.current) {
      this.el.classList.add('hidden');
      this.onOpenChange(false, null);
      return;
    }
    const p = this.current;
    const btns = p.buttons.map((b, i) =>
      el(
        'button',
        {
          class: `btn ${b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : 'btn-ghost'}`,
          autofocus: i === 0,
          onclick: () => {
            this.close();
            b.onClick?.();
          },
        },
        b.label,
      ),
    );
    const box = el(
      'div',
      { class: `modal modal-${p.kind ?? 'info'}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      p.kind === 'celebrate' || p.kind === 'gold' ? el('div', { class: 'rays', 'aria-hidden': 'true' }) : null,
      el('div', { class: 'modal-icon', 'aria-hidden': 'true' }, p.icon),
      el('h2', { id: 'modal-title' }, p.title),
      p.subtitle ? el('div', { class: 'modal-sub' }, p.subtitle) : null,
      p.body ? el('div', { class: 'modal-body' }, p.body) : null,
      el('div', { class: 'modal-buttons' }, ...btns),
    );
    this.el.append(box);
    // Confirmations can be opened from full-screen menus (New Game, Reset, Skip tutorial): show them on top.
    this.el.classList.toggle('over-menus', p.kind === 'confirm');
    this.el.classList.remove('hidden');
    this.onOpenChange(true, p);
    setTimeout(() => (btns[0] as HTMLButtonElement | undefined)?.focus(), 50);
  }

  close(): void {
    this.next();
  }

  clearAll(): void {
    this.queue = [];
    this.current = null;
    this.next();
  }

  static ok(): string {
    return t('ui.ok');
  }
}
