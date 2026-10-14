import type { Game } from '../sim/game';
import type { Renderer, PickResult } from '../render/renderer';
import type { AudioManager, SfxName } from '../audio/audio';
import type { Haptics } from '../services/haptics';
import type { NotificationService } from '../services/notifications';
import type { AppApi, ConfirmOpts, PlacementRequest } from './api';
import type { Dir } from '../core/types';
import type { Panel } from './panel';
import { el, setText, toggle, pulse } from './dom';
import { Toasts, floatText, setUICtx } from './components';
import { Hud } from './hud';
import { Inspector } from './inspector';
import { Popups } from './popups';
import { Tutorial } from './tutorial';
import { Menus } from './menus';
import type { MenuHooks } from './menus';
import { DebugPanel } from './debug';
import { ShopPanel } from './panels/shop';
import { UpgradesPanel } from './panels/upgrades';
import { ProductsPanel } from './panels/products';
import { StaffPanel } from './panels/staff';
import { MapPanel } from './panels/map';
import { PremiumShop } from './premiumShop';
import type { PurchaseController } from '../monetization/controller';
import { OBJECT_MAP } from '../config/objects';
import { getProduct } from '../config/products';
import { DEPARTMENT_MAP } from '../config/departments';
import { LOCATION_MAP } from '../config/locations';
import { STAFF_MAP } from '../config/staff';
import { MILESTONES, ACHIEVEMENTS } from '../config/achievements';
import { EVENT_MAP } from '../config/events';
import { UPGRADES } from '../config/upgrades';
import { PRODUCTS } from '../config/products';
import { DEPARTMENTS } from '../config/departments';
import { STAFF } from '../config/staff';
import { LOCATIONS } from '../config/locations';
import { formatMoney, formatDuration } from '../core/format';
import { t } from '../core/i18n';
import { unlockLine } from './unlocks';

const NAV = [
  { id: 'shop', icon: '🏪' },
  { id: 'upgrades', icon: '⬆️' },
  { id: 'products', icon: '🛍️' },
  { id: 'staff', icon: '🧑‍💼' },
  { id: 'map', icon: '🗺️' },
];

interface PlacementState {
  req: PlacementRequest;
  dir: Dir;
}

export interface UIHooks extends MenuHooks {
  debugEnabled: boolean;
  store: () => PurchaseController;
}

/** UIManager: owns all DOM UI, routes input, and turns game events into feedback. */
export class UIManager implements AppApi {
  game: Game;
  activePanel: string | null = null;
  private hud: Hud;
  private navEl: HTMLElement;
  private navBadges = new Map<string, HTMLElement>();
  private panels = new Map<string, Panel>();
  private panelHost: HTMLElement;
  private inspector: Inspector;
  popups = new Popups();
  private toasts = new Toasts();
  private tutorial: Tutorial;
  menus: Menus;
  premium: PremiumShop;
  private hooks: UIHooks;
  private debug: DebugPanel | null = null;
  private placementBar: HTMLElement;
  private placementTitle: HTMLElement;
  private placement: PlacementState | null = null;
  private unsub: (() => void)[] = [];
  private refreshTimer = 0;
  private badgeTimer = 0;
  private pendingProductPopups: string[] = [];
  private hammerTimer = 0;
  private lowStockToastAt = 0;
  private fps = 60;
  private lastChromeBottom = '';
  private tutState = { activePanel: null as string | null, inspectorUid: 0, placing: false };

