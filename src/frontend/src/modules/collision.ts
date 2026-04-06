/**
 * collision.ts v34 — Tile-row crossing collision. 3-hit down system.
 * - NO worldZ float math for collision. NO grace period.
 * - Collision fires when player's mapRow changes and the entered tile matches player lane.
 * - 3 hits to end a play (not 1). Each hit registers damage + hurtFlash.
 * - endPlay only called when hitsThisPlay >= 3 OR hp <= 0.
 */
import {
  BREAK_DUR,
  DEFENDER_STATS,
  type GameState,
  TILE_DEF_TYPE,
  stageMult,
} from "../types/game";

const DEFENDER_DAMAGE: Record<string, number> = {
  dt: 25,
  lb: 20,
  de: 18,
  cb: 12,
  s: 12,
};

function playerLaneInt(gs: GameState): number {
  return Math.round(gs.fromLane + (gs.targetLane - gs.fromLane) * gs.laneT);
}

/**
 * Called each frame from the game loop when phase=playing.
 * prevMapRow: the mapRow value from BEFORE this frame's spawner tick.
 * This lets us detect when the player just crossed into a new tile row.
 */
export function detectCollisions(gs: GameState, prevMapRow: number): void {
  if (gs.touchdown) return;

  // Only check when the player has advanced into a new tile row
  if (gs.mapRow <= prevMapRow) return;

  // Check every row the player crossed this frame (usually just 1)
  for (let r = prevMapRow; r < gs.mapRow; r++) {
    checkTileRow(gs, r);
    if (gs.phase !== "playing") return; // play ended mid-check
  }
}

function checkTileRow(gs: GameState, rowIdx: number): void {
  // Get field map for this stage inline (avoids circular import from game.ts getFieldMap)
  const fieldMap = getFieldMapInline(gs.careerStage);
  if (rowIdx < 0 || rowIdx >= fieldMap.length) return;

  const row = fieldMap[rowIdx];
  if (!row) return;

  const playerLane = playerLaneInt(gs);
  if (playerLane < 0 || playerLane > 4) return;

  const tileChar = row[playerLane];
  if (!tileChar) return;
  const code = Number.parseInt(tileChar);
  if (Number.isNaN(code) || code === 0 || code === 9) return;

  // Endzone
  if (code === 8) {
    gs.touchdown = true;
    endPlay(gs);
    return;
  }

  // Mark corresponding obstacle as broken (visual feedback)
  markObstacleBroken(gs, playerLane, rowIdx);

  const mult = stageMult(gs.careerStage);

  // Crate (code 2)
  if (code === 2) {
    gainXp(
      gs,
      Math.round(12 * mult),
      `+${Math.round(12 * mult)} XP`,
      "#3FAE5A",
    );
    return;
  }

  // Power-up (code 3)
  if (code === 3) {
    const epList = [
      { emoji: "⚡", effectType: "speed", label: "SPEED!", color: "#FFD700" },
      { emoji: "🔥", effectType: "turbo", label: "TURBO!", color: "#FF6347" },
      { emoji: "🌟", effectType: "star", label: "STAR!", color: "#FFD700" },
      { emoji: "🏈", effectType: "extraDown", label: "+HP!", color: "#3FAE5A" },
    ];
    const ep = epList[rowIdx % epList.length];
    if (ep) {
      gs.playItems.push(ep.emoji);
      gainXp(gs, 5, ep.label, ep.color);
      switch (ep.effectType) {
        case "speed":
        case "turbo":
          gs.turboActive = true;
          gs.turboTimer = 3.5;
          break;
        case "star":
          gs.shieldActive = true;
          gs.shieldTimer = 5;
          gs.multiplier = 2;
          gs.multiplierTimer = 5;
          break;
        case "extraDown":
          heal(gs, 40);
          break;
      }
    }
    return;
  }

  // Defender tiles (1, 4, 5, 6, 7)
  const defType = TILE_DEF_TYPE[code as keyof typeof TILE_DEF_TYPE];
  if (!defType) return;

  const xpReward = Math.round(DEFENDER_STATS[defType].xpReward * mult);

  if (gs.spinning) {
    gainXp(gs, xpReward * 2, "SPIN BREAK!", "#FFD700");
    return;
  }

  if (gs.shieldActive) {
    gs.shieldActive = false;
    gs.shieldTimer = 0;
    gainXp(gs, xpReward, "BLOCKED!", "#2E7BD6");
    return;
  }

  const powerTier = Math.floor((gs.skills.power ?? 0) / 4);
  if (powerTier >= 3 || (powerTier >= 2 && defType === "de")) {
    gainXp(gs, xpReward, "BULLDOZED!", "#FFD700");
    return;
  }

  const shedChance = (gs.skills.breakTackle ?? 0) * 0.08;
  if (Math.random() < shedChance) {
    gainXp(gs, Math.round(xpReward * 0.5), "SHED!", "#FF6B35");
    return;
  }

  // Register a hit
  const dmg = DEFENDER_DAMAGE[defType] ?? 18;
  damage(gs, dmg);
  gs.hitsThisPlay = (gs.hitsThisPlay ?? 0) + 1;

  // Show hit count
  addFloat(gs, `HIT! ${gs.hitsThisPlay}/3`, "#C63A3A");

  // End play only after 3 hits OR hp depleted
  if (gs.hitsThisPlay >= 3 || gs.hp <= 0) {
    endPlay(gs);
  }
}

