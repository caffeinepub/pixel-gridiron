/**
 * collision.ts v29 — tile-based collision with correct interpolated lane tracking.
 *
 * HOW IT WORKS:
 *   - Each obstacle's worldZ starts at SPAWN_Z and counts DOWN as the player advances.
 *   - worldZ === 0 means the tile is exactly at the player's ground position.
 *   - Collision fires when worldZ is within COLLISION_Z of 0.
 *   - Lane check uses the ACTUAL interpolated lane position (fromLane → targetLane * laneT),
 *     not gs.lane (which is only set when the shift completes). This prevents ghost tackles
 *     and missed collisions during mid-shift frames.
 */
import {
  BREAK_DUR,
  COLLISION_Z,
  DEFENDER_STATS,
  type GameState,
  stageMult,
} from "../types/game";

const DEFENDER_DAMAGE: Record<string, number> = {
  dt: 25,
  lb: 20,
  de: 18,
  cb: 12,
  s: 12,
};

/**
 * Returns the player's actual fractional lane position (0–4).
 * Uses fromLane + (targetLane - fromLane) * laneT — the same formula
 * the renderer uses for playerScreenX — so collision matches what you see.
 */
function playerLaneF(gs: GameState): number {
  return gs.fromLane + (gs.targetLane - gs.fromLane) * gs.laneT;
}

export function detectCollisions(gs: GameState): void {
  if (gs.touchdown) return;

  // Player's actual interpolated lane position (fractional)
  const playerLF = playerLaneF(gs);

  for (const obs of gs.obstacles) {
    if (obs.broken) continue;
    // Tile hasn't reached the player yet
    if (obs.worldZ > COLLISION_Z) continue;
    // Tile has already passed the player
    if (obs.worldZ < -1.5) continue;
    // Lane check: player center must be within 0.5 lane-widths of the tile center.
    // 0.5 radius means the player must be visually overlapping the tile's lane.
    if (Math.abs(obs.lane - playerLF) > 0.5) continue;

    // Jump clears crates
    if (gs.jumping && gs.jumpY > 14 && obs.type === "crate") continue;

    obs.broken = true;
    obs.breakTimer = BREAK_DUR;

    const mult = stageMult(gs.careerStage);

    // ── Emoji power-up ────────────────────────────────────────────────────
    if (obs.emojiPowerUp) {
      const ep = obs.emojiPowerUp;
      gs.playItems.push(ep.emoji);
      gainXp(gs, 5, ep.label, ep.color);
      switch (ep.effectType) {
        case "speed":
        case "turbo":
          gs.turboActive = true;
          gs.turboTimer = 3.5;
          break;
        case "rage":
          gs.spinning = true;
          gs.spinTimer = 1.8;
          break;
        case "extraDown":
          heal(gs, 40);
          break;
        case "star":
          gs.shieldActive = true;
          gs.shieldTimer = 5;
          gs.multiplier = 2;
          gs.multiplierTimer = 5;
          break;
        case "shield":
          gs.shieldActive = true;
          gs.shieldTimer = 4;
          break;
      }
      continue;
    }

    // ── Crate ──────────────────────────────────────────────────────────────
    if (obs.type === "crate") {
      gainXp(
        gs,
        Math.round(12 * mult),
        `+${Math.round(12 * mult)} XP`,
        "#3FAE5A",
      );
      if (obs.powerUp) {
        const pu = obs.powerUp;
        addFloat(gs, `${pu.label}!`, pu.color);
        switch (pu.type) {
          case "speed":
            gs.turboActive = true;
            gs.turboTimer = 3;
            break;
          case "shield":
            gs.shieldActive = true;
            gs.shieldTimer = 4;
            break;
          case "extra_down":
            heal(gs, 25);
            break;
          case "multiplier":
            gs.multiplier = 2;
            gs.multiplierTimer = 5;
            addFloat(gs, "2X!", "#D4A017");
            break;
        }
      }
      continue;
    }

    // ── Defender hit ──────────────────────────────────────────────────────
    const defType = obs.defenderType!;
    const xpReward = Math.round(DEFENDER_STATS[defType].xpReward * mult);

    if (gs.spinning) {
      gainXp(gs, xpReward * 2, "SPIN BREAK!", "#FFD700");
      continue;
    }

    if (gs.shieldActive) {
      gs.shieldActive = false;
      gs.shieldTimer = 0;
      gainXp(gs, xpReward, "BLOCKED!", "#2E7BD6");
      continue;
    }

    // Power skill: each 4 ranks adds one bulldoze tier
    const powerTier = Math.floor((gs.skills.power ?? 0) / 4);
    if (powerTier >= 3 || (powerTier >= 2 && defType === "de")) {
      gainXp(gs, xpReward, "BULLDOZED!", "#FFD700");
      continue;
    }

    const shedChance = (gs.skills.breakTackle ?? 0) * 0.08;
    if (Math.random() < shedChance) {
      gainXp(gs, Math.round(xpReward * 0.5), "SHED!", "#FF6B35");
      continue;
    }

    const dmg = DEFENDER_DAMAGE[defType] ?? 18;
    damage(gs, dmg);
    if (gs.hp <= 0) {
      endPlay(gs);
      return;
    }
  }
}

function damage(gs: GameState, amt: number) {
  gs.hp = Math.max(0, gs.hp - amt);
  gs.hurtFlash = 0.4;
  addFloat(gs, `-${amt} HP`, "#C63A3A");
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
