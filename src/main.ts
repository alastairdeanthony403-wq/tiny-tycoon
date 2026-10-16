import './styles.css';
import { Game } from './sim/game';
import { Renderer } from './render/renderer';
import { AudioManager } from './audio/audio';
import { Haptics } from './services/haptics';
import { NotificationService } from './services/notifications';
import { AnalyticsManager } from './services/analytics';
import { SaveManager, MemoryStore } from './save/saveManager';
import type { KeyValueStore } from './save/saveManager';
import { UIManager } from './ui/ui';
import { createInitialState } from './core/state';
import { setLanguage, t } from './core/i18n';
import type { GameEvents } from './core/bus';
import { PurchaseController } from './monetization/controller';
import { SimulatedPurchaseAdapter } from './monetization/simulatedAdapter';
import { NativeBridgeAdapter } from './monetization/nativeBridgeAdapter';
import { SimulatedVerifier, RemoteVerifier } from './monetization/verifier';
import type { PurchaseAdapter, PurchaseVerifier } from './monetization/types';
import { AdController } from './ads/controller';
import { PREMIUM_MAP } from './monetization/catalog';
import { NoAdProvider, SimulatedAdProvider, NativeAdBridgeProvider } from './ads/providers';
import type { RewardedAdProvider } from './ads/types';
import { ADS } from './config/ads';
import { loadBundledImages } from './assets/images';
import { clearSpriteCache } from './assets/spriteCache';

/**
 * Picks the rewarded-ad provider: a native ad plugin when the app shell provides one; the
 * clearly-labelled development simulator in dev builds or with VITE_SIMULATED_ADS=1; otherwise
 * none (offers are hidden).
 */
function createAdProvider(): RewardedAdProvider {
  if (typeof window !== 'undefined' && window.TinyTycoonAds) return new NativeAdBridgeProvider(window.TinyTycoonAds, ADS.placement);
  if (import.meta.env.DEV || import.meta.env.VITE_SIMULATED_ADS === '1') {
    const p = new SimulatedAdProvider();
    p.latency = 1200;
    return p;
  }
  return new NoAdProvider();
}