function markObstacleBroken(
  gs: GameState,
  lane: number,
  _rowIdx: number,
): void {
  // Find the closest unbroken obstacle in this lane and mark it broken
  let closest: (typeof gs.obstacles)[0] | null = null;
  let closestZ = Number.POSITIVE_INFINITY;
  for (const obs of gs.obstacles) {
    if (obs.broken) continue;
    if (obs.lane !== lane) continue;
    if (Math.abs(obs.worldZ) < closestZ) {
      closestZ = Math.abs(obs.worldZ);
      closest = obs;
    }
  }
  if (closest) {
    closest.broken = true;
    closest.breakTimer = BREAK_DUR;
  }
}

// Inline field map lookup to avoid circular import
function getFieldMapInline(stage: string): readonly string[] {
  // These are imported lazily to avoid circular deps
  const maps: Record<string, readonly string[]> = {
    HighSchool: [
      "99999",
      "00000",
      "10000",
      "00000",
      "00000",
      "00022",
      "00000",
      "33000",
      "00000",
      "10001",
      "00000",
      "00000",
      "00200",
      "00000",
      "30030",
      "00000",
      "10002",
      "00000",
      "00000",
      "02020",
      "00000",
      "03003",
      "00000",
      "00100",
      "00000",
      "00000",
      "22022",
      "00000",
      "33333",
      "00000",
      "00400",
      "00000",
      "00000",
      "00000",
      "03000",
      "00000",
      "12001",
      "00000",
      "00000",
      "88888",
      "88888",
      "88888",
    ],
    College: [
      "99999",
      "00000",
      "10101",
      "00000",
      "00000",
      "22000",
      "00000",
      "04030",
      "00000",
      "10001",
      "00000",
      "00000",
      "02100",
      "00010",
      "00000",
      "24042",
      "00000",
      "03001",
      "00000",
      "70007",
      "00000",
      "00000",
      "11110",
      "00000",
      "33033",
      "00000",
      "04440",
      "00000",
      "00000",
      "24200",
      "00000",
      "71017",
      "00000",
      "00000",
      "02220",
      "00000",
      "05050",
      "00000",
      "00000",
      "30303",
      "00000",
      "88888",
      "88888",
      "88888",
    ],
    Pro: [
      "99999",
      "00000",
      "06060",
      "00000",
      "00000",
      "10601",
      "00000",
      "44044",
      "00000",
      "00000",
      "22022",
      "02020",
      "00000",
      "00300",
      "00000",
      "66060",
      "00000",
      "00000",
      "14041",
      "00000",
      "75057",
      "00000",
      "00000",
      "22322",
      "00000",
      "60006",
      "00000",
      "00000",
      "11011",
      "00000",
      "24642",
      "00000",
      "00000",
      "55055",
      "00000",
      "36063",
      "00000",
      "00000",
      "42024",
      "00000",
      "88888",
      "88888",
      "88888",
    ],
    SuperBowl: [
      "99999",
      "00000",
      "15051",
      "00000",
      "00000",
      "76067",
      "00000",
      "44044",
      "00000",
      "00000",
      "62026",
      "00000",
      "10310",
      "00000",
      "65056",
      "00000",
      "00000",
      "70707",
      "00000",
      "14141",
      "00000",
      "00000",
      "22222",
      "02020",
      "00000",
      "00030",
      "00000",
      "55555",
      "00000",
      "00000",
      "61016",
      "00000",
      "75757",
      "00000",
      "00000",
      "66666",
      "00000",
      "03030",
      "00000",
      "88888",
      "88888",
      "88888",
    ],
    HallOfFame: [
      "99999",
      "00000",
      "16161",
      "00000",
      "00000",
      "44444",
      "00000",
      "22222",
      "00000",
      "75057",
      "05050",
      "00000",
      "00300",
      "00000",
      "06660",
      "00000",
      "00000",
      "17471",
      "00000",
      "26062",
      "00000",
      "00000",
      "55555",
      "00000",
      "03003",
      "66066",
      "00000",
      "77777",
      "00000",
      "12421",
      "00000",
      "00000",
      "46164",
      "00000",
      "65056",
      "16061",
      "00000",
      "33333",
      "00000",
      "88888",
      "88888",
      "88888",
    ],
  };
  return maps[stage] ?? maps.HighSchool ?? [];
}

function damage(gs: GameState, amt: number) {
  gs.hp = Math.max(0, gs.hp - amt);
  gs.hurtFlash = 0.5;
}

function heal(gs: GameState, amt: number) {
  gs.hp = Math.min(gs.maxHp, gs.hp + amt);
  addFloat(gs, `+${amt} HP`, "#3FAE5A");
}

function gainXp(gs: GameState, amt: number, label: string, color: string) {
  gs.xp += amt;
  gs.xpGained += amt;
  gs.playXp += amt;
  addFloat(gs, label, color);
}

function addFloat(gs: GameState, text: string, color: string) {
  gs.floats.push({
    id: gs.nextFloatId++,
    x: 0,
    y: 430,
    text,
    color,
    life: 1.1,
    maxLife: 1.1,
  });
}

export function endPlay(gs: GameState) {
  if (gs.phase !== "playing") return;
  if (!gs.touchdown) {
    if (gs.currentDown < 4) {
      gs.currentDown += 1;
    } else {
      gs.currentDown = 1;
      gs.yardsNeeded = 10;
      gs.driveYards = gs.fieldZ;
    }
    gs.yardsToGo = gs.yardsNeeded;
  }
  gs.phase = "tackled";
  gs.tackleTimer = 1.8;
}
