import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { createInitialState } from '../src/core/state';
import { SaveManager, MemoryStore, SAVE_KEY, BACKUP_KEY, DAMAGED_KEY, migrate, validate } from '../src/save/saveManager';
import { dayKey, weekKey } from '../src/sim/missions';
import { ADS } from '../src/config/ads';
import { AdController } from '../src/ads/controller';
import { NoAdProvider, SimulatedAdProvider } from '../src/ads/providers';
import { AnalyticsManager } from '../src/services/analytics';
import { MAIN_QUESTS } from '../src/config/quests';
import { T0 } from './helpers';

const DAY = 86_400_000;

/** A game with a controllable clock, shop open, tutorial finished. */
function clockGame(seed = 3, tutorialDone = true) {
  const clock = { now: T0 };
  const g = new Game(createInitialState(T0, seed), { seed, now: () => clock.now });
  g.shopMgr.openShop();
  g.economy.earn(500, false);
  g.state.progression.tutorialDone = tutorialDone;
  return { g, clock };
}

describe('mission period keys', () => {
  it('uses UTC days and Monday-based UTC weeks', () => {
    const wed = Date.UTC(2026, 9, 14, 23, 59);
    expect(dayKey(wed)).toBe('2026-10-14');
    expect(weekKey(wed)).toBe('2026-10-12');
    expect(weekKey(Date.UTC(2026, 9, 12, 0, 0))).toBe('2026-10-12');
    expect(weekKey(Date.UTC(2026, 9, 18, 23, 59))).toBe('2026-10-12'); // Sunday
    expect(weekKey(Date.UTC(2026, 9, 19, 0, 0))).toBe('2026-10-19');
  });
});

describe('daily and weekly missions', () => {
  it('are not issued during the tutorial, then three of each are issued', () => {
    const { g } = clockGame(3, false);
    g.missions.refresh();
    expect(g.state.missions.daily).toHaveLength(0);
    g.state.progression.tutorialDone = true;
    g.missions.refresh();
    expect(g.state.missions.daily).toHaveLength(3);
    expect(g.state.missions.weekly).toHaveLength(3);
    expect(new Set(g.state.missions.daily.map((m) => m.id)).size).toBe(3);
    expect(g.state.missions.dailyKey).toBe(dayKey(T0));
  });

  it('progress comes from real gameplay and rewards are claimed exactly once', () => {
    const { g } = clockGame(5);
    g.missions.refresh();
    const m = g.state.missions.daily[0];
    // Make the first mission a small "serve customers" goal so the real simulation completes it.
    Object.assign(m, { stat: 'customersServed', base: g.state.stats.customersServed, target: 3 });
    expect(g.missions.claim('daily', m.id)).toBe(false); // not complete yet
    for (let i = 0; i < 120 && !m.completed; i++) {
      g.runFor(5);
      g.missions.refresh();
    }
    expect(m.completed).toBe(true);
    expect(g.missions.views('daily')[0].value).toBe(3);
    const before = { money: g.state.player.money, gems: g.monetization.gems };
    expect(g.missions.claim('daily', m.id)).toBe(true);
    expect(g.missions.claim('daily', m.id)).toBe(false);
    expect(g.state.player.money).toBe(before.money + m.money);
    expect(g.monetization.gems).toBe(before.gems + m.gems);
    expect(g.state.stats.dailyMissionsClaimed).toBe(1);
    expect(g.state.monetization.ledger.filter((l) => l.source?.startsWith('mission:daily')).length).toBe(1);
  });

  it('restarting never rerolls or resets missions; a new day issues a new set; a clock rollback does not', () => {
    const { g, clock } = clockGame(9);
    g.missions.refresh();
    g.state.stats.itemsSold += 3;
    const ids = g.state.missions.daily.map((m) => m.id).join();
    const sm = new SaveManager(new MemoryStore());
    sm.save(g.state, clock.now);
    const g2 = new Game(sm.load(clock.now).state, { seed: 9, now: () => clock.now });
    g2.missions.refresh();
    expect(g2.state.missions.daily.map((m) => m.id).join()).toBe(ids);
    expect(g2.state.missions.daily).toEqual(g.state.missions.daily);
    clock.now = T0 + DAY;
    g2.missions.refresh();
    expect(g2.state.missions.dailyKey).toBe(dayKey(T0 + DAY));
    const nextDay = JSON.stringify(g2.state.missions.daily);
    clock.now = T0; // clock moved back
    g2.missions.refresh();
    expect(g2.state.missions.dailyKey).toBe(dayKey(T0 + DAY));
    expect(JSON.stringify(g2.state.missions.daily)).toBe(nextDay);
  });

  it('the same seed and day always produce the same set (deterministic, not re-rollable)', () => {
    const a = clockGame(11).g;
    const b = clockGame(11).g;
    a.missions.refresh();
    b.missions.refresh();
    expect(a.state.missions.daily.map((m) => m.id)).toEqual(b.state.missions.daily.map((m) => m.id));
  });

  it('claiming a daily mission unlocks the On a Mission achievement', () => {
    const { g } = clockGame(4);
    g.missions.refresh();
    const m = g.state.missions.daily[0];
    if (m.stat.startsWith('sold:')) g.state.stats.soldByCategory[m.stat.slice(5)] = (g.state.stats.soldByCategory[m.stat.slice(5)] ?? 0) + m.target;
    else (g.state.stats as any)[m.stat] += m.target;
    g.missions.refresh();
    expect(g.missions.claim('daily', m.id)).toBe(true);
    g.achievements.evaluate();
    expect(g.state.progression.achievements.on_a_mission?.unlocked).toBe(true);
  });

  it('tampered mission data is sanitised on load', () => {
    const raw: any = createInitialState(T0, 1);
    raw.missions = { dailyKey: 'yesterday', daily: [{ id: 'd_sell', stat: 'itemsSold', base: -5, target: 0, money: 'lots', gems: 1e9 }, 'junk'], weekly: null };
    const st = validate(raw, T0);
    expect(st.missions.dailyKey).toBe('');
    expect(st.missions.daily).toHaveLength(1);
    expect(st.missions.daily[0]).toMatchObject({ base: 0, target: 1, money: 0, gems: 100 });
    expect(st.missions.weekly).toEqual([]);
  });
});

