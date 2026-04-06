# Pixel Gridiron

## Current State
- v33 deployed. Pure 2D Canvas renderer, player GIF as DOM img overlay.
- Renderer draws a perspective floor with lane lines converging at horizon.
- Collision uses worldZ float comparison (worldZ < COLLISION_Z) — ghost tackle bug persists.
- Grace period (1.5s) added to mask the bug but doesn't fix it.
- Player gets tackled on first hit, no multi-hit down system.
- No snap sequence (READY/SET/GO) — play starts immediately on button press.
- Service worker at v33.

## Requested Changes (Diff)

### Add
- Perspective trapezoid renderer: vanishing point top-center, 5 lanes as trapezoids, checkerboard turf. Each tile row is a horizontal strip, wider toward player, tiles appear as trapezoids.
- Tile-row crossing collision: player current lane (integer 0-4) matched against tile value at the row the player just entered. No worldZ float math. Fire when tileRow === currentMapRow.
- 3-hit down system: player takes 3 hits before play ends. Each hit shows stagger/flash, game continues.
- READY → SET → GO snap sequence on single button (same button cycles states). Idle until GO.
- SW bumped to v34.

### Modify
- renderer.ts: replace worldZToDepth/laneFracAtDepth perspective with proper trapezoid row-based rendering. Each visible tile row gets correct trapezoid geometry.
- collision.ts: remove worldZ-based checks, replace with tile-row crossing trigger. Track hitsThisPlay, end play only after 3 hits.
- movement.ts: add snapPhase state (ready/set/go). Field only advances when snapPhase=go.
- spawner.ts: obstacles appear at correct visual tile rows, not worldZ distances.
- game.ts: add hitsThisPlay, snapPhase, remove GRACE_PERIOD dependency.
- sw.js: bump CACHE_VERSION to pixel-gridiron-v34.

### Remove
- GRACE_PERIOD workaround in collision.ts.
- worldZ float collision comparison.

## Implementation Plan
1. Update sw.js to v34 (cache bust).
2. Rewrite renderer.ts: trapezoid perspective, 5 lanes, tile rows as trapezoid strips.
3. Rewrite collision.ts: tile-row crossing, 3-hit down system.
4. Update movement.ts: READY/SET/GO snap sequence gating.
5. Update game.ts types: add hitsThisPlay, snapPhase.
6. Update GameCanvas.tsx: snap button UI (shows READY/SET/GO text), wire new collision/movement.
