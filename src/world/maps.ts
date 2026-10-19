/**
 * WORLD MAP DEFINITIONS (data only; generation is in ./gen.ts).
 *
 * A map is a miniature district laid out on a road grid in world tiles:
 *  - `avenues` are north–south roads at those x positions, `streets` east–west roads at those y
 *    positions. Each road is 2 tiles wide with a 2-tile pavement on both sides.
 *  - The roads cut the map into blocks. Block (col,row): col −1 is the strip west of the first avenue,
 *    col i lies east of avenue i; rows work the same way with streets.
 *  - Each block gets a themed filler (`blocks`, or the map's `defaultBlock`); strips on the map edge
 *    use `edge`.
 *  - Shop plots sit in a block directly east of an avenue: the shop's west street is that avenue,
 *    which is where customers walk. Every plot can hold the largest shop (12×12) plus the stockroom
 *    annex to its north.
 * The player's shop always keeps its own coordinates; the renderer draws the world around it,
 * offset by the active plot's origin.
 */
export type MapId = 'town' | 'city' | 'shopping' | 'beach' | 'night_market' | 'countryside' | 'airport';

export type BlockKind =
  | 'houses'
  | 'park'
  | 'cafe'
  | 'offices'
  | 'plaza'
  | 'transit'
  | 'shops'
  | 'parking'
  | 'stalls'
  | 'shore'
  | 'beach'
  | 'field'
  | 'farm'
  | 'woods'
  | 'construction'
  | 'runway'
  | 'terminal'
  | 'skyline';

export interface PlotDef {
  id: string;
  col: number;
  row: number;
  /** Unlock rule for moving here (the first plot of a map is always free). */
  requiredLevel?: number;
}

export interface ArtefactDef {
  id: string;
  /** Registry sprite id. */
  asset: string;
  col: number;
  row: number;
  /** Position inside the block (0..1). */
  fx: number;
  fy: number;
  reward: { gems?: number; cash?: number };
}

export interface MapDef {
  id: MapId;
  size: { w: number; h: number };
  base: string;
  road: string;
  walk: string;
  avenues: number[];
  streets: number[];
  defaultBlock: BlockKind;
  blocks: Record<string, BlockKind>;
  edge: BlockKind;
  traffic: 'cars' | 'none';
  night?: boolean;
  icon: string;
  plots: PlotDef[];
  artefacts: ArtefactDef[];
  /** How busy fillers make their blocks (1 = normal). */
  density: number;
  /** Locale keys under map.highlight.* shown on the map card. */
  highlights: string[];
}

