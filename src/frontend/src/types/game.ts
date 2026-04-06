export type CareerStage =
  | "HighSchool"
  | "College"
  | "Pro"
  | "SuperBowl"
  | "HallOfFame";
export type DefenderType = "de" | "dt" | "lb" | "cb" | "s";
export type TileCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type GamePhase = "idle" | "playing" | "paused" | "tackled";
export type SnapPhase = "ready" | "set" | "go" | null;

export interface Skills {
  speed: number;
  power: number;
  agility: number;
  spin: number;
  hurdle: number;
  breakTackle: number;
  vision: number;
  burst: number;
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
  worldZ: number;
  type: "defender" | "crate";
  hp: number;
  defenderType?: DefenderType;
  powerUp?: PowerUp;
  emojiPowerUp?: EmojiPowerUp;
  broken: boolean;
  breakTimer: number;
}

export interface FloatingText {
  id: number;
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
  snapPhase: SnapPhase;
  hitsThisPlay: number;
  fieldZ: number;
  fieldScroll: number;
  speed: number;
  lane: number;
  targetLane: number;
  fromLane: number;
  laneT: number;
  jumpY: number;
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
  hp: number;
  maxHp: number;
  xp: number;
  xpGained: number;
  score: number;
  multiplier: number;
  multiplierTimer: number;
  obstacles: Obstacle[];
  nextId: number;
  mapRow: number;
  nextSpawnZ: number;
  skills: Skills;
  careerStage: CareerStage;
  playerName: string;
  teamName: string;
  jerseyNumber: number;
  activeLegend: string | null;
  playYards: number;
  playXp: number;
  playItems: string[];
  careerYards: number;
  level: number;
  floats: FloatingText[];
  nextFloatId: number;
  elapsedTime: number;
  frame: number;
  tutActive: boolean;
  tutMessage: string;
  tutTimer: number;
  tutMask: number;
  tackleTimer: number;
  currentDown: number;
  yardsNeeded: number;
  yardsToGo: number;
  driveYards: number;
  touchdown: boolean;
}

// ── Canvas dimensions ────────────────────────────────────────────────────────
export const CW = 360;
export const CH = 640;
export const HORIZON_Y = 16;
export const GROUND_Y = CH;
export const PLAYER_Y = CH - 82;
export const VANISH_X = CW / 2;

export const LANE_BOT: readonly number[] = [28, 96, 180, 264, 332];
export const LANE_HOR: readonly number[] = [48, 108, 180, 252, 312];

// ── World physics ────────────────────────────────────────────────────────────
export const SPAWN_Z = 20;
export const COLLISION_Z = 0;
export const BASE_SPEED = 4.5;
export const MAX_SPEED = 8.5;
export const SPEED_RAMP = 0.06;
export const ROW_SPACING = 8;
export const FIRST_ROW_Z = 8;
export const GRAVITY_PX = 600;
export const JUMP_VY = 220;
export const BREAK_DUR = 0.33;

// ── LEVEL-SEGMENTED FIELD MAPS ───────────────────────────────────────────────
export const FIELD_MAP_HS: readonly string[] = [
  "99999",
  "00000",
  "10000",
  "00000",
  "00000",
  "00022",
  "00000",
  "33000",
  "00000",
  "10001",
  "00000",
  "00000",
  "00200",
  "00000",
  "30030",
  "00000",
  "10002",
  "00000",
  "00000",
  "02020",
  "00000",
  "03003",
  "00000",
  "00100",
  "00000",
  "00000",
  "22022",
  "00000",
  "33333",
  "00000",
  "00400",
  "00000",
  "00000",
  "00000",
  "03000",
  "00000",
  "12001",
  "00000",
  "00000",
  "88888",
  "88888",
  "88888",
] as const;

