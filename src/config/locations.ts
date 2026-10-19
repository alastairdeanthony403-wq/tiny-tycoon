export interface LocationDef {
  id: string;
  icon: string;
  unlockCost: number;
  requiredLevel: number;
  requiredRepTier: number;
  trafficMult: number;
  spendMult: number;
  /** Multiplier on build/upgrade costs for this location. */
  costMult: number;
  startStage: number;
  startDepartments: string[];
  customerWeights: Record<string, number>;
  /** Special nighttime/airport/etc. mechanics. */
  special?: 'night' | 'tourists' | 'busy' | 'downtown' | 'countryside' | 'shoppers';
  theme: { ground: string; ground2: string; road: string; accent: string; sky: string; night?: boolean };
}

export const LOCATIONS: LocationDef[] = [
  { id: 'neighborhood', icon: '🏡', unlockCost: 0, requiredLevel: 1, requiredRepTier: 1, trafficMult: 1, spendMult: 1, costMult: 1, startStage: 0, startDepartments: ['snacks'], customerWeights: {}, theme: { ground: '#8fd16a', ground2: '#7cc05a', road: '#6c757d', accent: '#ff8fab', sky: '#bde0fe' } },
  { id: 'downtown', icon: '🏙️', unlockCost: 25000, requiredLevel: 10, requiredRepTier: 3, trafficMult: 1.6, spendMult: 1.15, costMult: 1.5, startStage: 2, startDepartments: ['snacks', 'drinks'], customerWeights: { office: 3, impatient: 2, rich: 1.2 }, special: 'downtown', theme: { ground: '#adb5bd', ground2: '#9aa3ab', road: '#495057', accent: '#4361ee', sky: '#caf0f8' } },
  { id: 'countryside', icon: '🌾', unlockCost: 60000, requiredLevel: 11, requiredRepTier: 3, trafficMult: 1.2, spendMult: 1.1, costMult: 1.8, startStage: 2, startDepartments: ['snacks', 'drinks'], customerWeights: { regular: 3, foodie: 2, child: 1.5 }, special: 'countryside', theme: { ground: '#a7c957', ground2: '#8fbc4a', road: '#6c757d', accent: '#bc6c25', sky: '#d8f3dc' } },
  { id: 'beach', icon: '🏖️', unlockCost: 150000, requiredLevel: 13, requiredRepTier: 3, trafficMult: 1.4, spendMult: 1.3, costMult: 2.2, startStage: 2, startDepartments: ['snacks', 'drinks'], customerWeights: { tourist: 4, child: 2 }, special: 'tourists', theme: { ground: '#ffe5a5', ground2: '#f9d77e', road: '#48cae4', accent: '#00b4d8', sky: '#90e0ef' } },
  { id: 'shopping', icon: '🛍️', unlockCost: 350000, requiredLevel: 14, requiredRepTier: 4, trafficMult: 1.9, spendMult: 1.4, costMult: 2.8, startStage: 3, startDepartments: ['snacks', 'drinks'], customerWeights: { rich: 2, regular: 2, foodie: 1.5, child: 1 }, special: 'shoppers', theme: { ground: '#e9ecef', ground2: '#dee2e6', road: '#495057', accent: '#ff006e', sky: '#ffe5ec' } },
  { id: 'airport', icon: '✈️', unlockCost: 900000, requiredLevel: 16, requiredRepTier: 4, trafficMult: 2.2, spendMult: 1.6, costMult: 3.5, startStage: 3, startDepartments: ['snacks', 'drinks', 'cafe'], customerWeights: { office: 3, impatient: 3, rich: 2, tourist: 2 }, special: 'busy', theme: { ground: '#ced4da', ground2: '#bfc6cc', road: '#343a40', accent: '#f77f00', sky: '#e0fbfc' } },
  { id: 'night_market', icon: '🏮', unlockCost: 4000000, requiredLevel: 19, requiredRepTier: 5, trafficMult: 1.8, spendMult: 2.0, costMult: 5, startStage: 3, startDepartments: ['snacks', 'drinks', 'bakery'], customerWeights: { foodie: 3, tourist: 2, rich: 1.5 }, special: 'night', theme: { ground: '#3c096c', ground2: '#5a189a', road: '#240046', accent: '#ff9e00', sky: '#10002b', night: true } },
];

export const LOCATION_MAP: Record<string, LocationDef> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
