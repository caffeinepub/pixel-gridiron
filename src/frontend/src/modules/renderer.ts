/**
 * renderer.ts v34 — Pure 2D Canvas, proper perspective trapezoid field.
 * - Upside-down V field: vanishing point top-center, 5 lanes spread wide at bottom
 * - Tile rows rendered as trapezoid strips with checkerboard turf
 * - Obstacles sized and positioned by depth (worldZ → screen depth)
 * - Player drawn at depth=1.0 (bottom of field)
 */
import type { GameState } from "../types/game";

// ── Field geometry constants ──────────────────────────────────────────────────
// Horizon bounds (fraction of W): 6 lines for 5 lanes, narrow at top
const HOR_BOUNDS = [0.35, 0.41, 0.47, 0.53, 0.59, 0.65] as const;
// Bottom bounds (fraction of W): 6 lines for 5 lanes, full width at bottom
const BOT_BOUNDS = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0] as const;

const HORIZON_Y_FRAC = 0.05;
const PLAYER_Y_FRAC = 0.88;

const SPAWN_WORLD_Z = 20; // matches game.ts SPAWN_Z
const VISIBLE_ROWS = 22;

// Stage palettes
const STAGE_COLORS: Record<
  string,
  {
    sky: string;
    darkTile: string;
    lightTile: string;
    line: string;
    endzoneA: string;
    endzoneB: string;
  }
> = {
  HighSchool: {
    sky: "#4a90d9",
    darkTile: "#2d6a1f",
    lightTile: "#35801f",
    line: "rgba(255,255,255,0.45)",
    endzoneA: "#b8860b",
    endzoneB: "#ffd700",
  },
  College: {
    sky: "#1a0a00",
    darkTile: "#1e5010",
    lightTile: "#2a6818",
    line: "rgba(255,215,0,0.5)",
    endzoneA: "#4a2200",
    endzoneB: "#c87830",
  },
  Pro: {
    sky: "#02020f",
    darkTile: "#0e2e12",
    lightTile: "#163a1a",
    line: "rgba(255,255,255,0.38)",
    endzoneA: "#1a1a50",
    endzoneB: "#3030a0",
  },
  SuperBowl: {
    sky: "#08001a",
    darkTile: "#1a4020",
    lightTile: "#203830",
    line: "rgba(255,215,0,0.55)",
    endzoneA: "#2a1a00",
    endzoneB: "#c89820",
  },
  HallOfFame: {
    sky: "#1a0030",
    darkTile: "#1a3020",
    lightTile: "#243828",
    line: "rgba(255,215,0,0.7)",
    endzoneA: "#3a1000",
    endzoneB: "#ff8c00",
  },
};

// Defender colors
const DEF_COLORS: Record<
  string,
  { body: string; helmet: string; glow: string; label: string }
> = {
  dt: {
    body: "#8b0000",
    helmet: "#5a0000",
    glow: "rgba(139,0,0,0.5)",
    label: "DT",
  },
  de: {
    body: "#c03030",
    helmet: "#801010",
    glow: "rgba(200,50,50,0.5)",
    label: "DE",
  },
  lb: {
    body: "#c06020",
    helmet: "#804010",
    glow: "rgba(200,100,30,0.5)",
    label: "LB",
  },
  cb: {
    body: "#2060c0",
    helmet: "#104080",
    glow: "rgba(50,100,200,0.5)",
    label: "CB",
  },
  s: {
    body: "#1850a0",
    helmet: "#0c3070",
    glow: "rgba(30,80,180,0.5)",
    label: "S",
  },
};

