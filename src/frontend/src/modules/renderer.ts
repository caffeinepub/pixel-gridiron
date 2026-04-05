/**
 * renderer.ts v32 — Pure 2D Canvas renderer. No Three.js.
 * v31: GIF sprites are DOM <img> elements positioned by the GameCanvas layer;
 *      the canvas handles field, obstacles, HUD, and fallback player only.
 *      Exports lastPlayerPos so GameCanvas can sync the sprite img position.
 * Scrolling perspective floor, sprite player, emoji obstacles, HUD floats.
 */
import type { GameState } from "../types/game";

// ── Layout constants ─────────────────────────────────────────────────────────
const HORIZON_Y = 0.04; // horizon very near top (4% down)
const PLAYER_Y_FRAC = 0.9; // player sits at 90% down (near bottom of canvas, above controls)
// vanishing point at horizontal center: 0.5 (used implicitly in lane fracs)

// Lane X positions at the bottom edge (0..1 of canvas width)
const LANE_BOT_FRAC = [0.08, 0.26, 0.5, 0.74, 0.92] as const;
// Lane X positions at the horizon (converge)
const LANE_HOR_FRAC = [0.32, 0.41, 0.5, 0.59, 0.68] as const;

// Obstacle rendering depth band: 0=horizon, 1=player row
const OBS_SPAWN_DEPTH = 0.04; // start tiny at horizon edge
const OBS_CULL_DEPTH = 1.05; // remove after passing player

// How far an obstacle at worldZ=0 (player position) is rendered
// worldZ in game.ts: 0=player, positive=ahead. We convert to depth 0..1.
const SPAWN_WORLD_Z = 12; // matches game.ts SPAWN_Z

function worldZToDepth(worldZ: number): number {
  const d = 1 - worldZ / SPAWN_WORLD_Z;
  return Math.max(OBS_SPAWN_DEPTH, Math.min(OBS_CULL_DEPTH, d));
}

// Lerp lane fraction at a given depth
function laneFracAtDepth(lane: number, depth: number): number {
  const bot = LANE_BOT_FRAC[Math.round(lane)] ?? LANE_BOT_FRAC[2];
  const hor = LANE_HOR_FRAC[Math.round(lane)] ?? LANE_HOR_FRAC[2];
  return hor + (bot - hor) * depth;
}

// ── Stage colors ─────────────────────────────────────────────────────────────
const STAGE_COLORS: Record<
  string,
  { sky: string; dark: string; light: string; line: string }
> = {
  HighSchool: {
    sky: "#5ba3dc",
    dark: "#2d8020",
    light: "#3a9a2a",
    line: "#ffffffcc",
  },
  College: {
    sky: "#1a0800",
    dark: "#2a7a20",
    light: "#1f6018",
    line: "#ffd700cc",
  },
  Pro: { sky: "#02020f", dark: "#143a18", light: "#1a4820", line: "#ffffffaa" },
  SuperBowl: {
    sky: "#08001a",
    dark: "#1a5028",
    light: "#204030",
    line: "#ffd700cc",
  },
  HallOfFame: {
    sky: "#1a0030",
    dark: "#1e4028",
    light: "#283830",
    line: "#ffd700ff",
  },
};

// ── Defender colors ───────────────────────────────────────────────────────────
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

// ── Player position — exported so GameCanvas can sync DOM img overlay ─────────
export interface PlayerCanvasPos {
  x: number; // canvas pixel x (center of player)
  y: number; // canvas pixel y (bottom of player)
  size: number; // height of sprite slot in pixels
}

