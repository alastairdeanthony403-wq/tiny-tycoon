export interface DepartmentDef {
  id: string;
  icon: string;
  requiredLevel: number;
  /** Minimum shop stage (size) so the granted object has room. */
  requiredStage: number;
  cost: number;
  /** Free object granted on unlock (visible change!). */
  grants?: { kind: string; productId: string };
  /** Products auto-unlocked with the department (no extra cost). */
  freeProducts: string[];
  floorTint: string;
}

export const DEPARTMENTS: DepartmentDef[] = [
  { id: 'snacks', icon: '🍿', requiredLevel: 1, requiredStage: 0, cost: 0, freeProducts: ['crisps'], floorTint: '#ffe8a3' },
  { id: 'drinks', icon: '🥤', requiredLevel: 2, requiredStage: 1, cost: 200, grants: { kind: 'fridge', productId: 'soda' }, freeProducts: ['soda'], floorTint: '#bde0fe' },
  { id: 'bakery', icon: '🥐', requiredLevel: 5, requiredStage: 2, cost: 1500, grants: { kind: 'oven', productId: 'donuts' }, freeProducts: ['bread', 'donuts'], floorTint: '#ffd8b1' },
  { id: 'cafe', icon: '☕', requiredLevel: 7, requiredStage: 3, cost: 4000, grants: { kind: 'coffee_machine', productId: 'coffee' }, freeProducts: ['coffee'], floorTint: '#e3c9b0' },
  { id: 'produce', icon: '🍎', requiredLevel: 9, requiredStage: 4, cost: 9000, grants: { kind: 'shelf', productId: 'fruit' }, freeProducts: ['fruit'], floorTint: '#caffbf' },
  { id: 'toys', icon: '🧸', requiredLevel: 11, requiredStage: 5, cost: 20000, grants: { kind: 'shelf', productId: 'toys' }, freeProducts: ['toys'], floorTint: '#ffc6ff' },
  { id: 'electronics', icon: '🎧', requiredLevel: 13, requiredStage: 6, cost: 50000, grants: { kind: 'shelf', productId: 'headphones' }, freeProducts: ['headphones'], floorTint: '#cfe1ff' },
  { id: 'clothing', icon: '👕', requiredLevel: 15, requiredStage: 7, cost: 120000, grants: { kind: 'shelf', productId: 'tshirt' }, freeProducts: ['tshirt'], floorTint: '#d0f4de' },
  { id: 'luxury', icon: '💎', requiredLevel: 18, requiredStage: 8, cost: 400000, grants: { kind: 'shelf', productId: 'perfume' }, freeProducts: ['perfume'], floorTint: '#f1e4ff' },
];

export const DEPARTMENT_MAP: Record<string, DepartmentDef> = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d]));