  constructor(
    root: HTMLElement,
    private canvas: HTMLCanvasElement,
    game: Game,
    private renderer: Renderer,
    private audio: AudioManager,
    private haptics: Haptics,
    private notifications: NotificationService,
    hooks: UIHooks,
  ) {
    this.game = game;
    setUICtx({ sfx: (n) => this.sfx(n), haptic: (p) => this.haptics.vibrate(p), balance: () => this.game.state.player.money, stars: () => this.game.state.player.stars });
    this.hud = new Hud(this, () => this.openPause(), hooks.debugEnabled ? () => this.debug?.toggle() : null);
    this.navEl = el('nav', { class: 'bottom-nav', 'aria-label': t('nav.label') });
    for (const n of NAV) {
      const badge = el('span', { class: 'nav-badge hidden' });
      this.navBadges.set(n.id, badge);
      this.navEl.append(
        el('button', { class: 'nav-btn', 'data-nav': n.id, 'aria-label': t(`nav.${n.id}`), onclick: () => { this.sfx('click'); this.openPanel(this.activePanel === n.id ? null : n.id); } }, el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, n.icon), el('span', { class: 'nav-label' }, t(`nav.${n.id}`)), badge),
      );
    }
    this.panels.set('shop', new ShopPanel(this));
    this.panels.set('upgrades', new UpgradesPanel(this));
    this.panels.set('products', new ProductsPanel(this));
    this.panels.set('staff', new StaffPanel(this));
    this.panels.set('map', new MapPanel(this));
    this.panelHost = el('div', { class: 'panel-host hidden' }, el('button', { class: 'panel-close', 'aria-label': t('ui.close'), onclick: () => this.openPanel(null) }, '✕'), ...[...this.panels.values()].map((p) => p.el));
    this.inspector = new Inspector(this);
    this.placementTitle = el('b');
    this.placementBar = el(
      'div',
      { class: 'placement-bar hidden', role: 'toolbar' },
      el('div', { class: 'pb-text' }, this.placementTitle, el('small', {}, t('build.instructions'))),
      el('div', { class: 'row' }, el('button', { class: 'btn btn-small', 'data-tut': 'place-auto', onclick: () => this.autoPlace() }, `✨ ${t('build.auto')}`), el('button', { class: 'btn btn-small', onclick: () => this.rotatePlacement() }, `⟳ ${t('insp.rotate')}`), el('button', { class: 'btn btn-small btn-primary', onclick: () => this.confirmHover() }, `✓ ${t('build.place_here')}`), el('button', { class: 'btn btn-small btn-ghost', onclick: () => this.cancelPlacement() }, `✕ ${t('ui.cancel')}`)),
    );
    this.hooks = hooks;
    this.premium = new PremiumShop(this, hooks.store, renderer);
    this.tutorial = new Tutorial(this, renderer, this.tutState);
    this.menus = new Menus(this, hooks);
    if (hooks.debugEnabled) this.debug = new DebugPanel(this, { resetSave: hooks.resetSave, store: hooks.store });
    this.popups.onOpenChange = () => {};
    root.append(this.hud.el, this.panelHost, this.inspector.el, this.placementBar, this.premium.previewBarEl, this.navEl, this.toasts.el, this.tutorial.el, this.premium.el, this.popups.el, this.menus.el);
    if (this.debug) root.append(this.debug.el);
    this.bindInput();
    this.bindGame();
    this.applySettings();
  }

  // ----------------------------------------------------------------- AppApi

  sfx(name: SfxName): void {
    this.audio.play(name);
  }

  toast(text: string, icon = 'ℹ️', kind: 'info' | 'good' | 'bad' | 'gold' = 'info'): void {
    this.toasts.show(text, icon, kind);
  }

  spendFeedback(amount: number): void {
    if (amount > 0) floatText(this.hud.money.el, `-${formatMoney(amount)}`, 'spend');
  }

  confirm(o: ConfirmOpts): void {
    this.popups.push({ icon: o.icon, title: o.title, body: o.text, kind: 'confirm', buttons: [{ label: o.okLabel, primary: !o.danger, danger: o.danger, onClick: o.onOk }, { label: t('ui.cancel') }] }, true);
  }

  saveNow(): void {
    this.hooks.saveNow();
  }

  openPremium(tab: 'featured' | 'cosmetic' | 'gems' | 'convenience' = 'featured'): void {
    this.sfx('swoosh');
    this.premium.endPreview();
    this.premium.show(tab);
  }

  showAchievements(): void {
    this.menus.achievementsFromGame();
  }

  openMissions(): void {
    this.menus.missionsFromGame();
  }

  skipTutorial(): void {
    this.confirm({ icon: '⏭️', title: t('tut.skip'), text: t('tut.skip_confirm'), okLabel: t('tut.skip'), onOk: () => this.hooks.skipTutorial() });
  }

  openPanel(id: string | null): void {
    if (id && this.placement) this.cancelPlacement();
    this.activePanel = id;
    if (id) this.inspector.close();
    for (const [pid, p] of this.panels) {
      toggle(p.el, 'active', pid === id);
      if (pid === id) p.refresh(true);
    }
    toggle(this.panelHost, 'hidden', !id);
    for (const b of this.navEl.querySelectorAll('.nav-btn')) {
      const on = (b as HTMLElement).dataset.nav === id;
      toggle(b as HTMLElement, 'active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (id) this.sfx('swoosh');
  }

  setGame(game: Game): void {
    this.game = game;
    this.premium.close();
    this.premium.endPreview();
    this.popups.clearAll();
    this.inspector.close();
    this.cancelPlacement();
    this.openPanel(null);
    this.bindGame();
    this.applySettings();
    for (const p of this.panels.values()) p.refresh(true);
  }

  openPause(): void {
    this.sfx('click');
    this.menus.pause();
  }

  get blockingOverlay(): boolean {
    return this.menus.open;
  }

  applySettings(): void {
    const s = this.game.state.settings;
    document.documentElement.style.setProperty('--ui-scale', String(s.textScale));
    toggle(document.documentElement, 'colorblind', s.colorblind);
    toggle(document.documentElement, 'reduce-motion', s.reduceFlashing);
    this.audio.musicEnabled = s.musicEnabled;
    this.audio.sfxEnabled = s.audioEnabled;
    this.audio.musicVolume = s.musicVolume;
    this.audio.sfxVolume = s.sfxVolume;
    this.audio.applyVolumes();
    this.haptics.enabled = s.vibrationEnabled;
    this.notifications.enabled = s.notificationsEnabled;
  }

  // ------------------------------------------------------------- per frame

  update(dt: number): void {
    this.fps = this.fps * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
    this.hud.update(dt);
    this.refreshTimer += dt;
    if (this.refreshTimer > 0.2) {
      this.refreshTimer = 0;
      if (this.activePanel) this.panels.get(this.activePanel)?.refresh();
      this.premium.tick();
      this.inspector.refresh();
      this.debug?.update(this.fps);
      this.audio.setAmbience(this.game.world.customers.length);
    }
    this.badgeTimer += dt;
    if (this.badgeTimer > 0.6) {
      this.badgeTimer = 0;
      this.updateBadges();
    }
    if (this.pendingProductPopups.length) this.flushProductPopups();
    // Construction hammering
    if (this.game.shop.construction) {
      this.hammerTimer -= dt;
      if (this.hammerTimer <= 0) {
        this.hammerTimer = 0.45;
        this.sfx('hammer');
      }
    }
    // Music follows the action
    const g = this.game;
    this.audio.setMood(g.events.isActive('rush_hour') ? 'rush' : LOCATION_MAP[g.shop.locationId]?.theme.night ? 'night' : g.slowmo > 0 ? 'celebration' : 'normal');
    // Layout: tell the renderer which screen areas are covered by UI.
    const hudBottom = (this.hud.el.querySelector('.hud-top') as HTMLElement)?.getBoundingClientRect().bottom ?? 60;
    const navTop = this.navEl.getBoundingClientRect().top;
    const vh = window.innerHeight;
    const wide = window.innerWidth >= 900;
    const shortSide = window.innerHeight <= 520 && window.innerWidth >= 600; // landscape phone: side panels
    const panelOpen = !!this.activePanel;
    let bottom = vh - navTop;
    let right = 0;
    if (this.inspector.open) {
      if (shortSide) right = Math.max(right, this.inspector.el.getBoundingClientRect().width + 8);
      else bottom = Math.max(bottom, vh - this.inspector.el.getBoundingClientRect().top);
    }
    if (panelOpen) {
      if (wide || shortSide) right = Math.max(right, this.panelHost.getBoundingClientRect().width + 8);
      else bottom = Math.max(bottom, vh - this.panelHost.getBoundingClientRect().top);
    }
    if (this.placement) bottom = Math.max(bottom, vh - this.placementBar.getBoundingClientRect().top);
    if (this.premium.previewing) bottom = Math.max(bottom, vh - this.premium.previewBarEl.getBoundingClientRect().top);
    // The goals/event column must never cover the shop: in landscape it reserves a left strip,
    // in portrait the space below it (it is compact when collapsed).
    let top = hudBottom + 6;
    let left = 0;
    const hl = (this.hud.el.querySelector('.hud-left') as HTMLElement | null)?.getBoundingClientRect();
    if (hl && hl.height > 0) {
      if (window.innerWidth > window.innerHeight) left = hl.right + 6;
      else top = Math.max(top, hl.bottom + 6);
    }
    this.renderer.insets = { top, bottom: bottom + 6, right, left };
    // Toasts float just above whatever bottom chrome is open, so they never cover panels or buttons.
    const cb = `${Math.round(bottom + 10)}px`;
    if (this.lastChromeBottom !== cb) {
      this.lastChromeBottom = cb;
      document.documentElement.style.setProperty('--chrome-bottom', cb);
    }
    this.tutState.activePanel = this.activePanel;
    this.tutState.inspectorUid = this.inspector.uid;
    this.tutState.placing = !!this.placement;
    this.tutorial.update();
    this.renderer.selectedUid = this.inspector.uid;
  }

  private updateBadges(): void {
    const g = this.game;
    const set = (id: string, n: number) => {
      const b = this.navBadges.get(id)!;
      setText(b, n > 9 ? '9+' : String(n));
      toggle(b, 'hidden', n <= 0);
    };
    let shop = g.shop.pendingPlacements.length + (g.shopMgr.canExpand().ok ? 1 : 0);
    for (const d of DEPARTMENTS) if (g.shopMgr.canUnlockDepartment(d.id).ok) shop++;
    let upg = 0;
    for (const u of UPGRADES) if (g.upgrades.canBuy(u.id).ok) upg++;
    let prod = 0;
    for (const p of PRODUCTS) if (g.progression.canUnlockProduct(p.id).ok) prod++;
    let staff = 0;
    for (const s of STAFF) if (g.employees.canHire(s.id).ok) staff++;
    let map = g.achievements.claimableCount() + (g.prestige.canFranchise().ok ? 1 : 0);
    for (const l of LOCATIONS) if (g.locations.canUnlock(l.id).ok) map++;
    set('shop', shop);
    set('upgrades', upg);
    set('products', prod);
    set('staff', staff);
    set('map', map);
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; type: string }>();
    let dragging = false;
    let pinchDist = 0;
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), type: e.pointerType });
      dragging = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (this.placement && e.pointerType === 'mouse' && !p) {
        this.setHover(this.renderer.tileAt(e.offsetX, e.offsetY));
        return;
      }
      if (!p) return;
      if (pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.renderer.camera.zoomBy(d / pinchDist);
        pinchDist = d;
        dragging = true;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) dragging = true;
      if (dragging) this.renderer.camera.pan(dx, dy, 400);
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.placement && e.pointerType === 'mouse') this.setHover(this.renderer.tileAt(e.offsetX, e.offsetY));
    });
    const end = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (!p) return;
      if (!dragging && pointers.size === 0 && performance.now() - p.t < 600) this.tap(e.offsetX, e.offsetY, p.type);
      if (pointers.size === 0) dragging = false;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      dragging = false;
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.renderer.camera.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      },
      { passive: false },
    );
    c.addEventListener('dblclick', () => this.renderer.camera.resetUser());
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      this.audio.unlock();
      if (e.key === 'Escape') {
        if (this.popups.open) return;
        if (this.premium.open) this.premium.close();
        else if (this.premium.previewing) this.premium.endPreview();
        else if (this.menus.open) this.menus.close();
        else if (this.placement) this.cancelPlacement();
        else if (this.inspector.open) this.inspector.close();
        else if (this.activePanel) this.openPanel(null);
        else this.openPause();
        return;
      }
      if (this.menus.open || this.popups.open) return;
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (idx >= 0) this.openPanel(this.activePanel === NAV[idx].id ? null : NAV[idx].id);
      if (e.key === 'r' || e.key === 'R') this.placement ? this.rotatePlacement() : null;
      if (e.key === 'Enter' && this.placement) this.confirmHover();
      if (e.key === '+' || e.key === '=') this.renderer.camera.zoomBy(1.15);
      if (e.key === '-') this.renderer.camera.zoomBy(1 / 1.15);
      if (e.key === '0') this.renderer.camera.resetUser();
    });
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
  }

  private tap(px: number, py: number, type: string): void {
    const g = this.game;
    if (this.placement) {
      const tile = this.renderer.tileAt(px, py);
      const hover = this.renderer.placement?.hover;
      if (type === 'mouse' || (hover && hover.x === tile.x && hover.y === tile.y)) this.placeAt(tile.x, tile.y);
      else this.setHover(tile);
      return;
    }
    const pick: PickResult = this.renderer.pick(px, py);
    if (!pick) {
      this.inspector.close();
      return;
    }
    switch (pick.type) {
      case 'openSign':
        if (!g.shop.open) {
          g.shopMgr.openShop();
          this.sfx('register');
          this.haptics.vibrate(30);
          this.toast(t('toast.shop_open'), '🎉', 'good');
        } else this.toast(t('toast.already_open'), '🏪');
        break;
      case 'crate':
        if (g.events.collectCrate()) this.haptics.vibrate(30);
        break;
      case 'object': {
        const o = g.shopMgr.getObject(pick.uid);
        if (!o) break;
        const def = OBJECT_MAP[o.kind];
        if (def.category === 'display' && g.inventory.status(o) !== 'ok' && g.inventory.manualRestock(o.uid)) this.sfx('restock');
        if (o.kind === 'checkout' && g.checkout.tapBoost(o.uid)) this.sfx('click');
        if (this.activePanel) this.openPanel(null);
        this.inspector.show(o.uid);
        this.sfx('pop');
        break;
      }
      case 'dirt':
        if (g.shopMgr.clean(pick.x, pick.y, true)) this.sfx('pop');
        break;
      case 'expansion':
        this.promptExpansion();
        break;
      default:
        this.inspector.close();
    }
  }

  private promptExpansion(): void {
    const g = this.game;
    const next = g.shopMgr.nextExpansion();
    if (!next) return;
    const can = g.shopMgr.canExpand();
    if (!can.ok && can.reason !== 'money') {
      this.toast(can.reason === 'level' ? t('toast.expand_level', { n: next.requiredLevel }) : t(`reason.${can.reason}`), '🔒', 'bad');
      return;
    }
    const cost = g.shopMgr.expansionCost() ?? 0;
    this.popups.push({
      icon: '🏗️',
      title: t('shop.expand_title'),
      subtitle: `${g.shop.size}×${g.shop.size} → ${next.size}×${next.size}`,
      body: t('shop.expand_confirm', { cost: formatMoney(cost), tiles: next.size * next.size - g.shop.size * g.shop.size }),
      kind: 'confirm',
      buttons: [
        {
          label: `🔨 ${t('shop.expand_btn')} ${formatMoney(cost)}`,
          primary: true,
          onClick: () => {
            if (g.shopMgr.expand()) this.spendFeedback(cost);
            else {
              this.sfx('error');
              this.toast(t('reason.money'), '💷', 'bad');
            }
          },
        },
        { label: t('ui.cancel') },
      ],
    });
  }

  // -------------------------------------------------------------- placement

  startPlacement(req: PlacementRequest): void {
    this.openPanel(null);
    this.inspector.close();
    const g = this.game;
    const dir: Dir = req.mode === 'move' ? g.shopMgr.getObject(req.uid)?.dir ?? 1 : 1;
    this.placement = { req, dir };
    const free = req.mode !== 'buy';
    setText(this.placementTitle, `${OBJECT_MAP[req.kind]?.icon ?? ''} ${t(req.mode === 'move' ? 'build.moving' : 'build.placing', { name: t(`object.${req.kind}`) })}${free ? '' : ` · ${formatMoney(g.shopMgr.objectCost(req.kind))}`}`);
    toggle(this.placementBar, 'hidden', false);
    this.recomputeValid();
    const spot = g.shopMgr.findSpot(req.kind, req.mode === 'move' ? req.uid : 0);
    if (this.renderer.placement) this.renderer.placement.hover = spot ? { x: spot.x, y: spot.y } : null;
    if (!spot) this.toast(t('build.no_space'), '📐', 'bad');
  }

  private recomputeValid(): void {
    const p = this.placement;
    if (!p) return;
    const g = this.game;
    const ignore = p.req.mode === 'move' ? p.req.uid : 0;
    const valid = new Map<string, { ok: boolean; dir: Dir }>();
    for (let y = 0; y < g.shop.size; y++) for (let x = 0; x < g.shop.size; x++) {
      const r = g.shopMgr.canPlace(p.req.kind, x, y, p.dir, ignore);
      valid.set(`${x},${y}`, { ok: r.ok, dir: r.dir });
    }
    const hover = this.renderer.placement?.hover ?? null;
    this.renderer.placement = { kind: p.req.kind, dir: p.dir, ignoreUid: ignore, hover, valid };
  }

  private setHover(tile: { x: number; y: number }): void {
    if (this.renderer.placement) this.renderer.placement.hover = tile;
  }

  private rotatePlacement(): void {
    if (!this.placement) return;
    this.placement.dir = ((this.placement.dir + 1) % 4) as Dir;
    this.recomputeValid();
    this.sfx('click');
  }

  private autoPlace(): void {
    const p = this.placement;
    if (!p) return;
    const spot = this.game.shopMgr.findSpot(p.req.kind, p.req.mode === 'move' ? p.req.uid : 0);
    if (!spot) {
      this.toast(t('build.no_space'), '📐', 'bad');
      this.sfx('error');
      return;
    }
    p.dir = spot.dir;
    this.recomputeValid();
    this.placeAt(spot.x, spot.y);
  }

  private confirmHover(): void {
    const h = this.renderer.placement?.hover;
    if (h) this.placeAt(h.x, h.y);
  }

  private placeAt(x: number, y: number): void {
    const p = this.placement;
    if (!p) return;
    const g = this.game;
    const v = this.renderer.placement?.valid.get(`${x},${y}`);
    if (!v?.ok) {
      this.sfx('error');
      this.haptics.vibrate(40);
      pulse(this.placementBar, 'shake');
      const r = g.shopMgr.canPlace(p.req.kind, x, y, p.dir, p.req.mode === 'move' ? p.req.uid : 0);
      this.toast(t(`place.${r.reason ?? 'occupied'}`), '✗', 'bad');
      this.setHover({ x, y });
      return;
    }
    let ok = false;
    if (p.req.mode === 'buy') {
      const cost = g.shopMgr.objectCost(p.req.kind);
      ok = !!g.shopMgr.buy(p.req.kind, x, y, v.dir);
      if (ok) this.spendFeedback(cost);
    } else if (p.req.mode === 'move') ok = g.shopMgr.move(p.req.uid, x, y, v.dir);
    else ok = !!g.shopMgr.placePending(p.req.index, x, y, v.dir);
    if (ok) {
      this.haptics.vibrate(20);
      this.cancelPlacement();
    } else {
      this.sfx('error');
      const c = g.shopMgr.canBuy(p.req.kind);
      if (!c.ok) this.toast(t(`reason.${c.reason}`), '✗', 'bad');
    }
  }

  cancelPlacement(): void {
    this.placement = null;
    this.renderer.placement = null;
    toggle(this.placementBar, 'hidden', true);
  }

  // ---------------------------------------------------------- game feedback



  private flushProductPopups(): void {
    const ids = this.pendingProductPopups.splice(0);
    for (const id of ids) {
      const p = getProduct(id);
      if (!p) continue;
      this.sfx('newProduct');
      this.popups.push({ id: `prod-${id}`, icon: p.icon, title: t('popup.new_product'), subtitle: t(`product.${id}`), body: t(`product.${id}.desc`), kind: 'celebrate', buttons: [{ label: t('ui.ok'), primary: true }] });
    }
  }

  private bindGame(): void {
    for (const u of this.unsub) u();
    const b = this.game.bus;
    const g = () => this.game;
    this.unsub = [
      b.on('sale', (e) => {
        this.sfx('register');
        if (e.tip) this.sfx('coin');
      }),
      b.on('levelUp', (e) => {
        this.sfx('levelup');
        this.haptics.vibrate([30, 40, 30]);
        const list = el('div', { class: 'unlock-list' }, ...e.unlocks.slice(0, 8).map((u) => el('div', { class: 'unlock-item' }, unlockLine(u))));
        const reward = [e.reward.money ? `💷 ${formatMoney(e.reward.money)}` : '', e.reward.stars ? `🌟 ${e.reward.stars}` : ''].filter(Boolean).join('  ');
        this.popups.push({ id: `lvl-${e.level}`, icon: '⭐', title: t('popup.level_up'), subtitle: t('popup.level_n', { n: e.level }), body: el('div', {}, reward ? el('div', { class: 'reward-big' }, reward) : null, e.unlocks.length ? el('div', { class: 'unlock-head' }, t('popup.unlocked')) : null, list), kind: 'celebrate', buttons: [{ label: t('popup.awesome'), primary: true }] });
      }),
      b.on('productUnlocked', (e) => {
        this.pendingProductPopups.push(e.id);
      }),
      b.on('departmentUnlocked', (e) => {
        const d = DEPARTMENT_MAP[e.id];
        this.pendingProductPopups = this.pendingProductPopups.filter((p) => !d.freeProducts.includes(p));
        this.sfx('newProduct');
        this.popups.push({ icon: d.icon, title: t('popup.new_department'), subtitle: t(`dept.${e.id}`), body: el('div', {}, t(`dept.${e.id}.desc`), el('div', { class: 'unlock-list' }, ...d.freeProducts.map((p) => el('div', { class: 'unlock-item' }, `${getProduct(p)?.icon} ${t(`product.${p}`)}`)))), kind: 'celebrate', buttons: [{ label: t('ui.ok'), primary: true }] });
        if (g().shop.pendingPlacements.length) this.toast(t('toast.pending_place'), '🎁', 'gold');
      }),
      b.on('expansionStarted', () => {
        this.toast(t('toast.construction'), '🚧');
        this.inspector.close();
      }),
      b.on('expansionCompleted', (e) => {
        this.sfx('expansion');
        this.haptics.vibrate([40, 30, 60]);
        this.popups.push({ icon: '🏗️', title: t('popup.expanded'), subtitle: `${e.size}×${e.size}`, body: t('popup.expanded_body', { tiles: e.size * e.size }), kind: 'celebrate', buttons: [{ label: t('popup.awesome'), primary: true }] });
      }),
      b.on('employeeHired', (e) => {
        this.sfx('hire');
        this.toast(t('toast.hired', { name: e.name, role: t(`staff.${e.type}`) }), STAFF_MAP[e.type as keyof typeof STAFF_MAP]?.icon ?? '🧑', 'good');
      }),
      b.on('achievementUnlocked', (e) => {
        this.sfx('achievement');
        const a = ACHIEVEMENTS.find((x) => x.id === e.id);
        this.toasts.show(t('toast.achievement', { name: t(`ach.${e.id}`) }), a?.icon ?? '🏆', 'gold', 4500, { label: t('ui.claim'), fn: () => this.showAchievements() });
      }),
      b.on('milestone', (e) => {
        const m = MILESTONES.find((x) => x.id === e.id);
        this.sfx('achievement');
        this.popups.push({ icon: m?.icon ?? '🎉', title: t('popup.milestone'), subtitle: t(`milestone.${e.id}`), body: el('div', {}, t(`milestone.${e.id}.desc`), m?.money ? el('div', { class: 'reward-big' }, `💷 +${formatMoney(m.money)}`) : null), kind: 'gold', buttons: [{ label: t('popup.awesome'), primary: true }] });
      }),
      b.on('reputationTier', (e) => {
        if (!e.up) return;
        this.sfx('achievement');
        this.popups.push({ icon: '❤️', title: t('popup.reputation'), subtitle: `${'★'.repeat(e.tier)} ${t(`rep.${e.tier}`)}`, body: t('popup.reputation_body'), kind: 'gold', buttons: [{ label: t('ui.ok'), primary: true }] });
      }),
      b.on('eventOffered', (e) => {
        this.sfx('eventStart');
        this.notifications.notify('Tiny Tycoon', t(`event.${e.id}.offer`));
      }),
      b.on('eventStarted', (e) => {
        this.sfx('eventStart');
        this.toast(t(`event.${e.id}`), EVENT_MAP[e.id]?.icon ?? '🎪', 'gold');
      }),
      b.on('eventEnded', (e) => {
        if (e.id === 'rush_hour' && e.summary) {
          const s = e.summary;
          this.sfx(s.success ? 'levelup' : 'click');
          this.popups.push({ icon: '⏰', title: t('popup.rush_complete'), body: el('div', { class: 'rush-summary' }, el('div', {}, `${t('popup.served')}: ${s.served}`), el('div', {}, `${t('popup.lost')}: ${s.lost}`), s.success ? el('div', { class: 'reward-big' }, `${t('popup.bonus')} +${formatMoney(s.money)} · +${s.xp} XP`) : el('div', {}, t('popup.rush_fail'))), kind: s.success ? 'celebrate' : 'info', buttons: [{ label: t('ui.ok'), primary: true }] });
        }
      }),
      b.on('questCompleted', () => {
        this.sfx('coin');
        this.toast(t('toast.goal_done'), '✅', 'good');
      }),
      b.on('crateSpawned', () => this.toast(t('toast.crate'), '📦', 'gold')),
      b.on('crateCollected', () => this.sfx('crate')),
      b.on('purchaseFailed', (e) => {
        this.sfx('error');
        if (e.reason === 'insufficient_funds') this.toast(t('reason.money'), '💷', 'bad');
      }),
      b.on('objectPlaced', () => this.sfx('pop')),
      b.on('objectUpgraded', () => this.sfx('upgrade')),
      b.on('upgradePurchased', () => this.sfx('upgrade')),
      b.on('employeeLeveled', () => this.sfx('upgrade')),
      b.on('customerLeftAngry', () => this.sfx('angry')),
      b.on('outOfStock', (e) => {
        if (g().shop.staff.some((s) => s.type === 'stocker')) return;
        const now = performance.now();
        if (now - this.lowStockToastAt < 15000) return;
        this.lowStockToastAt = now;
        this.toast(t('toast.out_of_stock', { name: t(`product.${e.productId}`) }), '📦', 'bad');
      }),
      b.on('locationUnlocked', (e) => {
        this.sfx('expansion');
        const l = LOCATION_MAP[e.id];
        this.popups.push({ icon: l.icon, title: t('popup.new_location'), subtitle: t(`location.${e.id}`), body: t(`location.${e.id}.desc`), kind: 'celebrate', buttons: [{ label: t('map.visit'), primary: true, onClick: () => g().locations.switchTo(e.id) }, { label: t('ui.later') }] });
      }),
      b.on('locationSwitched', (e) => {
        this.inspector.close();
        this.toast(t('toast.welcome_to', { name: t(`location.${e.id}`) }), LOCATION_MAP[e.id]?.icon ?? '📍');
      }),
      b.on('franchised', (e) => {
        this.sfx('levelup');
        this.popups.push({ icon: '🏢', title: t('popup.franchised'), subtitle: t('popup.franchise_n', { n: e.count }), body: el('div', {}, t('popup.franchised_body'), el('div', { class: 'reward-big' }, `🌟 +${e.stars}`)), kind: 'gold', buttons: [{ label: t('popup.lets_go'), primary: true }] });
      }),
      b.on('offlineEarnings', (e) => {
        this.sfx('coin');
        this.toast(t('toast.collected', { amount: formatMoney(e.amount) }), '💷', 'good');
      }),
      b.on('premiumGranted', (e) => {
        this.premium.render();
        if (e.productId === 'bundle_seasonal_decorations') this.panels.get('shop')?.refresh(true);
      }),
      b.on('premiumRevoked', () => this.premium.render()),
      b.on('tutorialCompleted', (e) => {
        const next = this.game.quests.currentMain();
        const nextText = next?.def ? t(`quest.${next.id}`, { n: next.target }) : '';
        this.popups.push({
          icon: e.skipped ? '⏭️' : '🎓',
          title: t(e.skipped ? 'popup.tutorial_skipped' : 'popup.tutorial_done'),
          body: el('div', {}, el('p', {}, t('popup.tutorial_done_body')), nextText ? el('p', {}, el('b', {}, `${t('popup.next_goal')}: `), nextText) : null),
          kind: 'gold',
          buttons: [{ label: t('popup.lets_go'), primary: true }],
        });
      }),
      b.on('missionCompleted', (e) => {
        this.sfx('coin');
        this.toast(t(e.kind === 'daily' ? 'toast.daily_done' : 'toast.weekly_done'), '📅', 'good');
      }),
      b.on('adBoostEnded', () => this.toast(t('ads.ended'), '🚀', 'info')),
      // Keep prices, shortfalls and lock states current if Gems change while the store is open.
      b.on('gemsChanged', () => this.premium.render()),
      b.on('error', (e) => {
        if (this.debug) this.toast(`[${e.where}] ${e.message.slice(0, 80)}`, '🐞', 'bad');
      }),
    ];
  }

  /** "Welcome back" popup for offline earnings. */
  showWelcomeBack(seconds: number, amount: number): void {
    this.popups.push(
      {
        id: 'welcome',
        icon: '🌙',
        title: t('popup.welcome_back'),
        body: el('div', {}, el('p', {}, t('popup.welcome_body')), el('div', { class: 'stat-row' }, el('span', {}, t('popup.offline_time')), el('b', {}, formatDuration(seconds))), el('div', { class: 'reward-big' }, `💷 +${formatMoney(amount)}`), el('small', { class: 'hint' }, t('popup.offline_hint'))),
        kind: 'gold',
        buttons: [{ label: `💷 ${t('popup.collect')}`, primary: true, onClick: () => this.game.offline.claim() }],
      },
      true,
    );
  }
}