// ── Floor tile scroll ─────────────────────────────────────────────────────────
function drawFloor(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gs: GameState,
) {
  const hz = H * HORIZON_Y;
  const stage = STAGE_COLORS[gs.careerStage] ?? STAGE_COLORS.HighSchool;

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, hz);
  skyGrad.addColorStop(0, stage.sky);
  skyGrad.addColorStop(1, lighten(stage.sky, 30));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, hz);

  // Ground gradient (below horizon)
  const gndGrad = ctx.createLinearGradient(0, hz, 0, H);
  gndGrad.addColorStop(0, stage.dark);
  gndGrad.addColorStop(1, lighten(stage.dark, 15));
  ctx.fillStyle = gndGrad;
  ctx.fillRect(0, hz, W, H - hz);

  // Perspective yard lines — scrolling based on fieldScroll
  const TILE_DEPTH_STEP = 0.065;
  const scroll = (gs.fieldScroll % (SPAWN_WORLD_Z / 8)) / (SPAWN_WORLD_Z / 8);

  ctx.save();
  ctx.strokeStyle = stage.line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;

  for (let i = 0; i < 16; i++) {
    const depth = (i * TILE_DEPTH_STEP + scroll * TILE_DEPTH_STEP) % 1.0;
    if (depth < 0.01) continue;
    const y = hz + (H - hz) * depth;
    ctx.lineWidth = depth * 2.5;
    ctx.globalAlpha = 0.15 + depth * 0.3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Lane separator lines
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  const LANE_BOUNDS_BOT = [0.0, 0.17, 0.35, 0.65, 0.83, 1.0];
  const LANE_BOUNDS_HOR = [0.27, 0.36, 0.45, 0.55, 0.64, 0.73];
  for (let i = 0; i < 6; i++) {
    const bx = W * LANE_BOUNDS_BOT[i];
    const hx = W * LANE_BOUNDS_HOR[i];
    ctx.beginPath();
    ctx.moveTo(hx, hz);
    ctx.lineTo(bx, H);
    ctx.stroke();
  }
  ctx.restore();

  // Checkerboard turf strips
  const stripeScroll = (gs.fieldScroll * 1.8) % 1;
  const stripeCount = 20;
  for (let i = 0; i < stripeCount; i++) {
    const depth0 = (i / stripeCount + stripeScroll / stripeCount) % 1.0;
    const depth1 = ((i + 0.5) / stripeCount + stripeScroll / stripeCount) % 1.0;
    if (depth0 > depth1) continue;
    const y0 = hz + (H - hz) * depth0;
    const y1 = hz + (H - hz) * depth1;
    if (i % 2 === 0) continue;
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, y0, W, y1 - y0);
  }
}

