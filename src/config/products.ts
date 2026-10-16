export type DisplayType = 'shelf' | 'fridge' | 'machine';
export type Rarity = 'common' | 'premium' | 'special';

export interface ProductDef {
  id: string;
  category: string;
  department: string;
  cost: number;
  price: number;
  /** Relative popularity (higher = bought more often). */
  demand: number;
  /** Seconds per unit when produced by a machine, or restock weight for shelves. */
  restockTime: number;
  requiredLevel: number;
  unlockCost: number;
  rarity: Rarity;
  display: DisplayType;
  icon: string;
  color: string;
  season?: string;
}

// Cheap goods: low profit / high demand. Premium: high profit / lower demand. Special: rare & valuable.
export const PRODUCTS: ProductDef[] = [
  { id: 'crisps', category: 'snacks', department: 'snacks', cost: 2, price: 4, demand: 1.0, restockTime: 1, requiredLevel: 1, unlockCost: 0, rarity: 'common', display: 'shelf', icon: '🍟', color: '#f2c14e' },
  { id: 'candy', category: 'sweets', department: 'snacks', cost: 1, price: 3, demand: 1.1, restockTime: 1, requiredLevel: 2, unlockCost: 40, rarity: 'common', display: 'shelf', icon: '🍬', color: '#ff7eb6' },
  { id: 'soda', category: 'drinks', department: 'drinks', cost: 2, price: 5, demand: 1.0, restockTime: 1, requiredLevel: 2, unlockCost: 0, rarity: 'common', display: 'fridge', icon: '🥤', color: '#e8505b' },
  { id: 'chocolate', category: 'sweets', department: 'snacks', cost: 3, price: 7, demand: 0.85, restockTime: 1.2, requiredLevel: 3, unlockCost: 120, rarity: 'common', display: 'shelf', icon: '🍫', color: '#8b5a2b' },
  { id: 'milk', category: 'drinks', department: 'drinks', cost: 2, price: 5, demand: 0.8, restockTime: 1, requiredLevel: 4, unlockCost: 200, rarity: 'common', display: 'fridge', icon: '🥛', color: '#f4f4f4' },
  { id: 'bread', category: 'bakery', department: 'bakery', cost: 3, price: 8, demand: 0.9, restockTime: 1.2, requiredLevel: 5, unlockCost: 0, rarity: 'common', display: 'shelf', icon: '🍞', color: '#d9a066' },
  { id: 'donuts', category: 'bakery', department: 'bakery', cost: 4, price: 11, demand: 0.9, restockTime: 3, requiredLevel: 5, unlockCost: 0, rarity: 'common', display: 'machine', icon: '🍩', color: '#ff9ecb' },
  { id: 'coffee', category: 'cafe', department: 'cafe', cost: 3, price: 12, demand: 1.0, restockTime: 2.5, requiredLevel: 7, unlockCost: 0, rarity: 'common', display: 'machine', icon: '☕', color: '#6f4e37' },
  { id: 'sandwich', category: 'cafe', department: 'cafe', cost: 6, price: 16, demand: 0.75, restockTime: 1.4, requiredLevel: 8, unlockCost: 900, rarity: 'common', display: 'fridge', icon: '🥪', color: '#e9c46a' },
  { id: 'cake', category: 'bakery', department: 'bakery', cost: 18, price: 48, demand: 0.45, restockTime: 6, requiredLevel: 8, unlockCost: 1500, rarity: 'premium', display: 'machine', icon: '🎂', color: '#ffd6e8' },
  { id: 'fruit', category: 'produce', department: 'produce', cost: 3, price: 9, demand: 1.0, restockTime: 1, requiredLevel: 9, unlockCost: 0, rarity: 'common', display: 'shelf', icon: '🍎', color: '#e63946' },
  { id: 'premium_choc', category: 'sweets', department: 'snacks', cost: 14, price: 38, demand: 0.4, restockTime: 1.6, requiredLevel: 10, unlockCost: 4000, rarity: 'premium', display: 'shelf', icon: '🎁', color: '#5c2e0e' },
  { id: 'salad', category: 'produce', department: 'produce', cost: 6, price: 18, demand: 0.7, restockTime: 1.4, requiredLevel: 10, unlockCost: 3000, rarity: 'common', display: 'fridge', icon: '🥗', color: '#7bc950' },
  { id: 'toys', category: 'toys', department: 'toys', cost: 22, price: 60, demand: 0.6, restockTime: 1.6, requiredLevel: 11, unlockCost: 0, rarity: 'common', display: 'shelf', icon: '🧸', color: '#c68b59' },
  { id: 'mystery_box', category: 'toys', department: 'toys', cost: 40, price: 140, demand: 0.25, restockTime: 3, requiredLevel: 14, unlockCost: 25000, rarity: 'special', display: 'shelf', icon: '🎲', color: '#9b5de5' },
  { id: 'headphones', category: 'electronics', department: 'electronics', cost: 70, price: 170, demand: 0.45, restockTime: 2, requiredLevel: 13, unlockCost: 0, rarity: 'premium', display: 'shelf', icon: '🎧', color: '#3a86ff' },
  { id: 'console', category: 'electronics', department: 'electronics', cost: 180, price: 420, demand: 0.25, restockTime: 3, requiredLevel: 16, unlockCost: 90000, rarity: 'premium', display: 'shelf', icon: '🎮', color: '#222f3e' },
  { id: 'tshirt', category: 'clothing', department: 'clothing', cost: 28, price: 75, demand: 0.55, restockTime: 1.6, requiredLevel: 15, unlockCost: 0, rarity: 'common', display: 'shelf', icon: '👕', color: '#06d6a0' },
  { id: 'sneakers', category: 'clothing', department: 'clothing', cost: 90, price: 230, demand: 0.35, restockTime: 2.4, requiredLevel: 17, unlockCost: 180000, rarity: 'premium', display: 'shelf', icon: '👟', color: '#ef476f' },
  { id: 'perfume', category: 'luxury', department: 'luxury', cost: 150, price: 400, demand: 0.3, restockTime: 3, requiredLevel: 18, unlockCost: 0, rarity: 'premium', display: 'shelf', icon: '🧴', color: '#cdb4db' },
  { id: 'watch', category: 'luxury', department: 'luxury', cost: 400, price: 1100, demand: 0.18, restockTime: 4, requiredLevel: 20, unlockCost: 600000, rarity: 'special', display: 'shelf', icon: '⌚', color: '#ffd166' },
  // Everyday essentials and extras
  { id: 'water', category: 'drinks', department: 'drinks', cost: 1, price: 4, demand: 1.0, restockTime: 1, requiredLevel: 3, unlockCost: 150, rarity: 'common', display: 'fridge', icon: '💧', color: '#a9def9' },
  { id: 'toilet_paper', category: 'household', department: 'household', cost: 3, price: 8, demand: 0.9, restockTime: 1, requiredLevel: 6, unlockCost: 0, rarity: 'common', display: 'shelf', icon: '🧻', color: '#f1f3f5' },
  { id: 'soap', category: 'household', department: 'household', cost: 2, price: 6, demand: 0.85, restockTime: 1, requiredLevel: 6, unlockCost: 0, rarity: 'common', display: 'shelf', icon: '🧼', color: '#ff8fab' },
  { id: 'laundry', category: 'household', department: 'household', cost: 6, price: 15, demand: 0.6, restockTime: 1.2, requiredLevel: 7, unlockCost: 800, rarity: 'common', display: 'shelf', icon: '🧺', color: '#3a86ff' },
  { id: 'pet_food', category: 'household', department: 'household', cost: 8, price: 20, demand: 0.55, restockTime: 1.2, requiredLevel: 8, unlockCost: 1500, rarity: 'common', display: 'shelf', icon: '🐾', color: '#2ec4b6' },
  { id: 'eggs', category: 'produce', department: 'produce', cost: 4, price: 10, demand: 0.8, restockTime: 1.2, requiredLevel: 9, unlockCost: 1200, rarity: 'common', display: 'shelf', icon: '🥚', color: '#fff8e7' },
  { id: 'flowers', category: 'produce', department: 'produce', cost: 7, price: 20, demand: 0.6, restockTime: 1.4, requiredLevel: 10, unlockCost: 3500, rarity: 'common', display: 'shelf', icon: '💐', color: '#ff70a6' },
  { id: 'books', category: 'toys', department: 'toys', cost: 12, price: 32, demand: 0.6, restockTime: 1.4, requiredLevel: 11, unlockCost: 6000, rarity: 'common', display: 'shelf', icon: '📚', color: '#3a86ff' },
  // Seasonal (only available while the season is active)
  { id: 'pumpkin_pie', category: 'bakery', department: 'snacks', cost: 5, price: 14, demand: 0.9, restockTime: 1.2, requiredLevel: 2, unlockCost: 0, rarity: 'special', display: 'shelf', icon: '🎃', color: '#f77f00', season: 'halloween' },
  { id: 'hot_cocoa', category: 'drinks', department: 'snacks', cost: 3, price: 10, demand: 1.0, restockTime: 1.2, requiredLevel: 2, unlockCost: 0, rarity: 'special', display: 'shelf', icon: '🍵', color: '#7f5539', season: 'winter' },
  { id: 'ice_lolly', category: 'sweets', department: 'snacks', cost: 2, price: 6, demand: 1.1, restockTime: 1, requiredLevel: 2, unlockCost: 0, rarity: 'special', display: 'shelf', icon: '🍦', color: '#a0e7e5', season: 'summer' },
];

export const PRODUCT_MAP: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string | undefined): ProductDef | undefined {
  return id ? PRODUCT_MAP[id] : undefined;
}

export function profitOf(p: ProductDef): number {
  return p.price - p.cost;
}