export interface PlayerCanvasPos {
  x: number;
  y: number;
  size: number;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Interpolate horizon/bottom bound at a given depth (0=horizon, 1=bottom) */
function laneLeft(laneIdx: number, depth: number, W: number): number {
  return (
    (HOR_BOUNDS[laneIdx] +
      (BOT_BOUNDS[laneIdx] - HOR_BOUNDS[laneIdx]) * depth) *
    W
  );
}
function laneRight(laneIdx: number, depth: number, W: number): number {
  return (
    (HOR_BOUNDS[laneIdx + 1] +
      (BOT_BOUNDS[laneIdx + 1] - HOR_BOUNDS[laneIdx + 1]) * depth) *
    W
  );
}
function laneCenterX(lane: number, depth: number, W: number): number {
  return (laneLeft(lane, depth, W) + laneRight(lane, depth, W)) / 2;
}
function depthToY(depth: number, hz: number, bottomY: number): number {
  return hz + (bottomY - hz) * depth;
}
function worldZToDepth(worldZ: number): number {
  return Math.max(0.01, Math.min(1.0, 1 - worldZ / SPAWN_WORLD_Z));
}

// ── Sky ───────────────────────────────────────────────────────────────────────
function drawSky(
  ctx: CanvasRenderingContext2D,
  W: number,
  hz: number,
  stage: (typeof STAGE_COLORS)[string],
) {
  const grad = ctx.createLinearGradient(0, 0, 0, hz);
  grad.addColorStop(0, darken(stage.sky, 20));
  grad.addColorStop(1, lighten(stage.sky, 25));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, hz);
}

// ── Tile floor (trapezoid rows with checkerboard) ─────────────────────────────
function drawFloor(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  hz: number,
  bottomY: number,
  gs: GameState,
  stage: (typeof STAGE_COLORS)[string],
  fieldMap: readonly string[],
) {
  // Scroll offset so tiles appear to move toward player
  const scrollFrac = (gs.fieldScroll * 0.18) % 1;

  for (let row = 0; row < VISIBLE_ROWS; row++) {
    // depth at top and bottom of this tile strip
    const depthTop = Math.max(0.005, (row + scrollFrac) / VISIBLE_ROWS);
    const depthBot = Math.min(1.0, (row + 1 + scrollFrac) / VISIBLE_ROWS);
    if (depthTop >= 1.0) continue;

    const yTop = depthToY(depthTop, hz, bottomY);
    const yBot = depthToY(depthBot, hz, bottomY);
    if (yBot < hz) continue;

    // Determine map row index this tile row corresponds to
    const mapRowIdx = (gs.mapRow + row) % Math.max(1, fieldMap.length);
    const mapRow = fieldMap[mapRowIdx] ?? "00000";
    const isEndzone = mapRow.split("").every((c) => c === "8" || c === "0");

    for (let lane = 0; lane < 5; lane++) {
      const xl = laneLeft(lane, depthTop, W);
      const xr = laneRight(lane, depthTop, W);
      const xlB = laneLeft(lane, depthBot, W);
      const xrB = laneRight(lane, depthBot, W);

      // Checkerboard: alternate by (row + lane) parity
      const checker = (row + lane) % 2 === 0;

      let color: string;
      if (isEndzone) {
        color = checker ? stage.endzoneA : stage.endzoneB;
      } else {
        color = checker ? stage.darkTile : stage.lightTile;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(xl, yTop);
      ctx.lineTo(xr, yTop);
      ctx.lineTo(xrB, yBot);
      ctx.lineTo(xlB, yBot);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Lane lines: 6 perspective lines from horizon to bottom
  ctx.save();
  ctx.strokeStyle = stage.line;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const hx = HOR_BOUNDS[i] * W;
    const bx = BOT_BOUNDS[i] * W;
    ctx.beginPath();
    ctx.moveTo(hx, hz);
    ctx.lineTo(bx, H);
    ctx.stroke();
  }
  ctx.restore();

  // Horizon line
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hz);
  ctx.lineTo(W, hz);
  ctx.stroke();
  ctx.restore();
}

// ── Spin arc ──────────────────────────────────────────────────────────────────
function drawSpinEffect(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  gs: GameState,
) {
  const SPIN_DURATION = 1.2;
  const alpha = (gs.spinTimer / SPIN_DURATION) * 0.85;
  if (alpha <= 0) return;
  const arcCy = py - size * 0.18;
  const sweep = Math.PI * 1.5;
  const startAngle = gs.spinAngle;
  const arcs = [
    { r: size * 0.22, w: size * 0.07, a: alpha },
    { r: size * 0.28, w: size * 0.05, a: alpha * 0.7 },
    { r: size * 0.35, w: size * 0.03, a: alpha * 0.4 },
  ];
  ctx.save();
  ctx.lineCap = "round";
  for (const arc of arcs) {
    ctx.beginPath();
    ctx.arc(px, arcCy, arc.r, startAngle, startAngle + sweep);
    ctx.strokeStyle = `rgba(255,220,50,${arc.a})`;
    ctx.lineWidth = arc.w;
    ctx.stroke();
  }
  ctx.restore();
}

// ── Player shadow + position (GIF is DOM overlay) ─────────────────────────────
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  _hz: number,
  bottomY: number,
  gs: GameState,
): PlayerCanvasPos {
  const depth = 1.0;
  const lane = gs.fromLane + (gs.targetLane - gs.fromLane) * gs.laneT;
  const px = laneCenterX(lane, depth, W);
  const py = bottomY - gs.jumpY * 0.15;
  const size = H * 0.12;

  if (gs.spinning) drawSpinEffect(ctx, px, py, size, gs);

  // Ground shadow
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(
    px,
    bottomY + size * 0.08,
    size * 0.42,
    size * 0.1,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  return { x: px, y: py, size };
}

function drawPlayerFallback(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  gs: GameState,
) {
  const t = gs.elapsedTime;
  const jerseyColor = gs.shieldActive
    ? "#2060c0"
    : gs.turboActive
      ? "#c03000"
      : "#3FAE5A";

  // torso
  ctx.fillStyle = jerseyColor;
  ctx.beginPath();
  ctx.roundRect(
    px - size * 0.18,
    py - size * 0.55,
    size * 0.36,
    size * 0.35,
    4,
  );
  ctx.fill();

  // helmet
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(px, py - size * 0.6, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + size * 0.06, py - size * 0.55, size * 0.1, -0.3, 0.8);
  ctx.stroke();

  // legs
  const stride = gs.spinning ? 0 : Math.sin(t * 12) * size * 0.15;
  ctx.fillStyle = "#1a2a3a";
  ctx.beginPath();
  ctx.roundRect(
    px - size * 0.12,
    py - size * 0.2,
    size * 0.1,
    size * 0.3 + stride,
    3,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(
    px + size * 0.02,
    py - size * 0.2,
    size * 0.1,
    size * 0.3 - stride,
    3,
  );
  ctx.fill();

  // arms
  const armSwing = gs.spinning ? 0 : Math.sin(t * 12 + 1) * size * 0.1;
  ctx.strokeStyle = jerseyColor;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px - size * 0.18, py - size * 0.45);
  ctx.lineTo(px - size * 0.3, py - size * 0.2 + armSwing);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + size * 0.18, py - size * 0.45);
  ctx.lineTo(px + size * 0.3, py - size * 0.2 - armSwing);
  ctx.stroke();

  // jersey number
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${size * 0.16}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText(String(gs.jerseyNumber || 32), px, py - size * 0.38);
}

