/**
 * collision.ts — checks every obstacle against the player each frame.
 * Touchdown is driven by the spawner hitting tile 8 (endzone row), NOT a
 * hardcoded yard distance. This supports variable-length fields.
 *
 * HP BUDGET: 150hp start. Hits cost: DT 25 | LB 20 | DE 18 | CB/S 12
 */
import {
  BREAK_DUR,
  COLLISION_Z,
  DEFENDER_STATS,
  type GameState,
  stageMult,
} from "../types/game";
import { laneX } from "./movement";

const DEFENDER_DAMAGE: Record<string, number> = {
  dt: 25,
  lb: 20,
  de: 18,
  cb: 12,
  s: 12,
};

export function detectCollisions(gs: GameState): void {
  // Endzone already triggered by spawner — don't process more collisions
  if (gs.touchdown) return;

  const px = laneX(gs.lane);

  for (const obs of gs.obstacles) {
    if (obs.broken) continue;
    if (obs.worldZ > COLLISION_Z) continue;
    if (obs.worldZ < -1.5) continue;
    if (obs.lane !== gs.lane) continue;

    // Jump clears crates
    if (gs.jumping && gs.jumpY > 14 && obs.type === "crate") continue;

    obs.broken = true;
    obs.breakTimer = BREAK_DUR;

    const mult = stageMult(gs.careerStage);

    // ── Emoji power-up ────────────────────────────────────────────
    if (obs.emojiPowerUp) {
      const ep = obs.emojiPowerUp;
      gs.playItems.push(ep.emoji);
      gainXp(gs, 5, px, ep.label, ep.color);
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
          heal(gs, 40, px);
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

    // ── Crate ──────────────────────────────────────────────────
    if (obs.type === "crate") {
      gainXp(
        gs,
        Math.round(12 * mult),
        px,
        `+${Math.round(12 * mult)} XP`,
        "#3FAE5A",
      );
      if (obs.powerUp) {
        const pu = obs.powerUp;
        float(gs, px, 430, `${pu.label}!`, pu.color);
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
            heal(gs, 25, px);
            break;
          case "multiplier":
            gs.multiplier = 2;
            gs.multiplierTimer = 5;
            float(gs, px, 410, "2X!", "#D4A017");
            break;
        }
      }
      continue;
    }

    // ── Defender hit ──────────────────────────────────────────────
    const defType = obs.defenderType!;
    const xpReward = Math.round(DEFENDER_STATS[defType].xpReward * mult);

    if (gs.spinning) {
      gainXp(gs, xpReward * 2, px, "SPIN BREAK!", "#FFD700");
      continue;
    }

    if (gs.shieldActive) {
      gs.shieldActive = false;
      gs.shieldTimer = 0;
      gainXp(gs, xpReward, px, "BLOCKED!", "#2E7BD6");
      continue;
    }

    if (gs.skills.power >= 8) {
      gainXp(gs, xpReward, px, "BULLDOZED!", "#FFD700");
      continue;
    }

    if (gs.skills.power >= 5 && defType === "de") {
      gainXp(gs, xpReward, px, "BOUNCED!", "#FFD700");
      continue;
    }

    const shedChance = (gs.skills.breakTackle ?? 0) * 0.08;
    if (Math.random() < shedChance) {
      gainXp(gs, Math.round(xpReward * 0.5), px, "SHED!", "#FF6B35");
      continue;
    }

    const dmg = DEFENDER_DAMAGE[defType] ?? 18;
    damage(gs, dmg, px);
    if (gs.hp <= 0) {
      endPlay(gs);
      return;
    }
  }
}

function damage(gs: GameState, amt: number, px: number) {
  gs.hp = Math.max(0, gs.hp - amt);
  gs.hurtFlash = 0.4;
  float(gs, px, 430, `-${amt} HP`, "#C63A3A");
}

function heal(gs: GameState, amt: number, px: number) {
  gs.hp = Math.min(gs.maxHp, gs.hp + amt);
  float(gs, px, 430, `+${amt} HP`, "#3FAE5A");
}

function gainXp(
  gs: GameState,
  amt: number,
  px: number,
  label: string,
  color: string,
) {
  gs.xp += amt;
  gs.xpGained += amt;
  gs.playXp += amt;
  float(gs, px, 430, label, color);
}

function float(
  gs: GameState,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  gs.floats.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
}

export function endPlay(gs: GameState) {
  if (gs.phase !== "playing") return;
  if (!gs.touchdown) {
    // Advance down
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
