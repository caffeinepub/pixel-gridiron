import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  BASE_SPEED,
  CANVAS_H,
  CANVAS_W,
  GRAVITY,
  type GameState,
  LANE_X,
  LEGENDARY_PLAYERS,
  type Obstacle,
  PLAYER_BASE_Y,
  PLAYER_LANE_X,
  careerStageMultiplier,
} from "../types/game";

const HORIZON_Y = 70;
const VANISH_X = 150;
const GROUND_Y = CANVAS_H;

// Canvas-only renderer -- rear-view drawing, no spritesheet needed
// Legendary players use canvas drawing with their color/secondaryColor

export interface GameCanvasHandle {
  pressLeft: () => void;
  pressRight: () => void;
  pressUp: () => void;
  pressTurbo: () => void;
  pressSpin: () => void;
  pressHurdle: () => void;
}

interface Props {
  gameStateRef: React.MutableRefObject<GameState>;
  onScoreUpdate: (score: number, hp: number, xp: number) => void;
  onGameOver: (score: number, xpGained: number) => void;
  canvasStyle?: React.CSSProperties;
}

const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(
  { gameStateRef, onScoreUpdate, onGameOver, canvasStyle },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const pressLeft = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.running || gs.gameOver) return;
    if (gs.tutorialActive) {
      gs.tutorialActive = false;
      return;
    }
    if (gs.targetLane > 0) {
      gs.targetLane -= 1;
      gs.laneTransition = 0;
    }
  }, [gameStateRef]);

  const pressRight = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.running || gs.gameOver) return;
    if (gs.tutorialActive) {
      gs.tutorialActive = false;
      return;
    }
    if (gs.targetLane < 4) {
      gs.targetLane += 1;
      gs.laneTransition = 0;
    }
  }, [gameStateRef]);

  const pressUp = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.running || gs.gameOver) return;
    if (gs.tutorialActive) {
      gs.tutorialActive = false;
      return;
    }
    if (!gs.playerJumping) {
      gs.playerJumping = true;
      const jumpPower = 4.2 + gs.skills.hurdle * 0.4;
      gs.jumpVelocity = -jumpPower;
    }
  }, [gameStateRef]);

  const pressTurbo = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.running || gs.gameOver) return;
    if (gs.tutorialActive) {
      gs.tutorialActive = false;
      return;
    }
    if (!gs.turboActive) {
      gs.turboActive = true;
      gs.turboFrames = 90;
    }
  }, [gameStateRef]);

  const pressSpin = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.running || gs.gameOver) return;
    if (gs.tutorialActive) {
      gs.tutorialActive = false;
      return;
    }
    if (!gs.playerSpinning) {
      gs.playerSpinning = true;
      gs.spinFrames = 30 + gs.skills.spin * 5;
    }
  }, [gameStateRef]);

  const pressHurdle = useCallback(() => {
    pressUp();
  }, [pressUp]);

  useImperativeHandle(ref, () => ({
    pressLeft,
    pressRight,
    pressUp,
    pressTurbo,
    pressSpin,
    pressHurdle,
  }));

  const loop = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dt = Math.min((timestamp - lastTimeRef.current) / 16.67, 2);
      lastTimeRef.current = timestamp;

      const gs = gameStateRef.current;

      if (!gs.running || gs.paused) {
        drawFrame(ctx, gs);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      updateGame(gs, dt);
      drawFrame(ctx, gs);
      onScoreUpdate(gs.score, gs.hp, gs.xp);

      if (gs.gameOver) {
        onGameOver(gs.score, gs.xpGained);
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    },
    [gameStateRef, onScoreUpdate, onGameOver],
  );

  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        ...canvasStyle,
      }}
      onPointerDown={(e) => {
        const gs = gameStateRef.current;
        if (gs.tutorialActive) {
          gs.tutorialActive = false;
          e.preventDefault();
        }
      }}
    />
  );
});

export default GameCanvas;

// ─── Perspective helpers ──────────────────────────────────────────────────────

function perspectiveScale(y: number): number {
  return Math.max(0, (y - HORIZON_Y) / (GROUND_Y - HORIZON_Y));
}

function perspX(laneIndex: number, y: number): number {
  const scale = perspectiveScale(y);
  return VANISH_X + (LANE_X[laneIndex] - VANISH_X) * scale;
}

// ─── Tutorial helpers ─────────────────────────────────────────────────────────

const TUTORIAL_BIT_START = 1;
const TUTORIAL_BIT_CRATE = 2;
const TUTORIAL_BIT_YARDS = 4;
const TUTORIAL_BIT_HP = 8;
const TUTORIAL_BIT_HS = 16;
const TUTORIAL_BIT_COLLEGE = 32;
const TUTORIAL_BIT_PRO = 64;
const TUTORIAL_BIT_SB = 128;
const TUTORIAL_BIT_HOF = 256;

const STAGE_BITS: Record<string, number> = {
  HighSchool: TUTORIAL_BIT_HS,
  College: TUTORIAL_BIT_COLLEGE,
  Pro: TUTORIAL_BIT_PRO,
  SuperBowl: TUTORIAL_BIT_SB,
  HallOfFame: TUTORIAL_BIT_HOF,
};

const STAGE_MESSAGES: Record<string, string> = {
  HighSchool: "Rookie! Stay in lanes & dodge defenders!",
  College: "College ball is faster — stay sharp!",
  Pro: "You're in the big leagues. No mercy!",
  SuperBowl: "THE SUPER BOWL! Leave it all on the field!",
  HallOfFame: "LEGEND STATUS. The greatest of all time!",
};

function triggerTutorial(gs: GameState, bit: number, message: string) {
  if (gs.shownTutorialMask & bit) return;
  gs.shownTutorialMask |= bit;
  gs.tutorialActive = true;
  gs.tutorialMessage = message;
  gs.tutorialTimer = 220;
}

// ─── Game Update ──────────────────────────────────────────────────────────────

function addFloat(
  gs: GameState,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  gs.floatingTexts.push({ x, y, text, color, life: 60, maxLife: 60 });
}

