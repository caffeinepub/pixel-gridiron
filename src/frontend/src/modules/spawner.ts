/**
 * spawner.ts v22 — reads level-specific FIELD_MAP and pushes obstacles.
 * FIXED: endzone check tests all 5 chars, not just row[0].
 * FIXED: map loop-back only fires when not already in touchdown/tackled phase.
 */
import {
  DEFENDER_STATS,
  EMOJI_POWERUPS,
  type GameState,
  type Obstacle,
  ROW_SPACING,
  SPAWN_Z,
  TILE_DEF_TYPE,
  type TileCode,
  getFieldMap,
} from "../types/game";
import { endPlay } from "./collision";

export function tickSpawner(gs: GameState): void {
  if (gs.phase !== "playing") return;
  const fieldMap = getFieldMap(gs.careerStage);
  const mapRows = fieldMap.length;

  while (gs.fieldZ >= gs.nextSpawnZ && gs.mapRow < mapRows) {
    const row = fieldMap[gs.mapRow];
    // FIXED: check full row for endzone, not just first character
    if (row?.split("").every((c) => c === "8" || c === "0")) {
      gs.touchdown = true;
      endPlay(gs);
      return;
    }
    spawnRow(gs, gs.mapRow, fieldMap);
    gs.mapRow++;
    gs.nextSpawnZ += ROW_SPACING;
  }

  // Map exhausted — loop from wave 2 (skip scrimmage row) only if still playing
  if (gs.mapRow >= mapRows && !gs.touchdown && gs.phase === "playing") {
    gs.mapRow = 2;
    gs.nextSpawnZ = gs.fieldZ + ROW_SPACING;
  }
}

function spawnRow(
  gs: GameState,
  rowIdx: number,
  fieldMap: readonly string[],
): void {
  const row = fieldMap[rowIdx];
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
