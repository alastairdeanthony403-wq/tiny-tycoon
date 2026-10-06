const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Formats money in a compact, readable way: £950, £12.4K, £3.21M. */
export function formatMoney(n: number, symbol = '£'): string {
  if (!Number.isFinite(n)) return symbol + '0';
  const neg = n < 0;
  const v = Math.abs(n);
  let out: string;
  if (v < 1000) out = v < 10 && v % 1 !== 0 ? v.toFixed(1).replace(/\.0$/, '') : Math.floor(v).toString();
  else if (v < 10000) out = Math.floor(v).toLocaleString('en-GB');
  else {
    let i = 0;
    let x = v;
    while (x >= 1000 && i < SUFFIXES.length - 1) {
      x /= 1000;
      i++;
    }
    out = (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + SUFFIXES[i];
  }
  return (neg ? '-' : '') + symbol + out;
}

export function formatNumber(n: number): string {
  return formatMoney(n, '');
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
