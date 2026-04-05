/**
 * renderer.ts — Three.js 3D scene manager v21.
 * ISOMETRIC 2D TILE FLOOR: 5 tiles wide, 64-unit tiles in isometric projection.
 * CHARACTER SPRITES: billboard canvas-texture aura wrapping 3D humanoid meshes.
 * DEFENDER SPRITES: type-specific silhouette, color, and shape per position.
 */
import * as THREE from "three";
import {
  BREAK_DUR,
  type CareerStage,
  DEFENDER_STATS,
  type GameState,
  LEGENDARY_PLAYERS,
  SPAWN_Z,
  STAGE_NAMES,
} from "../types/game";

// ── Lane mapping: game lanes 0-4 → world X positions ────────────────────────
const LANE_WORLD_X = [-4, -2, 0, 2, 4] as const;

function laneWorldX(lane: number): number {
  return LANE_WORLD_X[lane] ?? 0;
}

// Map worldZ (0=player, SPAWN_Z=far) to Three.js Z
function worldZToSceneZ(worldZ: number): number {
  return (worldZ / SPAWN_Z) * 24;
}

// ── Sky colors per career stage ──────────────────────────────────────────────
const SKY_COLORS: Record<CareerStage, number> = {
  HighSchool: 0x5ba3dc,
  College: 0x1a0800,
  Pro: 0x02020f,
  SuperBowl: 0x08001a,
  HallOfFame: 0x1a0030,
};

const GROUND_SKY: Record<CareerStage, number> = {
  HighSchool: 0x3a9a2a,
  College: 0x2a7a20,
  Pro: 0x143a18,
  SuperBowl: 0x1a5028,
  HallOfFame: 0x1e4028,
};

// ── Jersey colors per career stage ──────────────────────────────────────────
const DEFENDER_JERSEY: Record<
  CareerStage,
  { body: number; helmet: number; accent: number }
> = {
  HighSchool: { body: 0xf0f0f0, helmet: 0xcccccc, accent: 0x333333 },
  College: { body: 0x1565c0, helmet: 0x0d47a1, accent: 0xffd700 },
  Pro: { body: 0x2d2d2d, helmet: 0x1a1a1a, accent: 0xc0c0c0 },
  SuperBowl: { body: 0x0a0a0a, helmet: 0xb8860b, accent: 0xffd700 },
  HallOfFame: { body: 0x1a1a1a, helmet: 0xdaa520, accent: 0xffd700 },
};

// ── Per-type defender accent colors (on top of stage palette) ─────────────────
const DEFENDER_TYPE_ACCENT: Record<string, number> = {
  dt: 0x8b2222, // deep red — power
  de: 0xe05050, // bright red — speed rush
  lb: 0xc05020, // orange — thumper
  cb: 0x4a90d9, // blue — quick corner
  s: 0x2e7bd6, // deep blue — safety
};

// ── Emoji orb colors ─────────────────────────────────────────────────────────
const EMOJI_COLORS: Record<string, number> = {
  "⚡": 0xffd700,
  "💥": 0xff4500,
  "💢": 0xff6b35,
  "🏈": 0x3fae5a,
  "🔥": 0xff6347,
  "🌟": 0xffd700,
};

// ── ISOMETRIC TILE FLOOR ─────────────────────────────────────────────────────
// The floor is a 5-column grid of 64-unit isometric tiles, rendered in 3D
// world space as a standard top-plane but viewed from the rear camera at an
// angle that gives the isometric illusion. Each tile row scrolls as fieldScroll
// advances. We keep a pool of tile meshes and recycle them.

const TILE_COLS = 5;
const TILE_W = 2.0; // world units per tile width (matches lane spacing)
const TILE_D = 1.5; // world units per tile depth
const TILE_ROWS_VISIBLE = 20; // rows in the pool

interface TileRow {
  meshes: THREE.Mesh[]; // one per column
  baseZ: number;
}

function buildTileMaterial(
  col: number,
  row: number,
  stage: CareerStage,
): THREE.MeshLambertMaterial {
  const isEndzone = row === 0;
  const isHashRow = row % 5 === 0;
  const isCheckerDark = (col + row) % 2 === 0;

  const stageBaseColors: Record<CareerStage, [number, number]> = {
    HighSchool: [0x3a9a2a, 0x2d8020],
    College: [0x2a7a20, 0x1e5e18],
    Pro: [0x143a18, 0x0f2e12],
    SuperBowl: [0x1a5028, 0x123a1c],
    HallOfFame: [0x1e4028, 0x163020],
  };

  const [lightColor, darkColor] = stageBaseColors[stage];
  let color = isCheckerDark ? darkColor : lightColor;
  if (isEndzone) color = 0xb8860b;
  else if (isHashRow) color = isCheckerDark ? 0x2a8060 : 0x3ab070;

  return new THREE.MeshLambertMaterial({ color });
}

