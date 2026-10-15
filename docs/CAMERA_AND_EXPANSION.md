# Camera & physical shop expansion

## Renderer and camera

Tiny Tycoon draws with Canvas 2D. Every floor tile, wall, counter and shelf is built from corners
projected by one function, `iso()` in `src/render/iso.ts`. That function is now a real
orthographic camera:

- **Yaw** (rotation about the vertical axis): unlimited, full 360°. The camera keeps an unbounded
  angle, so passing 0°/360° never jumps. Reset turns back the short way.
- **Pitch** (tilt): 20°–60° (`src/config/camera.ts`). 30° is the classic 2:1 isometric view; the
  default view reproduces the original projection exactly (unit-tested).
- **Pivot**: the shop centre, so the shop rotates in place; when the shop grows the camera is
  compensated so the picture doesn't jump.
- **Zoom / pan**: player zoom on top of automatic "fit the shop" framing (0.5×–3×, with an absolute
  cap), and pan in *ground* tiles (it rotates with the scene), clamped to half the shop + 3 tiles.

How the scene stays correct from every angle:

- `box()` draws only the side faces that face the camera; trims, glass doors and shelf boards use
  `frontChain()/frontSides()` so they follow the visible faces.
- Objects, people, crates and scenery are depth-sorted with `depth()` for the current angle.
- All four walls exist. Walls whose inside faces the camera are drawn full height (with windows,
  lights, trims); walls between the camera and the interior are cut down to a low skirting
  ("dollhouse" view) so the shop is never hidden.
- Trees, buildings and street people between the camera and the shop are drawn in front and fade
  where they would cover the shop.

### Limitations (honest)

- People, product icons, emotes and labels are flat **billboards** that always face the camera.
- Walls nearest the camera are cut away; the outside face of the building is not modelled.
- Some objects have a front-only detail (oven door, arcade screen): from behind you see the plain
  back of the box, as you would in reality.
- It is still a 2.5D renderer: the camera cannot go below the floor or inside objects, so there is
  nothing to clip through, but there is no perspective (orthographic only).

### Controls

| Action | Touch | Mouse / keyboard | Buttons |
|---|---|---|---|
| Rotate & tilt | one-finger drag | left-drag; Q/E rotate, T/G (PgUp/PgDn) tilt | ⟲ ⟳, ⋯ → ⤒ ⤓ |
| Move the view | two-finger drag | right-drag or Shift/Ctrl/Alt-drag; arrow keys | ⋯ → ✋ makes one-finger drag pan |
| Zoom | pinch | wheel; + / − | ⋯ → ＋ － |
| Frame the shop | — | F | ⋯ → ⛶ |
| Reset view | — | 0 / Home, double-click | 🎯 |

A drag never counts as a tap, so camera gestures can't select, restock or buy anything. Gestures
only start on the shop canvas: panels, menus and buttons never move the camera. Settings → Camera:
speed (slow/normal/fast), what one-finger drag does, and "Remember camera view" (saved with the
game). Reduced motion makes camera transitions instant.

## Physical expansion and shop tiers

The shop grid really grows (`src/config/expansions.ts`, 3×3 → 12×12 across 10 stages); new tiles
are usable for displays, decorations, customers and staff paths, and existing objects keep their
positions. The stages are grouped into five named tiers (`src/config/shopTiers.ts`):

| Tier | Stages (size) | Building | Real limits |
|---|---|---|---|
| Starter Shop | 3×3–4×4 | windows | 2 checkouts, ½ decorations |
| Expanded Shop | 5×5–6×6 | taller walls, skirting boards, framed entrance | 3 checkouts, ¾ decorations |
| Super Shop | 7×7–8×8 (needs £15K lifetime revenue) | wall band, corner pillars, tiled floor | 4 checkouts, full decorations |
| Mega Store | 9×9–10×10 (needs £100K) | wall lights, floor border | 5 checkouts |
| Tycoon Flagship | 11×11–12×12 (needs £600K) | gold cornice & pillars, marble medallion, grand sign | 6 checkouts, 1¼ decorations |

Staff capacity already grows with every stage. Every expansion: requirement check (level,
lifetime revenue, cash) → confirmation with price and gains → one charge
(`ShopManager.expand`, which also starts construction, so it can't be bought twice) → the grid,
navigation, walls and camera framing update when construction completes → summary popup, saved.
The Shop panel's "Shop size" section shows the current tier with real numbers, the next
expansion's requirements with progress, what it adds, and a floor-plan preview of the actual layout.
Cosmetic themes (Neon Nights, Golden Shelves) apply to every size and angle.