function takeDamage(gs: GameState, amount: number) {
  gs.hp = Math.max(0, gs.hp - amount);
  gs.hurtFlash = 15;
  addFloat(
    gs,
    PLAYER_LANE_X[gs.lane],
    gs.playerY - 40,
    `-${amount} HP`,
    "#C63A3A",
  );
}

function spawnObstacle(gs: GameState) {
  const lane = Math.floor(Math.random() * 5);
  const isCrate = Math.random() < 0.35;
  const powerUps = [
    { type: "speed" as const, label: "TURBO", color: "#FFD700" },
    { type: "shield" as const, label: "SHIELD", color: "#2E7BD6" },
    { type: "extra_down" as const, label: "+DOWN", color: "#3FAE5A" },
    { type: "multiplier" as const, label: "2X", color: "#D4A017" },
  ];
  gs.obstacles.push({
    lane,
    y: -30,
    type: isCrate ? "crate" : "defender",
    hp: 1,
    width: isCrate ? 24 : 20,
    height: isCrate ? 24 : 32,
    powerUp: isCrate
      ? powerUps[Math.floor(Math.random() * powerUps.length)]
      : undefined,
  });
}

function detectCollisions(gs: GameState) {
  const playerX = PLAYER_LANE_X[gs.lane];
  const playerW = 18;
  const playerH = 28;
  const playerTop = gs.playerY - playerH;
  const playerBottom = gs.playerY;

  for (const obs of gs.obstacles) {
    if (obs.broken) continue;
    if (obs.lane !== gs.lane) continue;

    const obsScreenY = obs.y;
    const obsTop = obsScreenY - obs.height;
    const obsBottom = obsScreenY;
    const obsLeft = PLAYER_LANE_X[obs.lane] - obs.width / 2;
    const obsRight = PLAYER_LANE_X[obs.lane] + obs.width / 2;
    const plLeft = playerX - playerW / 2;
    const plRight = playerX + playerW / 2;

    if (gs.playerJumping && gs.playerY < obsTop + obs.height * 0.3) continue;
    if (playerTop > obsBottom || playerBottom < obsTop) continue;
    if (plLeft > obsRight || plRight < obsLeft) continue;

    obs.broken = true;
    obs.breakAnim = 15;

    if (obs.type === "crate") {
      // Trigger crate tutorial
      triggerTutorial(
        gs,
        TUTORIAL_BIT_CRATE,
        "Smash crates for power-ups and XP!",
      );
      if (obs.powerUp) {
        const pu = obs.powerUp;
        addFloat(gs, playerX, gs.playerY - 50, `${pu.label}!`, pu.color);
        if (pu.type === "speed") {
          gs.turboActive = true;
          gs.turboFrames = 90;
        } else if (pu.type === "shield") {
          gs.shieldActive = true;
          gs.shieldFrames = 180;
        } else if (pu.type === "extra_down") {
          gs.hp = Math.min(gs.maxHp, gs.hp + 20);
          addFloat(gs, playerX, gs.playerY - 70, "+20 HP", "#3FAE5A");
        } else if (pu.type === "multiplier") {
          gs.multiplier = 2;
          gs.multiplierFrames = 300;
          addFloat(gs, playerX, gs.playerY - 70, "2X SCORE!", "#D4A017");
        }
      }
      gs.xpGained += 5;
      gs.xp += 5;
      addFloat(gs, playerX, gs.playerY - 40, "+5 XP", "#3FAE5A");
      if (!gs.playerSpinning && gs.skills.power < 2 && !obs.powerUp) {
        if (!gs.shieldActive) takeDamage(gs, 10);
      }
    } else {
      if (gs.playerSpinning) {
        addFloat(gs, playerX, gs.playerY - 40, "SPIN BREAK!", "#3FAE5A");
      } else if (gs.shieldActive) {
        gs.shieldActive = false;
        gs.shieldFrames = 0;
        addFloat(gs, playerX, gs.playerY - 40, "BLOCKED!", "#2E7BD6");
      } else {
        takeDamage(gs, 20);
      }
    }
  }
}