function buildIsoTileGeo(): THREE.BufferGeometry {
  // Flat tile with slight bevel for isometric look
  const geo = new THREE.BoxGeometry(TILE_W - 0.04, 0.06, TILE_D - 0.04);
  return geo;
}

// ── Endzone tile texture ─────────────────────────────────────────────────────
function buildEndzoneTileTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#b8860b";
  ctx.fillRect(0, 0, 128, 96);
  ctx.strokeStyle = "rgba(255,215,0,0.9)";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 120, 88);
  ctx.fillStyle = "rgba(255,215,0,0.9)";
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("END", 64, 48);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ── Billboard canvas texture builders ────────────────────────────────────────

/** Build player aura billboard — full-body pixel silhouette */
function buildPlayerAuraTex(
  turbo: boolean,
  shield: boolean,
): THREE.CanvasTexture {
  const W = 128;
  const H = 192;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const glowColor = shield
    ? "rgba(46,123,214,"
    : turbo
      ? "rgba(255,200,0,"
      : "rgba(255,80,30,";
  const alpha = shield ? "0.55)" : turbo ? "0.65)" : "0.35)";

  // Draw a rough humanoid silhouette
  ctx.fillStyle = glowColor + alpha;
  ctx.shadowColor = `${glowColor}0.9)`;
  ctx.shadowBlur = 18;

  // Head
  ctx.beginPath();
  ctx.arc(64, 22, 16, 0, Math.PI * 2);
  ctx.fill();
  // Torso
  ctx.fillRect(38, 36, 52, 60);
  // Arms
  ctx.fillRect(18, 36, 22, 50);
  ctx.fillRect(88, 36, 22, 50);
  // Legs
  ctx.fillRect(38, 96, 22, 72);
  ctx.fillRect(68, 96, 22, 72);

  ctx.shadowBlur = 0;
  return new THREE.CanvasTexture(c);
}

