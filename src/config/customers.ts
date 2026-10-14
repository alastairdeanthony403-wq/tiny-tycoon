export interface CustomerTypeDef {
  id: string;
  /** Category preference weights (missing = 1). */
  prefers: Record<string, number>;
  /** 'cheap' favours low prices, 'premium' favours expensive, 'any' neutral. */
  priceTaste: 'cheap' | 'premium' | 'any';
  budget: [number, number];
  patience: number; // seconds of waiting tolerated
  speed: number; // walk speed multiplier
  items: [number, number];
  /** Leaves instead of queueing when the shortest queue is at least this long. */
  maxQueueTolerance: number;
  requiredLevel: number;
  requiredRepTier: number;
  weight: number;
  /** Tip chance when happy. */
  tipChance: number;
  colors: { body: string; head: string; hair: string };
  special?: boolean;
}

export const CUSTOMER_TYPES: CustomerTypeDef[] = [
  { id: 'student', prefers: { snacks: 1.6, drinks: 1.4, sweets: 1.2 }, priceTaste: 'cheap', budget: [8, 20], patience: 40, speed: 1.1, items: [1, 3], maxQueueTolerance: 6, requiredLevel: 1, requiredRepTier: 1, weight: 3, tipChance: 0.05, colors: { body: '#4cc9f0', head: '#f1c27d', hair: '#3d2b1f' } },
  { id: 'regular', prefers: {}, priceTaste: 'any', budget: [12, 35], patience: 50, speed: 1.0, items: [1, 3], maxQueueTolerance: 8, requiredLevel: 1, requiredRepTier: 1, weight: 3, tipChance: 0.12, colors: { body: '#90be6d', head: '#e0ac69', hair: '#6b4226' } },
  { id: 'child', prefers: { sweets: 2.5, toys: 2.0, snacks: 1.2 }, priceTaste: 'cheap', budget: [5, 15], patience: 30, speed: 1.25, items: [1, 2], maxQueueTolerance: 5, requiredLevel: 2, requiredRepTier: 1, weight: 1.5, tipChance: 0.02, colors: { body: '#f9844a', head: '#ffdbac', hair: '#f6bd60' } },
  { id: 'office', prefers: { cafe: 2.5, drinks: 1.3, bakery: 1.3, electronics: 1.2 }, priceTaste: 'any', budget: [18, 60], patience: 26, speed: 1.3, items: [1, 2], maxQueueTolerance: 4, requiredLevel: 3, requiredRepTier: 1, weight: 2, tipChance: 0.1, colors: { body: '#495057', head: '#c68642', hair: '#212529' } },
  { id: 'impatient', prefers: { drinks: 1.3, snacks: 1.3 }, priceTaste: 'any', budget: [10, 30], patience: 12, speed: 1.45, items: [1, 2], maxQueueTolerance: 3, requiredLevel: 4, requiredRepTier: 1, weight: 1.2, tipChance: 0.03, colors: { body: '#e63946', head: '#f1c27d', hair: '#000000' } },
  { id: 'foodie', prefers: { bakery: 2.4, cafe: 2.0, produce: 1.6, sweets: 1.3 }, priceTaste: 'premium', budget: [30, 90], patience: 45, speed: 0.95, items: [2, 4], maxQueueTolerance: 7, requiredLevel: 5, requiredRepTier: 2, weight: 1.5, tipChance: 0.18, colors: { body: '#f4a261', head: '#e0ac69', hair: '#9c6644' } },
  { id: 'rich', prefers: { luxury: 3, electronics: 2, clothing: 1.8, sweets: 1.2 }, priceTaste: 'premium', budget: [150, 1500], patience: 40, speed: 0.9, items: [2, 4], maxQueueTolerance: 6, requiredLevel: 8, requiredRepTier: 3, weight: 0.8, tipChance: 0.35, colors: { body: '#7b2cbf', head: '#ffdbac', hair: '#ffd166' } },
  { id: 'tourist', prefers: { drinks: 1.6, sweets: 1.4, toys: 1.4, clothing: 1.4 }, priceTaste: 'any', budget: [25, 120], patience: 35, speed: 0.9, items: [2, 4], maxQueueTolerance: 6, requiredLevel: 1, requiredRepTier: 1, weight: 0, tipChance: 0.2, colors: { body: '#ffbe0b', head: '#f1c27d', hair: '#8d5524' } },
  { id: 'celebrity', prefers: { luxury: 3, sweets: 2, cafe: 2 }, priceTaste: 'premium', budget: [500, 5000], patience: 60, speed: 0.85, items: [3, 6], maxQueueTolerance: 99, requiredLevel: 1, requiredRepTier: 1, weight: 0, tipChance: 1, colors: { body: '#ff006e', head: '#ffdbac', hair: '#ffd60a' }, special: true },
];

export const CUSTOMER_MAP: Record<string, CustomerTypeDef> = Object.fromEntries(CUSTOMER_TYPES.map((c) => [c.id, c]));
