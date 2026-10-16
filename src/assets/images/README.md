# Optional bundled artwork

Drop a transparent PNG here named after an asset id, e.g. `product.soda.png` or `deco.tree_round.png`.
It is bundled by Vite and replaces that asset's procedural drawing once it loads. Rules:

- The id must already exist in the registry (see `docs/ART.md`); unknown names are ignored with a dev warning.
- The image's aspect ratio must match the asset's box within ±10% (it is drawn into that box, anchored the same way).
- Nothing is ever fetched from a remote URL. If a file is missing, fails to load or doesn't fit, the procedural art stays.

This folder currently holds **no** PNGs: every asset in the game is drawn procedurally.