/** Build defender type silhouette billboard */
function buildDefenderAuraTex(
  defType: string,
  _stage: CareerStage,
): THREE.CanvasTexture {
  const W = 128;
  const H = 192;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const typeColor: Record<string, string> = {
    dt: "rgba(180,20,20,",
    de: "rgba(220,60,60,",
    lb: "rgba(200,80,20,",
    cb: "rgba(70,140,220,",
    s: "rgba(40,110,200,",
  };
  const baseAlpha = "0.5)";
  const glowAlpha = "0.85)";
  const col = typeColor[defType] ?? "rgba(200,200,200,";

  ctx.shadowColor = col + glowAlpha;
  ctx.shadowBlur = 14;
  ctx.fillStyle = col + baseAlpha;

  if (defType === "dt") {
    // Wide, squat
    ctx.beginPath();
    ctx.arc(64, 24, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(28, 42, 72, 62);
    ctx.fillRect(8, 42, 20, 44);
    ctx.fillRect(100, 42, 20, 44);
    ctx.fillRect(32, 104, 28, 64);
    ctx.fillRect(68, 104, 28, 64);
  } else if (defType === "de") {
    // Tall, angular
    ctx.beginPath();
    ctx.arc(64, 18, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(40, 32, 48, 68);
    ctx.fillRect(18, 32, 22, 58);
    ctx.fillRect(88, 32, 22, 58);
    ctx.fillRect(40, 100, 22, 80);
    ctx.fillRect(66, 100, 22, 80);
  } else if (defType === "lb") {
    // Medium, hunched forward
    ctx.beginPath();
    ctx.arc(64, 26, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(36, 40, 56, 56);
    ctx.fillRect(14, 44, 24, 46);
    ctx.fillRect(90, 44, 24, 46);
    ctx.fillRect(38, 96, 24, 72);
    ctx.fillRect(66, 96, 24, 72);
    // Hunch: tilt body forward visually
    ctx.fillRect(36, 36, 56, 10);
  } else if (defType === "cb") {
    // Slim, upright
    ctx.beginPath();
    ctx.arc(64, 16, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(44, 28, 40, 64);
    ctx.fillRect(24, 30, 20, 50);
    ctx.fillRect(84, 30, 20, 50);
    ctx.fillRect(44, 92, 20, 82);
    ctx.fillRect(68, 92, 20, 82);
  } else {
    // safety — slim, arms wide
    ctx.beginPath();
    ctx.arc(64, 16, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(44, 28, 40, 60);
    ctx.fillRect(14, 28, 30, 36); // wide arms
    ctx.fillRect(84, 28, 30, 36);
    ctx.fillRect(44, 88, 20, 80);
    ctx.fillRect(68, 88, 20, 80);
  }

  ctx.shadowBlur = 0;
  return new THREE.CanvasTexture(c);
}

// ── Build emoji billboard canvas texture ─────────────────────────────────────
function buildEmojiTex(emoji: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = "48px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 32, 36);
  return new THREE.CanvasTexture(c);
}

// ── Humanoid mesh builder ─────────────────────────────────────────────────────
interface HumanoidParts {
  group: THREE.Group;
  leftUpperLeg: THREE.Mesh;
  rightUpperLeg: THREE.Mesh;
  leftLowerLeg: THREE.Mesh;
  rightLowerLeg: THREE.Mesh;
  leftUpperArm: THREE.Mesh;
  rightUpperArm: THREE.Mesh;
  torso: THREE.Mesh;
  helmet: THREE.Mesh;
  auraBillboard?: THREE.Sprite;
  shieldSphere?: THREE.Mesh;
}

/** Build a face texture for the helmet visor */
function buildHelmetFaceTex(isPlayer: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = isPlayer ? "rgba(255,210,0,0.8)" : "rgba(200,200,200,0.6)";
  ctx.fillRect(0, 0, 64, 32);
  // Eye slots
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.fillRect(10, 8, 16, 10);
  ctx.fillRect(38, 8, 16, 10);
  // Facemask bars
  ctx.strokeStyle = isPlayer ? "rgba(255,180,0,1)" : "rgba(180,180,180,1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(64, 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 28);
  ctx.lineTo(64, 28);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

function buildHumanoid(
  bodyColor: number,
  helmetColor: number,
  accentColor: number,
  jerseyNumber: number | null = null,
  isPlayer = false,
): HumanoidParts {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const helmetMat = new THREE.MeshLambertMaterial({ color: helmetColor });
  const accentMat = new THREE.MeshLambertMaterial({ color: accentColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x222244 });
  const darkPantsMat = new THREE.MeshLambertMaterial({ color: 0x111133 });
  const cleatMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc88050 });

  // ── Head / Helmet ───────────────────────────────────────────────────────
  const helmetGeo = new THREE.SphereGeometry(0.35, 12, 8);
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.set(0, 2.1, 0);
  group.add(helmet);

  // Helmet face texture plane
  const faceTex = buildHelmetFaceTex(isPlayer);
  const facePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.25),
    new THREE.MeshLambertMaterial({ map: faceTex, transparent: true }),
  );
  facePlane.position.set(0, 2.05, 0.32);
  group.add(facePlane);

  // Facemask bar (accent)
  const visorGeo = new THREE.BoxGeometry(0.55, 0.1, 0.06);
  const visor = new THREE.Mesh(visorGeo, accentMat);
  visor.position.set(0, 1.88, 0.32);
  group.add(visor);

  // ── Torso / Jersey ─────────────────────────────────────────────────────
  const torsoGeo = new THREE.BoxGeometry(0.82, 1.05, 0.45);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.set(0, 1.25, 0);
  group.add(torso);

  // Jersey number
  if (jerseyNumber !== null) {
    const numC = document.createElement("canvas");
    numC.width = 64;
    numC.height = 64;
    const numCtx = numC.getContext("2d")!;
    numCtx.fillStyle = `#${accentColor.toString(16).padStart(6, "0")}`;
    numCtx.font = "bold 40px monospace";
    numCtx.textAlign = "center";
    numCtx.textBaseline = "middle";
    numCtx.fillText(String(jerseyNumber), 32, 34);
    const numTex = new THREE.CanvasTexture(numC);
    const numMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshLambertMaterial({ map: numTex, transparent: true }),
    );
    numMesh.position.set(0, 1.22, 0.23);
    group.add(numMesh);
  }

  // Shoulder pads — wider, more prominent
  for (const sx of [-0.56, 0.56]) {
    const padGeo = new THREE.BoxGeometry(0.32, 0.24, 0.55);
    const pad = new THREE.Mesh(padGeo, accentMat);
    pad.position.set(sx, 1.78, 0);
    group.add(pad);
    // Pad edge highlight
    const edgeGeo = new THREE.BoxGeometry(0.32, 0.04, 0.55);
    const edge = new THREE.Mesh(
      edgeGeo,
      new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
      }),
    );
    edge.position.set(sx, 1.9, 0);
    group.add(edge);
  }

  // ── Upper arms ─────────────────────────────────────────────────────────
  const uArmGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.52, 8);
  const leftUpperArm = new THREE.Mesh(uArmGeo, bodyMat);
  leftUpperArm.position.set(-0.62, 1.55, 0);
  leftUpperArm.rotation.z = 0.3;
  group.add(leftUpperArm);

  const rightUpperArm = new THREE.Mesh(uArmGeo, bodyMat);
  rightUpperArm.position.set(0.62, 1.55, 0);
  rightUpperArm.rotation.z = -0.3;
  group.add(rightUpperArm);

  // ── Forearms ───────────────────────────────────────────────────────────
  const foreArmGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.46, 8);
  const leftForeArm = new THREE.Mesh(foreArmGeo, skinMat);
  leftForeArm.position.set(-0.72, 1.2, 0);
  leftForeArm.rotation.z = 0.5;
  group.add(leftForeArm);

  const rightForeArm = new THREE.Mesh(foreArmGeo, skinMat);
  rightForeArm.position.set(0.72, 1.2, 0);
  rightForeArm.rotation.z = -0.5;
  group.add(rightForeArm);

  // Football prop in right hand (player only)
  if (isPlayer) {
    const fbGeo = new THREE.SphereGeometry(0.18, 8, 6);
    fbGeo.scale(1, 0.7, 0.55); // oblate football shape
    const fbMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const fb = new THREE.Mesh(fbGeo, fbMat);
    fb.position.set(0.82, 1.1, 0.1);
    fb.rotation.z = -0.8;
    group.add(fb);
    // Football seam
    const seamMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.7,
      transparent: true,
    });
    const seamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.12, 0),
      new THREE.Vector3(0, 0.12, 0),
    ]);
    const seam = new THREE.LineSegments(seamGeo, seamMat);
    seam.position.copy(fb.position);
    group.add(seam);
  }

  // ── Hips / Waist ────────────────────────────────────────────────────────
  const hipGeo = new THREE.BoxGeometry(0.7, 0.28, 0.4);
  const hip = new THREE.Mesh(hipGeo, pantsMat);
  hip.position.set(0, 0.68, 0);
  group.add(hip);

  // ── Upper legs ─────────────────────────────────────────────────────────
  const uLegGeo = new THREE.CylinderGeometry(0.21, 0.19, 0.58, 8);
  const leftUpperLeg = new THREE.Mesh(uLegGeo, pantsMat);
  leftUpperLeg.position.set(-0.22, 0.42, 0);
  group.add(leftUpperLeg);

  const rightUpperLeg = new THREE.Mesh(uLegGeo, pantsMat);
  rightUpperLeg.position.set(0.22, 0.42, 0);
  group.add(rightUpperLeg);

  // ── Lower legs ─────────────────────────────────────────────────────────
  const lLegGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.52, 8);
  const leftLowerLeg = new THREE.Mesh(lLegGeo, darkPantsMat);
  leftLowerLeg.position.set(-0.22, 0.12, 0);
  group.add(leftLowerLeg);

  const rightLowerLeg = new THREE.Mesh(lLegGeo, darkPantsMat);
  rightLowerLeg.position.set(0.22, 0.12, 0);
  group.add(rightLowerLeg);

  // ── Feet / Cleats ───────────────────────────────────────────────────────
  const cleatGeo = new THREE.BoxGeometry(0.26, 0.15, 0.46);
  const leftCleat = new THREE.Mesh(cleatGeo, cleatMat);
  leftCleat.position.set(-0.22, -0.14, 0.08);
  group.add(leftCleat);

  const rightCleat = new THREE.Mesh(cleatGeo, cleatMat);
  rightCleat.position.set(0.22, -0.14, 0.08);
  group.add(rightCleat);

  // Ground shadow ellipse
  const shadowGeo = new THREE.CircleGeometry(0.55, 16);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -0.18, 0);
  group.add(shadow);

  return {
    group,
    leftUpperLeg,
    rightUpperLeg,
    leftLowerLeg,
    rightLowerLeg,
    leftUpperArm,
    rightUpperArm,
    torso,
    helmet,
  };
}

