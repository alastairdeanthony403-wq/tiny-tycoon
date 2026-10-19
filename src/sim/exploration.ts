import type { Game } from './game';
import { MAPS, mapFor, type ArtefactDef, type MapDef } from '../world/maps';
import { artefactPos, plotOrigin, plotById } from '../world/gen';

export interface ArtefactFind {
  id: string;
  gems: number;
  cash: number;
}

/** Interaction radius (tiles) around an artefact for a tap to count. */
export const ARTEFACT_RADIUS = 1.1;

const ALL = new Map<string, { map: MapDef; def: ArtefactDef }>(Object.values(MAPS).flatMap((map) => map.artefacts.map((def) => [def.id, { map, def }] as const)));

/**
 * ExplorationManager: discoverable artefacts hidden around the world maps. Each one can be found
 * once per save; its reward goes through the central economy (cash) and the Gem ledger (Gems),
 * keyed so it can never be paid twice, even across reloads.
 */
export class ExplorationManager {
  constructor(private game: Game) {}

  get found(): string[] {
    return this.game.state.exploration.found;
  }

  isFound(id: string): boolean {
    return this.found.includes(id);
  }

  /** Artefacts of the active location's map. */
  here(): ArtefactDef[] {
    return mapFor(this.game.shop.locationId).artefacts;
  }

  /** Artefact positions in the active shop's coordinates (the world is drawn around the shop). */
  positions(): { def: ArtefactDef; x: number; y: number }[] {
    const map = mapFor(this.game.shop.locationId);
    const o = plotOrigin(map, plotById(map, this.game.shop.plotId));
    return map.artefacts.map((def) => {
      const w = artefactPos(map, def);
      return { def, x: w.x - o.x, y: w.y - o.y };
    });
  }

  /** The undiscovered artefact (if any) within reach of a ground point in shop coordinates. */
  near(x: number, y: number, radius = ARTEFACT_RADIUS): ArtefactDef | null {
    let best: ArtefactDef | null = null;
    let bestD = radius;
    for (const p of this.positions()) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestD && !this.isFound(p.def.id)) {
        best = p.def;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * Records a discovery and pays its reward once. Fails safely (null) for unknown ids, artefacts of
   * another map than the active shop's, and ones already found.
   */
  discover(id: string): ArtefactFind | null {
    const entry = ALL.get(id);
    if (!entry || entry.map.id !== mapFor(this.game.shop.locationId).id || this.isFound(id)) return null;
    this.found.push(id);
    const g = this.game;
    const gems = entry.def.reward.gems ? g.store.earnOnce(`artefact:${id}`, entry.def.reward.gems, 'artefact') : 0;
    const cash = entry.def.reward.cash ? g.economy.earn(entry.def.reward.cash, false) : 0;
    g.bus.emit('artefactFound', { id, gems, cash });
    g.analytics('artefact_found', { id });
    return { id, gems, cash };
  }

  /** Discovered / total across every map. */
  progress(): { found: number; total: number } {
    return { found: this.found.filter((id) => ALL.has(id)).length, total: ALL.size };
  }
}