function updateGame(gs: GameState, dt: number) {
  gs.frameCount += dt;

  // Tutorial: stage welcome
  const stageBit = STAGE_BITS[gs.careerStage];
  if (stageBit && gs.tilePosition < 2) {
    triggerTutorial(gs, stageBit, STAGE_MESSAGES[gs.careerStage]);
  }

  // Tutorial: first start
  if (gs.tilePosition < 3 && gs.running) {
    triggerTutorial(
      gs,
      TUTORIAL_BIT_START,
      "Stay in your lane! Dodge the defenders!",
    );
  }

  // Tutorial: 50 yards
  if (gs.tilePosition > 50) {
    triggerTutorial(
      gs,
      TUTORIAL_BIT_YARDS,
      "TURBO boost keeps your momentum going!",
    );
  }

  // Tutorial: low HP
  if (gs.hp < 50 && gs.hp > 0) {
    triggerTutorial(
      gs,
      TUTORIAL_BIT_HP,
      "Use SPIN to break through defenders!",
    );
  }

  // Tutorial countdown
  if (gs.tutorialActive) {
    gs.tutorialTimer -= dt;
    if (gs.tutorialTimer <= 0) gs.tutorialActive = false;
  }

  if (gs.laneTransition < 1) {
    const transSpeed = 0.12 + gs.skills.agility * 0.02;
    gs.laneTransition = Math.min(1, gs.laneTransition + transSpeed * dt);
    gs.lane = gs.targetLane;
  }

  if (gs.playerJumping) {
    gs.playerY += gs.jumpVelocity * dt * 10;
    gs.jumpVelocity += GRAVITY * dt;
    if (gs.playerY >= PLAYER_BASE_Y) {
      gs.playerY = PLAYER_BASE_Y;
      gs.playerJumping = false;
      gs.jumpVelocity = 0;
    }
  }

  if (gs.turboActive) {
    gs.turboFrames -= dt;
    if (gs.turboFrames <= 0) {
      gs.turboActive = false;
      gs.turboFrames = 0;
    }
  }
  if (gs.playerSpinning) {
    gs.spinFrames -= dt;
    if (gs.spinFrames <= 0) {
      gs.playerSpinning = false;
      gs.spinFrames = 0;
    }
  }
  if (gs.shieldActive) {
    gs.shieldFrames -= dt;
    if (gs.shieldFrames <= 0) {
      gs.shieldActive = false;
      gs.shieldFrames = 0;
    }
  }
  if (gs.multiplierFrames > 0) {
    gs.multiplierFrames -= dt;
    if (gs.multiplierFrames <= 0) {
      gs.multiplierFrames = 0;
      gs.multiplier = 1;
    }
  }
  if (gs.hurtFlash > 0) gs.hurtFlash -= dt;

  gs.baseSpeed = Math.min(gs.baseSpeed + 0.002 * dt, BASE_SPEED * 2.5);
  let curSpeed = gs.baseSpeed;
  if (gs.turboActive) curSpeed *= 2.0;
  gs.speed = curSpeed;

  const prevTilePos = gs.tilePosition;
  gs.tilePosition += (curSpeed * dt) / 60;
  gs.yardage = gs.tilePosition;
  gs.fieldOffset = gs.tilePosition % 1;

  const mult = careerStageMultiplier(gs.careerStage) * gs.multiplier;
  gs.score = Math.floor(gs.yardage * mult);

  if (Math.floor(gs.tilePosition / 10) > Math.floor(prevTilePos / 10)) {
    gs.xpGained += 10;
    gs.xp += 10;
    addFloat(gs, PLAYER_LANE_X[gs.lane], gs.playerY - 40, "+10 XP", "#2E7BD6");
  }

  const spawnIntervalTiles = Math.max(3, 8 - Math.floor(gs.tilePosition / 50));
  const currentTile = Math.floor(gs.tilePosition);
  if (currentTile - gs.lastSpawnTile >= spawnIntervalTiles) {
    spawnObstacle(gs);
    gs.lastSpawnTile = currentTile;
  }

  for (const obs of gs.obstacles) {
    obs.y += (curSpeed / BASE_SPEED) * 2.5 * dt * 1.6;
    if (obs.breakAnim !== undefined && obs.breakAnim > 0) obs.breakAnim -= dt;
  }
  gs.obstacles = gs.obstacles.filter(
    (o) => o.y < CANVAS_H + 40 && !(o.broken && (o.breakAnim ?? 0) <= 0),
  );

  detectCollisions(gs);

  for (const ft of gs.floatingTexts) {
    ft.y -= 0.8 * dt;
    ft.life -= dt;
  }
  gs.floatingTexts = gs.floatingTexts.filter((ft) => ft.life > 0);

  if (gs.hp <= 0) {
    gs.hp = 0;
    gs.gameOver = true;
    gs.running = false;
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawFrame(ctx: CanvasRenderingContext2D, gs: GameState) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawField(ctx, gs);
  drawObstacles(ctx, gs);
  drawPlayer(ctx, gs);
  drawFloatingTexts(ctx, gs);

  if (gs.tutorialActive) drawCoach(ctx, gs);

  if (gs.hurtFlash > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(198, 58, 58, ${Math.min(0.4, (gs.hurtFlash / 15) * 0.4)})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }

  if (!gs.running && !gs.gameOver) drawStartScreen(ctx, gs);
  if (gs.gameOver) drawGameOverScreen(ctx, gs);

  // Scanlines
  ctx.save();
  for (let y = 0; y < CANVAS_H; y += 4) {
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, y, CANVAS_W, 1);
  }
  ctx.restore();
}

