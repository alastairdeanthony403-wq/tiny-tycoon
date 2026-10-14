export type StaffType = 'cashier' | 'stocker' | 'cleaner' | 'chef' | 'manager';

export interface StaffDef {
  id: StaffType;
  icon: string;
  hireCost: number;
  hireGrowth: number;
  /** Wage per minute. */
  salary: number;
  requiredLevel: number;
  requiredDepartmentAny?: string[];
  maxBase: number;
  /** Extra hires allowed per expansion stage. */
  maxPerStage: number;
  levelUpBase: number;
  levelUpGrowth: number;
  color: string;
}

export const STAFF: StaffDef[] = [
  { id: 'cashier', icon: '🧑‍💼', hireCost: 300, hireGrowth: 2.2, salary: 5, requiredLevel: 3, maxBase: 1, maxPerStage: 0.5, levelUpBase: 200, levelUpGrowth: 2.4, color: '#3a86ff' },
  { id: 'stocker', icon: '📦', hireCost: 300, hireGrowth: 2.2, salary: 5, requiredLevel: 3, maxBase: 1, maxPerStage: 0.5, levelUpBase: 200, levelUpGrowth: 2.4, color: '#fb8500' },
  { id: 'cleaner', icon: '🧹', hireCost: 600, hireGrowth: 2.4, salary: 6, requiredLevel: 6, maxBase: 1, maxPerStage: 0.25, levelUpBase: 400, levelUpGrowth: 2.4, color: '#2a9d8f' },
  { id: 'chef', icon: '👩‍🍳', hireCost: 1200, hireGrowth: 2.4, salary: 10, requiredLevel: 5, requiredDepartmentAny: ['bakery', 'cafe'], maxBase: 1, maxPerStage: 0.25, levelUpBase: 900, levelUpGrowth: 2.4, color: '#ffffff' },
  { id: 'manager', icon: '🕴️', hireCost: 8000, hireGrowth: 4, salary: 30, requiredLevel: 12, maxBase: 1, maxPerStage: 0, levelUpBase: 6000, levelUpGrowth: 2.6, color: '#2b2d42' },
];

export const STAFF_MAP: Record<StaffType, StaffDef> = Object.fromEntries(STAFF.map((s) => [s.id, s])) as Record<StaffType, StaffDef>;

/** Speed multiplier per employee level (index = level-1). */
export const STAFF_LEVEL_SPEED = [1, 1.15, 1.35, 1.6, 1.9, 2.25];
export const STAFF_MAX_LEVEL = STAFF_LEVEL_SPEED.length;

export interface TraitDef {
  id: string;
  icon: string;
  moveMult: number;
  workMult: number;
  salaryMult: number;
  satisfactionBonus: number;
  luck: number;
}

export const TRAITS: TraitDef[] = [
  { id: 'fast', icon: '⚡', moveMult: 1.2, workMult: 1, salaryMult: 1, satisfactionBonus: 0, luck: 0 },
  { id: 'friendly', icon: '😊', moveMult: 1, workMult: 1, salaryMult: 1, satisfactionBonus: 6, luck: 0 },
  { id: 'efficient', icon: '⚙️', moveMult: 1, workMult: 1.15, salaryMult: 1, satisfactionBonus: 0, luck: 0 },
  { id: 'lazy', icon: '😴', moveMult: 0.9, workMult: 0.9, salaryMult: 0.7, satisfactionBonus: 0, luck: 0 },
  { id: 'lucky', icon: '🍀', moveMult: 1, workMult: 1, salaryMult: 1, satisfactionBonus: 0, luck: 0.1 },
];

export const TRAIT_MAP: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export const STAFF_NAMES = ['Alex', 'Sam', 'Jo', 'Priya', 'Ben', 'Mia', 'Leo', 'Zoe', 'Kai', 'Ava', 'Omar', 'Lily', 'Finn', 'Nia', 'Theo', 'Ruby', 'Max', 'Ivy', 'Raj', 'Ella', 'Tom', 'Yuki', 'Ada', 'Hugo'];