/** Stable anonymous player id for purchase verification (production backends map it to an account). */
function playerId(): string {
  try {
    let id = localStorage.getItem('tinytycoon.playerId');
    if (!id) {
      id = (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('tinytycoon.playerId', id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

/**
 * Picks the purchase backend:
 *  - packaged app with a native billing bridge → real store + remote verification (VITE_PURCHASE_VERIFY_URL)
 *  - dev build, or a build made with VITE_SIMULATED_STORE=1 → test-only simulator (clearly labelled)
 *  - otherwise → unavailable (no purchases, Gem items still work)
 */
function createStoreBackend(): { adapter: PurchaseAdapter; verifier: PurchaseVerifier } {
  if (typeof window !== 'undefined' && window.TinyTycoonBilling) {
    return { adapter: new NativeBridgeAdapter(window.TinyTycoonBilling), verifier: new RemoteVerifier(import.meta.env.VITE_PURCHASE_VERIFY_URL as string | undefined, playerId) };
  }
  if (import.meta.env.DEV || import.meta.env.VITE_SIMULATED_STORE === '1') {
    const sim = new SimulatedPurchaseAdapter(navigator.language || 'en-GB');
    sim.latency = 600;
    if (typeof navigator !== 'undefined') {
      sim.online = navigator.onLine;
      window.addEventListener('online', () => (sim.online = true));
      window.addEventListener('offline', () => (sim.online = false));
    }
    return { adapter: sim, verifier: new SimulatedVerifier() };
  }
  return { adapter: new NativeBridgeAdapter(undefined), verifier: new RemoteVerifier(undefined, playerId) };
}

/** Events after which we save soon (purchases & important progression). */
const SAVE_TRIGGERS: (keyof GameEvents)[] = ['missionClaimed', 'missionsReset', 'tutorialCompleted', 'adBoostStarted', 'gemsChanged', 'premiumGranted', 'premiumRevoked', 'upgradePurchased', 'objectPlaced', 'objectUpgraded', 'objectRemoved', 'levelUp', 'productUnlocked', 'departmentUnlocked', 'expansionStarted', 'expansionCompleted', 'employeeHired', 'employeeFired', 'employeeLeveled', 'questClaimed', 'achievementClaimed', 'locationUnlocked', 'locationSwitched', 'franchised', 'offlineEarnings', 'crateCollected', 'milestone'];

function safeStorage(): KeyValueStore {
  try {
    const k = '__tt_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    console.warn('[save] localStorage unavailable — progress will not persist this session');
    return new MemoryStore();
  }
}

class App {
  game!: Game;
  renderer!: Renderer;
  ui!: UIManager;
  readonly audio = new AudioManager();
  readonly haptics = new Haptics();
  readonly notifications = new NotificationService();
  readonly analytics = new AnalyticsManager();
  readonly saves = new SaveManager(safeStorage());
  store!: PurchaseController;
  ads!: AdController;
  private last = performance.now();
  private saveSoon = -1;
  private autosave = 0;
  private inGame = false;
  private unsubSave: (() => void) | null = null;

  private saveFailToastAt = 0;

  boot(): void {
    // 1. Services
    if (import.meta.env.DEV) this.analytics.addSink((n, p) => console.debug('[analytics]', n, p));
    // A provider exists only when the app shell supplies one; nothing is sent otherwise.
    const bridge = typeof window !== 'undefined' ? window.TinyTycoonAnalytics : undefined;
    if (bridge) this.analytics.setProvider({ name: bridge.name ?? 'app analytics', track: (n, p) => bridge.track(n, p) });
    // Crash/error reporting (goes through the same consent-gated adapter).
    window.addEventListener('error', (e) => this.analytics.reportError('window', e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => this.analytics.reportError('promise', e.reason));
    // 2. Configuration is bundled as typed data modules (src/config) — nothing to fetch.
    // 3–5. Load, validate and migrate the save (falls back to backup, then to a new game).
    const loaded = this.saves.load(Date.now());
    if (loaded.error) console.warn('[save]', loaded.error);
    if (loaded.migratedFrom) console.info(`[save] migrated from v${loaded.migratedFrom}`);
    setLanguage(loaded.state.settings.language);
    this.analytics.consent = loaded.state.settings.analyticsConsent;
    if (loaded.recovered) this.analytics.track('save_load_recovered', { outcome: loaded.recovered });
    // 6–7. Shop + NPC systems
    this.game = this.makeGame(loaded.state);
    const backend = createStoreBackend();
    this.store = new PurchaseController(() => this.game, backend.adapter, backend.verifier, {
      onChange: () => this.ui?.premium.render(),
      onOutcome: (o) => {
        // Outcomes that arrive outside an explicit purchase (deferred approvals, refunds, relaunch deliveries).
        if (!this.store.inFlight) this.ui?.premium.reportOutcome(o);
        this.requestSave();
      },
    });
    this.ads = new AdController(() => this.game, createAdProvider(), (n, p) => this.analytics.track(n, p));
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas, this.game);
    // Optional bundled PNG artwork (src/assets/images/<asset id>.png) replaces procedural art once loaded.
    void loadBundledImages().then(() => clearSpriteCache());
    this.restoreCamera();
    this.ui = new UIManager(document.getElementById('ui')!, canvas, this.game, this.renderer, this.audio, this.haptics, this.notifications, {
      debugEnabled: import.meta.env.DEV,
      store: () => this.store,
      continueGame: () => this.enterGame(),
      newGame: () => this.newGame(),
      saveNow: () => this.save(),
      toMainMenu: () => {
        this.save();
        this.inGame = false;
        this.ui.menus.main();
      },
      analyticsProvider: () => this.analytics.provider?.name ?? null,
      settingsChanged: () => {
        setLanguage(this.game.state.settings.language);
        this.analytics.consent = this.game.state.settings.analyticsConsent;
        this.ui.applySettings();
        this.requestSave();
      },
      resetSave: () => {
        this.saves.reset();
        this.newGame();
      },
      requestNotifications: () => this.notifications.requestPermission(),
      hasSave: () => this.saves.hasSave(),
      ads: () => this.ads,
      skipTutorial: () => {
        this.game.quests.skipTutorial();
        this.requestSave();
      },
      replayTutorialTips: () => {
        const f = this.game.state.progression.flags;
        f.tutorialHidden = false;
        f.tipsReplay = true;
        this.requestSave();
      },
    });
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => {
      this.save();
      this.analytics.track('session_ended', {});
    });
    this.analytics.track('session_started', {});
    // First launch: show the logo briefly, then start playing immediately. Returning: main menu.
    const splash = document.getElementById('splash');
    const first = loaded.source === 'new';
    setTimeout(
      () => {
        splash?.classList.add('gone');
        setTimeout(() => splash?.remove(), 600);
        if (first) {
          this.analytics.track('game_started', {});
          this.analytics.track('tutorial_started', {});
          this.enterGame();
        } else this.ui.menus.main();
        if (loaded.recovered) this.ui.popups.push({ icon: '💾', title: t('save.title'), body: t(loaded.recovered === 'backup' ? 'save.recovered_backup' : 'save.load_failed'), kind: 'confirm', buttons: [{ label: t('ui.ok'), primary: true }] });
      },
      first ? 900 : 500,
    );
    // Purchase layer: load products and pick up any interrupted/pending transactions.
    void this.store.init();
    // 10. Start the loop
    requestAnimationFrame((t) => this.frame(t));
  }

  private restoreCamera(): void {
    const st = this.game.state;
    if (st.settings.rememberCamera && st.camera) this.renderer.camera.restore(st.camera);
    else this.renderer.camera.resetView();
  }

  private makeGame(state = createInitialState()): Game {
    const g = new Game(state, { analytics: (n, p) => this.analytics.track(n, p) });
    this.unsubSave?.();
    const a = this.analytics;
    const offs = [
      ...SAVE_TRIGGERS.map((ev) => g.bus.on(ev, () => this.requestSave())),
      // Gameplay → analytics (anonymous ids and numbers only).
      g.bus.on('levelUp', (e) => a.track('level_up', { level: e.level })),
      g.bus.on('questCompleted', (e) => a.track(e.id === 'first_sale' ? 'first_sale' : 'goal_completed', { id: e.id })),
      g.bus.on('missionClaimed', (e) => a.track('mission_claimed', { kind: e.kind, id: e.id })),
      g.bus.on('premiumGranted', (e) => PREMIUM_MAP[e.productId as keyof typeof PREMIUM_MAP]?.category === 'cosmetic' && a.track('cosmetic_unlocked', { product: e.productId })),
    ];
    this.unsubSave = () => offs.forEach((o) => o());
    return g;
  }

  /** 8–9. Offline rewards + welcome back, then start simulating. */
  private enterGame(): void {
    this.ui.menus.close();
    this.inGame = true;
    this.checkOffline();
    this.audio.unlock();
  }

  private checkOffline(): void {
    const res = this.game.offline.compute(Date.now());
    const pending = this.game.state.pendingOffline;
    if (res || (pending && !pending.claimed)) {
      const p = this.game.state.pendingOffline!;
      this.ui.showWelcomeBack(p.seconds, p.amount);
    }
    this.save();
  }

  private newGame(): void {
    const settings = this.game?.state.settings;
    this.saves.reset();
    const state = createInitialState(Date.now());
    if (settings) state.settings = settings;
    this.game = this.makeGame(state);
    this.renderer.setGame(this.game);
    this.renderer.camera.resetView();
    this.renderer.camera.snap();
    this.ui.setGame(this.game);
    this.save();
    this.analytics.track('game_started', {});
    this.enterGame();
  }

  requestSave(): void {
    if (this.saveSoon < 0) this.saveSoon = 1.0;
  }

  save(): void {
    if (!this.game) return;
    // Camera view is a preference: kept only when "remember camera view" is on.
    if (this.renderer && this.game.state.settings.rememberCamera) this.game.state.camera = this.renderer.camera.pose();
    else delete this.game.state.camera;
    if (this.saves.save(this.game.state, Date.now())) return;
    console.warn('[save] failed', this.saves.lastError);
    this.analytics.track('save_failed', { reason: String(this.saves.lastError ?? '').slice(0, 80) });
    // Tell the player (at most every 5 minutes) instead of failing silently.
    const now = Date.now();
    if (this.ui && now - this.saveFailToastAt > 5 * 60 * 1000) {
      this.saveFailToastAt = now;
      this.ui.toast(t('save.write_failed'), '💾', 'bad');
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.save();
      this.audio.suspend();
    } else {
      this.audio.resume();
      this.last = performance.now();
      if (this.inGame) this.checkOffline();
    }
  }

  private frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 30 && this.inGame) {
      // The device slept with the page open: treat the gap as offline time.
      this.checkOffline();
      dt = 0;
    }
    try {
      this.game.paused = !this.inGame || this.ui.blockingOverlay;
      this.game.update(dt);
      const vis = Math.min(dt, 0.1);
      this.renderer.render(vis);
      this.ui.update(vis);
      if (this.inGame) {
        this.autosave += dt;
        if (this.autosave > 15) {
          this.autosave = 0;
          this.save();
        }
      }
      // Pending saves (purchases, settings) flush even from the menus.
      if (this.saveSoon >= 0) {
        this.saveSoon -= Math.min(dt, 1);
        if (this.saveSoon < 0) this.save();
      }
    } catch (e) {
      // Never let a rendering/UI glitch kill the loop.
      console.error('[frame]', e);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

const app = new App();
(window as any).__tinyTycoon = app;
app.boot();