// ── Obstacle drawing ──────────────────────────────────────────────────────────
function drawObstacle(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  hz: number,
  bottomY: number,
  obs: import("../types/game").Obstacle,
  gs: GameState,
) {
  const depth = worldZToDepth(obs.worldZ);
  if (depth < 0.02 || depth > 1.05) return;

  const ox = laneCenterX(obs.lane, depth, W);
  const oy = depthToY(depth, hz, bottomY);
  const size = H * 0.1 * depth;
  if (size < 4) return;

  ctx.save();

  if (obs.broken) {
    const breakPct = 1 - obs.breakTimer / 0.33;
    ctx.globalAlpha = Math.max(0, 1 - breakPct * 1.4);
    ctx.translate(ox, oy);
    ctx.rotate(breakPct * Math.PI);
    ctx.translate(-ox, -oy);
  }

  if (obs.emojiPowerUp) {
    const bobY = Math.sin(gs.elapsedTime * 4 + obs.id * 1.2) * size * 0.15;
    const orbY = oy + bobY;
    const grd = ctx.createRadialGradient(ox, orbY, 0, ox, orbY, size * 0.7);
    grd.addColorStop(0, `${obs.emojiPowerUp.color}cc`);
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(ox, orbY, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${size * 0.9}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(obs.emojiPowerUp.emoji, ox, orbY);
  } else if (obs.type === "crate") {
    ctx.fillStyle = "#8B5E3C";
    ctx.strokeStyle = "#5C3A1E";
    ctx.lineWidth = size * 0.08;
    ctx.beginPath();
    ctx.roundRect(
      ox - size * 0.45,
      oy - size * 0.45,
      size * 0.9,
      size * 0.9,
      size * 0.08,
    );
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(ox - size * 0.45, oy);
    ctx.lineTo(ox + size * 0.45, oy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy - size * 0.45);
    ctx.lineTo(ox, oy + size * 0.45);
    ctx.stroke();
    if (obs.powerUp) {
      ctx.font = `bold ${size * 0.35}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = obs.powerUp.color;
      ctx.fillText(obs.powerUp.label.slice(0, 2), ox, oy);
    } else {
      ctx.font = `${size * 0.45}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📦", ox, oy);
    }
  } else if (obs.type === "defender" && obs.defenderType) {
    drawDefender(ctx, ox, oy, size, obs.defenderType, gs);
  }

  ctx.restore();
}

function drawDefender(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  size: number,
  type: string,
  gs: GameState,
) {
  const col = DEF_COLORS[type] ?? DEF_COLORS.lb;
  const t = gs.elapsedTime;

  // glow aura
  const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, size * 1.0);
  grd.addColorStop(0, col.glow);
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(ox, oy, size, 0, Math.PI * 2);
  ctx.fill();

  const scaleX = type === "dt" ? 1.4 : type === "de" ? 0.9 : 1.0;
  const scaleY = type === "dt" ? 0.88 : type === "de" ? 1.15 : 1.0;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scaleX, scaleY);

  // torso
  ctx.fillStyle = col.body;
  ctx.beginPath();
  ctx.roundRect(-size * 0.2, -size * 0.55, size * 0.4, size * 0.38, 4);
  ctx.fill();

  // helmet
  ctx.fillStyle = col.helmet;
  ctx.beginPath();
  ctx.arc(0, -size * 0.58, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(200,200,200,0.7)";
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.moveTo(-size * 0.14, -size * 0.52);
  ctx.lineTo(size * 0.14, -size * 0.52);
  ctx.stroke();

  // legs
  const stride = Math.sin(t * 10 + ox) * size * 0.12;
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.roundRect(
    -size * 0.16,
    -size * 0.17,
    size * 0.12,
    size * 0.28 + stride,
    3,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(
    size * 0.04,
    -size * 0.17,
    size * 0.12,
    size * 0.28 - stride,
    3,
  );
  ctx.fill();

  // arms
  ctx.strokeStyle = col.body;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.42);
  ctx.lineTo(-size * 0.38, -size * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.2, -size * 0.42);
  ctx.lineTo(size * 0.38, -size * 0.2);
  ctx.stroke();

  // label
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${size * 0.22}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(col.label, 0, -size * 0.38);

  ctx.restore();
}

