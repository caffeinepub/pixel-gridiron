/**
 * renderer.ts v30 — Pure 2D Canvas renderer. No Three.js.
 * v30: Uses user GIF sprites when loaded; fromLane-based player position.
 * Scrolling perspective floor, sprite player, emoji obstacles, HUD floats.
 * Simple, fast, correct.
 */
import type { GameState } from "../types/game";

// ── Layout constants ─────────────────────────────────────────────────────────
const HORIZON_Y = 0.32; // 0..1 fraction of canvas height
const PLAYER_Y_FRAC = 0.82; // player sits at 82% down
const VANISH_X_FRAC = 0.5; // vanishing point at horizontal center

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
  // worldZ=SPAWN_WORLD_Z → depth=OBS_SPAWN_DEPTH, worldZ=0 → depth=1
  const d = 1 - worldZ / SPAWN_WORLD_Z;
  return Math.max(OBS_SPAWN_DEPTH, Math.min(OBS_CULL_DEPTH, d));
}

// Lerp lane fraction at a given depth
function laneFracAtDepth(lane: number, depth: number): number {
  const bot = LANE_BOT_FRAC[Math.round(lane)] ?? LANE_BOT_FRAC[2];
  const hor = LANE_HOR_FRAC[Math.round(lane)] ?? LANE_HOR_FRAC[2];
  // depth 0=horizon, 1=bottom
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

  // Draw perspective yard lines — scrolling based on fieldScroll
  const _vx = W * VANISH_X_FRAC;
  const TILE_DEPTH_STEP = 0.065; // each yard line is 6.5% of depth apart
  const scroll = (gs.fieldScroll % (SPAWN_WORLD_Z / 8)) / (SPAWN_WORLD_Z / 8);

  ctx.save();
  ctx.strokeStyle = stage.line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;

  for (let i = 0; i < 16; i++) {
    let depth = (i * TILE_DEPTH_STEP + scroll * TILE_DEPTH_STEP) % 1.0;
    if (depth < 0.01) continue;
    const y = hz + (H - hz) * depth;
    // Line width grows with depth
    ctx.lineWidth = depth * 2.5;
    ctx.globalAlpha = 0.15 + depth * 0.3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Lane separator lines (perspective lines from vanishing point)
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  // Draw lane boundaries (6 lines for 5 lanes)
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

  // Checkerboard turf pattern — alternating dark/light strips
  const stripeScroll = (gs.fieldScroll * 1.8) % 1;
  const stripeCount = 20;
  for (let i = 0; i < stripeCount; i++) {
    const depth0 = (i / stripeCount + stripeScroll / stripeCount) % 1.0;
    const depth1 = ((i + 0.5) / stripeCount + stripeScroll / stripeCount) % 1.0;
    if (depth0 > depth1) continue;
    const y0 = hz + (H - hz) * depth0;
    const y1 = hz + (H - hz) * depth1;
    if (i % 2 === 0) continue; // skip alternates for less noise
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, y0, W, y1 - y0);
  }
}

// ── Spin arc effect ───────────────────────────────────────────────────────────
// Sweeping gold arc at waist height — reads as arms cutting through air.
// No Y-axis scale/rotate on the player sprite itself.
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

  // Arc centered at waist/hip height
  const arcCy = py - size * 0.18;
  // 270-degree sweep starting from current spin angle
  const sweep = Math.PI * 1.5;
  const startAngle = gs.spinAngle;

  // Three concentric arcs: thick inner → thin outer (motion blur feel)
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

  // Sparkle dots along the outer arc
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

// ── Player sprite drawing ────────────────────────────────────────────────────
// Uses GIF image when provided; falls back to canvas primitives.
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gs: GameState,
  spriteImg: HTMLImageElement | null,
) {
  const playerDepth = 1.0;
  const lane = gs.fromLane + (gs.targetLane - gs.fromLane) * gs.laneT;
  const px = W * laneFracAtDepth(lane, playerDepth);
  const py = H * PLAYER_Y_FRAC - gs.jumpY * 0.18;

  // Player height scales with depth
  const size = H * 0.14;

  // Spin arc draws behind the player
  if (gs.spinning) {
    drawSpinEffect(ctx, px, py, size, gs);
  }

  ctx.save();

  // Ground shadow
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

  if (spriteImg?.complete && spriteImg.naturalWidth > 0) {
    // Draw user GIF: scale to fit height=size*2, centered on px/py
    const spriteH = size * 2.0;
    const aspect = spriteImg.naturalWidth / spriteImg.naturalHeight;
    const spriteW = spriteH * aspect;
    ctx.drawImage(
      spriteImg,
      px - spriteW * 0.5,
      py - spriteH * 0.8,
      spriteW,
      spriteH,
    );
  } else {
    drawPlayerFallback(ctx, px, py, size, gs);
  }

  ctx.restore();
}

