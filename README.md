# 🏪 Tiny Tycoon

A cute, casual shop-management / incremental tycoon game. You start with a tiny 3×3 shop and grow it into a retail empire: sell products, upgrade shelves and checkouts, expand the building, hire staff who really walk around, open departments and new locations, then franchise for permanent bonuses.

**Stack:** TypeScript, Vite, Canvas 2D (isometric diorama renderer), DOM UI, Web Audio (all sounds and music are synthesized), Vitest. There are no art or audio asset files; everything is drawn and generated in code.

```bash
npm install
npm run dev        # play at http://localhost:5173 (debug panel enabled: 🐞 button)
npm test           # unit + integration + balance tests
npm run build      # typecheck + production build in dist/
BALANCE_REPORT=1 npx vitest run tests/balance.test.ts   # print the 60-minute pacing report
```

## Premium Shop (monetization)
Tap the 💎 balance in the HUD. Gems are earned by claiming achievements and milestones, and every item except Gem packs can be unlocked with them. In `npm run dev` (or a build made with `VITE_SIMULATED_STORE=1`) real-money items go through a **clearly labelled test store**, where no money moves. In other builds those items show as unavailable until the native billing bridge exists. Architecture, iOS and Android integration steps, the backend contract and the compliance checklist are in [docs/MONETIZATION.md](docs/MONETIZATION.md).

## Controls
- **Tap / click**: objects open the inspector. Tapping a low shelf restocks it, and tapping a checkout serves faster.
- **Drag** to pan, **pinch / wheel** to zoom, **double-click** or `0` to reset the camera.
- Keyboard: `1–5` switch tabs, `R` rotates while placing, `Enter` places, `Esc` goes back or opens pause.

## Architecture

```
src/
  config/     data-driven content & ALL balance values (economy.ts is the central balance file)
  core/       state types, initial state, event bus, seeded RNG, i18n, formatting
  sim/        headless simulation (no DOM): one manager per system
              game.ts (fixed-timestep orchestrator) · economy · shop (grid/placement/expansion/departments)
              inventory · customers (AI state machine) · checkout (queues) · employees (worker AI)
              upgrades · progression (XP/levels/reputation) · quests · achievements (+milestones)
              events (rush hour, crates…) · locations · prestige (franchise/perks/cosmetics) · offline · debug
  save/       versioned saves: checksum, backup slot, migrations, validation/repair
  render/     isometric Canvas renderer, camera, pooled particles, sprites
  audio/      Web Audio synth SFX (categories + pitch variation) and adaptive procedural music
  ui/         DOM UI: HUD, 5 tab panels, inspector, popups, toasts, tutorial pointer, menus, debug
  services/   analytics hooks, notifications, haptics
  locales/    en.ts (every player-facing string is a key)
```

Key design decisions:
- **Simulation is separate from rendering.** The sim runs at a fixed 20 Hz timestep, so FPS never affects the economy. Game speed (0.5×–10×, debug) scales sim time only and never touches real timestamps.
- **Robust NPCs.** Every customer, employee and checkout updates inside its own try/catch, and every state has a stuck timeout. Paths are recomputed after any layout change, so expanding, selling or moving objects mid-walk never strands anyone.
- **Placement validation** keeps the door, stockroom, access tiles and queue lanes reachable (BFS connectivity check) and shows ✓/✗ previews. The previews use symbols as well as colour, so they work for colour-blind players.
- **Anti-exploit:** all transactions are validated (finite, non-negative, affordable) and money is clamped. One-shot rewards carry claimed flags, UI actions are guarded against double taps, and the crate is cleared before it pays out. Offline time is capped and gives nothing if the clock moves backwards.
- **Light failure:** money never goes negative (wages included), reputation never drops below a tier you reached, and there is no game over.
- **Data-driven content:** adding a product, upgrade, quest, event, location, theme or season only needs a data entry (plus locale strings, which a test enforces).

## Progression at a glance
Tiny shop → first sale → shelf upgrade → second shelf → new product → checkout upgrade → **expansion** → Drinks department → first hire → bakery/café → bigger shop → new locations (Downtown, Beach, Airport, Night Market) → **franchise** (Stars and a permanent +25% revenue) → Head Office perks → retail empire.

The first ten main quests form a contextual tutorial. A bouncing pointer shows the next thing to tap; after the tutorial, side quests rotate in.

## Testing
`tests/` covers economy formulas, transactions and edge cases (exact money, £0, overflow, invalid input), XP/levels/reputation, offline earnings (cap, clock rollback), prestige, and save/load (round trip, corrupt-main → backup, tamper detection, v1 migration, repair). It also has integration tests: a customer completes a purchase, a stocker restocks, a cashier opens a till, expansion updates navigation, an employee is removed mid-task, a full queue, deterministic speed and frame-rate independence, and isolation of a broken NPC. Finally, a **60-minute balance bot** asserts healthy pacing (no 10-minute dead zones).
