# World maps, shop plots, artefacts & Shop Lock

Every location is a whole miniature district around the player's shop instead of a thin ring of
scenery. This document covers how the world is defined and generated, how shops sit on plots,
the discoverable artefacts, the camera's Shop Lock / Free Explore / Return to Shop modes, saves,
performance and known limits.

## Files

| File | What |
|---|---|
| `src/world/maps.ts` | Map definitions (data only): size, ground/road/pavement terrain, road grid, block fillers, plots, artefacts, density, highlights, traffic. `LOCATION_MAP_ID` maps gameplay locations to maps. |
| `src/world/gen.ts` | Deterministic generator: terrain grid, roads and pavements, block fillers, street furniture, reserved plots, artefact spots; `validateMap`. |
| `src/render/world.ts` | Draws a generated world around the shop: baked ground, buildings, props, fences, parked and moving cars, the plane, vacant-plot markers, artefacts. |
| `src/render/iso.ts` | `Camera`: lock modes, world pan bounds, Return to Shop. |
| `src/render/renderer.ts` | Camera framing, world bounds, screen-bounds culling, artefact picking. |
| `src/sim/exploration.ts` | `ExplorationManager`: artefact positions, discovery, once-only rewards. |
| `src/sim/locations.ts` | Shop plots: list, rules, explicit relocation. |
| `src/ui/cameraControls.ts`, `src/ui/panels/map.ts` | HUD camera buttons; Map panel plots and discoveries. |
| `tests/world.test.ts` | Map, plot, artefact, migration and camera-lock tests. |

## Sizes

| | Before | Now |
|---|---|---|
| World around the shop | the shop plus 8 tiles west, 7 east: **18×18** (3×3 shop) to **27×27** (12×12 shop) | **64×70** (Neighbourhood, Downtown, Shopping District, Night Market), **72×70** (Waterfront, Airport), **72×72** (Countryside) |
| Area | at most 729 tiles | 4,480 to 5,184 tiles (about 6–7× the largest old world) |
| Scenery objects | about 20–40 | 239–395 per map (static and moving) |

The shop's own size is unchanged: it still grows through the expansion stages from 3×3 to 12×12.
The world size and the shop size are separate.

## How a map is built

A map is a road grid in world tiles:

- `avenues` are north–south roads at those x positions and `streets` are east–west roads. Each road
  is 2 tiles wide, with a 2-tile pavement on both sides. Roads get dashed centre lines and zebra
  crossings at junctions.
- The roads cut the map into **blocks**. Each block gets a themed **filler** (`blocks["col,row"]`,
  else `defaultBlock`); thin strips along the map edge use `edge`.
- **Fillers**: `houses`, `park`, `cafe`, `offices`, `skyline`, `plaza`, `transit`, `shops`,
  `parking`, `stalls`, `shore`, `beach`, `field`, `farm`, `woods`, `construction`, `runway`,
  `terminal`. Each is a small hand-designed layout (for example a park has paths, a fountain,
  benches, a pond, a playground, a noticeboard, a bike rack and lamps) with seeded variation.
- **Street furniture** follows the roads: lamps (lanterns at night), bins, road signs at crossings
  and bus stops. None of it is placed on a plot or in front of a shop door.
- `density` scales how full fillers are. `traffic: 'cars'` adds moving cars on every road.

### Determinism

Every block uses its own random stream, seeded from `map id + block`. The same definition always
produces the same world, so nothing generated is saved; it is rebuilt on load. Generated worlds are
cached per map.

### Validation

`validateMap` (run by the tests) checks:

- size and road order;
- unique plot ids, and that every plot sits east of an avenue in a block big enough for the largest
  shop plus the stockroom annex;
- room for the customer street 3 tiles beyond the largest shop;
- every artefact has a clear spot in its block.

The tests also check that:

- nothing generated overlaps any plot, and plots never overlap;
- every plot has a road at shop x ∈ [−4, −2) and a dry, empty pavement where customers walk
  (x ≈ −0.5), for the full length the street is used;
- each map's set of landmark types differs;
- no 16×16 chunk of any map is empty;
- the required landmark categories exist.

## Maps and landmarks