// ── Floating text ─────────────────────────────────────────────────────────────
function drawFloats(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gs: GameState,
) {
  for (const ft of gs.floats) {
    const alpha = Math.min(1, ft.life * 2);
    if (alpha <= 0) continue;
    const yPos = H * 0.65 - (ft.maxLife - ft.life) * 70;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${W * 0.045}px monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = ft.color;
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 8;
    ctx.fillText(ft.text, W * 0.5, yPos);
    ctx.restore();
  }
}

function drawDownHud(
  ctx: CanvasRenderingContext2D,
  W: number,
  _H: number,
  gs: GameState,
) {
  const ordinals = ["1ST", "2ND", "3RD", "4TH"];
  const text = `${ordinals[(gs.currentDown - 1) % 4] ?? "1ST"} & ${Math.ceil(gs.yardsToGo)}`;
  ctx.save();
  ctx.font = `bold ${W * 0.038}px monospace`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText(text, W - 8 + 1, 58 + 1);
  ctx.fillStyle = "#FFD700";
  ctx.fillText(text, W - 8, 58);
  ctx.restore();
}

function drawSnapHud(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gs: GameState,
) {
  if (gs.phase !== "idle" || !gs.snapPhase) return;
  const labels: Record<string, string> = {
    ready: "READY...",
    set: "SET...",
  };
  const label = labels[gs.snapPhase];
  if (!label) return;
  ctx.save();
  ctx.font = `bold ${W * 0.06}px monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(label, W * 0.5 + 1, H * 0.42 + 1);
  ctx.fillStyle = "#FFD700";
  ctx.shadowColor = "#FFD700";
  ctx.shadowBlur = 12;
  ctx.fillText(label, W * 0.5, H * 0.42);
  ctx.restore();
}

function drawTutorial(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gs: GameState,
) {
  if (!gs.tutActive || gs.tutTimer <= 0) return;
  const alpha = Math.min(1, gs.tutTimer * 2);
  ctx.save();
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath();
  ctx.roundRect(W * 0.05, H * 0.45, W * 0.9, H * 0.1, 8);
  ctx.fill();
  ctx.fillStyle = "#FFD700";
  ctx.font = `bold ${W * 0.032}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText(gs.tutMessage, W * 0.5, H * 0.5 + 4);
  ctx.restore();
}

