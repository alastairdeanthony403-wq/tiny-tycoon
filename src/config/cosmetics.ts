export interface ThemeDef {
  id: string;
  icon: string;
  starCost: number;
  floorA: string;
  floorB: string;
  wall: string;
  wallTop: string;
  trim: string;
  season?: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'classic', icon: '🏪', starCost: 0, floorA: '#f6e7cb', floorB: '#eed9b4', wall: '#f7a072', wallTop: '#ffd6a5', trim: '#e76f51' },
  { id: 'candy', icon: '🍭', starCost: 6, floorA: '#ffe5ec', floorB: '#ffc2d1', wall: '#ff8fab', wallTop: '#ffb3c6', trim: '#fb6f92' },
  { id: 'jungle', icon: '🌴', starCost: 10, floorA: '#d8f3dc', floorB: '#b7e4c7', wall: '#52b788', wallTop: '#95d5b2', trim: '#2d6a4f' },
  { id: 'space', icon: '🚀', starCost: 12, floorA: '#cdb4db', floorB: '#bde0fe', wall: '#3a0ca3', wallTop: '#7209b7', trim: '#4cc9f0' },
  { id: 'winter', icon: '❄️', starCost: 8, floorA: '#edf6f9', floorB: '#d6eaf8', wall: '#83c5be', wallTop: '#cfe8f3', trim: '#006d77', season: 'winter' },
  { id: 'halloween', icon: '🎃', starCost: 8, floorA: '#ffd6a5', floorB: '#fdba74', wall: '#3d2c5a', wallTop: '#6a4c93', trim: '#f77f00', season: 'halloween' },
  { id: 'neon', icon: '🌈', starCost: 20, floorA: '#1b1b3a', floorB: '#2c2c54', wall: '#ff006e', wallTop: '#8338ec', trim: '#3a86ff' },
];

export const THEME_MAP: Record<string, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
