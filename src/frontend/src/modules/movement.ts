/**
 * movement.ts — player physics, lane shifting, jump, timers, field advance.
 * Called once per frame with delta-time in seconds.
 */
import {
  BASE_SPEED,
  GRAVITY_PX,
  type GameState,
  JUMP_VY,
  MAX_SPEED,
  SPEED_RAMP,
  stageMult,
} from "../types/game";

export function updateMovement(gs: GameState, dt: number): void {
  // ── Speed ramp ─────────────────────────────────────────────────
  const cap = Math.min(MAX_SPEED, BASE_SPEED + gs.skills.speed * 0.3);
  gs.speed = Math.min(cap, gs.speed + SPEED_RAMP * dt);
  const effective = gs.turboActive ? gs.speed * 1.7 : gs.speed;

  // ── Field advance ──────────────────────────────────────────────
  const prevZ = gs.fieldZ;
  gs.fieldZ += effective * dt;
  gs.fieldScroll = (gs.fieldScroll + effective * dt * 0.1) % 1;
  gs.playYards = gs.fieldZ;
  gs.score = Math.floor(
    gs.fieldZ * 10 * stageMult(gs.careerStage) * gs.multiplier,
  );

  // XP tick every 10 yards
  if (Math.floor(gs.fieldZ / 10) > Math.floor(prevZ / 10)) {
    const yxp = Math.round(8 * stageMult(gs.careerStage));
    gs.xp += yxp;
    gs.xpGained += yxp;
    gs.playXp += yxp;
    gs.floats.push({
      x: laneX(gs.lane),
      y: 420,
      text: `+${yxp} XP`,
      color: "#2E7BD6",
      life: 1.0,
      maxLife: 1.0,
    });
  }

  // Down & distance tracking
  const yardsGained = gs.fieldZ - gs.driveYards;
  if (gs.yardsToGo === undefined) {
    gs.yardsToGo = 10;
    gs.yardsNeeded = 10;
    gs.currentDown = 1;
    gs.driveYards = 0;
  }
  if (yardsGained >= gs.yardsNeeded) {
    // First down!
    gs.currentDown = 1;
    gs.yardsNeeded = 10;
    gs.yardsToGo = 10;
    gs.driveYards = gs.fieldZ; // reset marker
    gs.floats.push({
      x: laneX(gs.lane),
      y: 370,
      text: "FIRST DOWN!",
      color: "#FFD700",
      life: 1.4,
      maxLife: 1.4,
    });
  } else {
    gs.yardsToGo = Math.max(0, gs.yardsNeeded - yardsGained);
  }

  // ── Lane shift ─────────────────────────────────────────────────
  if (gs.laneT < 1) {
    gs.laneT = Math.min(1, gs.laneT + (5 + gs.skills.agility * 0.8) * dt);
  } else {
    gs.lane = gs.targetLane;
  }

  // ── Jump ───────────────────────────────────────────────────────
  if (gs.jumping) {
    gs.jumpY += gs.jumpVY * dt;
    gs.jumpVY -= GRAVITY_PX * dt;
    if (gs.jumpY <= 0) {
      gs.jumpY = 0;
      gs.jumpVY = 0;
      gs.jumping = false;
    }
  }

  // ── Power-up timers ─────────────────────────────────────────────
  tick("turboTimer", "turboActive", gs, dt);
  tick("shieldTimer", "shieldActive", gs, dt);
  tickSpin(gs, dt);
  if (gs.multiplierTimer > 0) {
    gs.multiplierTimer -= dt;
    if (gs.multiplierTimer <= 0) {
      gs.multiplierTimer = 0;
      gs.multiplier = 1;
    }
  }
  if (gs.hurtFlash > 0) gs.hurtFlash = Math.max(0, gs.hurtFlash - dt);

  // Advance obstacle worldZ
  for (const obs of gs.obstacles) {
    if (!obs.broken) obs.worldZ -= effective * dt;
    if (obs.breakTimer > 0) obs.breakTimer -= dt;
  }
  gs.obstacles = gs.obstacles.filter(
    (o) => o.worldZ > -3 && !(o.broken && o.breakTimer <= 0),
  );
}

function tick(
  timerKey: "turboTimer" | "shieldTimer",
  activeKey: "turboActive" | "shieldActive",
  gs: GameState,
  dt: number,
) {
  if (gs[activeKey]) {
    (gs[timerKey] as number) -= dt;
    if ((gs[timerKey] as number) <= 0) {
      (gs[timerKey] as number) = 0;
      (gs[activeKey] as boolean) = false;
    }
  }
}

function tickSpin(gs: GameState, dt: number) {
  if (gs.spinning) {
    gs.spinTimer -= dt;
    gs.spinAngle += dt * Math.PI * 4;
    if (gs.spinTimer <= 0) {
      gs.spinning = false;
      gs.spinTimer = 0;
      gs.spinAngle = 0;
    }
  }
}

export function laneX(lane: number): number {
  return [28, 96, 180, 264, 332][lane] ?? 180;
}

export function playerScreenX(gs: GameState): number {
  const from = laneX(gs.lane);
  const to = laneX(gs.targetLane);
  return from + (to - from) * gs.laneT;
}

export function inputLeft(gs: GameState) {
  if (gs.targetLane > 0) {
    gs.targetLane--;
    gs.laneT = 0;
  }
}
export function inputRight(gs: GameState) {
  if (gs.targetLane < 4) {
    gs.targetLane++;
    gs.laneT = 0;
  }
}
export function inputJump(gs: GameState) {
  if (!gs.jumping) {
    gs.jumping = true;
    gs.jumpVY = JUMP_VY + gs.skills.hurdle * 15;
  }
}
export function inputSpin(gs: GameState) {
  if (!gs.spinning) {
    gs.spinning = true;
    gs.spinTimer = 1.2 + gs.skills.spin * 0.08;
  }
}
export function inputTurbo(gs: GameState) {
  if (!gs.turboActive) {
    gs.turboActive = true;
    gs.turboTimer = 3.5;
  }
}
