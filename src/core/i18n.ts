import { en } from '../locales/en';

export type Locale = Record<string, string>;
const locales: Record<string, Locale> = { en };
let current: Locale = en;
let currentId = 'en';
const missing = new Set<string>();

export function registerLocale(id: string, table: Locale): void {
  locales[id] = table;
}

export function setLanguage(id: string): void {
  current = locales[id] ?? en;
  currentId = locales[id] ? id : 'en';
}

export function getLanguage(): string {
  return currentId;
}

export function availableLanguages(): string[] {
  return Object.keys(locales);
}

/** Translate a key, substituting {vars}. Falls back to English, then to the key itself. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = current[key] ?? en[key];
  if (s === undefined) {
    if (!missing.has(key)) {
      missing.add(key);
      if (typeof console !== 'undefined') console.warn(`[i18n] missing key: ${key}`);
    }
    s = key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  return s;
}

export function hasKey(key: string): boolean {
  return key in current || key in en;
}