// ── Spin arc effect ───────────────────────────────────────────────────────────
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

  const arcs: Array<{ r: number; w: number; a: number }> = [
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

  const sparkCount = 5;
  for (let i = 0; i < sparkCount; i++) {
    const a = startAngle + (i / sparkCount) * sweep;
    const sx = px + Math.cos(a) * size * 0.35;
    const sy = arcCy + Math.sin(a) * size * 0.35;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,240,100,${alpha * 0.8})`;
    ctx.fill();
  }
  ctx.restore();
}

// ── Player canvas draw (shadow + fallback only — GIF handled by DOM overlay) ──
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gs: GameState,
): PlayerCanvasPos {
  const playerDepth = 1.0;
  const lane = gs.fromLane + (gs.targetLane - gs.fromLane) * gs.laneT;
  const px = W * laneFracAtDepth(lane, playerDepth);
  const py = H * PLAYER_Y_FRAC - gs.jumpY * 0.18;
  const size = H * 0.14;

  if (gs.spinning) {
    drawSpinEffect(ctx, px, py, size, gs);
  }

  // Ground shadow — always drawn on canvas
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(
    px,
    H * PLAYER_Y_FRAC + size * 0.55,
    size * 0.38,
    size * 0.1,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  // Canvas fallback (only used when no GIF is mounted by GameCanvas)
  // We skip drawing here — GameCanvas owns the sprite.

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

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(px, py - size * 0.6, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + size * 0.06, py - size * 0.55, size * 0.1, -0.3, 0.8);
  ctx.stroke();

  const spinFrac = gs.spinning ? gs.spinTimer / 1.2 : 0;
  const armFlare = gs.spinning
    ? 1.0 + Math.sin(spinFrac * Math.PI) * 0.55
    : 1.0;
  const legCross = gs.spinning ? Math.sin(gs.spinAngle) * size * 0.08 : 0;
  const stride = gs.spinning ? 0 : Math.sin(t * 12) * size * 0.15;

  ctx.fillStyle = "#1a2a3a";
  ctx.beginPath();
  ctx.roundRect(
    px - size * 0.12 + legCross,
    py - size * 0.2,
    size * 0.1,
    size * 0.3 + stride,
    3,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(
    px + size * 0.02 - legCross,
    py - size * 0.2,
    size * 0.1,
    size * 0.3 - stride,
    3,
  );
  ctx.fill();

  const armSpread = size * 0.3 * armFlare;
  const armSwing = gs.spinning ? 0 : Math.sin(t * 12 + 1) * size * 0.1;
  ctx.strokeStyle = jerseyColor;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px - size * 0.18, py - size * 0.45);
  ctx.lineTo(px - armSpread, py - size * 0.2 + armSwing);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + size * 0.18, py - size * 0.45);
  ctx.lineTo(px + armSpread, py - size * 0.2 - armSwing);
  ctx.stroke();

  ctx.fillStyle = lighten(jerseyColor, 20);
  ctx.beginPath();
  ctx.ellipse(
    px - size * 0.2 * armFlare,
    py - size * 0.5,
    size * 0.1 * Math.min(armFlare, 1.3),
    size * 0.06,
    -0.3,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    px + size * 0.2 * armFlare,
    py - size * 0.5,
    size * 0.1 * Math.min(armFlare, 1.3),
    size * 0.06,
    0.3,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${size * 0.16}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText(String(gs.jerseyNumber || 32), px, py - size * 0.38);

  if (gs.turboActive) {
    ctx.save();
    ctx.globalAlpha = 0.3 + Math.sin(t * 10) * 0.2;
    const grd = ctx.createRadialGradient(px, py, 0, px, py, size * 0.8);
    grd.addColorStop(0, "#ff6600");
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Obstacle drawing ──────────────────────────────────────────────────────────
function drawObstacle(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  obs: import("../types/game").Obstacle,
  gs: GameState,
) {
  const hz = H * HORIZON_Y;
  const depth = worldZToDepth(obs.worldZ);
  if (depth < OBS_SPAWN_DEPTH || depth > OBS_CULL_DEPTH) return;

  const ox = W * laneFracAtDepth(obs.lane, depth);
  const oy = hz + (H * PLAYER_Y_FRAC - hz) * depth;
  const size = H * 0.11 * depth;
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
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    for (const [dx, dy] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3],
    ]) {
      ctx.beginPath();
      ctx.arc(ox + dx * size, oy + dy * size, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
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

  ctx.fillStyle = col.body;
  ctx.beginPath();
  ctx.roundRect(-size * 0.2, -size * 0.55, size * 0.4, size * 0.38, 4);
  ctx.fill();

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
  ctx.beginPath();
  ctx.moveTo(-size * 0.12, -size * 0.44);
  ctx.lineTo(size * 0.12, -size * 0.44);
  ctx.stroke();

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

// ── Down & distance HUD ───────────────────────────────────────────────────────
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

// ── Coach tip ─────────────────────────────────────────────────────────────────
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

// ── Utility ───────────────────────────────────────────────────────────────────
function lighten(hex: string, pct: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + pct);
  const g = Math.min(255, ((n >> 8) & 0xff) + pct);
  const b = Math.min(255, (n & 0xff) + pct);
  return `rgb(${r},${g},${b})`;
}

// ── Main renderer class ────────────────────────────────────────────────────────
export default class Renderer2D {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  W = 0;
  H = 0;
  // Set to false when GameCanvas has mounted a GIF img overlay
  useCanvasFallback = true;
  // Last computed player position — read by GameCanvas each frame
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
    drawFloor(ctx, W, H, gs);

    const sorted = [...gs.obstacles].sort((a, b) => b.worldZ - a.worldZ);
    for (const obs of sorted) {
      drawObstacle(ctx, W, H, obs, gs);
    }

    // Draw player (shadow + spin arc + optionally fallback)
    const pos = drawPlayer(ctx, W, H, gs);
    this.lastPlayerPos = pos;

    // If no GIF overlay is mounted, draw fallback
    if (this.useCanvasFallback) {
      drawPlayerFallback(ctx, pos.x, pos.y, pos.size, gs);
    }

    drawFloats(ctx, W, H, gs);
    drawDownHud(ctx, W, H, gs);
    drawTutorial(ctx, W, H, gs);
  }

  dispose() {
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    this.ctx = null;
  }
}