export const MAPS: Record<MapId, MapDef> = {
  town: {
    id: 'town',
    size: { w: 64, h: 70 },
    base: 'grass',
    road: 'road',
    walk: 'pavement',
    avenues: [6, 26, 46],
    streets: [6, 26, 46],
    defaultBlock: 'houses',
    blocks: { '0,1': 'park', '2,1': 'cafe', '1,2': 'houses', '2,0': 'park', '0,2': 'cafe' },
    edge: 'woods',
    traffic: 'cars',
    icon: 'deco.tree_round',
    density: 1,
    plots: [
      { id: 'main_street', col: 0, row: 0 },
      { id: 'park_side', col: 1, row: 1, requiredLevel: 4 },
      { id: 'quiet_corner', col: 2, row: 2, requiredLevel: 8 },
    ],
    artefacts: [
      { id: 'town_gnome', asset: 'deco.garden_gnome', col: 1, row: 0, fx: 0.85, fy: 0.2, reward: { gems: 5 } },
      { id: 'town_cart', asset: 'deco.golden_cart', col: 0, row: 1, fx: 0.15, fy: 0.85, reward: { gems: 10 } },
      { id: 'town_parcel', asset: 'deco.lost_parcel', col: 2, row: 1, fx: 0.85, fy: 0.85, reward: { cash: 250 } },
      { id: 'town_sign', asset: 'deco.vintage_sign', col: 1, row: 2, fx: 0.12, fy: 0.15, reward: { gems: 5 } },
    ],
    highlights: ['park', 'cafe', 'houses', 'playground'],
  },
  city: {
    id: 'city',
    size: { w: 64, h: 70 },
    base: 'pavement',
    road: 'road',
    walk: 'pavement',
    avenues: [6, 24, 42],
    streets: [6, 26, 46],
    defaultBlock: 'offices',
    blocks: { '1,0': 'plaza', '2,1': 'transit', '0,1': 'cafe', '1,2': 'shops', '2,2': 'offices' },
    edge: 'skyline',
    traffic: 'cars',
    icon: 'deco.bus_stop',
    density: 1.2,
    plots: [
      { id: 'junction', col: 0, row: 0 },
      { id: 'tower_row', col: 1, row: 1, requiredLevel: 12 },
      { id: 'square_view', col: 0, row: 2, requiredLevel: 14 },
    ],
    artefacts: [
      { id: 'city_statue', asset: 'deco.mini_statue', col: 1, row: 0, fx: 0.25, fy: 0.75, reward: { gems: 10 } },
      { id: 'city_parcel', asset: 'deco.lost_parcel', col: 2, row: 1, fx: 0.85, fy: 0.15, reward: { cash: 600 } },
      { id: 'city_plant', asset: 'deco.rare_plant', col: 2, row: 2, fx: 0.15, fy: 0.85, reward: { gems: 5 } },
    ],
    highlights: ['offices', 'plaza', 'subway', 'taxi'],
  },
  shopping: {
    id: 'shopping',
    size: { w: 64, h: 70 },
    base: 'pavement',
    road: 'road',
    walk: 'pavement',
    avenues: [6, 26, 46],
    streets: [6, 26, 46],
    defaultBlock: 'shops',
    blocks: { '1,0': 'plaza', '2,0': 'parking', '0,1': 'cafe', '2,2': 'construction', '1,2': 'shops' },
    edge: 'shops',
    traffic: 'cars',
    icon: 'deco.ad_board',
    density: 1.1,
    plots: [
      { id: 'retail_avenue', col: 0, row: 0 },
      { id: 'central_plaza', col: 1, row: 1, requiredLevel: 15 },
      { id: 'mall_corner', col: 0, row: 2, requiredLevel: 16 },
    ],
    artefacts: [
      { id: 'shop_cart', asset: 'deco.golden_cart', col: 1, row: 0, fx: 0.8, fy: 0.8, reward: { gems: 10 } },
      { id: 'shop_sign', asset: 'deco.vintage_sign', col: 2, row: 1, fx: 0.2, fy: 0.2, reward: { gems: 5 } },
      { id: 'shop_parcel', asset: 'deco.lost_parcel', col: 2, row: 0, fx: 0.85, fy: 0.15, reward: { cash: 900 } },
    ],
    highlights: ['shops', 'plaza', 'delivery', 'construction'],
  },
  beach: {
    id: 'beach',
    size: { w: 72, h: 70 },
    base: 'sand',
    road: 'road',
    walk: 'boardwalk',
    avenues: [6, 26, 46],
    streets: [6, 26, 46],
    defaultBlock: 'beach',
    blocks: { '0,1': 'cafe', '1,0': 'beach', '1,2': 'park', '2,0': 'shore', '2,1': 'shore', '2,2': 'shore' },
    edge: 'beach',
    traffic: 'cars',
    icon: 'deco.palm',
    density: 1,
    plots: [
      { id: 'harbour_road', col: 0, row: 0 },
      { id: 'promenade', col: 1, row: 1, requiredLevel: 14 },
      { id: 'palm_corner', col: 0, row: 2, requiredLevel: 15 },
    ],
    artefacts: [
      { id: 'beach_cart', asset: 'deco.golden_cart', col: 2, row: 1, fx: 0.15, fy: 0.3, reward: { gems: 10 } },
      { id: 'beach_parcel', asset: 'deco.lost_parcel', col: 1, row: 0, fx: 0.85, fy: 0.85, reward: { cash: 1500 } },
      { id: 'beach_gnome', asset: 'deco.garden_gnome', col: 1, row: 2, fx: 0.85, fy: 0.15, reward: { gems: 5 } },
    ],
    highlights: ['shore', 'pier', 'beach', 'promenade'],
  },
  night_market: {
    id: 'night_market',
    size: { w: 64, h: 70 },
    base: 'cobble',
    road: 'cobble',
    walk: 'cobble',
    avenues: [6, 26, 46],
    streets: [6, 26, 46],
    defaultBlock: 'stalls',
    blocks: { '1,0': 'plaza', '2,1': 'cafe', '0,2': 'park' },
    edge: 'stalls',
    traffic: 'none',
    night: true,
    icon: 'deco.lantern_post',
    density: 1.2,
    plots: [
      { id: 'lantern_lane', col: 0, row: 0 },
      { id: 'food_court', col: 1, row: 1, requiredLevel: 19 },
      { id: 'moon_gate', col: 2, row: 2, requiredLevel: 20 },
    ],
    artefacts: [
      { id: 'night_statue', asset: 'deco.mini_statue', col: 1, row: 0, fx: 0.5, fy: 0.85, reward: { gems: 10 } },
      { id: 'night_plant', asset: 'deco.rare_plant', col: 0, row: 2, fx: 0.85, fy: 0.15, reward: { gems: 5 } },
      { id: 'night_parcel', asset: 'deco.lost_parcel', col: 2, row: 0, fx: 0.15, fy: 0.85, reward: { cash: 5000 } },
    ],
    highlights: ['stalls', 'lanterns', 'plaza', 'cafe'],
  },
  countryside: {
    id: 'countryside',
    size: { w: 72, h: 72 },
    base: 'grass',
    road: 'road',
    walk: 'dirt',
    avenues: [6, 30, 54],
    streets: [6, 34],
    defaultBlock: 'field',
    blocks: { '1,0': 'farm', '2,0': 'woods', '0,1': 'woods', '2,1': 'farm' },
    edge: 'woods',
    traffic: 'cars',
    icon: 'deco.hay_bale',
    density: 0.9,
    plots: [
      { id: 'village_green', col: 0, row: 0 },
      { id: 'farm_lane', col: 1, row: 1, requiredLevel: 12 },
      { id: 'orchard_end', col: 2, row: 1, requiredLevel: 13 },
    ],
    artefacts: [
      { id: 'country_gnome', asset: 'deco.garden_gnome', col: 1, row: 0, fx: 0.1, fy: 0.9, reward: { gems: 5 } },
      { id: 'country_plant', asset: 'deco.rare_plant', col: 0, row: 1, fx: 0.5, fy: 0.5, reward: { gems: 10 } },
      { id: 'country_sign', asset: 'deco.vintage_sign', col: 2, row: 0, fx: 0.85, fy: 0.85, reward: { cash: 1200 } },
    ],
    highlights: ['fields', 'farm', 'woods', 'pond'],
  },
  airport: {
    id: 'airport',
    size: { w: 72, h: 70 },
    base: 'tarmac',
    road: 'road',
    walk: 'pavement',
    avenues: [6, 26, 46],
    streets: [6, 26, 46],
    defaultBlock: 'parking',
    blocks: { '1,0': 'terminal', '2,0': 'runway', '2,1': 'runway', '2,2': 'runway', '0,1': 'cafe', '1,2': 'transit' },
    edge: 'parking',
    traffic: 'cars',
    icon: 'deco.windsock',
    density: 1,
    plots: [
      { id: 'departures', col: 0, row: 0 },
      { id: 'arrivals', col: 1, row: 1, requiredLevel: 17 },
      { id: 'cargo_gate', col: 0, row: 2, requiredLevel: 18 },
    ],
    artefacts: [
      { id: 'air_parcel', asset: 'deco.lost_parcel', col: 1, row: 2, fx: 0.85, fy: 0.85, reward: { cash: 3000 } },
      { id: 'air_cart', asset: 'deco.golden_cart', col: 1, row: 0, fx: 0.1, fy: 0.9, reward: { gems: 10 } },
      { id: 'air_statue', asset: 'deco.mini_statue', col: 0, row: 1, fx: 0.85, fy: 0.15, reward: { gems: 5 } },
    ],
    highlights: ['runway', 'terminal', 'parking', 'transit'],
  },
};

/** Gameplay location id → world map. Unknown ids fall back to the Neighbourhood. */
export const LOCATION_MAP_ID: Record<string, MapId> = {
  neighborhood: 'town',
  downtown: 'city',
  shopping: 'shopping',
  beach: 'beach',
  night_market: 'night_market',
  countryside: 'countryside',
  airport: 'airport',
};

export function mapFor(locationId: string): MapDef {
  return MAPS[LOCATION_MAP_ID[locationId] ?? 'town'];
}

/** The world size of the old scene around a fully expanded shop (−8 … S+7 with S = 12). */
export const LEGACY_WORLD_TILES = 27;
