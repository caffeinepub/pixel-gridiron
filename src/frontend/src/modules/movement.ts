/**
 * movement.ts v22 — player physics, lane shifting, jump, timers, field advance.
 * FIXED: speed cap now lets turbo feel impactful at ALL skill levels.
 * FIXED: lane chaining — mid-slide tap commits current position before changing target.
 * FIXED: stride animation is time-based (elapsedTime), not frame-count-based.
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
  // ── Speed ramp ────────────────────────────────────────────────────────────
  // Burst only active in first 5 yards of each play
  const burstBonus = gs.fieldZ < 5 ? (gs.skills.burst ?? 0) * 0.4 : 0;
  // FIXED: cap starts at MAX_SPEED — skills.speed increases it further, not limit it
  const speedCap = MAX_SPEED + (gs.skills.speed ?? 0) * 0.15 + burstBonus;
  gs.speed = Math.min(speedCap, gs.speed + SPEED_RAMP * dt);
  const effective = gs.turboActive ? gs.speed * 1.7 : gs.speed;

  // ── Field advance ─────────────────────────────────────────────────────────
  const prevZ = gs.fieldZ;
  gs.fieldZ += effective * dt;
  // fieldScroll: fractional 0..1 loop for tile floor — simple and clean
  gs.fieldScroll = (gs.fieldScroll + effective * dt) % 100;
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
      id: gs.nextFloatId++,
      x: 0,
      y: 420,
      text: `+${yxp} XP`,
      color: "#2E7BD6",
      life: 1.0,
      maxLife: 1.0,
    });
  }

  // Down & distance tracking
  const yardsGained = gs.fieldZ - gs.driveYards;
  if (yardsGained >= gs.yardsNeeded) {
    gs.currentDown = 1;
    gs.yardsNeeded = 10;
    gs.yardsToGo = 10;
    gs.driveYards = gs.fieldZ;
    gs.floats.push({
      id: gs.nextFloatId++,
      x: 0,
      y: 370,
      text: "FIRST DOWN!",
      color: "#FFD700",
      life: 1.4,
      maxLife: 1.4,
    });
  } else {
    gs.yardsToGo = Math.max(0, gs.yardsNeeded - yardsGained);
  }

  // ── Lane shift — FIXED: chain support ────────────────────────────────────
  // If mid-slide, laneT < 1: update gs.lane to intermediate position first,
  // then continue sliding to targetLane. This prevents snap-back on double tap.
  if (gs.laneT < 1) {
    gs.laneT = Math.min(
      1,
      gs.laneT + (5 + (gs.skills.agility ?? 0) * 0.8) * dt,
    );
    if (gs.laneT >= 1) {
      gs.lane = gs.targetLane;
      gs.laneT = 1;
    }
  }

  // ── Jump ──────────────────────────────────────────────────────────────────
  if (gs.jumping) {
    gs.jumpY += gs.jumpVY * dt;
    gs.jumpVY -= GRAVITY_PX * dt;
    if (gs.jumpY <= 0) {
      gs.jumpY = 0;
      gs.jumpVY = 0;
      gs.jumping = false;
    }
  }

  // ── Power-up timers ───────────────────────────────────────────────────────
  tickTimer("turboTimer", "turboActive", gs, dt);
  tickTimer("shieldTimer", "shieldActive", gs, dt);
  tickSpin(gs, dt);
  if (gs.multiplierTimer > 0) {
    gs.multiplierTimer -= dt;
    if (gs.multiplierTimer <= 0) {
      gs.multiplierTimer = 0;
      gs.multiplier = 1;
    }
  }
  if (gs.hurtFlash > 0) gs.hurtFlash = Math.max(0, gs.hurtFlash - dt);

  // Advance obstacle worldZ — vision skill slows their approach
  const visionMult = Math.max(0.6, 1 - (gs.skills.vision ?? 0) * 0.03);
  for (const obs of gs.obstacles) {
    if (!obs.broken) obs.worldZ -= effective * visionMult * dt;
    if (obs.breakTimer > 0) obs.breakTimer -= dt;
  }
  gs.obstacles = gs.obstacles.filter(
    (o) => o.worldZ > -3 && !(o.broken && o.breakTimer <= 0),
  );
}

function tickTimer(
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

/** Canvas-pixel lane center (used for legacy references only — renderer uses laneWorldX) */
export function laneX(lane: number): number {
  return [28, 96, 180, 264, 332][lane] ?? 180;
}

export function playerScreenX(gs: GameState): number {
  const from = laneX(gs.lane);
  const to = laneX(gs.targetLane);
  return from + (to - from) * gs.laneT;
}

// ── Input handlers ────────────────────────────────────────────────────────────
export function inputLeft(gs: GameState) {
  if (gs.laneT < 1) {
    // Mid-slide: commit current interpolated position as new origin
    const fromX = laneX(gs.lane);
    const toX = laneX(gs.targetLane);
    const midX = fromX + (toX - fromX) * gs.laneT;
    // Find closest lane to mid position
    const lanePositions = [28, 96, 180, 264, 332];
    const closestLane = lanePositions.reduce(
      (best, x, i) =>
        Math.abs(x - midX) < Math.abs(lanePositions[best] - midX) ? i : best,
      0,
    );
    gs.lane = closestLane;
    gs.laneT = 1;
  }
  if (gs.targetLane > 0) {
    gs.targetLane--;
    gs.laneT = 0;
  }
}

export function inputRight(gs: GameState) {
  if (gs.laneT < 1) {
    // Mid-slide: commit current interpolated position as new origin
    const fromX = laneX(gs.lane);
    const toX = laneX(gs.targetLane);
    const midX = fromX + (toX - fromX) * gs.laneT;
    const lanePositions = [28, 96, 180, 264, 332];
    const closestLane = lanePositions.reduce(
      (best, x, i) =>
        Math.abs(x - midX) < Math.abs(lanePositions[best] - midX) ? i : best,
      0,
    );
    gs.lane = closestLane;
    gs.laneT = 1;
  }
  if (gs.targetLane < 4) {
    gs.targetLane++;
    gs.laneT = 0;
  }
}

export function inputJump(gs: GameState) {
  if (!gs.jumping) {
    gs.jumping = true;
    gs.jumpVY = JUMP_VY + (gs.skills.hurdle ?? 0) * 15;
  }
}

export function inputSpin(gs: GameState) {
  if (!gs.spinning) {
    gs.spinning = true;
    gs.spinTimer = 1.2 + (gs.skills.spin ?? 0) * 0.08;
  }
}

export function inputTurbo(gs: GameState) {
  if (!gs.turboActive) {
    gs.turboActive = true;
    gs.turboTimer = 3.5;
  }
}