export const FIELD_MAP_COL: readonly string[] = [
  "99999",
  "00000",
  "10101",
  "00000",
  "00000",
  "22000",
  "00000",
  "04030",
  "00000",
  "10001",
  "00000",
  "00000",
  "02100",
  "00010",
  "00000",
  "24042",
  "00000",
  "03001",
  "00000",
  "70007",
  "00000",
  "00000",
  "11110",
  "00000",
  "33033",
  "00000",
  "04440",
  "00000",
  "00000",
  "24200",
  "00000",
  "71017",
  "00000",
  "00000",
  "02220",
  "00000",
  "05050",
  "00000",
  "00000",
  "30303",
  "00000",
  "88888",
  "88888",
  "88888",
] as const;

export const FIELD_MAP_PRO: readonly string[] = [
  "99999",
  "00000",
  "06060",
  "00000",
  "00000",
  "10601",
  "00000",
  "44044",
  "00000",
  "00000",
  "22022",
  "02020",
  "00000",
  "00300",
  "00000",
  "66060",
  "00000",
  "00000",
  "14041",
  "00000",
  "75057",
  "00000",
  "00000",
  "22322",
  "00000",
  "60006",
  "00000",
  "00000",
  "11011",
  "00000",
  "24642",
  "00000",
  "00000",
  "55055",
  "00000",
  "36063",
  "00000",
  "00000",
  "42024",
  "00000",
  "88888",
  "88888",
  "88888",
] as const;

export const FIELD_MAP_SB: readonly string[] = [
  "99999",
  "00000",
  "15051",
  "00000",
  "00000",
  "76067",
  "00000",
  "44044",
  "00000",
  "00000",
  "62026",
  "00000",
  "10310",
  "00000",
  "65056",
  "00000",
  "00000",
  "70707",
  "00000",
  "14141",
  "00000",
  "00000",
  "22222",
  "02020",
  "00000",
  "00030",
  "00000",
  "55555",
  "00000",
  "00000",
  "61016",
  "00000",
  "75757",
  "00000",
  "00000",
  "66666",
  "00000",
  "03030",
  "00000",
  "88888",
  "88888",
  "88888",
] as const;

export const FIELD_MAP_HOF: readonly string[] = [
  "99999",
  "00000",
  "16161",
  "00000",
  "00000",
  "44444",
  "00000",
  "22222",
  "00000",
  "75057",
  "05050",
  "00000",
  "00300",
  "00000",
  "06660",
  "00000",
  "00000",
  "17471",
  "00000",
  "26062",
  "00000",
  "00000",
  "55555",
  "00000",
  "03003",
  "66066",
  "00000",
  "77777",
  "00000",
  "12421",
  "00000",
  "00000",
  "46164",
  "00000",
  "65056",
  "16061",
  "00000",
  "33333",
  "00000",
  "88888",
  "88888",
  "88888",
] as const;

export const FIELD_MAP: readonly string[] = FIELD_MAP_HS;
export const MAP_ROWS = FIELD_MAP_HS.length;

export function getFieldMap(stage: CareerStage): readonly string[] {
  switch (stage) {
    case "HighSchool":
      return FIELD_MAP_HS;
    case "College":
      return FIELD_MAP_COL;
    case "Pro":
      return FIELD_MAP_PRO;
    case "SuperBowl":
      return FIELD_MAP_SB;
    case "HallOfFame":
      return FIELD_MAP_HOF;
  }
}

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
    snapPhase: null,
    hitsThisPlay: 0,
    fieldZ: 0,
    fieldScroll: 0,
    speed: BASE_SPEED + p.skills.speed * 0.3,
    lane: 2,
    targetLane: 2,
    fromLane: 2,
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
    hp: 150,
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
    nextFloatId: 0,
    elapsedTime: 0,
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
    touchdown: false,
  };
}

export const CAREER_STAGE_NAMES = STAGE_NAMES;
export const CAREER_STAGE_XP = STAGE_XP;
export { stageMult as careerStageMultiplier };

export const SKILL_MAX = 15;

export interface LeaderboardEntry {
  playerName: string;
  score: number;
  principal: string;
}