// ── TYPES ────────────────────────────────────────────────────────────────────
interface PlayerMesh extends HumanoidParts {
  shieldMesh?: THREE.Mesh;
  turboLight?: THREE.PointLight;
  auraSprite?: THREE.Sprite;
  auraTex?: THREE.CanvasTexture;
  lastTurbo?: boolean;
  lastShield?: boolean;
}

interface ObsMeshEntry {
  group: THREE.Group;
  type: "defender" | "crate" | "emoji";
  parts?: HumanoidParts;
  auraSprite?: THREE.Sprite;
}

// ── ThreeRenderer ────────────────────────────────────────────────────────────
export default class ThreeRenderer {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private grassTexture!: THREE.CanvasTexture;
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private playerMesh!: PlayerMesh;
  private cameraPivotX = 0;
  private obsMeshes: Map<number, ObsMeshEntry> = new Map();
  private floatSprites: Map<string, THREE.Sprite> = new Map();
  private prevStage: CareerStage = "HighSchool";
  private emojiTexCache: Map<string, THREE.CanvasTexture> = new Map();

  // Isometric tile pool
  private tileRows: TileRow[] = [];
  private tileGeo!: THREE.BufferGeometry;
  private tileScrollOffset = 0;
  private currentStage: CareerStage = "HighSchool";

  // Endzone overlay
  private endzoneGroup!: THREE.Group;

