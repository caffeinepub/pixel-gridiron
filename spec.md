# Pixel Gridiron

## Current State
- Three.js 3D renderer with rear-view camera, humanoid player/defender meshes
- Modular codebase: movement.ts, spawner.ts, collision.ts, renderer.ts, game.ts
- sw.js versioned at pixel-gridiron-v20, basic cache-first strategy
- manifest.json references icon-192.png/icon-512.png (not yet generated, no actual icon assets)
- No "install to home screen" prompt in the app UI
- Field is a flat PlaneGeometry with a texture; no isometric tile floor
- Characters and defenders are full 3D humanoid builds with CylinderGeometry/BoxGeometry limbs
- Tile map (FIELD_MAP) has 50 waves of formations; item/defender patterns are mixed but not segmented by level
- Manifest icons reference missing files — install prompt won't work properly

## Requested Changes (Diff)

### Add
- **sw.js full debug update**: bump to v21, add precache of critical assets, add better error handling, add push/message event stubs for future, add background-sync stub, and add offline fallback to index.html
- **Install from home screen icon**: generate 192x192 and 512x512 PWA icons (football field / pixel art style), place in public/assets/icons/, update manifest.json with correct paths. Add an in-app "Install App" banner that fires the beforeinstallprompt event on Android Chrome
- **Isometric 2D tile floor**: Replace flat PlaneGeometry field with a 5-tile-wide isometric tile grid rendered in Three.js (5 columns x N rows of 64x64 unit isometric tiles, checkerboard turf pattern, yard line markings per row, endzone tiles gold-tinted). The tiles should scroll as the player advances, creating the movement illusion on an isometric perspective
- **Better character sprites**: Player mesh upgraded — add pixel-art style face texture on helmet, more defined shoulder pad geometry, better leg/arm proportions, add football prop in right hand. Wrap the humanoid in a semi-transparent canvas-texture billboard overlay (front-facing sprite aura) that animates with stride
- **Better defender sprites**: Each defender type gets a unique color scheme, a distinctive shape modifier (DT=wide/squat, DE=tall/angular, LB=medium/hunched, CB=slim/upright, S=slim with arms out), and a type-specific silhouette wrap (same billboard technique as player)
- **Level-based formation patterns**: Reorganize FIELD_MAP into 5 named level blocks (HighSchool, College, Pro, SuperBowl, HallOfFame), each ~50-60 rows. Level 1 (HighSchool) = simple spread patterns, gap always open. Level 2 (College) = staggered DE/LB, crate alleys. Level 3 (Pro) = tight formations, power-ups scarce. Level 4 (SuperBowl) = blitz packages, safety nets. Level 5 (HallOfFame) = near-wall formations, forced spin/hurdle patterns

### Modify
- manifest.json: update icon paths to /assets/icons/icon-192.png and /assets/icons/icon-512.png; add screenshots array stub
- renderer.ts: replace flat field plane with isometric tile grid; upgrade player/defender mesh builders; add billboard overlay system
- types/game.ts: update FIELD_MAP to level-segmented patterns (HighSchool through HallOfFame); update MAP_ROWS
- index.html: add beforeinstallprompt listener and install button markup

### Remove
- Nothing removed; all existing game systems are preserved

## Implementation Plan
1. Generate 192x192 and 512x512 PWA icons (pixel-art football field style)
2. Write new sw.js (v21) with precache, offline fallback, error handling, event stubs
3. Update manifest.json with correct icon paths + add display_override and screenshots
4. Update index.html to include install prompt banner logic (beforeinstallprompt)
5. Rewrite renderer.ts: isometric tile floor (5 cols × scrolling rows), upgraded player mesh with billboard aura, upgraded defender meshes per type with silhouette wraps
6. Rewrite FIELD_MAP in types/game.ts: 5 level blocks with named formation patterns suited to each stage
7. Update spawner.ts to use careerStage to select the correct FIELD_MAP block
