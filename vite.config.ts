import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
    // INLINE_ASSETS=1 embeds every PNG in the JS bundle (for single-file hosting); otherwise only small ones are inlined.
    assetsInlineLimit: process.env.INLINE_ASSETS ? 100_000_000 : 4096,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