  init(container: HTMLDivElement, w: number, h: number): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLORS.HighSchool);
    this.scene.fog = new THREE.Fog(SKY_COLORS.HighSchool, 30, 80);

    // Camera: rear-view, above and behind player, angled for isometric feel
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 120);
    this.camera.position.set(0, 7, -11);
    this.camera.lookAt(0, 1, 8);

    // ── Lighting ──────────────────────────────────────────────────────────
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
    this.dirLight.position.set(5, 12, -5);
    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x2a7a20, 0.65);
    this.scene.add(this.hemiLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    // ── Build isometric tile floor ─────────────────────────────────────────
    this.tileGeo = buildIsoTileGeo();
    this._buildTilePool();

    // ── Lane lines ─────────────────────────────────────────────────────────
    for (let i = 0; i <= TILE_COLS; i++) {
      const laneGeo = new THREE.PlaneGeometry(0.05, 60);
      const laneMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        opacity: 0.4,
        transparent: true,
      });
      const laneMesh = new THREE.Mesh(laneGeo, laneMat);
      laneMesh.rotation.x = -Math.PI / 2;
      const lx = -5 + i * 2;
      laneMesh.position.set(lx, 0.05, 22);
      this.scene.add(laneMesh);
    }

    // ── Endzone group ──────────────────────────────────────────────────────
    this.endzoneGroup = new THREE.Group();
    const ezTex = buildEndzoneTileTex();
    for (let col = 0; col < TILE_COLS; col++) {
      const geo = buildIsoTileGeo();
      const mat = new THREE.MeshLambertMaterial({
        map: ezTex,
        color: 0xb8860b,
        emissive: 0x221100,
      });
      const m = new THREE.Mesh(geo, mat);
      const cx = -4 + col * TILE_W;
      m.position.set(cx, 0.01, 46);
      this.endzoneGroup.add(m);
    }
    this.scene.add(this.endzoneGroup);

    // ── Stands ────────────────────────────────────────────────────────────
    const standMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    for (const side of [-11, 11] as const) {
      const standGeo = new THREE.BoxGeometry(1.5, 3, 60);
      const stand = new THREE.Mesh(standGeo, standMat);
      stand.position.set(side, 1.5, 22);
      this.scene.add(stand);
    }

    // ── Player humanoid ───────────────────────────────────────────────────
    const parts = buildHumanoid(0xe83030, 0xc02020, 0xffd700, 32, true);
    this.playerMesh = parts as PlayerMesh;
    this.playerMesh.group.position.set(0, 0, 0);
    this.scene.add(this.playerMesh.group);

    // Player aura billboard
    this._rebuildPlayerAura(false, false);

    this.cameraPivotX = 0;
  }

  private _buildTilePool(): void {
    for (let row = 0; row < TILE_ROWS_VISIBLE; row++) {
      const rowMeshes: THREE.Mesh[] = [];
      for (let col = 0; col < TILE_COLS; col++) {
        const mat = buildTileMaterial(col, row, this.currentStage);
        const m = new THREE.Mesh(this.tileGeo, mat);
        const cx = -4 + col * TILE_W;
        const rz = row * TILE_D;
        m.position.set(cx, 0, rz);
        this.scene.add(m);
        rowMeshes.push(m);
      }
      this.tileRows.push({ meshes: rowMeshes, baseZ: row * TILE_D });
    }
  }

  private _rebuildPlayerAura(turbo: boolean, shield: boolean): void {
    const pm = this.playerMesh;
    // Remove old
    if (pm.auraSprite) {
      pm.group.remove(pm.auraSprite);
      (pm.auraSprite.material as THREE.SpriteMaterial).map?.dispose();
      (pm.auraSprite.material as THREE.SpriteMaterial).dispose();
    }
    if (!turbo && !shield) {
      pm.auraSprite = undefined;
      return;
    }
    const tex = buildPlayerAuraTex(turbo, shield);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 3.6, 1);
    sprite.position.set(0, 1.3, 0);
    pm.group.add(sprite);
    pm.auraSprite = sprite;
    pm.auraTex = tex;
  }

  update(gs: GameState, dt: number): void {
    if (!this.renderer) return;

    // ── Sky / Stage change ─────────────────────────────────────────────────
    if (gs.careerStage !== this.prevStage) {
      this.prevStage = gs.careerStage;
      this.currentStage = gs.careerStage;
      this.scene.background = new THREE.Color(SKY_COLORS[gs.careerStage]);
      (this.scene.fog as THREE.Fog).color = new THREE.Color(
        SKY_COLORS[gs.careerStage],
      );
      this.hemiLight.groundColor = new THREE.Color(GROUND_SKY[gs.careerStage]);
      // Rebuild tile materials for new stage
      for (let row = 0; row < TILE_ROWS_VISIBLE; row++) {
        const tr = this.tileRows[row];
        if (!tr) continue;
        for (let col = 0; col < TILE_COLS; col++) {
          const m = tr.meshes[col];
          (m.material as THREE.MeshLambertMaterial).color.set(
            buildTileMaterial(col, row, gs.careerStage).color,
          );
        }
      }
    }

    // ── Scroll isometric tile floor ────────────────────────────────────────
    this.tileScrollOffset =
      (gs.fieldScroll * TILE_D * TILE_ROWS_VISIBLE * 1.2) %
      (TILE_ROWS_VISIBLE * TILE_D);
    const totalDepth = TILE_ROWS_VISIBLE * TILE_D;
    for (let row = 0; row < TILE_ROWS_VISIBLE; row++) {
      const tr = this.tileRows[row];
      if (!tr) continue;
      // Compute scrolled Z
      let rz = (tr.baseZ - this.tileScrollOffset + totalDepth) % totalDepth;
      for (const m of tr.meshes) {
        m.position.z = rz;
        m.visible = rz > -2 && rz < 52;
      }
    }

    // ── Player position + animation ────────────────────────────────────────
    const targetX = this._playerWorldX(gs);
    this.cameraPivotX += (targetX - this.cameraPivotX) * Math.min(1, 8 * dt);

    const pm = this.playerMesh;

    // Legend color sync
    if (gs.activeLegend) {
      const lp = LEGENDARY_PLAYERS.find((l) => l.id === gs.activeLegend);
      if (lp) {
        (pm.torso.material as THREE.MeshLambertMaterial).color.set(lp.color);
        (pm.helmet.material as THREE.MeshLambertMaterial).color.set(
          lp.secondaryColor,
        );
      }
    }

    pm.group.position.x = this.cameraPivotX;

    // Jump
    if (gs.jumping) {
      pm.group.position.y = Math.max(0, (gs.jumpY / 220) * 3);
    } else {
      pm.group.position.y = 0;
    }

    // Tackle lean
    if (gs.phase === "tackled") {
      const elapsed = 1.8 - gs.tackleTimer;
      pm.group.rotation.x = Math.min(Math.PI * 0.4, elapsed * 0.8);
      pm.group.position.y = Math.max(-0.5, -0.5 * Math.min(1, elapsed / 1.8));
    } else {
      pm.group.rotation.x = 0;
    }

    // Spin
    if (gs.spinning) {
      pm.group.rotation.y = gs.spinAngle;
    } else {
      pm.group.rotation.y = 0;
    }

    // Leg stride animation
    if (gs.phase === "playing") {
      const stride = Math.sin(gs.frame * 0.18);
      pm.leftUpperLeg.rotation.x = stride * 0.65;
      pm.rightUpperLeg.rotation.x = -stride * 0.65;
      pm.leftLowerLeg.rotation.x = Math.max(0, stride * 0.4);
      pm.rightLowerLeg.rotation.x = Math.max(0, -stride * 0.4);
      pm.leftUpperArm.rotation.x = -stride * 0.4;
      pm.rightUpperArm.rotation.x = stride * 0.4;
    } else {
      pm.leftUpperLeg.rotation.x = 0;
      pm.rightUpperLeg.rotation.x = 0;
      pm.leftLowerLeg.rotation.x = 0;
      pm.rightLowerLeg.rotation.x = 0;
    }

    // Aura billboard — rebuild only when state changes
    const needAura = gs.turboActive || gs.shieldActive;
    const lastTurbo = pm.lastTurbo ?? false;
    const lastShield = pm.lastShield ?? false;
    if (gs.turboActive !== lastTurbo || gs.shieldActive !== lastShield) {
      pm.lastTurbo = gs.turboActive;
      pm.lastShield = gs.shieldActive;
      this._rebuildPlayerAura(gs.turboActive, gs.shieldActive);
    }
    if (pm.auraSprite && needAura) {
      // Pulse the aura opacity
      (pm.auraSprite.material as THREE.SpriteMaterial).opacity =
        0.55 + 0.35 * Math.sin(gs.frame * 0.14);
    }

    // Shield wireframe sphere
    if (gs.shieldActive) {
      if (!pm.shieldMesh) {
        const sg = new THREE.SphereGeometry(1.4, 12, 8);
        pm.shieldMesh = new THREE.Mesh(
          sg,
          new THREE.MeshLambertMaterial({
            color: 0x2e7bd6,
            wireframe: true,
            transparent: true,
            opacity: 0.35,
          }),
        );
        pm.shieldMesh.position.set(0, 1.2, 0);
        pm.group.add(pm.shieldMesh);
      }
    } else if (pm.shieldMesh) {
      pm.group.remove(pm.shieldMesh);
      pm.shieldMesh.geometry.dispose();
      (pm.shieldMesh.material as THREE.MeshLambertMaterial).dispose();
      pm.shieldMesh = undefined;
    }

    // Turbo glow light
    if (gs.turboActive) {
      if (!pm.turboLight) {
        pm.turboLight = new THREE.PointLight(0xffd700, 2.5, 6);
        pm.turboLight.position.set(0, 1, 0);
        pm.group.add(pm.turboLight);
      }
    } else if (pm.turboLight) {
      pm.group.remove(pm.turboLight);
      pm.turboLight = undefined;
    }

    // ── Camera smooth follow ───────────────────────────────────────────────
    this.camera.position.x +=
      (this.cameraPivotX - this.camera.position.x) * Math.min(1, 6 * dt);
    this.camera.position.y = 7;
    this.camera.position.z = -11;
    this.camera.lookAt(this.cameraPivotX, 1, 8);

    // ── Obstacle meshes ────────────────────────────────────────────────────
    const currentIds = new Set(gs.obstacles.map((o) => o.id));

    for (const [id, entry] of this.obsMeshes) {
      if (!currentIds.has(id)) {
        this.scene.remove(entry.group);
        this._disposeGroup(entry.group);
        this.obsMeshes.delete(id);
      }
    }

    for (const obs of gs.obstacles) {
      if (obs.worldZ > SPAWN_Z + 2 || obs.worldZ < -2) continue;

      const ox = laneWorldX(obs.lane);
      const oz = worldZToSceneZ(obs.worldZ);

      if (!this.obsMeshes.has(obs.id)) {
        let entry: ObsMeshEntry;
        if (obs.emojiPowerUp) {
          entry = this._buildEmojiOrb(obs.emojiPowerUp.emoji);
        } else if (obs.type === "crate") {
          entry = this._buildCrateMesh(!!obs.powerUp, gs.careerStage);
        } else {
          entry = this._buildDefenderMesh(
            obs.defenderType ?? "de",
            gs.careerStage,
          );
        }
        this.obsMeshes.set(obs.id, entry);
        this.scene.add(entry.group);
      }

      const entry = this.obsMeshes.get(obs.id)!;

      if (obs.broken && obs.breakTimer > 0) {
        const frac = obs.breakTimer / BREAK_DUR;
        entry.group.scale.setScalar(frac * 0.8);
        for (const child of entry.group.children) {
          if (child instanceof THREE.Mesh) {
            (child.material as THREE.MeshLambertMaterial).opacity = frac;
            (child.material as THREE.MeshLambertMaterial).transparent = true;
          }
        }
      } else if (!obs.broken) {
        entry.group.scale.setScalar(1);
      }

      entry.group.position.set(ox, obs.type === "crate" ? 0.4 : 0, oz);

      // Defender leg stride + face camera
      if (entry.parts && gs.phase === "playing") {
        const offset = obs.id * 1.3;
        const defStride = Math.sin(gs.frame * 0.15 + offset);
        entry.parts.leftUpperLeg.rotation.x = defStride * 0.5;
        entry.parts.rightUpperLeg.rotation.x = -defStride * 0.5;
      }

      // Emoji bob
      if (entry.type === "emoji") {
        entry.group.position.y = 0.5 + Math.sin(gs.frame * 0.08) * 0.2;
      }

      // Aura billboard always faces camera for defenders
      if (entry.auraSprite) {
        entry.auraSprite.material.opacity =
          0.4 + 0.15 * Math.sin(gs.frame * 0.1 + obs.id);
      }
    }

    // ── Floating text sprites ──────────────────────────────────────────────
    const activeFloatKeys = new Set(gs.floats.map((_, i) => `ft_${i}`));
    for (const [key, sprite] of this.floatSprites) {
      if (!activeFloatKeys.has(key)) {
        this.scene.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        (sprite.material as THREE.SpriteMaterial).dispose();
        this.floatSprites.delete(key);
      }
    }

    gs.floats.forEach((ft, i) => {
      const key = `ft_${i}`;
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 2);
      if (!this.floatSprites.has(key)) {
        const sprite = this._buildFloatSprite(ft.text, ft.color);
        this.floatSprites.set(key, sprite);
        this.scene.add(sprite);
      }
      const sprite = this.floatSprites.get(key)!;
      sprite.position.set(
        this.cameraPivotX,
        2.5 + (1 - ft.life / ft.maxLife) * 2,
        1.5,
      );
      (sprite.material as THREE.SpriteMaterial).opacity = alpha;
    });

    // ── Endzone pulse ──────────────────────────────────────────────────────
    if (gs.touchdown) {
      const pulse = 0.7 + 0.3 * Math.sin(gs.frame * 0.15);
      for (const child of this.endzoneGroup.children) {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshLambertMaterial).emissiveIntensity =
            pulse;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number): void {
    if (!this.renderer) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (!this.renderer) return;
    for (const entry of this.obsMeshes.values())
      this._disposeGroup(entry.group);
    this.obsMeshes.clear();
    for (const sprite of this.floatSprites.values()) {
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.floatSprites.clear();
    for (const tex of this.emojiTexCache.values()) tex.dispose();
    this.emojiTexCache.clear();
    this.tileGeo.dispose();
    this.grassTexture?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _playerWorldX(gs: GameState): number {
    const fromX = laneWorldX(gs.lane);
    const toX = laneWorldX(gs.targetLane);
    return fromX + (toX - fromX) * gs.laneT;
  }

  private _buildDefenderMesh(
    defType: string,
    stage: CareerStage,
  ): ObsMeshEntry {
    const c = DEFENDER_JERSEY[stage];
    // Override body accent with per-type color for readability
    const typeAccent = DEFENDER_TYPE_ACCENT[defType] ?? c.accent;
    const parts = buildHumanoid(c.body, c.helmet, typeAccent, null, false);
    const group = parts.group;

    // Scale by defender type for distinct silhouettes
    if (defType === "dt") {
      group.scale.set(1.45, 0.88, 1.45); // wide and squat
    } else if (defType === "lb") {
      group.scale.set(1.15, 1.08, 1.15); // medium hunk
    } else if (defType === "de") {
      group.scale.set(0.95, 1.2, 0.95); // tall angular rusher
    } else if (defType === "cb") {
      group.scale.set(0.88, 1.22, 0.88); // slim fast corner
    } else if (defType === "s") {
      group.scale.set(0.9, 1.18, 0.9); // slim safety
    }

    // Defender aura billboard
    const auraTex = buildDefenderAuraTex(defType, stage);
    const auraMat = new THREE.SpriteMaterial({
      map: auraTex,
      transparent: true,
      depthWrite: false,
    });
    const auraSprite = new THREE.Sprite(auraMat);
    auraSprite.scale.set(2.0, 3.0, 1);
    auraSprite.position.set(0, 1.2, 0);
    group.add(auraSprite);

    // Defender label sprite above head
    const label =
      DEFENDER_STATS[defType as keyof typeof DEFENDER_STATS]?.label ?? "DEF";
    const labelSprite = this._buildFloatSprite(
      label,
      `#${typeAccent.toString(16).padStart(6, "0")}`,
    );
    labelSprite.scale.set(1.2, 0.5, 1);
    labelSprite.position.set(0, 3.2, 0);
    group.add(labelSprite);

    return { group, type: "defender", parts, auraSprite };
  }

  private _buildCrateMesh(
    hasPowerUp: boolean,
    stage: CareerStage,
  ): ObsMeshEntry {
    const group = new THREE.Group();

    // Slightly taller/wider crates for isometric visibility
    const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);

    const stageColors: Record<CareerStage, number> = {
      HighSchool: 0x8b4513,
      College: 0x9b2020,
      Pro: 0x2d2d2d,
      SuperBowl: 0xb8860b,
      HallOfFame: 0xdaa520,
    };
    const matColor = stageColors[stage];
    const mat = new THREE.MeshLambertMaterial({
      color: matColor,
      emissive: hasPowerUp ? 0x331100 : 0x000000,
    });
    const crate = new THREE.Mesh(geo, mat);
    group.add(crate);

    // Thick edge lines
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      opacity: 0.6,
      transparent: true,
    });
    group.add(new THREE.LineSegments(edgesGeo, edgesMat));

    // X cross on front face
    const crossMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      opacity: 0.45,
      transparent: true,
    });
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.45, -0.45, 0.46, 0.45, 0.45, 0.46, 0.45, -0.45, 0.46, -0.45, 0.45,
          0.46,
        ],
        3,
      ),
    );
    crossGeo.setIndex([0, 1, 2, 3]);
    group.add(new THREE.LineSegments(crossGeo, crossMat));

    if (hasPowerUp) {
      const glowLight = new THREE.PointLight(0xffd700, 1.8, 3.5);
      group.add(glowLight);
      // Glowing orb on top
      const orbGeo = new THREE.SphereGeometry(0.18, 8, 6);
      const orbMat = new THREE.MeshLambertMaterial({
        color: 0xffd700,
        emissive: 0xffd700,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.85,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(0, 0.62, 0);
      group.add(orb);
    }

    return { group, type: "crate" };
  }

  private _buildEmojiOrb(emoji: string): ObsMeshEntry {
    const group = new THREE.Group();
    const color = EMOJI_COLORS[emoji] ?? 0xffd700;

    const geo = new THREE.SphereGeometry(0.44, 12, 8);
    const mat = new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.88,
    });
    group.add(new THREE.Mesh(geo, mat));

    if (!this.emojiTexCache.has(emoji)) {
      this.emojiTexCache.set(emoji, buildEmojiTex(emoji));
    }
    const spriteMat = new THREE.SpriteMaterial({
      map: this.emojiTexCache.get(emoji),
      transparent: true,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.1, 1.1, 1);
    group.add(sprite);
    group.add(new THREE.PointLight(color, 1.8, 4));

    return { group, type: "emoji" };
  }

  private _buildFloatSprite(text: string, color: string): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(text, 129, 33);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 0.75, 1);
    return sprite;
  }

  private _disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) m.dispose();
        } else {
          obj.material.dispose();
        }
      } else if (obj instanceof THREE.Sprite) {
        const sm = obj.material as THREE.SpriteMaterial;
        sm.map?.dispose();
        sm.dispose();
      }
    });
  }
}

// Keep backward-compat named exports
export { laneWorldX };
export type { HumanoidParts };
