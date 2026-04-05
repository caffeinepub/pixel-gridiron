export type CareerStage =
  | "HighSchool"
  | "College"
  | "Pro"
  | "SuperBowl"
  | "HallOfFame";
export type DefenderType = "de" | "dt" | "lb" | "cb" | "s";
export type TileCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type GamePhase = "idle" | "playing" | "paused" | "tackled";

export interface Skills {
  speed: number;
  power: number;
  agility: number;
  spin: number;
  hurdle: number;
  // Extended skills — unlocked as career progresses
  breakTackle: number; // bonus tackle-break chance
  vision: number; // slows obstacle approach speed
  burst: number; // explosive first-step acceleration
}

export interface PlayerProfile {
  xp: number;
  hp: number;
  level: number;
  skillPoints: number;
  highScore: number;
  careerStage: CareerStage;
  unlockedLegends: string[];
  skills: Skills;
  displayName: string;
  teamName: string;
  jerseyNumber: number;
}

export interface PowerUp {
  type: "speed" | "shield" | "extra_down" | "multiplier";
  label: string;
  color: string;
}

export interface EmojiPowerUp {
  emoji: string;
  effectType: "speed" | "shield" | "rage" | "extraDown" | "turbo" | "star";
  label: string;
  color: string;
}

export interface Obstacle {
  id: number;
  lane: number;
  worldZ: number; // distance ahead of player. SPAWN_Z → 0 = collision
  type: "defender" | "crate";
  hp: number;
  defenderType?: DefenderType;
  powerUp?: PowerUp;
  emojiPowerUp?: EmojiPowerUp;
  broken: boolean;
  breakTimer: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface PlayResult {
  yards: number;
  xpGained: number;
  items: string[];
  leveledUp: boolean;
  newLevel: number;
  touchdown: boolean;
}

export interface GameState {
  phase: GamePhase;
  // Field
  fieldZ: number; // yards run this play
  fieldScroll: number; // 0..1 drives ground animation
  speed: number; // yards/sec
  // Player
  lane: number; // current display lane (0-4)
  targetLane: number;
  laneT: number; // 0..1 lane shift progress
  jumpY: number; // pixels above ground
  jumpVY: number;
  jumping: boolean;
  spinning: boolean;
  spinTimer: number;
  spinAngle: number;
  turboActive: boolean;
  turboTimer: number;
  shieldActive: boolean;
  shieldTimer: number;
  hurtFlash: number;
  // Stats
  hp: number;
  maxHp: number;
  xp: number;
  xpGained: number;
  score: number;
  multiplier: number;
  multiplierTimer: number;
  // Obstacles
  obstacles: Obstacle[];
  nextId: number;
  // Map
  mapRow: number;
  nextSpawnZ: number;
  // RPG
  skills: Skills;
  careerStage: CareerStage;
  playerName: string;
  teamName: string;
  jerseyNumber: number;
  activeLegend: string | null;
  // Per-play
  playYards: number;
  playXp: number;
  playItems: string[];
  careerYards: number;
  level: number;
  // Visuals
  floats: FloatingText[];
  frame: number; // raw frame counter
  // Tutorial
  tutActive: boolean;
  tutMessage: string;
  tutTimer: number;
  tutMask: number;
  // Tackle anim
  tackleTimer: number;
  // Down system (1-4)
  currentDown: number;
  yardsNeeded: number;
  yardsToGo: number;
  driveYards: number; // yards gained since last first down / start of drive
}

// ── Canvas ────────────────────────────────────────────────────────────────────
export const CW = 360;
export const CH = 640;
export const HORIZON_Y = 168;
export const GROUND_Y = CH;
export const PLAYER_Y = CH - 82; // player feet screen Y
export const VANISH_X = CW / 2;

// Lane centers at screen bottom (wide) and at horizon (narrow)
export const LANE_BOT: readonly number[] = [28, 96, 180, 264, 332];
export const LANE_HOR: readonly number[] = [161, 170, 180, 190, 199];

// ── World physics ─────────────────────────────────────────────────────────────
export const SPAWN_Z = 10; // obstacles spawn 10 yards ahead — visible within ~2s
export const COLLISION_Z = 1.6; // yards — collision fires here
export const BASE_SPEED = 5.0; // yards/sec — snappy feel from snap
export const MAX_SPEED = 9.0;
export const SPEED_RAMP = 0.08; // yards/sec per second
export const ROW_SPACING = 8; // yards between tile rows — tight waves
export const FIRST_ROW_Z = 3; // first obstacle spawns almost immediately
export const GRAVITY_PX = 600; // px/sec² for jump
export const JUMP_VY = 220; // px/sec initial jump velocity
export const BREAK_DUR = 0.33; // seconds for break particle animation

// ── Tile map ──────────────────────────────────────────────────────────────────
// 0=open 1=DE 2=crate 3=powerup 4=LB 5=safety 6=DT 7=corner 8=endzone 9=startline
export const FIELD_MAP: readonly string[] = [
  "00000",
  "10101", // DE rush — two gaps to dodge through
  "00000",
  "06060", // DT gap — huge DTs, go middle or edges
  "00000",
  "20200", // crates — smash for loot
  "02020",
  "00000",
  "30032", // powerups + crate
  "00223",
  "00600", // lone DT in center
  "02604",
  "00000",
  "70007", // corners wide — flanks only
  "78870", // corners + safeties spread
  "03200",
  "00000",
  "02000",
  "02220", // crate alley
  "10001", // DE flanks — middle is open
  "00000",
  "33333", // full powerup row — grab them!
  "00000",
  "44040", // linebackers
  "00000",
  "16161", // mixed defenders
  "00000",
  "20202", // crate wall
  "00000",
  "88888", // endzone
] as const;

export const MAP_ROWS = FIELD_MAP.length;

export const DEFENDER_STATS: Record<
  DefenderType,
  { hp: number; xpReward: number; label: string; color: string }
> = {
  de: { hp: 1, xpReward: 20, label: "DE", color: "#E05050" },
  dt: { hp: 3, xpReward: 50, label: "DT", color: "#8B2222" },
  lb: { hp: 2, xpReward: 30, label: "LB", color: "#C05020" },
  cb: { hp: 1, xpReward: 15, label: "CB", color: "#4A90D9" },
  s: { hp: 1, xpReward: 15, label: "S", color: "#2E7BD6" },
};

export const TILE_DEF_TYPE: Partial<Record<TileCode, DefenderType>> = {
  1: "de",
  4: "lb",
  5: "s",
  6: "dt",
  7: "cb",
};

export const EMOJI_POWERUPS: EmojiPowerUp[] = [
  { emoji: "⚡", effectType: "speed", label: "SPEED!", color: "#FFD700" },
  { emoji: "💥", effectType: "rage", label: "RAGE!", color: "#FF4500" },
  { emoji: "💢", effectType: "rage", label: "POWER!", color: "#FF6B35" },
  { emoji: "🏈", effectType: "extraDown", label: "+HP!", color: "#3FAE5A" },
  { emoji: "🔥", effectType: "turbo", label: "TURBO!", color: "#FF6347" },
  { emoji: "🌟", effectType: "star", label: "STAR!", color: "#FFD700" },
];

export const LEGENDARY_PLAYERS = [
  {
    id: "fridge",
    nickname: "The Fridge",
    number: 72,
    role: "Power Back",
    xpCost: 500,
    boost: { power: 2, speed: 1 },
    color: "#4A90D9",
    secondaryColor: "#1C4C8A",
    description: "Bulldozes defenders",
  },
  {
    id: "night_train",
    nickname: "Night Train",
    number: 81,
    role: "Speedster",
    xpCost: 500,
    boost: { agility: 2, speed: 1 },
    color: "#2D2D2D",
    secondaryColor: "#1A1A1A",
    description: "Ghost through the line",
  },
  {
    id: "a_train",
    nickname: "A-Train",
    number: 36,
    role: "The Bus",
    xpCost: 600,
    boost: { power: 3 },
    color: "#1C3A6B",
    secondaryColor: "#FFD700",
    description: "Pure power machine",
  },
  {
    id: "sweetness",
    nickname: "Sweetness",
    number: 34,
    role: "All-Around",
    xpCost: 700,
    boost: { speed: 2, agility: 1, spin: 1 },
    color: "#1B5E20",
    secondaryColor: "#E65100",
    description: "Speed, grace, unstoppable",
  },
];

export const CAREER_STAGES: CareerStage[] = [
  "HighSchool",
  "College",
  "Pro",
  "SuperBowl",
  "HallOfFame",
];
export const STAGE_NAMES: Record<CareerStage, string> = {
  HighSchool: "High School",
  College: "College",
  Pro: "Pro",
  SuperBowl: "Super Bowl",
  HallOfFame: "Hall of Fame",
};

export const STAGE_XP: Record<CareerStage, number> = {
  HighSchool: 0,
  College: 300,
  Pro: 800,
  SuperBowl: 2000,
  HallOfFame: 5000,
};

export function stageMult(stage: CareerStage): number {
  return {
    HighSchool: 1,
    College: 1.3,
    Pro: 1.7,
    SuperBowl: 2.2,
    HallOfFame: 3,
  }[stage];
}

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1);
}

