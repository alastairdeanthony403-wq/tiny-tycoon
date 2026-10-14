import { el, clear } from './dom';

/**
 * Base for tab panels. Panels rebuild their DOM only when their structure key changes
 * (e.g. a new product unlocked) and otherwise just run cheap updaters — so buttons
 * aren't recreated under the player's finger and UI updates stay cheap.
 */
export abstract class Panel {
  readonly el: HTMLElement;
  protected body: HTMLElement;
  private key = '';
  private updaters: (() => void)[] = [];

  constructor(public readonly id: string, title: string, icon: string) {
    this.body = el('div', { class: 'panel-body' });
    this.el = el('section', { class: `panel panel-${id}`, 'aria-label': title }, el('header', { class: 'panel-head' }, el('h2', {}, `${icon} ${title}`)), this.body);
  }

  protected abstract structureKey(): string;
  protected abstract build(add: (fn: () => void) => void): Node[];

  refresh(force = false): void {
    const k = this.structureKey();
    if (force || k !== this.key) {
      this.key = k;
      this.updaters = [];
      const scroll = this.body.scrollTop;
      clear(this.body);
      this.body.append(...this.build((fn) => this.updaters.push(fn)));
      this.body.scrollTop = scroll;
    }
    for (const u of this.updaters) u();
  }
}