function lighten(hex: string, pct: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + pct);
  const g = Math.min(255, ((n >> 8) & 0xff) + pct);
  const b = Math.min(255, (n & 0xff) + pct);
  return `rgb(${r},${g},${b})`;
}

function darken(hex: string, pct: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - pct);
  const g = Math.max(0, ((n >> 8) & 0xff) - pct);
  const b = Math.max(0, (n & 0xff) - pct);
  return `rgb(${r},${g},${b})`;
}

// ── Main renderer class ────────────────────────────────────────────────────────
export default class Renderer2D {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  W = 0;
  H = 0;
  useCanvasFallback = true;
  lastPlayerPos: PlayerCanvasPos = { x: 0, y: 0, size: 0 };

  init(container: HTMLDivElement, w: number, h: number) {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.imageRendering = "pixelated";
    this.W = w;
    this.H = h;
    canvas.width = w;
    canvas.height = h;
    container.innerHTML = "";
    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  resize(w: number, h: number) {
    if (!this.canvas) return;
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w);
    this.canvas.height = Math.round(h);
  }

  update(gs: GameState, _dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.W;
    const H = this.H;

    ctx.clearRect(0, 0, W, H);

    const stage = STAGE_COLORS[gs.careerStage] ?? STAGE_COLORS.HighSchool;
    const hz = H * HORIZON_Y_FRAC;
    const bottomY = H * PLAYER_Y_FRAC;

    // Get field map for endzone detection in floor tiles
    // Import dynamically to avoid circular deps — use inline logic
    const fieldMapProxy: readonly string[] =
      gs.obstacles.length >= 0
        ? (() => {
            // Fallback: all open rows — real map handled by spawner
            // We only need this for endzone tile coloring
            return ["00000"] as readonly string[];
          })()
        : ["00000"];

    // Sky
    drawSky(ctx, W, hz, stage);

    // Field floor with trapezoid tiles
    drawFloor(ctx, W, H, hz, bottomY, gs, stage, fieldMapProxy);

    const activePlay = gs.phase === "playing" || gs.phase === "tackled";

    if (activePlay) {
      // Obstacles: sort back-to-front (higher worldZ = farther = draw first)
      const sorted = [...gs.obstacles].sort((a, b) => b.worldZ - a.worldZ);
      for (const obs of sorted) {
        drawObstacle(ctx, W, H, hz, bottomY, obs, gs);
      }

      // Player shadow + position
      const pos = drawPlayer(ctx, W, H, hz, bottomY, gs);
      this.lastPlayerPos = pos;

      if (this.useCanvasFallback) {
        drawPlayerFallback(ctx, pos.x, pos.y, pos.size, gs);
      }

      drawFloats(ctx, W, H, gs);
      drawDownHud(ctx, W, H, gs);
      drawTutorial(ctx, W, H, gs);
    } else {
      // idle/paused: draw snap phase HUD if in snap sequence
      drawSnapHud(ctx, W, H, gs);
      this.lastPlayerPos = { x: 0, y: 0, size: 0 };
    }
  }

  dispose() {
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    this.ctx = null;
  }
}