describe('optional rewarded ads', () => {
  it('without a provider the offer is unavailable and nothing is granted', async () => {
    const { g } = clockGame();
    const c = new AdController(() => g, new NoAdProvider());
    expect(c.offerable).toBe(false);
    expect(await c.watch()).toBe('unavailable');
    expect(g.ads.boostActive).toBe(false);
  });

  it('skipped or failed ads grant nothing; only a verified completion grants the boost', async () => {
    const { g } = clockGame();
    const p = new SimulatedAdProvider();
    const c = new AdController(() => g, p);
    const base = g.mods.priceMult();
    p.scenario = 'skip';
    expect(await c.watch()).toBe('skipped');
    p.scenario = 'fail';
    expect(await c.watch()).toBe('failed');
    expect(g.ads.boostActive).toBe(false);
    p.scenario = 'complete';
    expect(await c.watch()).toBe('rewarded');
    expect(g.mods.priceMult()).toBeCloseTo(base * ADS.boostPriceMult);
    g.runFor(ADS.boostSeconds + 1);
    expect(g.ads.boostActive).toBe(false);
    expect(g.mods.priceMult()).toBeCloseTo(base);
  });

  it('duplicate completions, cooldowns and the daily cap are enforced', async () => {
    const { g, clock } = clockGame();
    clock.now = Date.UTC(2026, 9, 14, 8, 0);
    const morning = clock.now;
    expect(g.ads.grantVerified('ad-1')).toBe(true);
    g.state.ads.boostRemaining = 0;
    expect(g.ads.grantVerified('ad-1')).toBe(false); // same completion id
    expect(g.ads.block()).toBe('cooldown');
    expect(g.ads.grantVerified('ad-2')).toBe(false);
    for (let i = 2; i <= ADS.dailyCap; i++) {
      clock.now += ADS.cooldownMs;
      g.state.ads.boostRemaining = 0;
      expect(g.ads.grantVerified(`ad-${i + 1}`)).toBe(true);
    }
    clock.now += ADS.cooldownMs;
    g.state.ads.boostRemaining = 0;
    expect(g.ads.block()).toBe('daily_cap');
    clock.now = morning + DAY;
    expect(g.ads.block()).toBe(null); // new UTC day
  });

  it('the boost is excluded from offline earnings', () => {
    const { g, clock } = clockGame();
    g.state.incomeBuckets = Array(30).fill(100);
    g.shop.incomeRate = 10;
    const plain = g.offline.compute(clock.now + 3600_000)!.amount;
    g.state.pendingOffline = undefined;
    g.state.timestamps.lastSave = clock.now;
    g.ads.grantVerified('x');
    const boosted = g.offline.compute(clock.now + 3600_000)!.amount;
    expect(boosted).toBeLessThanOrEqual(plain);
  });
});