function drawPlayerFallback(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  gs: GameState,
) {
  const t = gs.elapsedTime;

  // Jersey color
  const jerseyColor = gs.shieldActive
    ? "#2060c0"
    : gs.turboActive
      ? "#c03000"
      : "#3FAE5A";

  // Body (torso)
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

  // Helmet
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(px, py - size * 0.6, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  // Facemask
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + size * 0.06, py - size * 0.55, size * 0.1, -0.3, 0.8);
  ctx.stroke();

  // Arm flare: grows then fades over spin (peaks at mid-spin)
  const spinFrac = gs.spinning ? gs.spinTimer / 1.2 : 0;
  const armFlare = gs.spinning
    ? 1.0 + Math.sin(spinFrac * Math.PI) * 0.55
    : 1.0;
  // Leg cross: slight lateral shift to sell the pivot
  const legCross = gs.spinning ? Math.sin(gs.spinAngle) * size * 0.08 : 0;

  // Legs — stride when running, lateral cross when spinning
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

  // Arms — spread wide during spin
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

  // Shoulder pads — widen with arm flare during spin
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

  // Number on jersey
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${size * 0.16}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText(String(gs.jerseyNumber || 32), px, py - size * 0.38);

  // Turbo glow
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

  const laneF = obs.lane + (obs.lane - obs.lane) * 0; // exact lane (no lerp for obstacles)
  const ox = W * laneFracAtDepth(laneF, depth);
  const oy = hz + (H * PLAYER_Y_FRAC - hz) * depth;

  // Size scales with depth
  const size = H * 0.11 * depth;
  if (size < 4) return;

  ctx.save();

  // Break animation — spin and fade
  if (obs.broken) {
    const breakPct = 1 - obs.breakTimer / 0.33;
    ctx.globalAlpha = Math.max(0, 1 - breakPct * 1.4);
    ctx.translate(ox, oy);
    ctx.rotate(breakPct * Math.PI);
    ctx.translate(-ox, -oy);
  }

  if (obs.emojiPowerUp) {
    // Emoji power-up — floating orb
    const bobY = Math.sin(gs.elapsedTime * 4 + obs.id * 1.2) * size * 0.15;
    const orbY = oy + bobY;
    // Glow
    const grd = ctx.createRadialGradient(ox, orbY, 0, ox, orbY, size * 0.7);
    grd.addColorStop(0, `${obs.emojiPowerUp.color}cc`);
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(ox, orbY, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // Emoji text
    ctx.font = `${size * 0.9}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(obs.emojiPowerUp.emoji, ox, orbY);
  } else if (obs.type === "crate") {
    // Crate — wooden box with powerup indicator
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
    // Slat lines
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
    // Nail dots
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
    // Power-up icon on crate
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
    // Defender — humanoid silhouette
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

  // Glow aura
  const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, size * 1.0);
  grd.addColorStop(0, col.glow);
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(ox, oy, size, 0, Math.PI * 2);
  ctx.fill();

  // Scale by defender type
  const scaleX = type === "dt" ? 1.4 : type === "de" ? 0.9 : 1.0;
  const scaleY = type === "dt" ? 0.88 : type === "de" ? 1.15 : 1.0;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scaleX, scaleY);

  // Body
  ctx.fillStyle = col.body;
  ctx.beginPath();
  ctx.roundRect(-size * 0.2, -size * 0.55, size * 0.4, size * 0.38, 4);
  ctx.fill();

  // Helmet
  ctx.fillStyle = col.helmet;
  ctx.beginPath();
  ctx.arc(0, -size * 0.58, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Facemask bars
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

  // Legs — threat approach stride
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

  // Arms out (defensive stance)
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

  // Type label
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
export interface SpriteSet {
  run: HTMLImageElement | null;
  turbo: HTMLImageElement | null;
  spin: HTMLImageElement | null;
}

export default class Renderer2D {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private W = 0;
  private H = 0;
  sprites: SpriteSet = { run: null, turbo: null, spin: null };

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

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Floor + sky
    drawFloor(ctx, W, H, gs);

    // Sort obstacles front-to-back (smaller worldZ = closer = draw last = on top)
    const sorted = [...gs.obstacles].sort((a, b) => b.worldZ - a.worldZ);
    for (const obs of sorted) {
      drawObstacle(ctx, W, H, obs, gs);
    }

    // Player (always on top of obstacles)
    const activeSprite = gs.spinning
      ? (this.sprites.spin ?? this.sprites.run)
      : gs.turboActive
        ? (this.sprites.turbo ?? this.sprites.run)
        : this.sprites.run;
    drawPlayer(ctx, W, H, gs, activeSprite ?? null);

    // HUD overlays
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
