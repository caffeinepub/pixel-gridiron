/**
 * renderer.ts — Three.js 3D scene manager.
 * Replaces the Canvas 2D PPU pipeline with a real 3D scene:
 *   - PerspectiveCamera behind & above player (3rd person rear view)
 *   - Humanoid player mesh with stride animation
 *   - Humanoid defender meshes (proportions vary by type)
 *   - Crate BoxGeometry + EdgesGeometry
 *   - Emoji power-up spheres with billboard sprites
 *   - Scrolling grass texture for movement illusion
 *   - HTML overlays handle HUD / screens (not drawn here)
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

// Map worldZ (0=player, SPAWN_Z=far) to Three.js Z (0=player, 24=far)
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

// ── Emoji orb colors ─────────────────────────────────────────────────────────
const EMOJI_COLORS: Record<string, number> = {
  "⚡": 0xffd700,
  "💥": 0xff4500,
  "💢": 0xff6b35,
  "🏈": 0x3fae5a,
  "🔥": 0xff6347,
  "🌟": 0xffd700,
};

// ── Build scrolling grass texture ────────────────────────────────────────────
function buildGrassTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  // Dark green base
  ctx.fillStyle = "#2a7a20";
  ctx.fillRect(0, 0, size, size);

  // Alternating lighter turf strips
  for (let i = 0; i < 10; i++) {
    const y = (i / 10) * size;
    const h = size / 20;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(0, y, size, h);
  }

  // Yard hash marks (horizontal white lines every ~50px)
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  for (let y = 0; y < size; y += 51) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 8);
  return tex;
}

// ── Build endzone texture ─────────────────────────────────────────────────────
function buildEndzoneTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#b8860b";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255,215,0,0.9)";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("END ZONE", 128, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
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
  shieldSphere?: THREE.Mesh;
}

function buildHumanoid(
  bodyColor: number,
  helmetColor: number,
  accentColor: number,
  jerseyNumber: number | null = null,
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

  // Facemask visor
  const visorGeo = new THREE.BoxGeometry(0.55, 0.12, 0.08);
  const visor = new THREE.Mesh(
    visorGeo,
    new THREE.MeshLambertMaterial({ color: accentColor }),
  );
  visor.position.set(0, 1.92, 0.3);
  group.add(visor);

  // ── Torso / Jersey ─────────────────────────────────────────────────────
  const torsoGeo = new THREE.BoxGeometry(0.82, 1.05, 0.45);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.position.set(0, 1.25, 0);
  group.add(torso);

  // Jersey number texture
  if (jerseyNumber !== null) {
    const numC = document.createElement("canvas");
    numC.width = 64;
    numC.height = 64;
    const numCtx = numC.getContext("2d")!;
    numCtx.fillStyle = `#${accentColor.toString(16).padStart(6, "0")}`;
    numCtx.font = "bold 36px monospace";
    numCtx.textAlign = "center";
    numCtx.textBaseline = "middle";
    numCtx.fillText(String(jerseyNumber), 32, 32);
    const numTex = new THREE.CanvasTexture(numC);
    const numGeo = new THREE.PlaneGeometry(0.4, 0.4);
    const numMesh = new THREE.Mesh(
      numGeo,
      new THREE.MeshLambertMaterial({ map: numTex, transparent: true }),
    );
    numMesh.position.set(0, 1.2, 0.23);
    group.add(numMesh);
  }

  // Shoulder pads (accent)
  for (const sx of [-0.55, 0.55]) {
    const padGeo = new THREE.BoxGeometry(0.28, 0.2, 0.5);
    const pad = new THREE.Mesh(padGeo, accentMat);
    pad.position.set(sx, 1.75, 0);
    group.add(pad);
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

  // Group pivot at feet (y=0)
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
}

interface ObsMeshEntry {
  group: THREE.Group;
  type: "defender" | "crate" | "emoji";
  parts?: HumanoidParts;
}

// ── ThreeRenderer ────────────────────────────────────────────────────────────
export default class ThreeRenderer {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private grassTexture!: THREE.CanvasTexture;
  private fieldMesh!: THREE.Mesh;
  private endzoneMesh!: THREE.Mesh;
  private endzoneMat!: THREE.MeshLambertMaterial;
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private playerMesh!: PlayerMesh;
  private cameraPivotX = 0;
  private obsMeshes: Map<number, ObsMeshEntry> = new Map();
  private floatSprites: Map<string, THREE.Sprite> = new Map();
  private prevStage: CareerStage = "HighSchool";
  private emojiTexCache: Map<string, THREE.CanvasTexture> = new Map();

  init(container: HTMLDivElement, w: number, h: number): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLORS.HighSchool);

    // Camera: PerspectiveCamera, positioned behind/above player
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    this.camera.position.set(0, 6, -10);
    this.camera.lookAt(0, 1, 8);

    // ── Lighting ──────────────────────────────────────────────────────────
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(5, 12, -5);
    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x2a7a20, 0.6);
    this.scene.add(this.hemiLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    // ── Field plane ───────────────────────────────────────────────────────
    this.grassTexture = buildGrassTexture();
    const fieldGeo = new THREE.PlaneGeometry(20, 60);
    const fieldMat = new THREE.MeshLambertMaterial({
      map: this.grassTexture,
      color: 0x3a9a2a,
    });
    this.fieldMesh = new THREE.Mesh(fieldGeo, fieldMat);
    this.fieldMesh.rotation.x = -Math.PI / 2;
    this.fieldMesh.position.set(0, -0.01, 20);
    this.scene.add(this.fieldMesh);

    // ── Lane lines ─────────────────────────────────────────────────────────
    for (let i = 0; i <= 5; i++) {
      const laneGeo = new THREE.PlaneGeometry(0.06, 60);
      const laneMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        opacity: 0.55,
        transparent: true,
      });
      const laneMesh = new THREE.Mesh(laneGeo, laneMat);
      laneMesh.rotation.x = -Math.PI / 2;
      const lx = -5 + i * 2;
      laneMesh.position.set(lx, 0, 20);
      this.scene.add(laneMesh);
    }

    // ── Endzone ────────────────────────────────────────────────────────────
    const ezTex = buildEndzoneTexture();
    const ezGeo = new THREE.PlaneGeometry(20, 8);
    this.endzoneMat = new THREE.MeshLambertMaterial({
      map: ezTex,
      color: 0xb8860b,
      opacity: 0.85,
      transparent: true,
    });
    this.endzoneMesh = new THREE.Mesh(ezGeo, this.endzoneMat);
    this.endzoneMesh.rotation.x = -Math.PI / 2;
    this.endzoneMesh.position.set(0, 0.02, 48);
    this.scene.add(this.endzoneMesh);

    // ── Stands (simple bleachers silhouette) ──────────────────────────────
    const standMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    for (const side of [-11, 11] as const) {
      const standGeo = new THREE.BoxGeometry(1.5, 3, 60);
      const stand = new THREE.Mesh(standGeo, standMat);
      stand.position.set(side, 1.5, 20);
      this.scene.add(stand);
    }

    // ── Player humanoid ───────────────────────────────────────────────────
    const parts = buildHumanoid(0xe83030, 0xc02020, 0xffd700, 32);
    this.playerMesh = parts as PlayerMesh;
    this.playerMesh.group.position.set(0, 0, 0);
    this.scene.add(this.playerMesh.group);

    this.cameraPivotX = 0;
  }

  update(gs: GameState, dt: number): void {
    if (!this.renderer) return;

    // ── Sky / Stage change ─────────────────────────────────────────────────
    if (gs.careerStage !== this.prevStage) {
      this.prevStage = gs.careerStage;
      this.scene.background = new THREE.Color(SKY_COLORS[gs.careerStage]);
      this.hemiLight.groundColor = new THREE.Color(GROUND_SKY[gs.careerStage]);
      // Update field color
      const fm = this.fieldMesh.material as THREE.MeshLambertMaterial;
      fm.color = new THREE.Color(GROUND_SKY[gs.careerStage]);
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

    // Position
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

    // Shield effect
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

    // Turbo glow
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
    this.camera.position.y = 6;
    this.camera.position.z = -10;
    this.camera.lookAt(this.cameraPivotX, 1, 8);

    // ── Field texture scroll ───────────────────────────────────────────────
    this.grassTexture.offset.y = (gs.fieldScroll * 8) % 1;

    // ── Obstacle meshes ────────────────────────────────────────────────────
    const currentIds = new Set(gs.obstacles.map((o) => o.id));

    // Remove stale meshes
    for (const [id, entry] of this.obsMeshes) {
      if (!currentIds.has(id)) {
        this.scene.remove(entry.group);
        this._disposeGroup(entry.group);
        this.obsMeshes.delete(id);
      }
    }

    // Add / update obstacle meshes
    for (const obs of gs.obstacles) {
      if (obs.worldZ > SPAWN_Z + 2 || obs.worldZ < -2) continue;

      const ox = laneWorldX(obs.lane);
      const oz = worldZToSceneZ(obs.worldZ);

      if (!this.obsMeshes.has(obs.id)) {
        // Create new mesh
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
        // Break animation: scale down, fade out
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

      // Update position
      entry.group.position.set(ox, obs.type === "crate" ? 0.4 : 0, oz);

      // Defender leg stride
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
    }

    // ── Floating text sprites ──────────────────────────────────────────────
    // Remove expired floats
    const activeFloatKeys = new Set(gs.floats.map((_, i) => `ft_${i}`));
    for (const [key, sprite] of this.floatSprites) {
      if (!activeFloatKeys.has(key)) {
        this.scene.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        (sprite.material as THREE.SpriteMaterial).dispose();
        this.floatSprites.delete(key);
      }
    }

    // Add/update float text
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
      this.endzoneMat.opacity = pulse;
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
    // Dispose all obstacle meshes
    for (const entry of this.obsMeshes.values()) {
      this._disposeGroup(entry.group);
    }
    this.obsMeshes.clear();
    // Dispose float sprites
    for (const sprite of this.floatSprites.values()) {
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.floatSprites.clear();
    // Dispose emoji textures
    for (const tex of this.emojiTexCache.values()) tex.dispose();
    this.emojiTexCache.clear();
    // Dispose scene
    this.grassTexture.dispose();
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
    const parts = buildHumanoid(c.body, c.helmet, c.accent, null);
    const group = parts.group;

    // Scale by defender type
    if (defType === "dt") group.scale.set(1.4, 0.9, 1.4);
    else if (defType === "lb") group.scale.set(1.1, 1.1, 1.1);
    else if (defType === "de") group.scale.set(1.0, 1.15, 1.0);
    else if (defType === "cb" || defType === "s")
      group.scale.set(0.9, 1.2, 0.9);

    // Defender label sprite above head
    const label =
      DEFENDER_STATS[defType as keyof typeof DEFENDER_STATS]?.label ?? "DEF";
    const labelSprite = this._buildFloatSprite(label, "#ffffff");
    labelSprite.scale.set(1.2, 0.5, 1);
    labelSprite.position.set(0, 3.2, 0);
    group.add(labelSprite);

    return { group, type: "defender", parts };
  }

  private _buildCrateMesh(
    hasPowerUp: boolean,
    stage: CareerStage,
  ): ObsMeshEntry {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.82, 0.82, 0.82);

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
      emissive: hasPowerUp ? 0x221100 : 0x000000,
    });
    const crate = new THREE.Mesh(geo, mat);
    group.add(crate);

    // Edge lines
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      opacity: 0.5,
      transparent: true,
    });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    group.add(edges);

    // Cross lines on front face
    const crossMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      opacity: 0.4,
      transparent: true,
    });
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.41, -0.41, 0.42, 0.41, 0.41, 0.42, 0.41, -0.41, 0.42, -0.41, 0.41,
          0.42,
        ],
        3,
      ),
    );
    crossGeo.setIndex([0, 1, 2, 3]);
    const cross = new THREE.LineSegments(crossGeo, crossMat);
    group.add(cross);

    // Gold power-up glow
    if (hasPowerUp) {
      const glowLight = new THREE.PointLight(0xffd700, 1.5, 3);
      glowLight.position.set(0, 0, 0);
      group.add(glowLight);
    }

    return { group, type: "crate" };
  }

  private _buildEmojiOrb(emoji: string): ObsMeshEntry {
    const group = new THREE.Group();
    const color = EMOJI_COLORS[emoji] ?? 0xffd700;

    const geo = new THREE.SphereGeometry(0.42, 12, 8);
    const mat = new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
    });
    const orb = new THREE.Mesh(geo, mat);
    group.add(orb);

    // Emoji billboard sprite
    if (!this.emojiTexCache.has(emoji)) {
      this.emojiTexCache.set(emoji, buildEmojiTex(emoji));
    }
    const spriteMat = new THREE.SpriteMaterial({
      map: this.emojiTexCache.get(emoji),
      transparent: true,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.1, 1.1, 1);
    sprite.position.set(0, 0, 0);
    group.add(sprite);

    // Point light
    const light = new THREE.PointLight(color, 1.8, 4);
    group.add(light);

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

// Keep backward-compat named export used by old renderer
export { laneWorldX };
export type { HumanoidParts };
