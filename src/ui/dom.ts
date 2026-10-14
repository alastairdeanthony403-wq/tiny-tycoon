type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

export function clear(e: HTMLElement): void {
  while (e.firstChild) e.removeChild(e.firstChild);
}

export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function toggle(e: HTMLElement, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}

/** Retriggers a CSS animation class (bounce/pulse feedback). */
export function pulse(e: HTMLElement, cls = 'pulse'): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

/**
 * Global action guard: ignores repeated activations of the same action for a short window,
 * so rapid tapping never causes duplicate purchases.
 */
const lastAction = new Map<string, number>();
export function guarded(key: string, fn: () => void, windowMs = 280): () => void {
  return () => {
    const now = performance.now();
    if (now - (lastAction.get(key) ?? -Infinity) < windowMs) return;
    lastAction.set(key, now);
    fn();
  };
}
