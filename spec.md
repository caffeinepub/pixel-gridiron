# Pixel Gridiron

## Current State
V21 ships a Three.js game with modules: GameCanvas.tsx, movement.ts, spawner.ts, collision.ts, renderer.ts, sw.js v21.
Core bugs identified via full audit:
- RAF loop gets recreated every forceUpdate call → double RAF, orphaned handles, jank
- `tackleFired` can fire twice; handleNextPlay races with parent state reset
- XP/skills stored only in gameStateRef — if App.tsx doesn't copy back to profile between plays, progression is silently lost
- Lane chaining: double-tap mid-slide snaps back to origin instead of chaining
- Speed cap formula: MAX_SPEED unreachable until skill rank 13+ (feels weak throughout game)
- Tile floor scroll has phase discontinuity (periodic floor pop visual jank)
- Float text sprites are index-keyed not ID-keyed — wrong text shown after array shifts
- Camera double-smoothed follow produces twitch on lane commit frame
- Stride animation is frame-rate-dependent not time-based
- buildTileMaterial leaks 100 material instances per stage change
- collision.ts float positions use canvas-pixel coords that renderer ignores

## Requested Changes (Diff)

### Add
- Stable float ID counter so float sprites never mismatch text
- XP/skill/level copy-back from gameStateRef into App profile on every play end
- Time-based stride animation (uses elapsed seconds, not frame count)
- Lane-chain support: queuing next target lane mid-slide rather than restarting from origin

### Modify
- GameCanvas.tsx: move `loop` out of React render cycle; use a stable ref for the RAF callback; forceUpdate only triggers overlay re-render, not loop restart
- GameCanvas.tsx: `tackleFired` guard tightened; handleNextPlay waits for parent reset via callback promise or sequential setState
- movement.ts: fix speed cap so turbo feels impactful at all skill levels; fix lane chain logic
- renderer.ts: fix tile scroll formula (remove 1.2 multiplier); key float sprites by stable ft.id not array index; remove material leak in buildTileMaterial; fix camera to single-layer smoothing
- spawner.ts: endzone check full row, not just row[0]; guard against infinite map loop-back
- collision.ts: remove laneX() call for float positioning (renderer uses cameraPivotX anyway)
- sw.js: bump to pixel-gridiron-v22

### Remove
- Dead `yardsToGo === undefined` guard in movement.ts
- Orphaned canvas-pixel `ft.x` assignment in collision.ts (unused by renderer)
- 1.2 scroll multiplier causing tile floor pop

## Implementation Plan
1. Rewrite GameCanvas.tsx with stable RAF ref pattern (loop stored in rafCallbackRef, never recreated)
2. Fix movement.ts: speed cap, lane chaining, time-based stride, remove dead guard
3. Fix renderer.ts: scroll formula, float ID keying, single-layer camera, material dispose
4. Fix spawner.ts: full endzone row check
5. Fix collision.ts: remove unused pixel-coord float positions
6. Bump sw.js to v22
7. Validate build