function drawField(ctx: CanvasRenderingContext2D, gs: GameState) {
  const stage = gs.careerStage;

  // ── Sky ───────────────────────────────────────────────────────────────────
  if (stage === "HighSchool") {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    skyGrad.addColorStop(0, "#87CEEB");
    skyGrad.addColorStop(1, "#4FC3F7");
    ctx.fillStyle = skyGrad;
  } else if (stage === "College") {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    skyGrad.addColorStop(0, "#FF8C00");
    skyGrad.addColorStop(0.5, "#FF6B35");
    skyGrad.addColorStop(1, "#1a1a2e");
    ctx.fillStyle = skyGrad;
  } else if (stage === "Pro") {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    skyGrad.addColorStop(0, "#05051a");
    skyGrad.addColorStop(1, "#0a0a20");
    ctx.fillStyle = skyGrad;
  } else if (stage === "SuperBowl") {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    skyGrad.addColorStop(0, "#0a0a1a");
    skyGrad.addColorStop(1, "#1a0a2e");
    ctx.fillStyle = skyGrad;
  } else {
    // HallOfFame
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
    skyGrad.addColorStop(0, "#2D1B69");
    skyGrad.addColorStop(0.5, "#6B3A2A");
    skyGrad.addColorStop(1, "#1a0a10");
    ctx.fillStyle = skyGrad;
  }
  ctx.fillRect(0, 0, CANVAS_W, HORIZON_Y);

  // ── Stars / Sun ────────────────────────────────────────────────────────────
  if (stage === "HighSchool") {
    // Sun
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(240, 20, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,215,0,0.3)";
    ctx.beginPath();
    ctx.arc(240, 20, 20, 0, Math.PI * 2);
    ctx.fill();
    // Clouds
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(60, 18, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(75, 14, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(90, 18, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(170, 25, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(182, 21, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(194, 25, 7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Stars for night/evening stages
    ctx.save();
    const starPositions = [
      [12, 8],
      [45, 15],
      [78, 5],
      [110, 20],
      [140, 10],
      [175, 18],
      [200, 6],
      [230, 14],
      [258, 9],
      [285, 20],
      [30, 30],
      [90, 35],
      [165, 28],
      [220, 40],
      [270, 32],
    ];
    for (const [sx, sy] of starPositions) {
      const twinkle = 0.5 + 0.5 * Math.sin(gs.frameCount * 0.05 + sx * 0.1);
      ctx.fillStyle = `rgba(255,255,255,${0.4 + twinkle * 0.5})`;
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.restore();
  }

  // ── Horizon band glow ─────────────────────────────────────────────────────
  const horizColors: Record<string, [string, string, string]> = {
    HighSchool: [
      "rgba(100,180,50,0)",
      "rgba(120,200,60,0.5)",
      "rgba(100,180,50,0)",
    ],
    College: ["rgba(255,140,0,0)", "rgba(255,180,50,0.6)", "rgba(255,140,0,0)"],
    Pro: ["rgba(40,80,200,0)", "rgba(60,120,255,0.5)", "rgba(40,80,200,0)"],
    SuperBowl: [
      "rgba(200,160,0,0)",
      "rgba(255,215,0,0.7)",
      "rgba(200,160,0,0)",
    ],
    HallOfFame: [
      "rgba(180,100,0,0)",
      "rgba(255,180,50,0.8)",
      "rgba(180,100,0,0)",
    ],
  };
  const [hc1, hc2, hc3] = horizColors[stage] ?? horizColors.HighSchool;
  const horizGrad = ctx.createLinearGradient(
    0,
    HORIZON_Y - 6,
    0,
    HORIZON_Y + 8,
  );
  horizGrad.addColorStop(0, hc1);
  horizGrad.addColorStop(0.5, hc2);
  horizGrad.addColorStop(1, hc3);
  ctx.fillStyle = horizGrad;
  ctx.fillRect(0, HORIZON_Y - 6, CANVAS_W, 14);

  // ── Horizon details (crowd, stadium, skyline) ──────────────────────────────
  if (stage === "HighSchool") {
    // Simple bleachers crowd at horizon
    const crowdColors = [
      "#E53935",
      "#1565C0",
      "#F9A825",
      "#2E7D32",
      "#6A1B9A",
      "#FFF",
    ];
    for (let x = 0; x < CANVAS_W; x += 4) {
      const color = crowdColors[Math.floor(x / 4 + 1) % crowdColors.length];
      ctx.fillStyle = color;
      ctx.fillRect(x, HORIZON_Y - 10, 3, 6);
      ctx.fillStyle = "#FFCCBC";
      ctx.fillRect(x + 1, HORIZON_Y - 14, 2, 4);
    }
    // Scoreboard
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(120, 2, 60, 20);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 5px monospace";
    ctx.textAlign = "center";
    ctx.fillText("HOME 0  AWAY 0", 150, 11);
    ctx.fillText("QTR 1", 150, 19);
  } else if (stage === "College") {
    // Denser crowd
    const crowdColors = ["#E53935", "#1565C0", "#F9A825", "#2E7D32", "#FFF"];
    for (let x = 0; x < CANVAS_W; x += 3) {
      const row = Math.floor(x / 3) % 2;
      ctx.fillStyle = crowdColors[Math.floor(x / 3) % crowdColors.length];
      ctx.fillRect(x, HORIZON_Y - 12 + row * 5, 2, 5);
      ctx.fillStyle = "#FFCCBC";
      ctx.fillRect(x, HORIZON_Y - 15 + row * 5, 2, 3);
    }
    // Stadium lights
    const lightPoles = [20, 100, 200, 280];
    for (const px of lightPoles) {
      ctx.fillStyle = "#888";
      ctx.fillRect(px - 1, HORIZON_Y - 30, 2, 30);
      // Light glow
      ctx.fillStyle = "rgba(255,240,180,0.9)";
      ctx.beginPath();
      ctx.arc(px, HORIZON_Y - 30, 4, 0, Math.PI * 2);
      ctx.fill();
      // Light cone
      ctx.save();
      const coneGrad = ctx.createLinearGradient(
        px,
        HORIZON_Y - 26,
        px,
        HORIZON_Y,
      );
      coneGrad.addColorStop(0, "rgba(255,240,180,0.25)");
      coneGrad.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(px, HORIZON_Y - 26);
      ctx.lineTo(px - 20, HORIZON_Y);
      ctx.lineTo(px + 20, HORIZON_Y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (stage === "Pro") {
    // City skyline
    const buildings = [
      { x: 0, w: 20, h: 35 },
      { x: 22, w: 15, h: 45 },
      { x: 39, w: 25, h: 30 },
      { x: 66, w: 12, h: 50 },
      { x: 80, w: 18, h: 38 },
      { x: 100, w: 10, h: 55 },
      { x: 112, w: 20, h: 40 },
      { x: 134, w: 16, h: 48 },
      { x: 152, w: 14, h: 35 },
      { x: 168, w: 22, h: 52 },
      { x: 192, w: 12, h: 44 },
      { x: 206, w: 18, h: 36 },
      { x: 226, w: 15, h: 50 },
      { x: 243, w: 20, h: 42 },
      { x: 265, w: 14, h: 38 },
      { x: 281, w: 19, h: 46 },
    ];
    for (const b of buildings) {
      ctx.fillStyle = "#0a0a18";
      ctx.fillRect(b.x, HORIZON_Y - b.h, b.w, b.h);
      // Windows
      for (let wy = HORIZON_Y - b.h + 3; wy < HORIZON_Y - 4; wy += 5) {
        for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 4) {
          if (Math.random() > 0.4) {
            ctx.fillStyle = "rgba(255,240,100,0.7)";
            ctx.fillRect(wx, wy, 2, 3);
          }
        }
      }
    }
    // Floodlights from sides
    ctx.save();
    const fl1 = ctx.createRadialGradient(0, HORIZON_Y, 0, 0, HORIZON_Y, 100);
    fl1.addColorStop(0, "rgba(200,220,255,0.15)");
    fl1.addColorStop(1, "rgba(200,220,255,0)");
    ctx.fillStyle = fl1;
    ctx.fillRect(0, HORIZON_Y - 20, 100, GROUND_Y - HORIZON_Y + 20);
    const fl2 = ctx.createRadialGradient(
      CANVAS_W,
      HORIZON_Y,
      0,
      CANVAS_W,
      HORIZON_Y,
      100,
    );
    fl2.addColorStop(0, "rgba(200,220,255,0.15)");
    fl2.addColorStop(1, "rgba(200,220,255,0)");
    ctx.fillStyle = fl2;
    ctx.fillRect(200, HORIZON_Y - 20, 100, GROUND_Y - HORIZON_Y + 20);
    ctx.restore();
  } else if (stage === "SuperBowl") {
    // Packed stadium
    const sbColors = [
      "#FFD700",
      "#C63A3A",
      "#2E7BD6",
      "#3FAE5A",
      "#FFF",
      "#FF69B4",
    ];
    for (let row = 0; row < 4; row++) {
      for (let x = 0; x < CANVAS_W; x += 3) {
        ctx.fillStyle = sbColors[(x + row * 7) % sbColors.length];
        ctx.fillRect(x, HORIZON_Y - 20 + row * 5, 2, 4);
        ctx.fillStyle = "#FFCCBC";
        ctx.fillRect(x, HORIZON_Y - 23 + row * 5, 2, 3);
      }
    }
    // Super Bowl banner
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(75, 2, 150, 18);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.fillText("* SUPER BOWL *", CANVAS_W / 2, 14);
  } else {
    // HallOfFame: HOF building silhouette + gold banners
    ctx.fillStyle = "#1a0a20";
    ctx.fillRect(100, HORIZON_Y - 40, 100, 40);
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(120, HORIZON_Y - 55, 60, 15);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 5px monospace";
    ctx.textAlign = "center";
    ctx.fillText("HALL OF FAME", CANVAS_W / 2, HORIZON_Y - 44);
    // Gold ribbons/banners
    for (let i = 0; i < 8; i++) {
      const bx = 20 + i * 35;
      const wave = Math.sin(gs.frameCount * 0.05 + i * 0.8) * 3;
      ctx.fillStyle = i % 2 === 0 ? "#FFD700" : "#C5A028";
      ctx.fillRect(bx, HORIZON_Y - 25 + wave, 4, 20);
    }
    // Purple glow
    ctx.save();
    ctx.fillStyle = "rgba(100,50,150,0.1)";
    ctx.fillRect(0, 0, CANVAS_W, HORIZON_Y);
    ctx.restore();
  }

  // ── Ground ────────────────────────────────────────────────────────────────
  const groundColors: Record<string, [string, string]> = {
    HighSchool: ["#2E7D32", "#1B5E20"],
    College: ["#1a5c14", "#0f3d0a"],
    Pro: ["#0d3d15", "#081f0b"],
    SuperBowl: ["#0f4020", "#0a3518"],
    HallOfFame: ["#1a3520", "#142a18"],
  };
  const [gc1, gc2] = groundColors[stage] ?? groundColors.HighSchool;
  const groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, GROUND_Y);
  groundGrad.addColorStop(0, gc1);
  groundGrad.addColorStop(1, gc2);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, HORIZON_Y, CANVAS_W, GROUND_Y - HORIZON_Y);

  // HallOfFame gold shimmer on ground
  if (stage === "HallOfFame") {
    ctx.save();
    ctx.fillStyle = "rgba(212,160,23,0.08)";
    ctx.fillRect(0, HORIZON_Y, CANVAS_W, GROUND_Y - HORIZON_Y);
    ctx.restore();
  }

  // SuperBowl confetti
  if (stage === "SuperBowl") drawConfetti(ctx, gs);

  // ── Lane alternating shading ──────────────────────────────────────────────
  const laneEdgesBottom = [0, 60, 120, 180, 240, 300];
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(VANISH_X, HORIZON_Y);
    ctx.lineTo(laneEdgesBottom[i + 1], GROUND_Y);
    ctx.lineTo(laneEdgesBottom[i], GROUND_Y);
    ctx.closePath();
    const shade = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)";
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();
  }

  // ── Lane dividers ─────────────────────────────────────────────────────────
  ctx.save();
  for (let i = 0; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(VANISH_X, HORIZON_Y);
    ctx.lineTo(laneEdgesBottom[i], GROUND_Y);
    const lineColor =
      stage === "HallOfFame"
        ? "rgba(255,200,0,0.4)"
        : stage === "HighSchool"
          ? "rgba(255,255,255,0.5)"
          : "rgba(255,255,255,0.25)";
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // ── Scrolling yard lines ──────────────────────────────────────────────────
  ctx.save();
  const yardLineColor =
    stage === "HallOfFame" ? "rgba(255,200,0,0.6)" : "rgba(255,255,255,0.5)";
  ctx.strokeStyle = yardLineColor;
  ctx.lineWidth = 1;
  const numLines = 10;
  for (let i = 0; i < numLines; i++) {
    const rawDepth = (i / numLines + gs.fieldOffset) % 1.0;
    const depth = rawDepth * rawDepth;
    const lineY = HORIZON_Y + (GROUND_Y - HORIZON_Y) * depth;
    if (lineY <= HORIZON_Y) continue;
    const scale = perspectiveScale(lineY);
    const xLeft = VANISH_X - scale * VANISH_X;
    const xRight = VANISH_X + (CANVAS_W - VANISH_X) * scale;
    ctx.globalAlpha = 0.3 + depth * 0.4;
    ctx.beginPath();
    ctx.moveTo(xLeft, lineY);
    ctx.lineTo(xRight, lineY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawConfetti(ctx: CanvasRenderingContext2D, gs: GameState) {
  const colors = ["#FFD700", "#C63A3A", "#2E7BD6", "#3FAE5A", "#FF69B4"];
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const cx = (i * 27 + gs.frameCount * 0.7) % CANVAS_W;
    const cy =
      HORIZON_Y + ((gs.frameCount * (0.8 + i * 0.1)) % (GROUND_Y - HORIZON_Y));
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(cx, cy, 4, 4);
  }
  ctx.restore();
}

function drawObstacles(ctx: CanvasRenderingContext2D, gs: GameState) {
  const sorted = [...gs.obstacles].sort((a, b) => a.y - b.y);
  for (const obs of sorted) {
    const screenY = obs.y;
    const screenX = perspX(obs.lane, screenY);
    const scale = perspectiveScale(screenY);
    if (screenY < HORIZON_Y || screenY > GROUND_Y + 20) continue;
    const breakFrac = obs.breakAnim !== undefined ? obs.breakAnim / 15 : 0;
    if (obs.broken && obs.breakAnim !== undefined && obs.breakAnim > 0) {
      ctx.save();
      ctx.globalAlpha = breakFrac;
      const parts = obs.type === "crate" ? 8 : 6;
      for (let p = 0; p < parts; p++) {
        const angle = (p / parts) * Math.PI * 2 + gs.frameCount * 0.2;
        const dist = (1 - breakFrac) * 20 * scale;
        const px = screenX + Math.cos(angle) * dist;
        const py = screenY + Math.sin(angle) * dist;
        ctx.fillStyle =
          obs.type === "crate" ? crateColor(gs.careerStage) : "#555";
        ctx.fillRect(px - 3 * scale, py - 3 * scale, 6 * scale, 6 * scale);
      }
      ctx.restore();
      continue;
    }
    if (obs.broken) continue;
    if (obs.type === "crate")
      drawCrate(ctx, screenX, screenY, obs, scale, gs.careerStage);
    else drawDefender(ctx, screenX, screenY, scale, gs.careerStage);
  }
}

function crateColor(stage: string): string {
  switch (stage) {
    case "HighSchool":
      return "#8B4513";
    case "College":
      return "#9B2020";
    case "Pro":
      return "#2D2D2D";
    case "SuperBowl":
      return "#B8860B";
    case "HallOfFame":
      return "#DAA520";
    default:
      return "#8B4513";
  }
}

function drawCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  obs: Obstacle,
  scale: number,
  stage: string,
) {
  const w = obs.width * scale;
  const h = obs.height * scale;
  const mainColor = crateColor(stage);
  const lightColor =
    stage === "College"
      ? "#c44040"
      : stage === "Pro"
        ? "#444"
        : stage === "SuperBowl"
          ? "#DAA520"
          : stage === "HallOfFame"
            ? "#FFD700"
            : "#A0522D";
  const darkColor =
    stage === "College"
      ? "#6B1010"
      : stage === "Pro"
        ? "#111"
        : stage === "SuperBowl"
          ? "#7B5B00"
          : stage === "HallOfFame"
            ? "#8B6914"
            : "#5C2E00";

  ctx.fillStyle = mainColor;
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = lightColor;
  ctx.fillRect(x - w / 2, y - h, w, 3 * scale);
  ctx.fillRect(x - w / 2, y - h, 3 * scale, h);
  ctx.fillStyle = darkColor;
  ctx.fillRect(x + w / 2 - 3 * scale, y - h, 3 * scale, h);
  ctx.fillRect(x - w / 2, y - 3 * scale, w, 3 * scale);

  if (stage === "HallOfFame" || stage === "SuperBowl") {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = scale * 1.5;
    ctx.strokeRect(
      x - w / 2 + scale,
      y - h + scale,
      w - 2 * scale,
      h - 2 * scale,
    );
  } else {
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h);
    ctx.lineTo(x + w / 2, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y - h);
    ctx.lineTo(x - w / 2, y);
    ctx.stroke();
  }
  if (obs.powerUp) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = obs.powerUp.color;
    ctx.fillRect(x - 3 * scale, y - h / 2 - 3 * scale, 6 * scale, 6 * scale);
    ctx.restore();
  }
}

function drawDefender(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  stage: string,
) {
  // Defenders face the camera (front view) -- they're running toward us
  const jerseyColors: Record<string, [string, string, string]> = {
    HighSchool: ["#f0f0f0", "#cccccc", "#333333"],
    College: ["#1565C0", "#0D47A1", "#FFD700"],
    Pro: ["#2D2D2D", "#1a1a1a", "#C0C0C0"],
    SuperBowl: ["#0a0a0a", "#B8860B", "#FFD700"],
    HallOfFame: ["#1a1a1a", "#DAA520", "#FFD700"],
  };
  const [jerseyColor, helmetColor, accentColor] =
    jerseyColors[stage] ?? jerseyColors.HighSchool;

  const isHOF = stage === "HallOfFame";

  ctx.save();
  if (isHOF) {
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 6 * scale;
  }

  // ── Helmet (front view) ──────────────────────────────────────────────────
  ctx.fillStyle = helmetColor;
  ctx.beginPath();
  ctx.arc(x, y - 26 * scale, 8 * scale, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 26 * scale, 8 * scale, 0, Math.PI);
  ctx.fill();

  // Facemask (horizontal bars)
  ctx.fillStyle = accentColor;
  ctx.fillRect(x - 6 * scale, y - 23 * scale, 12 * scale, 1.5 * scale);
  ctx.fillRect(x - 6 * scale, y - 20 * scale, 12 * scale, 1.5 * scale);
  // Center bar
  ctx.fillRect(x - 1 * scale, y - 26 * scale, 2 * scale, 8 * scale);

  // Ear holes
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(x - 7 * scale, y - 27 * scale, 1.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 7 * scale, y - 27 * scale, 1.5 * scale, 0, Math.PI * 2);
  ctx.fill();

  // ── Shoulder pads (wide) ─────────────────────────────────────────────────
  ctx.fillStyle = jerseyColor;
  ctx.fillRect(x - 14 * scale, y - 22 * scale, 9 * scale, 5 * scale);
  ctx.fillRect(x + 5 * scale, y - 22 * scale, 9 * scale, 5 * scale);

  // ── Jersey (front) ───────────────────────────────────────────────────────
  ctx.fillStyle = jerseyColor;
  ctx.fillRect(x - 8 * scale, y - 22 * scale, 16 * scale, 14 * scale);

  // Jersey stripes / accent
  ctx.fillStyle = accentColor;
  ctx.fillRect(x - 8 * scale, y - 22 * scale, 2 * scale, 14 * scale);
  ctx.fillRect(x + 6 * scale, y - 22 * scale, 2 * scale, 14 * scale);

  // DEF text on chest
  if (scale > 0.25) {
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${Math.max(4, Math.round(6 * scale))}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("DEF", x, y - 14 * scale);
  }

  // ── Pants ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(x - 7 * scale, y - 8 * scale, 14 * scale, 8 * scale);

  // ── Legs (running toward camera) ──────────────────────────────────────────
  const runPhase = Math.sin(x * 0.05 + performance.now() * 0.008) * Math.PI;
  const legSwing = Math.sin(runPhase) * 3 * scale;

  ctx.fillStyle = "#1a1a2e";
  // Left leg
  ctx.fillRect(x - 7 * scale + legSwing, y - 1 * scale, 5 * scale, 8 * scale);
  // Right leg (opposite swing)
  ctx.fillRect(x + 2 * scale - legSwing, y - 1 * scale, 5 * scale, 8 * scale);

  // Cleats
  ctx.fillStyle = "#111111";
  ctx.fillRect(x - 8 * scale + legSwing, y + 6 * scale, 7 * scale, 3 * scale);
  ctx.fillRect(x + 1 * scale - legSwing, y + 6 * scale, 7 * scale, 3 * scale);

  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, gs: GameState) {
  const x = PLAYER_LANE_X[gs.lane];
  const y = gs.playerY;
  const S = 1.3;

  ctx.save();

  // ── Shield effect ─────────────────────────────────────────────────────────
  if (gs.shieldActive) {
    ctx.beginPath();
    ctx.arc(x, y - 14 * S, 22 * S, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(46,123,214,0.22)";
    ctx.fill();
    ctx.strokeStyle = "#2E7BD6";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── Spin aura ─────────────────────────────────────────────────────────────
  if (gs.playerSpinning) {
    ctx.save();
    const spinAngle = (gs.frameCount * 0.3) % (Math.PI * 2);
    ctx.translate(x, y - 14 * S);
    ctx.rotate(spinAngle);
    ctx.strokeStyle = "rgba(255,255,100,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18 * S, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  // ── Turbo afterimage trail ────────────────────────────────────────────────
  if (gs.turboActive) {
    for (let i = 3; i >= 1; i--) {
      ctx.save();
      ctx.globalAlpha = 0.18 - i * 0.04;
      ctx.translate(x, y + i * 5);
      drawPlayerRearView(ctx, gs, 0, 0, S * 0.9, true);
      ctx.restore();
    }
  }

  // ── Main player draw ──────────────────────────────────────────────────────
  if (gs.playerSpinning) {
    // Spin: rotate entire player around center
    ctx.save();
    const spinAngle = (gs.frameCount * 0.3) % (Math.PI * 2);
    ctx.translate(x, y - 14 * S);
    ctx.rotate(spinAngle);
    drawPlayerRearView(ctx, gs, 0, 14 * S, S, false);
    ctx.restore();
  } else {
    drawPlayerRearView(ctx, gs, x, y, S, false);
  }

  ctx.restore();
}

function drawPlayerRearView(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  x: number,
  y: number,
  S: number,
  isTrail: boolean,
) {
  // Determine colors
  let bodyColor = "#E83030";
  let helmetColor = "#C02020";
  let accentColor = "#FFD700";
  const playerNum = 32;

  if (gs.activeLegend) {
    const legend = LEGENDARY_PLAYERS.find((l) => l.id === gs.activeLegend);
    if (legend) {
      bodyColor = legend.color;
      helmetColor = legend.secondaryColor;
    }
  }

  const runPhase = (gs.frameCount * 0.25) % (Math.PI * 2);

  ctx.save();

  // ── Turbo golden glow ────────────────────────────────────────────────────
  if (gs.turboActive && !isTrail) {
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 8 * S;
  }

  // ── Legs (rear view: legs go downward from behind) ────────────────────────
  // Legs swing fore/aft relative to each other
  const legSwing = Math.sin(runPhase) * 6 * S;
  const legW = 5 * S;
  const legH = 10 * S;

  // Left leg
  ctx.fillStyle = "#222244";
  ctx.fillRect(x - 5 * S + legSwing * 0.5, y - legH + 2 * S, legW, legH);
  // Right leg (opposite phase)
  ctx.fillRect(x + 0 * S - legSwing * 0.5, y - legH + 2 * S, legW, legH);

  // ── Cleats ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "#111111";
  ctx.fillRect(x - 6 * S + legSwing * 0.5, y - 1 * S, legW + 2 * S, 3 * S);
  ctx.fillRect(x - 1 * S - legSwing * 0.5, y - 1 * S, legW + 2 * S, 3 * S);

  // ── Pants ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#222244";
  ctx.fillRect(x - 8 * S, y - 16 * S, 16 * S, 8 * S);
  // Belt stripe
  ctx.fillStyle = accentColor;
  ctx.fillRect(x - 8 * S, y - 16 * S, 16 * S, 1.5 * S);

  // ── Jersey (back) ─────────────────────────────────────────────────────────
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 9 * S, y - 28 * S, 18 * S, 13 * S);

  // Back stripe (vertical center stripe)
  ctx.fillStyle = accentColor;
  ctx.fillRect(x - 1 * S, y - 28 * S, 2 * S, 13 * S);

  // Horizontal shoulder stripe
  ctx.fillRect(x - 9 * S, y - 26 * S, 18 * S, 1.5 * S);

  // ── Jersey number on back ─────────────────────────────────────────────────
  if (!isTrail) {
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${Math.round(7 * S)}px monospace`;
    ctx.textAlign = "center";
    const num = gs.activeLegend
      ? (LEGENDARY_PLAYERS.find((l) => l.id === gs.activeLegend)?.number ??
        playerNum)
      : playerNum;
    ctx.fillText(String(num), x, y - 18 * S);
  }

  // ── Shoulder pads (wider than torso) ──────────────────────────────────────
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x - 15 * S, y - 30 * S, 9 * S, 5 * S); // left pad
  ctx.fillRect(x + 6 * S, y - 30 * S, 9 * S, 5 * S); // right pad
  // Pad accent stripes
  ctx.fillStyle = accentColor;
  ctx.fillRect(x - 15 * S, y - 30 * S, 9 * S, 1.5 * S);
  ctx.fillRect(x + 6 * S, y - 30 * S, 9 * S, 1.5 * S);

  // ── Helmet (rear view) ─────────────────────────────────────────────────────
  // Rounded back of helmet
  ctx.fillStyle = helmetColor;
  ctx.beginPath();
  ctx.arc(x, y - 35 * S, 9 * S, 0, Math.PI * 2);
  ctx.fill();

  // Helmet back vertical stripe
  ctx.fillStyle = accentColor;
  ctx.fillRect(x - 1.5 * S, y - 44 * S, 3 * S, 14 * S);

  // Ear holes (left and right sides)
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(x - 8 * S, y - 35 * S, 2 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 8 * S, y - 35 * S, 2 * S, 0, Math.PI * 2);
  ctx.fill();

  // Back of helmet neck protector
  ctx.fillStyle = helmetColor;
  ctx.fillRect(x - 5 * S, y - 27 * S, 10 * S, 3 * S);

  ctx.restore();
}

function drawCoach(ctx: CanvasRenderingContext2D, gs: GameState) {
  const alpha = Math.min(1, gs.tutorialTimer / 30);
  ctx.save();
  ctx.globalAlpha = alpha;

  // Coach position: bottom-left area
  const cx = 38;
  const cy = CANVAS_H - 60;

  // Coach body (pixel art)
  // Legs
  ctx.fillStyle = "#2244AA";
  ctx.fillRect(cx - 6, cy + 10, 5, 12);
  ctx.fillRect(cx + 1, cy + 10, 5, 12);
  // Shoes
  ctx.fillStyle = "#111";
  ctx.fillRect(cx - 7, cy + 20, 7, 4);
  ctx.fillRect(cx + 1, cy + 20, 7, 4);
  // Body (polo shirt)
  ctx.fillStyle = "#4A90D9";
  ctx.fillRect(cx - 9, cy - 8, 18, 20);
  // Whistle
  ctx.fillStyle = "#FFD700";
  ctx.fillRect(cx + 2, cy, 5, 3);
  // Arms
  ctx.fillStyle = "#C8906A";
  ctx.fillRect(cx - 14, cy - 4, 6, 8);
  ctx.fillRect(cx + 9, cy - 4, 6, 8);
  // Neck/head
  ctx.fillStyle = "#C8906A";
  ctx.fillRect(cx - 3, cy - 14, 6, 7);
  ctx.beginPath();
  ctx.arc(cx, cy - 18, 8, 0, Math.PI * 2);
  ctx.fill();
  // Cap
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(cx - 9, cy - 24, 18, 6);
  ctx.fillRect(cx - 11, cy - 20, 22, 3);

  // Speech bubble
  const msg = gs.tutorialMessage;
  const words = msg.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  const maxLineWidth = 130;
  ctx.font = "bold 8px monospace";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxLineWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const bubbleW = 150;
  const bubbleH = lines.length * 12 + 14;
  const bubbleX = cx + 20;
  const bubbleY = cy - 30 - bubbleH;

  // Bubble background
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 8);
  ctx.fill();
  ctx.strokeStyle = "#3FAE5A";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Bubble tail
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(bubbleX + 10, bubbleY + bubbleH);
  ctx.lineTo(cx + 12, cy - 26);
  ctx.lineTo(bubbleX + 25, bubbleY + bubbleH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3FAE5A";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  ctx.fillStyle = "#0a0a1a";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "left";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bubbleX + 8, bubbleY + 14 + i * 12);
  }

  // Tap to dismiss hint
  ctx.fillStyle = "rgba(100,100,100,0.8)";
  ctx.font = "7px monospace";
  ctx.textAlign = "center";
  ctx.fillText("tap to dismiss", bubbleX + bubbleW / 2, bubbleY + bubbleH - 3);

  ctx.restore();
}

function drawFloatingTexts(ctx: CanvasRenderingContext2D, gs: GameState) {
  for (const ft of gs.floatingTexts) {
    const alpha = ft.life / ft.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

function drawStartScreen(ctx: CanvasRenderingContext2D, gs: GameState) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#3FAE5A";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PIXEL", CANVAS_W / 2, 90);
  ctx.fillText("GRIDIRON", CANVAS_W / 2, 116);
  ctx.fillStyle = "#E7E7E7";
  ctx.font = "11px monospace";
  ctx.fillText("PRESS START", CANVAS_W / 2, 150);
  ctx.fillStyle = "#A9B0B6";
  ctx.font = "9px monospace";
  ctx.fillText("Tap ◀ ▶ to switch lanes", CANVAS_W / 2, 175);
  ctx.fillText("HURDLE to jump  SPIN to break", CANVAS_W / 2, 190);
  ctx.fillText("TURBO for speed boost", CANVAS_W / 2, 205);
  ctx.fillStyle = "#3FAE5A";
  ctx.font = "bold 10px monospace";
  ctx.fillText(
    gs.careerStage
      .replace(/([A-Z])/g, " $1")
      .trim()
      .toUpperCase(),
    CANVAS_W / 2,
    235,
  );
  ctx.restore();
}

function drawGameOverScreen(ctx: CanvasRenderingContext2D, gs: GameState) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#C63A3A";
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", CANVAS_W / 2, 90);
  ctx.fillStyle = "#E7E7E7";
  ctx.font = "bold 14px monospace";
  ctx.fillText(`SCORE: ${gs.score}`, CANVAS_W / 2, 125);
  ctx.fillStyle = "#A9B0B6";
  ctx.font = "10px monospace";
  ctx.fillText(`YARDS: ${Math.floor(gs.yardage)}`, CANVAS_W / 2, 148);
  ctx.fillText(`XP GAINED: +${gs.xpGained}`, CANVAS_W / 2, 165);
  ctx.fillStyle = "#3FAE5A";
  ctx.font = "bold 11px monospace";
  ctx.fillText("PRESS START TO PLAY AGAIN", CANVAS_W / 2, 200);
  ctx.restore();
}