export function xpForNextLevel(level: number): number {
  return level * level * 50;
}

// Alias for backwards compatibility
export const xpForLevel = xpForNextLevel;

export const defaultProfile: PlayerProfile = {
  xp: 0,
  hp: 150,
  level: 1,
  skillPoints: 3,
  highScore: 0,
  careerStage: "HighSchool",
  unlockedLegends: [],
  skills: {
    speed: 0,
    power: 0,
    agility: 0,
    spin: 0,
    hurdle: 0,
    breakTackle: 0,
    vision: 0,
    burst: 0,
  },
  displayName: "",
  teamName: "",
  jerseyNumber: 32,
};

export function createGameState(p: PlayerProfile): GameState {
  return {
    phase: "idle",
    fieldZ: 0,
    fieldScroll: 0,
    speed: BASE_SPEED + p.skills.speed * 0.3,
    lane: 2,
    targetLane: 2,
    laneT: 1,
    jumpY: 0,
    jumpVY: 0,
    jumping: false,
    spinning: false,
    spinTimer: 0,
    spinAngle: 0,
    turboActive: false,
    turboTimer: 0,
    shieldActive: false,
    shieldTimer: 0,
    hurtFlash: 0,
    hp: 150, // starts at 150 — survivable hits
    maxHp: 150,
    xp: p.xp,
    xpGained: 0,
    score: 0,
    multiplier: 1,
    multiplierTimer: 0,
    obstacles: [],
    nextId: 0,
    mapRow: 0,
    nextSpawnZ: FIRST_ROW_Z,
    skills: { ...p.skills },
    careerStage: p.careerStage,
    playerName: p.displayName,
    teamName: p.teamName,
    jerseyNumber: p.jerseyNumber,
    activeLegend: null,
    playYards: 0,
    playXp: 0,
    playItems: [],
    careerYards: 0,
    level: p.level,
    floats: [],
    frame: 0,
    tutActive: true,
    tutMessage: "Pick a lane! Dodge defenders, smash crates, grab power-ups.",
    tutTimer: 4,
    tutMask: 0,
    tackleTimer: 0,
    currentDown: 1,
    yardsNeeded: 10,
    yardsToGo: 10,
    driveYards: 0,
  };
}

// Backwards-compat aliases
export const CAREER_STAGE_NAMES = STAGE_NAMES;
export const CAREER_STAGE_XP = STAGE_XP;
export { stageMult as careerStageMultiplier };

export const SKILL_MAX = 15;

export interface LeaderboardEntry {
  playerName: string;
  score: number;
  principal: string;
}
