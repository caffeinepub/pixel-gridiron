/**
 * renderer.ts — full SNES-style PPU layered draw pipeline.
 * Layer order: sky → horizon → ground → lanes → obstacles → player → floats → coach → flash → scanlines → screens
 */
import {
  BREAK_DUR,
  CH,
  CW,
  type CareerStage,
  DEFENDER_STATS,
  GROUND_Y,
  type GameState,
  HORIZON_Y,
  LANE_BOT,
  LANE_HOR,
  LEGENDARY_PLAYERS,
  type Obstacle,
  PLAYER_Y,
  SPAWN_Z,
  STAGE_NAMES,
  VANISH_X,
} from "../types/game";
import { laneX, playerScreenX } from "./movement";

// Project a worldZ + lane to screen coords
function proj(worldZ: number, lane: number) {
  const t = Math.min(1, Math.max(0, worldZ / SPAWN_Z));
  const y = PLAYER_Y - (PLAYER_Y - HORIZON_Y) * t;
  const bx = LANE_BOT[lane];
  const hx = LANE_HOR[lane];
  const x = bx + (hx - bx) * t;
  const scale = 1 - t * 0.88;
  return { x, y, scale };
}

export function drawFrame(ctx: CanvasRenderingContext2D, gs: GameState): void {
  ctx.clearRect(0, 0, CW, CH);

  drawSky(ctx, gs);
  drawHorizon(ctx, gs);
  drawGround(ctx, gs);
  drawLanes(ctx, gs);
  drawObstacles(ctx, gs);
  drawPlayer(ctx, gs);
  drawFloats(ctx, gs);
  if (gs.tutActive) drawCoach(ctx, gs);

  // Hurt flash
  if (gs.hurtFlash > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(198,58,58,${Math.min(0.55, gs.hurtFlash * 1.4).toFixed(2)})`;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();
  }

  // SNES scanlines
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = "#000";
  for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Screens
  if (gs.phase === "idle") drawIdleScreen(ctx, gs);
  if (gs.phase === "paused") drawPauseScreen(ctx, gs);
  if (gs.phase === "tackled") drawTackleScreen(ctx, gs);

  // Yards HUD (always during play)
  if (gs.phase === "playing" || gs.phase === "tackled") drawYards(ctx, gs);
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 0: SKY
// ───────────────────────────────────────────────────────────────────────────────
function drawSky(ctx: CanvasRenderingContext2D, gs: GameState) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  const skies: Record<CareerStage, string[]> = {
    HighSchool: ["#5BA3DC", "#87CEEB"],
    College: ["#1a0a00", "#FF6B1A", "#FFB347"],
    Pro: ["#02020F", "#0a0a25"],
    SuperBowl: ["#08001A", "#1a052e"],
    HallOfFame: ["#1a0030", "#5C2A00", "#1a0010"],
  };
  const cols = skies[gs.careerStage];
  if (cols.length === 2) {
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[1]);
  } else {
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.5, cols[1]);
    g.addColorStop(1, cols[2]);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, HORIZON_Y);

  if (gs.careerStage === "HighSchool") {
    // Sun
    const sg = ctx.createRadialGradient(VANISH_X, 30, 4, VANISH_X, 30, 26);
    sg.addColorStop(0, "#FFF176");
    sg.addColorStop(0.5, "#FFD700");
    sg.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(VANISH_X - 30, 4, 60, 56);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    for (const [cx, cy, cr] of [
      [100, 22, 14],
      [118, 16, 18],
      [136, 22, 13],
      [220, 30, 12],
      [238, 24, 16],
      [254, 30, 11],
    ] as number[][]) {
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Stars
    ctx.save();
    for (const [sx, sy] of [
      [20, 10],
      [55, 18],
      [100, 8],
      [145, 22],
      [195, 12],
      [240, 20],
      [290, 7],
      [330, 15],
      [60, 35],
      [160, 32],
      [280, 28],
      [350, 40],
    ] as number[][]) {
      const tw = 0.5 + 0.5 * Math.sin(gs.frame * 0.04 + sx * 0.1);
      ctx.fillStyle = `rgba(255,255,255,${(0.4 + tw * 0.5).toFixed(2)})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.restore();
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 1: HORIZON SCENERY
// ───────────────────────────────────────────────────────────────────────────────
function drawHorizon(ctx: CanvasRenderingContext2D, gs: GameState) {
  const glows: Record<CareerStage, string> = {
    HighSchool: "rgba(120,200,60,0.5)",
    College: "rgba(255,160,40,0.6)",
    Pro: "rgba(60,120,255,0.5)",
    SuperBowl: "rgba(255,215,0,0.7)",
    HallOfFame: "rgba(255,140,40,0.8)",
  };
  const hg = ctx.createLinearGradient(0, HORIZON_Y - 10, 0, HORIZON_Y + 16);
  hg.addColorStop(0, "rgba(0,0,0,0)");
  hg.addColorStop(0.5, glows[gs.careerStage]);
  hg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, HORIZON_Y - 10, CW, 26);

  const stage = gs.careerStage;
  if (stage === "HighSchool") {
    const cc = ["#E53935", "#1565C0", "#F9A825", "#2E7D32", "#6A1B9A", "#FFF"];
    for (let x = 0; x < CW; x += 5) {
      ctx.fillStyle = cc[Math.floor(x / 5) % cc.length];
      ctx.fillRect(x, HORIZON_Y - 14, 4, 8);
      ctx.fillStyle = "#FFCCBC";
      ctx.fillRect(x + 1, HORIZON_Y - 20, 3, 6);
    }
    ctx.fillStyle = "#111";
    ctx.fillRect(VANISH_X - 55, 4, 110, 28);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("HOME 0  AWAY 0  Q1", VANISH_X, 15);
    ctx.fillText(
      (gs.teamName || "PIXEL FC").toUpperCase().slice(0, 12),
      VANISH_X,
      27,
    );
  } else if (stage === "College") {
    const cc = ["#E53935", "#1565C0", "#F9A825", "#2E7D32", "#FFF"];
    for (let x = 0; x < CW; x += 4) {
      const row = Math.floor(x / 4) % 2;
      ctx.fillStyle = cc[Math.floor(x / 4) % cc.length];
      ctx.fillRect(x, HORIZON_Y - 16 + row * 6, 3, 6);
      ctx.fillStyle = "#FFCCBC";
      ctx.fillRect(x, HORIZON_Y - 20 + row * 6, 3, 4);
    }
    for (const lx of [40, 160, 200, 320]) {
      ctx.fillStyle = "#888";
      ctx.fillRect(lx - 2, HORIZON_Y - 50, 4, 50);
      ctx.fillStyle = "rgba(255,240,180,0.95)";
      ctx.beginPath();
      ctx.arc(lx, HORIZON_Y - 50, 7, 0, Math.PI * 2);
      ctx.fill();
      const cg = ctx.createLinearGradient(lx, HORIZON_Y - 43, lx, HORIZON_Y);
      cg.addColorStop(0, "rgba(255,240,180,0.22)");
      cg.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(lx, HORIZON_Y - 43);
      ctx.lineTo(lx - 32, HORIZON_Y);
      ctx.lineTo(lx + 32, HORIZON_Y);
      ctx.closePath();
      ctx.fill();
    }
  } else if (stage === "Pro") {
    const bldgs = [
      { x: 0, w: 28, h: 55 },
      { x: 30, w: 20, h: 75 },
      { x: 52, w: 32, h: 45 },
      { x: 86, w: 16, h: 90 },
      { x: 104, w: 24, h: 62 },
      { x: 130, w: 14, h: 80 },
      { x: 146, w: 28, h: 58 },
      { x: 176, w: 22, h: 74 },
      { x: 200, w: 18, h: 50 },
      { x: 220, w: 28, h: 85 },
      { x: 250, w: 16, h: 68 },
      { x: 268, w: 24, h: 55 },
      { x: 294, w: 20, h: 78 },
      { x: 316, w: 24, h: 60 },
      { x: 340, w: 20, h: 72 },
    ];
    for (const b of bldgs) {
      ctx.fillStyle = "#080810";
      ctx.fillRect(b.x, HORIZON_Y - b.h, b.w, b.h);
      for (let wy = HORIZON_Y - b.h + 5; wy < HORIZON_Y - 5; wy += 8) {
        for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 6) {
          if (Math.random() > 0.6) {
            ctx.fillStyle = `rgba(255,240,${Math.floor(Math.random() * 100 + 80)},0.7)`;
            ctx.fillRect(wx, wy, 3, 5);
          }
        }
      }
    }
  } else if (stage === "SuperBowl") {
    const sc = ["#FFD700", "#C63A3A", "#2E7BD6", "#3FAE5A", "#FFF", "#FF69B4"];
    for (let row = 0; row < 5; row++)
      for (let x = 0; x < CW; x += 4) {
        ctx.fillStyle = sc[(x + row * 9) % sc.length];
        ctx.fillRect(x, HORIZON_Y - 24 + row * 5, 3, 5);
        ctx.fillStyle = "#FFCCBC";
        ctx.fillRect(x, HORIZON_Y - 28 + row * 5, 3, 4);
      }
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(VANISH_X - 90, 4, 180, 24);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("* SUPER BOWL *", VANISH_X, 20);
  } else {
    ctx.fillStyle = "#0a0515";
    ctx.fillRect(VANISH_X - 70, HORIZON_Y - 65, 140, 65);
    ctx.fillStyle = "#7B3F00";
    ctx.fillRect(VANISH_X - 50, HORIZON_Y - 80, 100, 20);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("HALL OF FAME", VANISH_X, HORIZON_Y - 68);
    for (let i = 0; i < 10; i++) {
      const bx = 18 + i * 33;
      const wave = Math.sin(gs.frame * 0.06 + i * 0.7) * 4;
      ctx.fillStyle = i % 2 === 0 ? "#FFD700" : "#C5A028";
      ctx.fillRect(bx, HORIZON_Y - 35 + wave, 6, 30);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 2: GROUND (Mode-7 scrolling)
// ───────────────────────────────────────────────────────────────────────────────
function drawGround(ctx: CanvasRenderingContext2D, gs: GameState) {
  const palettes: Record<CareerStage, [string, string, string, string]> = {
    HighSchool: ["#3A9A2A", "#2E7D32", "#226018", "#1B5E20"],
    College: ["#2A7A20", "#1f6018", "#154810", "#0f3d0a"],
    Pro: ["#143A18", "#0f2e12", "#09200c", "#051508"],
    SuperBowl: ["#1A5028", "#133d1e", "#0d2e16", "#09200f"],
    HallOfFame: ["#1E4028", "#16301e", "#0f2415", "#09180d"],
  };
  const [c1, c2, c3, c4] = palettes[gs.careerStage];
  const gg = ctx.createLinearGradient(0, HORIZON_Y, 0, GROUND_Y);
  gg.addColorStop(0, c1);
  gg.addColorStop(0.35, c2);
  gg.addColorStop(0.7, c3);
  gg.addColorStop(1, c4);
  ctx.fillStyle = gg;
  ctx.fillRect(0, HORIZON_Y, CW, GROUND_Y - HORIZON_Y);

  // Mode-7 stripes
  ctx.save();
  for (let i = 0; i < 20; i++) {
    const d = (i / 20 + gs.fieldScroll) % 1.0;
    const nd = ((i + 1) / 20 + gs.fieldScroll) % 1.0;
    const y1 = HORIZON_Y + (GROUND_Y - HORIZON_Y) * (1 - d);
    const y2 = HORIZON_Y + (GROUND_Y - HORIZON_Y) * (1 - nd);
    const top = Math.min(y1, y2);
    const bot = Math.max(y1, y2);
    if (bot < HORIZON_Y) continue;
    const t = 1 - d;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(VANISH_X - VANISH_X * t, top, CW * t, Math.max(1, bot - top));
  }
  ctx.restore();

  // Yard lines
  ctx.save();
  ctx.strokeStyle =
    gs.careerStage === "HallOfFame"
      ? "rgba(255,200,0,0.5)"
      : "rgba(255,255,255,0.38)";
  for (let i = 0; i < 12; i++) {
    const raw = (i / 12 + gs.fieldScroll * 1.4) % 1.0;
    const d = raw * raw;
    const y = HORIZON_Y + (GROUND_Y - HORIZON_Y) * (1 - d);
    if (y <= HORIZON_Y + 2 || y > GROUND_Y) continue;
    const t = 1 - d;
    ctx.lineWidth = Math.max(0.5, 2 * (1 - raw));
    ctx.globalAlpha = 0.2 + d * 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, VANISH_X - VANISH_X * t - 2), y);
    ctx.lineTo(Math.min(CW, VANISH_X + (CW - VANISH_X) * t + 2), y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (gs.careerStage === "SuperBowl") {
    const cc = ["#FFD700", "#C63A3A", "#2E7BD6", "#3FAE5A", "#FF69B4"];
    ctx.save();
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = cc[i % cc.length];
      ctx.fillRect(
        (i * 22 + gs.frame * 0.9) % CW,
        HORIZON_Y + ((gs.frame * (0.5 + i * 0.08)) % (GROUND_Y - HORIZON_Y)),
        5,
        5,
      );
    }
    ctx.restore();
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 3: LANE DIVIDERS
// ───────────────────────────────────────────────────────────────────────────────
function drawLanes(ctx: CanvasRenderingContext2D, gs: GameState) {
  const col =
    gs.careerStage === "HallOfFame"
      ? "rgba(255,200,0,0.55)"
      : gs.careerStage === "HighSchool"
        ? "rgba(255,255,255,0.55)"
        : "rgba(255,255,255,0.3)";
  const bEdge = [
    LANE_BOT[0] - (LANE_BOT[1] - LANE_BOT[0]) / 2,
    (LANE_BOT[0] + LANE_BOT[1]) / 2,
    (LANE_BOT[1] + LANE_BOT[2]) / 2,
    (LANE_BOT[2] + LANE_BOT[3]) / 2,
    (LANE_BOT[3] + LANE_BOT[4]) / 2,
    LANE_BOT[4] + (LANE_BOT[4] - LANE_BOT[3]) / 2,
  ];
  const hEdge = [
    LANE_HOR[0] - (LANE_HOR[1] - LANE_HOR[0]) / 2,
    (LANE_HOR[0] + LANE_HOR[1]) / 2,
    (LANE_HOR[1] + LANE_HOR[2]) / 2,
    (LANE_HOR[2] + LANE_HOR[3]) / 2,
    (LANE_HOR[3] + LANE_HOR[4]) / 2,
    LANE_HOR[4] + (LANE_HOR[4] - LANE_HOR[3]) / 2,
  ];
  ctx.save();
  ctx.strokeStyle = col;
  for (let i = 0; i <= 5; i++) {
    ctx.lineWidth = i === 0 || i === 5 ? 2.5 : 1.5;
    ctx.globalAlpha = i === 0 || i === 5 ? 0.85 : 0.45;
    ctx.beginPath();
    ctx.moveTo(hEdge[i], HORIZON_Y);
    ctx.lineTo(bEdge[i], GROUND_Y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 4: OBSTACLES
// ───────────────────────────────────────────────────────────────────────────────
function drawObstacles(ctx: CanvasRenderingContext2D, gs: GameState) {
  const sorted = [...gs.obstacles].sort((a, b) => b.worldZ - a.worldZ);
  for (const obs of sorted) {
    if (obs.worldZ > SPAWN_Z + 2 || obs.worldZ < -2) continue;
    const { x, y, scale } = proj(obs.worldZ, obs.lane);
    if (y < HORIZON_Y) continue;
    if (obs.broken && obs.breakTimer > 0) {
      drawBreak(ctx, x, y, scale, obs);
      continue;
    }
    if (obs.broken) continue;
    if (obs.emojiPowerUp) drawEmoji(ctx, x, y, scale, obs, gs.frame);
    else if (obs.type === "crate")
      drawCrate(ctx, x, y, scale, gs.careerStage, !!obs.powerUp);
    else
      drawDefender(
        ctx,
        x,
        y,
        scale,
        gs.careerStage,
        obs.defenderType,
        gs.frame,
      );
  }
}

function drawBreak(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  obs: Obstacle,
) {
  const frac = obs.breakTimer / BREAK_DUR;
  ctx.save();
  ctx.globalAlpha = frac;
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    const d = (1 - frac) * 28 * scale;
    ctx.fillStyle = obs.type === "crate" ? "#8B4513" : "#E05050";
    const sz = Math.max(3, 6 * scale);
    ctx.fillRect(
      x + Math.cos(a) * d - sz / 2,
      y + Math.sin(a) * d - sz / 2,
      sz,
      sz,
    );
  }
  ctx.restore();
}

function drawEmoji(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  obs: Obstacle,
  frame: number,
) {
  const ep = obs.emojiPowerUp!;
  const r = Math.max(12, 26 * scale);
  const bob = Math.sin(frame * 0.08) * 4 * scale;
  ctx.save();
  const rg = ctx.createRadialGradient(
    x,
    y + bob - r,
    r * 0.2,
    x,
    y + bob - r,
    r * 1.3,
  );
  rg.addColorStop(0, `${ep.color}55`);
  rg.addColorStop(1, `${ep.color}00`);
  ctx.fillStyle = rg;
  ctx.fillRect(x - r * 1.6, y + bob - r * 2.6, r * 3.2, r * 3.2);
  ctx.beginPath();
  ctx.arc(x, y + bob - r, r, 0, Math.PI * 2);
  ctx.strokeStyle = ep.color;
  ctx.lineWidth = Math.max(1.5, 2.5 * scale);
  ctx.stroke();
  ctx.font = `${Math.max(12, Math.round(20 * scale))}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ep.emoji, x, y + bob - r);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  stage: CareerStage,
  hasPow: boolean,
) {
  const w = Math.max(22, 52 * scale);
  const h = w;
  const mc: Record<CareerStage, string> = {
    HighSchool: "#8B4513",
    College: "#9B2020",
    Pro: "#2D2D2D",
    SuperBowl: "#B8860B",
    HallOfFame: "#DAA520",
  };
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x - w / 2 + 4, y - h + 4, w, h);
  ctx.fillStyle = mc[stage];
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(x - w / 2, y - h, w, 3);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x + w / 2 - 3, y - h, 3, h);
  ctx.fillRect(x - w / 2, y - 3, w, 3);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.moveTo(x + w / 2, y - h);
  ctx.lineTo(x - w / 2, y);
  ctx.stroke();
  if (hasPow) {
    const pg = ctx.createRadialGradient(x, y - h / 2, 2, x, y - h / 2, w / 2);
    pg.addColorStop(0, "rgba(255,215,0,0.55)");
    pg.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = pg;
    ctx.fillRect(x - w / 2, y - h, w, h);
  }
  if (stage === "HallOfFame" || stage === "SuperBowl") {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.strokeRect(x - w / 2 + 1, y - h + 1, w - 2, h - 2);
  }
  ctx.restore();
}

function drawDefender(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  stage: CareerStage,
  dType?: string,
  frame = 0,
) {
  const jerseys: Record<CareerStage, [string, string, string]> = {
    HighSchool: ["#f0f0f0", "#cccccc", "#333333"],
    College: ["#1565C0", "#0D47A1", "#FFD700"],
    Pro: ["#2D2D2D", "#1a1a1a", "#C0C0C0"],
    SuperBowl: ["#0a0a0a", "#B8860B", "#FFD700"],
    HallOfFame: ["#1a1a1a", "#DAA520", "#FFD700"],
  };
  const [jc, hc, ac] = jerseys[stage];
  let wm = 1.0;
  let hm = 1.0;
  if (dType === "dt") {
    wm = 1.4;
    hm = 0.85;
  } else if (dType === "cb" || dType === "s") {
    wm = 0.85;
    hm = 1.15;
  }
  const bW = 44 * scale * wm;
  const bH = 62 * scale * hm;
  if (bW < 4) return;
  ctx.save();
  if (stage === "HallOfFame") {
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 8 * scale;
  }
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, bW * 0.55, bH * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  const sw = Math.sin(frame * 0.18) * bW * 0.12;
  const lw = bW * 0.25;
  const lh = bH * 0.25;
  ctx.fillStyle = "#111128";
  ctx.fillRect(x - bW * 0.22 + sw, y - lh, lw, lh);
  ctx.fillRect(x + bW * 0.22 - lw - sw, y - lh, lw, lh);
  ctx.fillStyle = "#000";
  ctx.fillRect(x - bW * 0.26 + sw, y - 3 * scale, lw + 2, 4 * scale);
  ctx.fillRect(x + bW * 0.18 - sw, y - 3 * scale, lw + 2, 4 * scale);
  // pants
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(x - bW * 0.45, y - bH * 0.32, bW * 0.9, bH * 0.22);
  // jersey
  ctx.fillStyle = jc;
  ctx.fillRect(x - bW * 0.48, y - bH * 0.72, bW * 0.96, bH * 0.44);
  ctx.fillStyle = ac;
  ctx.fillRect(x - bW * 0.48, y - bH * 0.72, bW * 0.07, bH * 0.44);
  ctx.fillRect(x + bW * 0.41, y - bH * 0.72, bW * 0.07, bH * 0.44);
  // shoulder pads
  ctx.fillStyle = jc;
  ctx.fillRect(x - bW * 0.55, y - bH * 0.72, bW * 0.2, bH * 0.15);
  ctx.fillRect(x + bW * 0.35, y - bH * 0.72, bW * 0.2, bH * 0.15);
  // arms
  ctx.fillStyle = "#C89060";
  ctx.fillRect(x - bW * 0.58, y - bH * 0.62, bW * 0.13, bH * 0.22);
  ctx.fillRect(x + bW * 0.45, y - bH * 0.62, bW * 0.13, bH * 0.22);
  // label
  if (scale > 0.3 && dType) {
    const tc: Record<string, string> = {
      de: "#FF7070",
      dt: "#FF3333",
      lb: "#FFA500",
      cb: "#6BAAFF",
      s: "#4AAEFF",
    };
    ctx.fillStyle = tc[dType] ?? ac;
    ctx.font = `bold ${Math.max(8, Math.round(11 * scale))}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(
      DEFENDER_STATS[dType as keyof typeof DEFENDER_STATS]?.label ?? "DEF",
      x,
      y - bH * 0.5,
    );
  }
  // helmet
  const hr = bW * 0.28;
  ctx.fillStyle = hc;
  ctx.beginPath();
  ctx.arc(x, y - bH * 0.82, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ac;
  ctx.fillRect(x - hr * 0.8, y - bH * 0.78, hr * 1.6, 2 * scale);
  ctx.fillRect(x - hr * 0.8, y - bH * 0.72, hr * 1.6, 2 * scale);
  ctx.fillRect(x - scale, y - bH * 0.9, 2 * scale, bH * 0.22);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x - hr * 0.88, y - bH * 0.85, 2 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + hr * 0.88, y - bH * 0.85, 2 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 5: PLAYER
// ───────────────────────────────────────────────────────────────────────────────
function drawPlayer(ctx: CanvasRenderingContext2D, gs: GameState) {
  const px = playerScreenX(gs);
  const py = PLAYER_Y - gs.jumpY;
  const S = 1.6;

  ctx.save();
  if (gs.shieldActive) {
    ctx.beginPath();
    ctx.arc(px, py - 20 * S, 30 * S, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(46,123,214,0.18)";
    ctx.fill();
    ctx.strokeStyle = "#2E7BD6";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  if (gs.turboActive) {
    for (let i = 3; i >= 1; i--) {
      ctx.save();
      ctx.globalAlpha = 0.12 - i * 0.03;
      drawSprite(ctx, gs, px, py + i * 9, S, true);
      ctx.restore();
    }
  }
  if (gs.spinning) {
    const sx = Math.cos(gs.spinAngle);
    ctx.save();
    for (let g = 1; g <= 3; g++) {
      ctx.save();
      ctx.globalAlpha = 0.1 * (4 - g);
      ctx.strokeStyle = "rgba(255,220,50,0.9)";
      ctx.lineWidth = 2 * S;
      ctx.translate(px + g * 10 * Math.sign(sx) * S, py - 18 * S);
      ctx.scale(Math.abs(sx) * 0.5, 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, 18 * S, 24 * S, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sx, 1);
    drawSprite(ctx, gs, 0, 0, S, false);
    ctx.restore();
  } else {
    drawSprite(ctx, gs, px, py, S, false);
  }
  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  x: number,
  y: number,
  S: number,
  trail: boolean,
) {
  let body = "#E83030";
  let helm = "#C02020";
  let acc = "#FFD700";
  let num = gs.jerseyNumber ?? 32;
  if (gs.activeLegend) {
    const l = LEGENDARY_PLAYERS.find((p) => p.id === gs.activeLegend);
    if (l) {
      body = l.color;
      helm = l.secondaryColor;
      num = l.number;
    }
  }
  const phase = (gs.frame * 0.22) % (Math.PI * 2);
  ctx.save();
  if (gs.turboActive && !trail) {
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 10 * S;
  }
  // legs
  const stride = Math.sin(phase);
  const lw = 7 * S;
  const lbh = 14 * S;
  const lf = stride > 0;
  const lH = lf ? lbh * 0.65 : lbh;
  const rH = !lf ? lbh * 0.65 : lbh;
  const lA = lf ? 0.72 : 1.0;
  const rA = !lf ? 0.72 : 1.0;
  const lO = lf ? -3 * S : 0;
  const rO = !lf ? -3 * S : 0;
  ctx.save();
  ctx.globalAlpha = (trail ? 0.55 : 1) * lA;
  ctx.fillStyle = "#222244";
  ctx.fillRect(x - 7 * S, y - lH + 2 * S + lO, lw, lH);
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 8 * S, y - S + lO, lw + 2 * S, 4 * S);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = (trail ? 0.55 : 1) * rA;
  ctx.fillStyle = "#222244";
  ctx.fillRect(x, y - rH + 2 * S + rO, lw, rH);
  ctx.fillStyle = "#111";
  ctx.fillRect(x - S, y - S + rO, lw + 2 * S, 4 * S);
  ctx.restore();
  // pants
  ctx.fillStyle = "#222244";
  ctx.fillRect(x - 11 * S, y - 20 * S, 22 * S, 11 * S);
  ctx.fillStyle = acc;
  ctx.fillRect(x - 11 * S, y - 20 * S, 22 * S, 2 * S);
  // jersey
  ctx.fillStyle = body;
  ctx.fillRect(x - 12 * S, y - 36 * S, 24 * S, 18 * S);
  ctx.fillStyle = acc;
  ctx.fillRect(x - 1.5 * S, y - 36 * S, 3 * S, 18 * S);
  ctx.fillRect(x - 12 * S, y - 34 * S, 24 * S, 2 * S);
  if (!trail) {
    ctx.fillStyle = acc;
    ctx.font = `bold ${Math.round(9 * S)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(String(num), x, y - 23 * S);
  }
  // shoulders
  ctx.fillStyle = body;
  ctx.fillRect(x - 20 * S, y - 38 * S, 12 * S, 7 * S);
  ctx.fillRect(x + 8 * S, y - 38 * S, 12 * S, 7 * S);
  ctx.fillStyle = acc;
  ctx.fillRect(x - 20 * S, y - 38 * S, 12 * S, 2 * S);
  ctx.fillRect(x + 8 * S, y - 38 * S, 12 * S, 2 * S);
  // helmet rear
  ctx.fillStyle = helm;
  ctx.beginPath();
  ctx.arc(x, y - 45 * S, 12 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = acc;
  ctx.fillRect(x - 2 * S, y - 57 * S, 4 * S, 18 * S);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x - 10 * S, y - 46 * S, 2.5 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 10 * S, y - 46 * S, 2.5 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = helm;
  ctx.fillRect(x - 7 * S, y - 36 * S, 14 * S, 4 * S);
  ctx.restore();
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 6: FLOATING TEXT
// ───────────────────────────────────────────────────────────────────────────────
function drawFloats(ctx: CanvasRenderingContext2D, gs: GameState) {
  for (const ft of gs.floats) {
    const a = Math.min(1, (ft.life / ft.maxLife) * 2);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// PPU LAYER 7: COACH TUTORIAL
// ───────────────────────────────────────────────────────────────────────────────
function drawCoach(ctx: CanvasRenderingContext2D, gs: GameState) {
  const alpha = Math.min(1, gs.tutTimer * 0.8);
  ctx.save();
  ctx.globalAlpha = alpha;
  const cx = 50;
  const cy = CH - 90;
  ctx.fillStyle = "#2244AA";
  ctx.fillRect(cx - 12, cy, 24, 30);
  ctx.fillStyle = "#C8906A";
  ctx.fillRect(cx - 22, cy + 5, 12, 14);
  ctx.fillRect(cx + 10, cy + 5, 12, 14);
  ctx.fillStyle = "#F5DEB3";
  ctx.fillRect(cx + 10, cy + 5, 10, 12);
  ctx.fillStyle = "#C8906A";
  ctx.fillRect(cx - 7, cy - 16, 14, 10);
  ctx.beginPath();
  ctx.arc(cx, cy - 22, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(cx - 13, cy - 30, 26, 8);
  ctx.fillRect(cx - 15, cy - 26, 30, 4);
  ctx.fillStyle = "#111";
  ctx.fillRect(cx - 9, cy + 28, 8, 14);
  ctx.fillRect(cx + 1, cy + 28, 8, 14);
  const words = gs.tutMessage.split(" ");
  const lines: string[] = [];
  let cur = "";
  ctx.font = "bold 10px monospace";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > 180 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  const bW = 210;
  const bH = lines.length * 16 + 18;
  const bX = cx + 26;
  const bY = cy - 30 - bH;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bX, bY, bW, bH, 10);
  else ctx.rect(bX, bY, bW, bH);
  ctx.fill();
  ctx.strokeStyle = "#3FAE5A";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.moveTo(bX + 14, bY + bH);
  ctx.lineTo(cx + 16, cy - 24);
  ctx.lineTo(bX + 32, bY + bH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0a0a1a";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "left";
  lines.forEach((l, i) => ctx.fillText(l, bX + 10, bY + 16 + i * 16));
  ctx.restore();
}

// ───────────────────────────────────────────────────────────────────────────────
// SCREENS
// ───────────────────────────────────────────────────────────────────────────────
function drawIdleScreen(ctx: CanvasRenderingContext2D, gs: GameState) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.fillRect(0, 0, CW, CH);
  const cx = CW / 2;
  ctx.fillStyle = "#3FAE5A";
  ctx.font = "bold 38px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PIXEL", cx, CH * 0.3);
  ctx.fillStyle = "#E7E7E7";
  ctx.fillText("GRIDIRON", cx, CH * 0.3 + 46);
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 13px monospace";
  ctx.fillText(
    (STAGE_NAMES[gs.careerStage] || gs.careerStage).toUpperCase(),
    cx,
    CH * 0.3 + 82,
  );
  if (Math.sin(gs.frame * 0.08) > 0) {
    ctx.fillStyle = "rgba(63,174,90,0.9)";
    ctx.font = "bold 15px monospace";
    ctx.fillText("PRESS START", cx, CH * 0.3 + 116);
  }
  ctx.fillStyle = "#6A7480";
  ctx.font = "10px monospace";
  ctx.fillText("TAP ◀ ▶ to change lanes", cx, CH * 0.3 + 148);
  ctx.fillText(
    "SPIN breaks defenders · HURDLE jumps crates",
    cx,
    CH * 0.3 + 164,
  );
  ctx.fillText("TURBO for speed boost", cx, CH * 0.3 + 180);
  if (gs.teamName) {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = "10px monospace";
    ctx.fillText(gs.teamName.toUpperCase(), cx, CH * 0.3 + 204);
  }
  ctx.restore();
}

function drawPauseScreen(ctx: CanvasRenderingContext2D, _gs: GameState) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = "#E7E7E7";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", CW / 2, CH / 2 - 16);
  ctx.fillStyle = "#3FAE5A";
  ctx.font = "bold 13px monospace";
  ctx.fillText("PRESS START TO RESUME", CW / 2, CH / 2 + 18);
  ctx.restore();
}

function drawTackleScreen(ctx: CanvasRenderingContext2D, gs: GameState) {
  const alpha = Math.min(0.88, (1.8 - gs.tackleTimer) * 0.6);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
  ctx.fillRect(0, 0, CW, CH);
  if (alpha > 0.35) {
    ctx.fillStyle = "#C63A3A";
    ctx.font = "bold 30px monospace";
    ctx.textAlign = "center";
    ctx.fillText("TACKLED!", CW / 2, CH * 0.35);
    ctx.fillStyle = "#E7E7E7";
    ctx.font = "bold 18px monospace";
    ctx.fillText(`${Math.floor(gs.fieldZ)} YARDS`, CW / 2, CH * 0.35 + 44);
    ctx.fillStyle = "#3FAE5A";
    ctx.font = "bold 13px monospace";
    ctx.fillText("TAP START → NEXT PLAY", CW / 2, CH * 0.35 + 78);
  }
  ctx.restore();
}

function drawYards(ctx: CanvasRenderingContext2D, gs: GameState) {
  const yards = Math.floor(gs.fieldZ);
  const down = gs.currentDown ?? 1;
  const toGo = Math.max(0, Math.ceil(gs.yardsToGo ?? 10));
  ctx.save();

  // Down & distance pill (top right, under HUD)
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(CW - 130, 54, 126, 40);
  // Down label
  const downLabel =
    down === 1 ? "1ST" : down === 2 ? "2ND" : down === 3 ? "3RD" : "4TH";
  const downColor = down >= 4 ? "#C63A3A" : down >= 3 ? "#D4A017" : "#3FAE5A";
  ctx.fillStyle = downColor;
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${downLabel} & ${toGo}`, CW - 6, 70);
  // Yards
  ctx.fillStyle = "rgba(200,200,200,0.7)";
  ctx.font = "bold 10px monospace";
  ctx.fillText(`${yards} YDS`, CW - 6, 88);
  ctx.restore();
}

// re-export laneX for external consumers
export { laneX };
