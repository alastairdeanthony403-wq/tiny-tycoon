export interface EventDef {
  id: string;
  icon: string;
  duration: number;
  weight: number;
  minLevel: number;
  /** Optional events are offered to the player first. */
  optional: boolean;
  effects: {
    spawnMult?: number;
    priceMult?: number;
    costMult?: number;
    machinesOff?: boolean;
    patienceMult?: number;
  };
  requiresMachines?: boolean;
}

export const EVENTS: EventDef[] = [
  { id: 'rush_hour', icon: '⏰', duration: 45, weight: 3, minLevel: 3, optional: true, effects: { spawnMult: 3.2, priceMult: 1.25 } },
  { id: 'supplier_discount', icon: '🏷️', duration: 60, weight: 2, minLevel: 2, optional: false, effects: { costMult: 0.5 } },
  { id: 'celebrity_visit', icon: '🌟', duration: 40, weight: 1, minLevel: 5, optional: false, effects: { spawnMult: 1.3 } },
  { id: 'power_cut', icon: '🔌', duration: 20, weight: 1, minLevel: 6, optional: false, effects: { machinesOff: true }, requiresMachines: true },
  { id: 'mystery_delivery', icon: '📦', duration: 30, weight: 2, minLevel: 2, optional: false, effects: {} },
  { id: 'local_festival', icon: '🎪', duration: 90, weight: 1.5, minLevel: 4, optional: false, effects: { spawnMult: 1.8, patienceMult: 1.2 } },
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Rush hour success = lost customers at most this many. */
export const RUSH_MAX_LOST_FOR_BONUS = 3;