| Location | Map | Size | Highlights | Plots (unlock) |
|---|---|---|---|---|
| Neighbourhood | `town` | 64×70 | homes with gardens and mailboxes, two parks (fountain, pond, playground with swings and slide, noticeboard, bike rack), corner cafés with tables, bus stops, woods at the edges | Main Street (start), Park-side Corner (L4), Quiet Corner (L8) |
| Downtown | `city` | 64×70 | office towers with lit windows, a plaza with fountain and food stalls, subway entrance, taxi rank, ad boards, storefronts, skyline edges | Downtown Junction (start), Tower Row (L12), Square View (L14) |
| Shopping District (new location: £350K, L14, 4★) | `shopping` | 64×70 | rows of storefronts with awnings, retail plaza, delivery yard with vans and crates, building site with barriers | Retail Avenue (start), Central Plaza (L15), Mall Corner (L16) |
| Waterfront (was "Beach") | `beach` | 72×70 | sea with boats and a pier, beach huts, palms, umbrellas and towels, lifebuoys, park | Harbour Road (start), Waterfront Promenade (L14), Palm Corner (L15) |
| Night Market | `night_market` | 64×70 | cobbled lanes (no traffic), food stalls, glowing lanterns and string lights, plaza, café | Lantern Lane (start), Food Court (L19), Moon Gate (L20) |
| Countryside | `countryside` | 72×72 | fields with fences, scarecrow and hay bales, a farm (barn, silo, farmhouse, pond), woods, dirt pavements | Village Green (start), Farm Lane (L12), Orchard End (L13) |
| Airport | `airport` | 72×70 | runway with lights and a plane, terminal, control tower, windsock, taxis, car park | Departures Hall (start), Arrivals Hall (L17), Cargo Gate (L18) |

All in-world art is procedural Canvas artwork in the existing diorama style. Buildings, cars and
fences are real 3D boxes that rotate with the camera; props are billboard sprites registered in the
asset registry and exported as PNG files (`npm run art:export`). New props: `swing_set`, `slide`,
`noticeboard`, `bike_rack`, `ad_board`, `subway_sign`, `taxi_sign`, `sale_sign`, `cafe_table`,
`barrier`. New building styles: `cafe`, `storefront`, `subway`, `frame`. Cars can now drive on
east–west streets too, and come as cars, vans and taxis. No emoji are drawn in the world.

## Shop plots

- A plot is `{ id, col, row, requiredLevel? }`. Its shop origin is fixed by the block: the shop's
  west street is the avenue, which is where customers walk. A plot reserves 12×14 tiles (the largest
  shop plus the stockroom annex).
- **The shop keeps its own coordinates.** The renderer offsets the whole world by the plot's
  origin, so the simulation, pathfinding, customer street, placement and expansion are unchanged.
- New shops start on their map's first plot. `ShopState.plotId` is saved per shop.
- **Moving** (Map panel → Shop plots → *Move here*) needs the plot's level, no expansion in
  progress, and an explicit confirmation that explains that the shop keeps its size, layout, stock,
  staff and progress and that only the surroundings change. Moving is free and reversible. Plots
  the shop is not on show a "for sale" sign, a fence and a flower bed.

## Discoverable artefacts

- 22 artefacts, 3–4 per map (`ArtefactDef`): a stable id, a sprite (`deco.garden_gnome`,
  `golden_cart`, `lost_parcel`, `mini_statue`, `rare_plant`, `vintage_sign`), a block and a
  preferred position in it, and a reward.
- The generator puts each one on the clear, walkable spot nearest its preferred position: not on
  water, rock or a road, not on a plot, and not touching any object. Seasonal decorations avoid
  them too.
- Undiscovered artefacts twinkle (static under reduced motion). Tapping one within reach collects
  it: a short card shows its name, story and reward, with sparkle and confetti.
- **Rewards go through the central systems exactly once.**
  - Gems use `store.earnOnce('artefact:<id>')`, the same once-only key ledger as other Gem rewards,
    so even a lost discovery list cannot pay twice.
  - Cash uses `economy.earn` and is guarded by the saved discovery list.
  - Rewards are modest: at most 15 💎, and cash at most 2% of the map's unlock cost (minimum £1,000).
- `discover()` fails safely, paying nothing, for unknown ids, artefacts on another map and ones
  already found.
- Progress: Map panel → Discoveries (found ones show their art and story; others show "???").
  Achievements: *Curious Shopkeeper* (1) and *Explorer* (8). Analytics event `artefact_found`
  (id only).
