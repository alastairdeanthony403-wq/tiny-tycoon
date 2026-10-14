import type { Game } from './game';
import { ECONOMY, scaledCost } from '../config/economy';
import { PERKS, PERK_MAP } from '../config/prestige';
import { THEME_MAP } from '../config/cosmetics';
import { createShop } from '../core/state';
import { MAIN_QUESTS } from '../config/quests';
import { EXPANSIONS } from '../config/expansions';

/** PrestigeManager: franchising (reset for Stars + permanent bonus), Head Office perks, cosmetics. */
export class PrestigeManager {
  constructor(private game: Game) {}

  canFranchise(): { ok: boolean; reason?: string } {
    const p = this.game.state.player;
    if (p.level < ECONOMY.prestige.minLevel) return { ok: false, reason: 'level' };
    if (p.runRevenue < ECONOMY.prestige.minRunRevenue) return { ok: false, reason: 'revenue' };
    return { ok: true };
  }

  starsForFranchise(runRevenue = this.game.state.player.runRevenue): number {
    if (runRevenue < ECONOMY.prestige.minRunRevenue) return 0;
    return Math.floor(Math.sqrt(runRevenue / ECONOMY.prestige.starsDivisor) * 3);
  }

  franchise(): boolean {
    if (!this.canFranchise().ok) return false;
    const g = this.game;
    const st = g.state;
    const stars = this.starsForFranchise();
    st.player.prestigeCount++;
    g.economy.addStars(stars);
    // Reset the run, keep permanent progress (stars, perks, achievements, cosmetics, lifetime stats).
    st.player.money = ECONOMY.startingCash + this.perkValue('start_cash');
    st.player.level = 1;
    st.player.xp = 0;
    st.player.runRevenue = 0;
    st.player.currentLocation = 'neighborhood';
    st.player.reputation = ECONOMY.reputation.tiers[Math.min(ECONOMY.reputation.tiers.length - 1, st.perks.fame ?? 0)] ?? 0;
    st.globalUpgrades = {};
    st.progression.unlockedLocations = ['neighborhood'];
    st.progression.unlockedProducts = ['crisps'];
    st.shops = { neighborhood: createShop('neighborhood') };
    const starter = st.perks.starter_pack ?? 0;
    const shop = st.shops.neighborhood;
    shop.open = true;
    if (starter >= 1) {
      shop.departments.push('drinks');
      st.progression.unlockedProducts.push('soda');
      shop.pendingPlacements.push({ kind: 'fridge', productId: 'soda' });
    }
    if (starter >= 2) st.progression.unlockedProducts.push('candy');
    if (starter >= 3) shop.stage = 1;
    shop.size = EXPANSIONS[shop.stage].size;
    st.events = { active: [], nextRollIn: ECONOMY.events.firstDelay };
    st.incomeBuckets = [];
    // Skip the tutorial part of the main quests on later runs.
    const firstNonTutorial = MAIN_QUESTS.findIndex((q) => !q.tutorial);
    st.progression.mainQuestIndex = Math.max(st.progression.mainQuestIndex, firstNonTutorial);
    st.progression.activeQuests = [];
    st.progression.tutorialDone = true;
    g.rebuildWorld();
    g.quests.startMain();
    g.shopMgr.autoPlacePending();
    g.bus.emit('franchised', { stars, count: st.player.prestigeCount });
    g.analytics('prestige_completed', { stars, count: st.player.prestigeCount });
    return true;
  }

  // ----------------------------------------------------------------- perks

  perkLevel(id: string): number {
    return this.game.state.perks[id] ?? 0;
  }

  perkValue(id: string): number {
    return this.perkLevel(id) * (PERK_MAP[id]?.perLevel ?? 0);
  }

  perkCost(id: string): number | null {
    const def = PERK_MAP[id];
    if (!def || this.perkLevel(id) >= def.maxLevel) return null;
    return scaledCost(def.baseCost, def.costGrowth, this.perkLevel(id));
  }

  buyPerk(id: string): boolean {
    const c = this.perkCost(id);
    if (c === null || !this.game.economy.spendStars(c)) return false;
    this.game.state.perks[id] = this.perkLevel(id) + 1;
    this.game.bus.emit('upgradePurchased', { id: `perk:${id}`, level: this.perkLevel(id) });
    return true;
  }

  perks() {
    return PERKS;
  }

  // ------------------------------------------------------------- cosmetics

  themeAvailable(id: string): boolean {
    const t = THEME_MAP[id];
    if (!t) return false;
    if (this.game.state.cosmetics.unlockedThemes.includes(id)) return true;
    // Seasonal themes are free while their season is running.
    return !!t.season && this.game.mods.seasons().some((s) => s.theme === id);
  }

  buyTheme(id: string): boolean {
    const t = THEME_MAP[id];
    if (!t || this.themeAvailable(id)) return false;
    if (!this.game.economy.spendStars(t.starCost)) return false;
    this.game.state.cosmetics.unlockedThemes.push(id);
    return true;
  }

  setTheme(id: string): boolean {
    if (!this.themeAvailable(id)) return false;
    this.game.state.cosmetics.theme = id;
    this.game.bus.emit('stateChanged', { reason: 'theme' });
    return true;
  }
}