describe('onboarding', () => {
  it('skipping the tutorial unlocks side goals and missions, hides tips and earns Graduate', () => {
    const { g } = clockGame(2, false);
    const events: boolean[] = [];
    g.bus.on('tutorialCompleted', (e) => events.push(e.skipped));
    g.quests.skipTutorial();
    g.quests.skipTutorial();
    expect(events).toEqual([true]);
    expect(g.state.progression.tutorialDone).toBe(true);
    expect(g.state.progression.flags.tutorialHidden).toBe(true);
    g.missions.refresh();
    expect(g.state.missions.daily.length).toBe(3);
    g.achievements.evaluate();
    expect(g.state.progression.achievements.graduate?.unlocked).toBe(true);
  });

  it('the achievements and cosmetics steps advance only when those screens were actually opened', () => {
    const { g } = clockGame(2, false);
    const idx = MAIN_QUESTS.findIndex((q) => q.id === 'view_achievements');
    g.state.progression.mainQuestIndex = idx;
    g.state.progression.activeQuests = [];
    g.quests.startMain();
    g.quests.evaluate();
    expect(g.quests.currentMain()!.id).toBe('view_achievements');
    expect(g.quests.currentMain()!.progress.completed).toBe(false);
    g.state.progression.flags.viewedAchievements = true;
    g.quests.evaluate();
    expect(g.quests.claim('view_achievements')).toBe(true);
    expect(g.quests.currentMain()!.id).toBe('view_cosmetics');
    g.state.progression.flags.viewedCosmetics = true;
    g.quests.evaluate();
    expect(g.quests.claim('view_cosmetics')).toBe(true);
    expect(g.state.progression.tutorialDone).toBe(true);
  });

  it('v3 saves past the old tutorial skip the two new steps; earlier saves keep their place', () => {
    const later: any = { version: 3, progression: { mainQuestIndex: 12 } };
    expect(migrate(later).progression.mainQuestIndex).toBe(14);
    const early: any = { version: 3, progression: { mainQuestIndex: 4 } };
    expect(migrate(early).progression.mainQuestIndex).toBe(4);
    expect(MAIN_QUESTS[12].id).toBe('serve_25');
  });

  it('first upgrade earns the Upgraded achievement', () => {
    const { g } = clockGame();
    g.economy.earn(10_000, false);
    g.state.player.level = 10;
    const id = ['marketing', 'pricing'].find((u) => g.upgrades.canBuy(u).ok)!;
    expect(g.upgrades.buy(id)).toBe(true);
    g.achievements.evaluate();
    expect(g.state.progression.achievements.first_upgrade?.unlocked).toBe(true);
  });
});

describe('analytics adapter and privacy', () => {
  it('sends nothing without a provider or without consent, and strips personal fields', () => {
    const a = new AnalyticsManager();
    const sent: string[] = [];
    a.track('level_up', { level: 2 });
    a.setProvider({ name: 'test', track: (n) => sent.push(n) });
    a.track('level_up', { level: 3 });
    expect(sent).toEqual([]);
    a.consent = true;
    a.track('purchase_result', { product: 'x', email: 'a@b.c', receipt: 'r' });
    expect(sent).toEqual(['purchase_result']);
    expect(a.buffer.slice(-1)[0].props).toEqual({ product: 'x' });
    a.reportError('test', new Error('boom'));
    expect(sent.slice(-1)[0]).toBe('client_error');
  });
});

describe('save recovery', () => {
  it('a damaged main save falls back to the backup and keeps a copy of the damaged one', () => {
    const store = new MemoryStore();
    const sm = new SaveManager(store);
    const st = createInitialState(T0, 1);
    st.player.money = 1234;
    sm.save(st, T0);
    sm.save(st, T0 + 1000); // backup now holds the first good save
    store.setItem(SAVE_KEY, '{"broken":');
    const r = sm.load(T0 + 2000);
    expect(r.source).toBe('backup');
    expect(r.recovered).toBe('backup');
    expect(r.state.player.money).toBe(1234);
    expect(store.getItem(DAMAGED_KEY)).toBe('{"broken":');
  });

  it('when nothing is readable a new game starts, the player is told, and the damaged data is kept', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, 'garbage');
    store.setItem(BACKUP_KEY, 'more garbage');
    const r = new SaveManager(store).load(T0);
    expect(r.source).toBe('new');
    expect(r.recovered).toBe('new_game');
    expect(store.getItem(DAMAGED_KEY)).toBe('garbage');
  });

  it('a clean first launch reports no recovery', () => {
    expect(new SaveManager(new MemoryStore()).load(T0).recovered).toBeUndefined();
  });
});