- Exploration is optional: no essential upgrade depends on it.

## Camera: Shop Lock, Free Explore, Return to Shop

`Camera.mode` is `'locked' | 'free' | 'returning'`:

- **Shop Locked** (default): the camera frames the shop. When the shop expands, the frame is
  recalculated from the new footprint. Pan is limited to `shop/2 + 3` tiles around its centre.
  Rotation, tilt and zoom (0.5×–3×) work as before. Nothing pulls the camera every frame; the
  framing simply targets the shop.
- **Free Explore**: pan anywhere inside the world, keeping the view centre 4 tiles inside the map
  edge. You can zoom out further (down to 0.2×). The camera stays where you put it: expansion
  does not yank it back.
- **Returning to Shop**: a short eased glide. Pan and zoom are cleared at once, and the mode
  switches to Shop Locked when the camera arrives. If you grab the view mid-glide, the camera simply
  becomes locked where it is, so it is never left in an invalid state. With reduced motion the
  return is instant.
- **Entering the game** or switching location snaps to the shop, then eases in from slightly
  further out (skipped with reduced motion).
- **Dragging past the lock limit** in one gesture (1.5 tiles past it) switches to Free Explore.
  Turn this off in Settings ("Dragging away starts Free Explore"); the lock then only limits
  panning.

**HUD** (right edge):

- 🏪 **Return to Shop**: always visible. It works from anywhere, after expansion, rotation, zoom
  and location or plot changes, and turns the lock back on.
- 🔒/🔓 **Shop Lock** toggle: `aria-pressed` and the label show the camera's real mode, and it
  updates when a drag unlocks the camera or Return to Shop locks it. It is highlighted in the
  accent colour when on and yellow when off.
- Rotate ⟲ ⟳ and ⋯ (zoom, tilt, frame, reset, drag mode) as before.

**Keys:** `H` returns to the shop (`F` too), `L` toggles Shop Lock, `0` resets the view and
returns.

**Saved:**

- `settings.cameraLock` and `settings.cameraAutoUnlock`.
- With "Remember camera view", the saved pan is only used when the lock was off. A locked camera
  always starts on the shop.

## Saves and migration (v4 → v5)

| Field | Default for older saves | Validation |
|---|---|---|
| `shops[id].plotId` | the map's first plot | unknown ids fall back to the first plot; the shop itself is never touched |
| `exploration.found` | `[]` | unknown ids and duplicates are dropped |
| `settings.cameraLock` | `true` | boolean |
| `settings.cameraAutoUnlock` | `true` | boolean |

Generated world data is never saved. Map definitions can change without resetting anyone's shop:
an invalid plot id just moves the surroundings to the first plot.

## Performance

- **Ground:** each map's ground is baked once into a single canvas (12–32 px per tile, at most about
  1,536 px). Each frame draws it with one affine `drawImage`, measured at about 0.01 ms. Water
  glints are sampled (at most about 600 strokes).
- **Static placements** (map, vacant plots, seasonal decor, annex) are shifted to shop coordinates
  once and cached per map, plot and season.
- **Screen-bounds culling:** every world item has a radius. Items whose radius does not reach the
  viewport are skipped before depth sorting. At the default zoom only 9–27 of the 239–395 world
  items are drawn.
- **Measured** (headless Chromium, 390×844 at DPR 2, render-only, 60 frames): this branch 0.7–11 ms
  per frame across the seven maps, against 7–19 ms on the previous main build for the same
  locations. Wide Free Explore views (zoom 0.25) averaged 16.6–18.4 ms of frame interval with
  vsync (about 60 fps). Simulation timing is unchanged: the fixed tick is independent of the
  renderer.

## Limitations

- Plots are fixed positions on the road grid (east of an avenue); the shop's orientation is the
  same on every plot. Moving a shop is a surroundings change, not a new simulation layout.
- Customers still use the shop's own street; the rest of the world's pedestrians and cars are
  decorative and do not path-find.
- Artefacts are tapped, not walked to. There is no minimap.
- The world beyond the map edge shows the sky gradient (Free Explore stays 4 tiles inside the
  edge).
- Map selection is the existing location list (one map per location) with highlights, size and
  plot count on each card. There is no separate full-screen map picker.
