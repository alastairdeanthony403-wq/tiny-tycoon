# Art direction and asset pipeline

Tiny Tycoon's look is a **"Cute Isometric Diorama"**: a small, bright, toy-like world with rounded shapes, soft outlines, top-left lighting, contact shadows and chibi characters. It is seen through the real orthographic 360° camera described in [CAMERA_AND_EXPANSION.md](CAMERA_AND_EXPANSION.md).

> **What exists today:** every asset in the game is drawn **procedurally in code** (Canvas 2D). There are no sprite sheets or PNG files in the repository. A bundled-PNG override slot exists (see [Replacing art with PNGs](#replacing-art-with-pngs)), but `src/assets/images/` is empty. The procedural art is consistent and complete enough to ship a prototype. A commercial release would probably still want an artist pass, described at the end.

## Specification (`src/assets/spec.ts`)

| Rule | Value |
|---|---|
| Floor tile at the default camera | 64 × 32 px (world px at zoom 1) |
| Character height (feet to top of head) | ~36 px, big head (radius 8.8 px) |
| Product art box | 32 × 32 px, anchored bottom centre (16, 30) |
| UI icon sizes | 32, 48, 64 px (thumbnails are baked from the same art) |
| Light | from the upper left: highlight top-left, shade bottom-right |
| Outline | `rgba(43,30,45,0.55)`, 1.2 px. Never pure black |
| Contact shadow | ellipse under the anchor, `rgba(43,45,66,0.22)` |
| Sprite padding | 2 px transparent margin so outlines are never clipped |
| Ids | `family.lower_snake_case`, family ∈ product, char, staff, outfit, furniture, terrain, deco, env, theme, location, ui |
| Animation timing | walk 0.5 s, idle 2.6 s, work 0.35 s, celebrate 0.6 s per cycle |
| Palette | `ART.palette`: primary, secondary, neutral and accent sets, plus 6 skin tones and 8 hair colours |

Shared drawing helpers in `src/assets/draw.ts` (`shadeFill`, `contactShadow`, `pack`, `blob`, `shine`, `mark`…) apply these rules, so new art matches automatically.

## How assets cope with the 360° camera

Each asset declares a `camera` strategy:

- **geometry**: built from projected 3D boxes every frame, so it really rotates. Used for walls, floors, all furniture (`render/sprites.ts`), buildings, cars, the plane, fences and the stockroom annex (`render/world.ts`).
- **billboard**: a flat sprite that always faces the camera. Used for people, products on displays, trees, lamps and other small props, and emote icons. People switch between front and back views and mirror left and right from their walking direction relative to the camera.
- **ground**: painted flat on the ground plane. Terrain is baked once per location and shop size into a top-down canvas, then drawn with an affine transform that matches the projection, so it rotates and tilts exactly like the floor with no seams.

Painter's sorting uses the rotated depth from `render/iso.ts`. Scenery between the camera and the shop fades to 35% so it never hides the shop.

## Pipeline (`src/assets/`)

```
spec.ts            the art specification (numbers above)
types.ts           AssetDef: id, category, size, anchor, footprint, layer, camera, draw, image, animation, label, ref
registry.ts        registerAsset / getAsset / listAssets / validateAsset / assetDiagnostics + the fallback asset
spriteCache.ts     bakes assets to offscreen canvases per zoom × DPR bucket; drawSprite(); thumbnail() for the DOM UI
images.ts          optional bundled PNG overrides (import.meta.glob, no network)
draw.ts            shared drawing helpers
art/products.ts    product artwork (fictional brands only)
art/characters.ts  the chibi character renderer (poses, hair, tops, headwear, accessories, props)
characters.ts      customer archetypes, staff role looks, outfits, deterministic appearance
art/people.ts      registry entries + portraits for archetypes, staff roles and outfits
art/furniture.ts   registry entries + thumbnails for every placeable object
art/environment.ts outdoor props (trees, lamps, benches, umbrellas…) + terrain swatches
art/themes.ts      theme previews and location thumbnails
art/ui.ts          emotes, star/crown ornaments, drop, barrier
terrain.ts         terrain types (paint order, soft/hard edges, detail pattern)
locations.ts       the six location art sets (terrain function, layout, traffic) + seasonal decor
index.ts           registerBuiltinAssets()
```

Safety rules built into the pipeline:

- **Validation:** `registerAsset` rejects bad ids, duplicates, sizes outside 1–512 px, anchors outside the box, non-whole footprints and assets with nothing to draw. Problems are listed in `assetDiagnostics()` and warned about in dev builds.
- **Fallback:** `getAsset` never throws. An unknown id returns `fallback.missing` (a grey crate marked "?") and is recorded as missing. If a drawing throws while baking, the fallback is baked instead.
- **Caching:** sprites are baked once per id and scale bucket (max 1,500 entries). Terrain is baked once per location and size. Thumbnails are cached data URLs.
- **No external files:** nothing is loaded from a URL. Bundled PNGs come only from `src/assets/images/` through Vite.

## Content

### Characters
- **Customer archetypes** (`ARCHETYPES`): Student, Shopper, Gamer, Senior, Tourist, Trendsetter, each with 3 outfit variants plus random skin, hair and hairstyle. `TYPE_ARCHETYPES` maps the gameplay customer types (student, regular, child, office, impatient, foodie, rich, tourist, celebrity) to looks. The look is picked by a hash of the customer's id, so it is stable and never consumes the simulation's random numbers. Behaviour still comes only from the gameplay type.
- **Staff roles** (`STAFF_LOOKS`):
  - Cashier: polo, visor, name tag.
  - Stocker: vest, cap.
  - Cleaner: coverall, mop.
  - Chef: whites, toque.
  - Manager: blazer, tie, lanyard, clipboard.
- **Poses:** idle, walk, carry, browse, reach, queue, pay, work, restock, clean, celebrate. The renderer maps each simulation state to a pose. Animation reads the state; it never writes it (a test runs the sim with and without drawing and compares).
- **Outfits** (`OUTFITS`): Smart Suits and Retro Diner come in the existing *Staff Outfits* pack. Barista, Chef Whites, Space Explorer and Holiday come in the new **Gems-only** *Deluxe Outfits* pack (250 💎, level 6). Outfits change clothes and hats but keep each role's tools. An unknown or unowned outfit falls back to the standard uniform.

### Products
All 32 products have their own drawing (`art/products.ts`), including the 18 requested families: sandwich, coffee, soda, water, crisps, candy, milk, bread, eggs, toilet paper, laundry, soap, books, toys, electronics (headphones, console), cosmetics (perfume), pet food and flowers. Brands are invented (CRUNCH, FIZZ, AQUA, MOO…). Eight of them are new gameplay products: water, eggs, flowers, books, plus toilet paper, soap, laundry and pet food in a new **Household** department.

### Furniture and interior
- Every placeable object has a `furniture.<id>` entry with a 1×1 footprint. A test places each object in a real shop and checks it occupies exactly that many tiles.
- Interior details:
  - belt-barrier stanchions along every queue lane (themed trim colour);
  - a stockroom annex with a roll-up door and crates behind the stockroom door;
  - procedural ornaments in place of the old ⭐/👑 emoji;
  - procedural emote icons in place of emoji faces.

### Terrain, scenery and locations
- **Terrain types** (`terrain.ts`): grass, pavement, road, water (animated glints), sand, rock, dirt, field, tarmac, cobble, boardwalk. Soft terrains spill over lower ones with bumpy edges. Hard ones get a kerb line. Water gets a foam line where it meets land.
- **Location sets** (`locations.ts`, mapped from gameplay locations in `LOCATION_ART`):
  - Town (Neighbourhood): houses, mailboxes, picket fences, a park pond, benches, trees, streetlights, cars.
  - City (Downtown): office towers with lit windows, a plaza fountain, bus stop, road sign, planters, cars.
  - Beach: sea with boats, boardwalk, sand, beach huts, palms, umbrellas, towels, lifebuoys, rocks.
  - Airport: tarmac with runway lights and a parked plane, terminal, control tower, windsock, cones.
  - Night Market: cobbles, food stalls with canopies, lanterns that glow at night, string lights, crates.
  - Countryside (new location: £60K, level 11): fields, a scarecrow, hay bales, barn and silo, farmhouse, fences, pond, dirt path, cars.
- **Seasonal decor:** pumpkins and leaf piles (Halloween), snow piles (winter), flower beds (spring), umbrellas (summer). These follow the game's existing season calendar.

### Themes
Default, **Neon Nights**, **Golden Shelves**, **Cozy Autumn** (new, 120 💎, level 8) and **Ocean Breeze** (new, 120 💎, level 12). Themes are data in `render/skins.ts` and include:
- palette, shelf, checkout, sign and uniform colours;
- one scene effect each: neon tubes, warm gold light, drifting leaves, floor caustics. Under reduced motion the effects are static.

Themes are cosmetic only: the simulation never reads them, and a test checks that money, sales, customers and XP are identical under every theme and outfit. They can be previewed live from the Premium Shop. They persist in the save as `monetization.equipped.skin`, and unknown values are dropped on load.

**Purchases:** the new items are **Gems only** (`realMoney: false`, no dev price). Nothing is granted without the normal Gem purchase confirmation, and no real-money integration was added.

## How to add assets

**A product:** add the product to `src/config/products.ts` and its locale strings. Then add a drawing to the `P` record in `art/products.ts`, keyed by the product id, inside the 32×32 box. It is registered as `product.<id>` automatically. The tests fail if a product only gets the generic fallback.

**A customer look:** add a variant to an archetype in `characters.ts`, or a new archetype and its entry in `TYPE_ARCHETYPES`. **A staff role:** add an entry to `STAFF_LOOKS` (the test checks every role in `config/staff.ts` has one). **An outfit:** add it to `OUTFITS` and to a catalog product's `grant.outfits`, plus locale keys `premium.outfit.<id>` and `premium.contents.outfit_<id>`.

**Furniture:** add the object to `config/objects.ts` (which needs locale strings) and its geometry case in `render/sprites.ts`. The registry entry, footprint and thumbnail are generated.

**A prop:** add an entry to `PROPS` in `art/environment.ts` with size, anchor and draw. It becomes `deco.<id>`. Place it from a location set's `layout()`.

**A terrain type:** add it to `TERRAIN` in `terrain.ts` with a z order, soft or hard edge and a detail pattern. Then use it in a set's `terrainAt()`.

**A location set:** add a `LocationSet` to `LOCATION_SETS` with a terrain function, layout, traffic and icon. Map the gameplay location id in `LOCATION_ART`.

**A theme:** add an entry to `SHOP_SKINS` in `render/skins.ts`. If it needs a new scene effect, draw it in the renderer and respect `reducedMotion`. Add a catalog product granting `{ kind: 'skin', skin: id }` and its locale strings.

After any change, `npm test` checks:
- ids, metadata and drawing bounds (every drawing is traced with a recording context against its declared box);
- product coverage, roles, outfit fallback, footprints;
- terrain sets and scenery clearances;
- theme invariance and save round-trips.

## Replacing art with PNGs

1. Export a transparent PNG at 2–4× the asset's declared size, with the same aspect ratio (±10%) and the ground contact point in the same relative place as the asset's `anchor`.
2. Name it after the asset id and put it in `src/assets/images/`, e.g. `product.soda.png` or `deco.tree_round.png`.
3. Rebuild. The image loads at start-up and replaces the drawing in the world and in UI thumbnails. If it is missing, fails to load or has the wrong shape, the procedural art stays and `imageDiagnostics()` says why.

Billboards and products are the best candidates for PNGs. Geometry assets (furniture, buildings) and ground terrain are built from projected 3D shapes so they rotate. A flat image cannot rotate, so they keep their procedural form unless they are redesigned as billboards.

## Honest status and next steps

- **Done and verified:** registry, cache, fallback, validation and diagnostics; procedural art for every product, character, staff role, outfit, prop, terrain, theme and location; the UI shows real thumbnails; and tests for all of the above.
- **Not done:** no hand-painted or generated bitmap art exists. Characters are procedurally animated (bob, swing, reach), not frame-by-frame sprite animation. Furniture has one design per tier family rather than unique sculpted models per tier.
- **Recommended for a commercial release:**
  - an illustrator pass on the 18 hero products, the 6 archetypes and the 5 staff roles, dropped in as PNG overrides;
  - a unique hero model for each shop tier's signature fixtures;
  - a sound and art review on real devices.
