/**
 * spawner.ts — reads FIELD_MAP and pushes obstacles into gs.obstacles.
 * Called by the game loop when fieldZ crosses nextSpawnZ.
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

export function tickSpawner(gs: GameState): void {
  while (gs.fieldZ >= gs.nextSpawnZ && gs.mapRow < MAP_ROWS) {
    spawnRow(gs, gs.mapRow);
    gs.mapRow++;
    gs.nextSpawnZ += ROW_SPACING;
  }
  // Loop map endlessly
  if (gs.mapRow >= MAP_ROWS) {
    gs.mapRow = 0;
    gs.nextSpawnZ = gs.fieldZ + ROW_SPACING;
  }
}

function spawnRow(gs: GameState, rowIdx: number): void {
  const row = FIELD_MAP[rowIdx];
  if (!row) return;

  let emojiIdx = 0;
  for (let lane = 0; lane < 5; lane++) {
    const code = Number.parseInt(row[lane]) as TileCode;
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
