# 🏪 Tiny Tycoon

A cute, casual shop-management / incremental tycoon game. You start with a tiny 3×3 shop and grow it into a retail empire: sell products, upgrade shelves and checkouts, expand the building through five shop tiers, hire staff who really walk around, open departments and new locations, then franchise for permanent bonuses. You can rotate, tilt and zoom the camera all the way around your shop.

**Stack:** TypeScript, Vite, Canvas 2D (an orthographic diorama renderer with a 360° camera), DOM UI, Web Audio (all sounds and music are synthesized), Vitest. Artwork ships as local PNG files in `src/assets/` (sprites, animated character sprite sheets, terrain textures) loaded through a typed asset registry, with procedural drawings as the fallback; `npm run art:export` regenerates them. All sound is synthesized.

```bash
npm install
npm run dev        # play at http://localhost:5173 (debug panel enabled: 🐞 button)
npm test           # unit + integration + balance tests
npm run build      # typecheck + production build in dist/
BALANCE_REPORT=1 npx vitest run tests/balance.test.ts   # print the 60-minute pacing report
npm run art:export # regenerate the PNG art in src/assets/ from the procedural source
```

Build options: `VITE_SIMULATED_STORE=1` turns on the labelled test store and `VITE_SIMULATED_ADS=1` the labelled ad simulator (both are on automatically in `npm run dev`).

