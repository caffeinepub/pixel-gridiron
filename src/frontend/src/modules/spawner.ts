/**
 * spawner.ts — reads FIELD_MAP and pushes obstacles into gs.obstacles.
 * Tile 8 = endzone. When the player reaches an endzone row it triggers touchdown.
 * The map plays once end-to-end (no looping) — 300 tiles of football field.
 */
import {
  DEFENDER_STATS,
  EMOJI_POWERUPS,
  FIELD_MAP,
  type GameState,
  MAP_ROWS,
  type Obstacle,
  ROW_SPACING,
  SPAWN_Z,
  TILE_DEF_TYPE,
  type TileCode,
} from "../types/game";
import { endPlay } from "./collision";

export function tickSpawner(gs: GameState): void {
  // Advance through map rows as field progresses
  while (gs.fieldZ >= gs.nextSpawnZ && gs.mapRow < MAP_ROWS) {
    const row = FIELD_MAP[gs.mapRow];
    if (row && row[0] === "8") {
      // Endzone row reached — touchdown!
      gs.touchdown = true;
      endPlay(gs);
      return;
    }
    spawnRow(gs, gs.mapRow);
    gs.mapRow++;
    gs.nextSpawnZ += ROW_SPACING;
  }

  // If we've exhausted the map without hitting endzone, loop from wave 2
  // (skip scrimmage line 99999 at row 0)
  if (gs.mapRow >= MAP_ROWS && !gs.touchdown) {
    gs.mapRow = 2;
    gs.nextSpawnZ = gs.fieldZ + ROW_SPACING;
  }
}

function spawnRow(gs: GameState, rowIdx: number): void {
  const row = FIELD_MAP[rowIdx];
  if (!row) return;

  let emojiIdx = 0;
  for (let lane = 0; lane < 5; lane++) {
    const code = Number.parseInt(row[lane]) as TileCode;
    // 0 = open, 8 = endzone, 9 = startline — nothing to spawn
    if (code === 0 || code === 8 || code === 9) continue;

    const defType = TILE_DEF_TYPE[code];

    if (defType) {
      push(gs, {
        id: gs.nextId++,
        lane,
        worldZ: SPAWN_Z,
        type: "defender",
        hp: DEFENDER_STATS[defType].hp,
        defenderType: defType,
        broken: false,
        breakTimer: 0,
      });
    } else if (code === 2) {
      const pwrs = [
        { type: "speed" as const, label: "+SPEED", color: "#FFD700" },
        { type: "shield" as const, label: "SHIELD", color: "#2E7BD6" },
        { type: "extra_down" as const, label: "+HP", color: "#3FAE5A" },
        { type: "multiplier" as const, label: "2X", color: "#D4A017" },
      ];
      push(gs, {
        id: gs.nextId++,
        lane,
        worldZ: SPAWN_Z,
        type: "crate",
        hp: 1,
        powerUp:
          Math.random() < 0.6
            ? pwrs[Math.floor(Math.random() * pwrs.length)]
            : undefined,
        broken: false,
        breakTimer: 0,
      });
    } else if (code === 3) {
      const ep = EMOJI_POWERUPS[emojiIdx % EMOJI_POWERUPS.length];
      emojiIdx++;
      push(gs, {
        id: gs.nextId++,
        lane,
        worldZ: SPAWN_Z,
        type: "crate",
        hp: 1,
        emojiPowerUp: ep,
        broken: false,
        breakTimer: 0,
      });
    }
  }
}

function push(gs: GameState, obs: Obstacle): void {
  gs.obstacles.push(obs);
}
