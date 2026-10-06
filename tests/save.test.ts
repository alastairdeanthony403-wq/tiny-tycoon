import { describe, it, expect } from 'vitest';
import { SaveManager, MemoryStore, SAVE_KEY, BACKUP_KEY, validate, migrate, checksum } from '../src/save/saveManager';
import { SAVE_VERSION } from '../src/core/types';
import { createInitialState } from '../src/core/state';
import { Game } from '../src/sim/game';
import { openGame, T0 } from './helpers';

describe('SaveManager', () => {
  it('round-trips state', () => {
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    const g = openGame(1, 5000);
    g.runFor(30);
    g.state.globalUpgrades.marketing = 3;
    expect(sm.save(g.state, T0)).toBe(true);
    const r = sm.load(T0);
    expect(r.source).toBe('main');
    expect(r.state.player.money).toBeCloseTo(g.state.player.money);
    expect(r.state.globalUpgrades.marketing).toBe(3);
    expect(r.state.shops.neighborhood.objects.length).toBe(g.shop.objects.length);
    expect(r.state.player.lifetimeCustomers).toBe(g.state.player.lifetimeCustomers);
  });

  it('keeps a backup and falls back to it when the main save is corrupt', () => {
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    const s = createInitialState(T0, 1);
    s.player.money = 111;
    sm.save(s, T0);
    s.player.money = 222;
    sm.save(s, T0 + 1);
    expect(store.getItem(BACKUP_KEY)).toBeTruthy();
    store.setItem(SAVE_KEY, '{not json');
    const r = sm.load(T0);
    expect(r.source).toBe('backup');
    expect(r.state.player.money).toBe(111);
  });

  it('detects tampering via checksum', () => {
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    sm.save(createInitialState(T0, 1), T0);
    const env = JSON.parse(store.getItem(SAVE_KEY)!);
    env.state.player.money = 1e12;
    store.setItem(SAVE_KEY, JSON.stringify(env));
    const r = sm.load(T0);
    expect(r.state.player.money).not.toBe(1e12);
  });

  it('starts a new game when nothing valid exists', () => {
    const sm = new SaveManager(new MemoryStore());
    expect(sm.load(T0).source).toBe('new');
  });

  it('migrates an old v1 save', () => {
    const store = new MemoryStore();
    const old: any = createInitialState(T0, 1);
    old.version = 1;
    old.player.premiumCurrency = 7;
    delete old.player.stars;
    delete old.settings.textScale;
    const body = JSON.stringify(old);
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: T0, checksum: checksum(body), state: old }));
    const r = new SaveManager(store).load(T0);
    expect(r.migratedFrom).toBe(1);
    expect(r.state.version).toBe(SAVE_VERSION);
    expect(r.state.player.stars).toBe(7);
    expect(r.state.settings.textScale).toBe(1);
  });

  it('repairs invalid values and drops unknown content', () => {
    const raw: any = migrate(createInitialState(T0, 1));
    raw.player.money = -500;
    raw.player.level = 'banana';
    raw.player.stars = Infinity;
    raw.shops.neighborhood.objects.push({ uid: 99, kind: 'nuclear_reactor', x: 1, y: 1, dir: 0, tier: 0, stock: 0 });
    raw.shops.neighborhood.objects.push({ uid: 98, kind: 'shelf', x: 50, y: 50, dir: 0, tier: 0, stock: 0 });
    raw.progression.unlockedProducts.push('unobtainium');
    const s = validate(raw, T0);
    expect(s.player.money).toBe(0);
    expect(s.player.level).toBe(1);
    expect(Number.isFinite(s.player.stars)).toBe(true);
    expect(s.shops.neighborhood.objects.some((o) => o.kind === 'nuclear_reactor')).toBe(false);
    expect(s.shops.neighborhood.objects.some((o) => o.uid === 98)).toBe(false);
    expect(s.progression.unlockedProducts).not.toContain('unobtainium');
  });

  it('restores a playable shop if objects are missing', () => {
    const raw: any = createInitialState(T0, 1);
    raw.shops.neighborhood.objects = [];
    const s = validate(raw, T0);
    expect(s.shops.neighborhood.objects.some((o) => o.kind === 'checkout')).toBe(true);
  });

  it('a loaded game keeps running (save/load preserves gameplay)', () => {
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    const g = openGame(3, 2000);
    g.state.player.level = 3;
    expect(g.employees.hire('stocker')).not.toBeNull();
    g.runFor(20);
    sm.save(g.state, T0);
    const g2 = new Game(sm.load(T0).state, { seed: 3, now: () => T0 });
    const served = g2.state.stats.customersServed;
    g2.runFor(60);
    expect(g2.state.stats.customersServed).toBeGreaterThan(served);
  });
});
