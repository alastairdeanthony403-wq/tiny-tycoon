import type { AppApi } from './api';
import type { Renderer } from '../render/renderer';
import { el, setText, toggle } from './dom';
import { t } from '../core/i18n';

/**
 * Contextual tutorial: points a bouncing finger at the next thing to tap, driven by the
 * current main quest's hint. No walls of text — one short line at a time.
 */
export class Tutorial {
  el: HTMLElement;
  private finger: HTMLElement;
  private bubble: HTMLElement;

  constructor(private app: AppApi, private renderer: Renderer, private ui: { activePanel: string | null; inspectorUid: number; placing: boolean }) {
    this.finger = el('div', { class: 'tut-finger', 'aria-hidden': 'true' }, '👆');
    this.bubble = el('div', { class: 'tut-bubble', role: 'note' });
    this.el = el('div', { class: 'tutorial hidden' }, this.finger, this.bubble);
  }

  private dom(sel: string): HTMLElement | null {
    const e = document.querySelector(sel) as HTMLElement | null;
    if (!e || e.offsetParent === null) return null;
    // Never point at something hidden behind a panel or popup.
    const r = e.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && top !== e && !e.contains(top) && !top.closest('.tutorial, .toasts')) return null;
    return e;
  }

  update(): void {
    const g = this.app.game;
    const q = g.quests.currentMain();
    const r = this.renderer;
    r.highlightUid = 0;
    r.highlightSign = false;
    r.highlightExpansion = false;
    const hint = q && !q.progress.completed ? q.def?.hint : undefined;
    // Only guide during the tutorial (and lightly afterwards for nav hints).
    const showText = !!q && !g.state.progression.tutorialDone;
    let target: { x: number; y: number } | null = null;
    let elTarget: HTMLElement | null = null;
    const ui = this.ui;
    const shelf = g.shop.objects.find((o) => o.kind === 'shelf');
    const checkout = g.shop.objects.find((o) => o.kind === 'checkout');
    if (q?.progress.completed) {
      elTarget = this.dom(`[data-quest="${q.id}"] .btn-claim`);
    } else if (hint === 'openSign') {
      r.highlightSign = true;
      target = r.screenOfSign();
    } else if (hint === 'shelf' || hint === 'checkout') {
      const obj = hint === 'shelf' ? shelf : checkout;
      const want = q?.id === 'restock' ? 'inspector-restock' : 'inspector-upgrade';
      if (obj && ui.inspectorUid === obj.uid) elTarget = this.dom(`[data-tut="${want}"]`);
      else if (obj) {
        r.highlightUid = obj.uid;
        target = r.screenOfObject(obj.uid);
      }
    } else if (hint === 'build') {
      const kind = q?.def?.goal.type === 'check' && q.def.goal.check === 'objectCount' ? q.def.goal.arg ?? 'shelf' : q?.def?.goal.type === 'check' && q.def.goal.check === 'decorCount' ? 'plant' : 'shelf';
      if (ui.placing) elTarget = null;
      else if (ui.activePanel === 'shop') elTarget = this.dom(`[data-tut="build-${kind}"]`);
      else elTarget = this.dom('[data-nav="shop"]');
    } else if (hint === 'expand') {
      if (ui.activePanel === 'shop') elTarget = this.dom('[data-tut="expand"]');
      else if (!g.shop.construction) {
        r.highlightExpansion = true;
        target = r.screenOfExpansion();
      }
    } else if (hint?.startsWith('nav:')) {
      const panel = hint.slice(4);
      if (ui.activePanel === panel) {
        const sel: Record<string, string> = {
          products: '[data-tut^="unlock-"]:not(.cant)',
          shop: '[data-tut^="dept-"]:not(.cant)',
          staff: '[data-tut^="hire-"]:not(.cant)',
          upgrades: '[data-tut="upgrade-marketing"]',
        };
        elTarget = sel[panel] ? this.dom(sel[panel]) : null;
      } else elTarget = this.dom(`[data-nav="${panel}"]`);
    }
    if (elTarget) {
      const b = elTarget.getBoundingClientRect();
      target = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    const visible = !!target && (showText || !!hint) && !ui.placing;
    toggle(this.el, 'hidden', !visible);
    if (!visible || !target) return;
    this.finger.style.left = `${target.x - 14}px`;
    this.finger.style.top = `${target.y + 6}px`;
    const quietBubble = !!q?.progress.completed || (!!ui.activePanel && !!elTarget) || (ui.inspectorUid !== 0 && !!elTarget);
    if (showText && q && !quietBubble) {
      setText(this.bubble, t(`tut.${q.progress.completed ? 'claim' : q.id}`));
      toggle(this.bubble, 'hidden', false);
      const vw = window.innerWidth;
      const bx = Math.max(12, Math.min(vw - 232, target.x - 110));
      const by = target.y + 58 > window.innerHeight - 140 ? target.y - 110 : target.y + 58;
      this.bubble.style.left = `${bx}px`;
      this.bubble.style.top = `${by}px`;
    } else toggle(this.bubble, 'hidden', true);
  }
}