## Features
- **Shop simulation:** customers browse, buy and queue; staff run checkouts, restock and clean; upgrades, departments, locations, events and franchising.
- **Shop expansion:** the floor grid physically grows from 3×3 to 12×12 across 10 stages, grouped into five tiers: **Starter Shop, Expanded Shop, Super Shop, Mega Store, Tycoon Flagship**. Each tier raises the walls, adds building details and raises checkout and decoration limits. The Shop panel shows the next expansion's price, requirements, gains and a floor-plan preview.
- **360° camera with Shop Lock:** rotate all the way round, tilt, pan and zoom, with on-screen buttons as well as gestures. The camera focuses on your shop when you enter the game. Turn **Shop Lock** off (or drag far enough) to explore the district, and press **Return to Shop** to glide back. See [Controls](#controls).
- **A living district around every shop:** each location is a 64×70 to 72×72 tile world map (it was a 27×27 strip at most) with streets, traffic, parks, cafés, offices, a subway, a plaza, beaches, farms and more. Each map has three shop plots to choose from, and hidden artefacts that pay a one-time reward. See [docs/WORLD.md](docs/WORLD.md).
- **Goals:** a guided tutorial (skippable, with a How to play screen), main and side goals, **daily and weekly missions**, achievements and milestones.
- **Art:** a "Cute Isometric Diorama" style with chibi customers (six archetypes) and staff (five roles with their own tools), 32 products with fictional brands, terrain that rotates with the camera, and seven world maps (Neighbourhood, Downtown, Shopping District, Waterfront, Night Market, Countryside, Airport) with buildings, props, traffic and seasonal decor. See [docs/ART.md](docs/ART.md).
- **Store:**
  - **Gems** are earned from missions, achievements, milestones, level-ups, shop tiers, franchises, the tutorial and events.
  - **Seven tabs:** Home, Upgrades (7 permanent Gem upgrades plus the cash upgrades), Boosters (timed, counted in play time), Cosmetics (themes, outfits, staff accessories, display, checkout, sign and entrance styles, decorations, event collections), Bundles, Exchange (cash, XP, stock delivery, staff training, expansion permit, offline bonus) and Gems.
  - **Purchases** go through one atomic service. Every item is reachable with earned Gems and none is needed to progress.
  - See [docs/STORE.md](docs/STORE.md), including the balance simulation report.
- **Optional rewarded ads:** a short sale-price boost, never required. Hidden unless an ad provider exists.
- **Saves:** versioned with checksum, backup, migrations and repair; unreadable saves are kept aside and the player is told what happened. Offline earnings are capped and collected once.
- **Accessibility:** text size, colour-blind palette, reduced motion (also follows the OS setting), screen shake and vibration toggles, camera speed.

## Store and monetisation
Tap the 💎 balance in the HUD. Gems are earned from achievements, milestones and missions, and every item except Gem packs can be unlocked with them. Nothing is needed to progress. In `npm run dev` (or a `VITE_SIMULATED_STORE=1` build) real-money items go through a **clearly labelled test store** where no money moves; in other builds they show as unavailable until the native billing bridge exists. Architecture, iOS and Android integration steps, the backend contract and the compliance checklist are in [docs/MONETIZATION.md](docs/MONETIZATION.md).

**Nothing is live with a real provider yet** (payments, ads, analytics, cloud saves). [docs/LAUNCH.md](docs/LAUNCH.md) lists what exists, what still needs external setup, and the store and QA checklists. How the Store's items, prices, rewards and balance work: [docs/STORE.md](docs/STORE.md).

## Controls

| Action | Touch | Mouse / keyboard |
|---|---|---|
| Select an object | tap (tapping a low shelf restocks it; tapping a checkout serves faster) | click |
| Rotate and tilt the camera | one-finger drag | left-drag; `Q`/`E` rotate, `T`/`G` (or PgUp/PgDn) tilt |
| Move the view | two-finger drag | right-drag, or drag with Shift/Ctrl/Alt; arrow keys |
| Zoom | pinch | wheel; `+` / `−` |
| Return to Shop | 🏪 | `H` (or `F`) |
| Shop Lock on/off | 🔒 / 🔓 | `L` |
| Reset the camera | ⋯ → 🎯 | `0` / Home, double-click |
| Collect a hidden artefact | tap its sparkle | click it |

- On-screen camera buttons sit at the right edge: 🏪 Return to Shop, the 🔒 Shop Lock toggle, rotate left/right, and ⋯ for zoom, tilt, frame, reset and a toggle that makes one-finger drag move the view instead of rotating.
- With Shop Lock on, the view stays within a few tiles of your shop. Dragging further switches to Free Explore (you can turn that off in Settings) and the lock button turns yellow. Return to Shop always brings you back and turns the lock on again.
- A drag never counts as a tap, so moving the camera can't select or buy anything. Gestures only start on the shop itself, never on panels or buttons.
- Settings → Camera: speed, what one-finger drag does, Shop Lock, "Dragging away starts Free Explore", and "Remember camera view".
- Other keys: `1–5` switch tabs, `R` rotates while placing, `Enter` places, `Esc` goes back or opens pause.

## Architecture

```
src/
  config/     data-driven content & ALL balance values (economy.ts is the central balance file)
              camera.ts (camera limits) · shopTiers.ts (the five tiers) · expansions.ts (stages)
              missions.ts · ads.ts · achievements · quests · products · objects · staff · …
  core/       state types, initial state, event bus, seeded RNG, i18n, formatting
  sim/        headless simulation (no DOM): one manager per system (store.ts = the Gem purchase service, boosters, Gem upgrades, rewards)
              game.ts (fixed-timestep orchestrator) · economy · shop (grid/placement/expansion/tiers)
              inventory · customers (AI state machine) · checkout (queues) · employees (worker AI)
              upgrades · progression (XP/levels/reputation) · quests · missions · achievements (+milestones)
              events (rush hour, crates…) · locations (+ shop plots) · exploration (artefacts) · prestige · offline · monetization · ads · debug
  save/       versioned saves: checksum, backup slot, migrations, validation/repair, damaged-save copy
  assets/     art pipeline: spec, registry, sprite cache, fallback, PNG overrides, procedural art
              (products, characters, furniture, props, terrain, themes, locations, UI icons)
  world/      maps.ts (the world map definitions: roads, blocks, plots, artefacts) · gen.ts (deterministic generator + validation)
  render/     renderer, projection + camera controller (iso.ts), world (terrain/scenery/traffic), shapes, sprites, theme skins, particles
  monetization/ purchase adapters (native bridge, test store), verifier, purchase controller, catalog
  ads/        rewarded-ad provider adapters (none / native bridge / dev simulator) and controller
  audio/      Web Audio synth SFX (categories + pitch variation) and adaptive procedural music
  ui/         DOM UI: HUD, 5 tab panels, inspector, popups, toasts, tutorial pointer, menus,
              Premium Shop, camera controls, debug
  services/   analytics adapter (consent-gated), notifications, haptics
  locales/    en.ts (every player-facing string is a key)
```

Key design decisions:
- **Simulation is separate from rendering.** The sim runs at a fixed 20 Hz timestep, so FPS never affects the economy. Game speed (0.5×–10×, debug) scales sim time only and never touches real timestamps.
- **A real camera, not a rotated picture.** Every tile, wall and object is built from projected corners, so the projection in `render/iso.ts` is a true orthographic camera (unlimited yaw, 20°–60° tilt). Boxes draw only camera-facing sides, sorting uses rotated depth, and walls nearest the camera are cut away. People and icons are flat billboards. Details and limitations: [docs/CAMERA_AND_EXPANSION.md](docs/CAMERA_AND_EXPANSION.md).
- **Robust NPCs.** Every customer, employee and checkout updates inside its own try/catch, and every state has a stuck timeout. Paths are recomputed after any layout change, so expanding, selling or moving objects mid-walk never strands anyone.
- **Placement validation** keeps the door, stockroom, access tiles and queue lanes reachable (BFS connectivity check) and shows ✓/✗ previews. The previews use symbols as well as colour, so they work for colour-blind players.
- **Anti-exploit:** all transactions are validated (finite, non-negative, affordable) and money is clamped. One-shot rewards carry claimed flags, UI actions are guarded against double taps, and expansions charge once and start construction in the same step. Missions are chosen from the UTC day/week and the save's seed, so restarting can't reroll them. Offline time is capped and gives nothing if the clock moves backwards.
- **Light failure:** money never goes negative (wages included), reputation never drops below a tier you reached, and there is no game over.
- **Data-driven content:** adding a product, upgrade, quest, mission, event, location, theme, season or shop tier only needs a data entry (plus locale strings, which a test enforces).

## Progression at a glance
Tiny shop → first sale → shelf upgrade → second shelf → new product → checkout upgrade → **expansion** → Drinks department → first hire → achievements & shop themes → missions unlock → Expanded Shop → bakery/café → Super Shop → new locations (Downtown, Countryside, Waterfront, Shopping District, Airport, Night Market) → Mega Store → **franchise** (Stars and a permanent +25% revenue) → Head Office perks → Tycoon Flagship → retail empire.

The first twelve main quests form a contextual tutorial. A bouncing pointer shows the next thing to tap; it can be skipped, and "How to play" in the pause menu explains the basics or turns the tips back on. After the tutorial, side quests and daily/weekly missions rotate in.

## Testing
`tests/` covers economy formulas, transactions and edge cases (exact money, £0, overflow, invalid input), XP/levels/reputation, offline earnings (cap, clock rollback), prestige, and save/load (round trip, corrupt-main → backup, tamper detection, migrations, repair). It also has integration tests: a customer completes a purchase, a stocker restocks, a cashier opens a till, expansion updates navigation, an employee is removed mid-task, a full queue, deterministic speed and frame-rate independence, and isolation of a broken NPC. Further suites cover the Premium Shop purchase state machine, cosmetics, missions, rewarded ads, onboarding, analytics consent, save recovery, the camera projection (exactness, inverse, 360° wrap, face visibility, limits), shop tiers (requirements, caps, single charging, usable new floor) and the art pipeline (unique valid ids, every drawing inside its declared box, product/role/outfit coverage, furniture footprints matching placement, terrain and scenery clearances, themes and animation not affecting the simulation, save round-trips). The world suite (`tests/world.test.ts`) checks every map definition, world sizes, landmark coverage, reserved plots, a clear customer street at every plot, deterministic generation, artefact placement, once-only rewards, plot selection, save migration and the camera lock modes. Finally, a **60-minute balance bot** asserts healthy pacing (no 10-minute dead zones).
