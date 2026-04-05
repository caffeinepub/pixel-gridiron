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
  fieldZ: number;
  fieldScroll: number;
  speed: number;
  lane: number;
  targetLane: number;
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

// ── Canvas ──────────────────────────────────────────────────────────────────
export const CW = 360;
export const CH = 640;
export const HORIZON_Y = 152;
export const GROUND_Y = CH;
export const PLAYER_Y = CH - 82;
export const VANISH_X = CW / 2;

export const LANE_BOT: readonly number[] = [28, 96, 180, 264, 332];
export const LANE_HOR: readonly number[] = [60, 110, 180, 250, 300];

// ── World physics ───────────────────────────────────────────────────────────────
export const SPAWN_Z = 12;
export const COLLISION_Z = 1.6;
export const BASE_SPEED = 4.5;
export const MAX_SPEED = 8.5;
export const SPEED_RAMP = 0.06;
export const ROW_SPACING = 6;
export const FIRST_ROW_Z = 4;
export const GRAVITY_PX = 600;
export const JUMP_VY = 220;
export const BREAK_DUR = 0.33;

// ── LEVEL-SEGMENTED FIELD MAPS ───────────────────────────────────────────────────
// Tile codes:
//   0=open  1=DE  2=crate  3=powerup  4=LB  5=safety  6=DT  7=corner  8=endzone  9=start
// Each map ends with 3 rows of "88888" (endzone trigger).
// Formations are designed for the stage difficulty:
//   HighSchool  — wide gaps, single defenders, lots of powerups
//   College     — staggered DE/LB, crate alleys, moderate powerups
//   Pro         — tight formations, DT walls, few powerups
//   SuperBowl   — blitz packages, safeties + corners, rare powerups
//   HallOfFame  — near-wall formations, force spin/hurdle, max difficulty

// ——— HIGH SCHOOL: Simple spread, always one clean lane, generous powerups ———
export const FIELD_MAP_HS: readonly string[] = [
  "99999", // scrimmage
  "00000",
  // P1: single DE left
  "10000",
  "00000",
  "00000",
  // P2: crate right two
  "00022",
  "00000",
  // P3: powerup grab
  "33000",
  "00000",
  // P4: DE flanks, open middle
  "10001",
  "00000",
  "00000",
  // P5: single crate center
  "00200",
  "00000",
  // P6: powerup row
  "30030",
  "00000",
  // P7: DE left, crate right
  "10002",
  "00000",
  "00000",
  // P8: two crates spread
  "02020",
  "00000",
  // P9: bonus powerups
  "03003",
  "00000",
  // P10: DE center only
  "00100",
  "00000",
  "00000",
  // P11: crate wall with gap
  "22022",
  "00000",
  // P12: full powerup shower
  "33333",
  "00000",
  // P13: LB solo
  "00400",
  "00000",
  "00000",
  // P14: open field bonus
  "00000",
  "03000",
  "00000",
  // P15: DE + crate mixed
  "12001",
  "00000",
  "00000",
  // ENDZONE
  "88888",
  "88888",
  "88888",
] as const;

// ——— COLLEGE: Staggered DE/LB, crate alleys, moderate powerups ———
export const FIELD_MAP_COL: readonly string[] = [
  "99999",
  "00000",
  // P1: DE spread
  "10101",
  "00000",
  "00000",
  // P2: crate alley left
  "22000",
  "00000",
  // P3: LB + powerup
  "04030",
  "00000",
  // P4: DE double rush flanks
  "10001",
  "00000",
  "00000",
  // P5: crate + DE stagger
  "02100",
  "00010",
  "00000",
  // P6: LB center + crates
  "24042",
  "00000",
  // P7: powerup + DE
  "03001",
  "00000",
  // P8: corner flanks
  "70007",
  "00000",
  "00000",
  // P9: DE wall gap right
  "11110",
  "00000",
  // P10: powerup shower
  "33033",
  "00000",
  // P11: LB wall gap left
  "04440",
  "00000",
  "00000",
  // P12: crate + LB
  "24200",
  "00000",
  // P13: DE + corner combo
  "71017",
  "00000",
  "00000",
  // P14: crate bonus
  "02220",
  "00000",
  // P15: safety blitz
  "05050",
  "00000",
  "00000",
  // P16: powerup lane
  "30303",
  "00000",
  // ENDZONE
  "88888",
  "88888",
  "88888",
] as const;

// ——— PRO: Tight formations, DT walls, crate fields, few powerups ———
export const FIELD_MAP_PRO: readonly string[] = [
  "99999",
  "00000",
  // P1: DT center
  "06060",
  "00000",
  "00000",
  // P2: DE flanks + DT
  "10601",
  "00000",
  // P3: LB blitz
  "44044",
  "00000",
  "00000",
  // P4: crate field
  "22022",
  "02020",
  "00000",
  // P5: rare powerup
  "00300",
  "00000",
  // P6: DT wall gap right
  "66060",
  "00000",
  "00000",
  // P7: DE + LB combo
  "14041",
  "00000",
  // P8: corner + safety net
  "75057",
  "00000",
  "00000",
  // P9: crate alley + powerup
  "22322",
  "00000",
  // P10: DT double
  "60006",
  "00000",
  "00000",
  // P11: full DE rush
  "11011",
  "00000",
  // P12: mixed crunch
  "24642",
  "00000",
  "00000",
  // P13: safety net
  "55055",
  "00000",
  // P14: powerup + DT
  "36063",
  "00000",
  "00000",
  // P15: LB + crate wall
  "42024",
  "00000",
  // ENDZONE
  "88888",
  "88888",
  "88888",
] as const;

// ——— SUPER BOWL: Blitz packages, safety + corner combos, rare powerups ———
export const FIELD_MAP_SB: readonly string[] = [
  "99999",
  "00000",
  // P1: safety + DE blitz
  "15051",
  "00000",
  "00000",
  // P2: corner + DT
  "76067",
  "00000",
  // P3: LB wall center gap
  "44044",
  "00000",
  "00000",
  // P4: crate + blitz
  "62026",
  "00000",
  // P5: rare powerup + DE
  "10310",
  "00000",
  // P6: DT + safety wall
  "65056",
  "00000",
  "00000",
  // P7: corner blitz wide
  "70707",
  "00000",
  // P8: LB + DE combined
  "14141",
  "00000",
  "00000",
  // P9: crate field dense
  "22222",
  "02020",
  "00000",
  // P10: single powerup rare
  "00030",
  "00000",
  // P11: safety net wide
  "55555",
  "00000",
  "00000",
  // P12: DT walls + DE rush
  "61016",
  "00000",
  // P13: corner + safety net
  "75757",
  "00000",
  "00000",
  // P14: DT blitz
  "66666",
  "00000",
  // P15: powerup just before endzone
  "03030",
  "00000",
  // ENDZONE
  "88888",
  "88888",
  "88888",
] as const;

// ——— HALL OF FAME: Near-wall formations, forced spin/hurdle, hardest ———
export const FIELD_MAP_HOF: readonly string[] = [
  "99999",
  "00000",
  // P1: DT + DE full blitz
  "16161",
  "00000",
  "00000",
  // P2: LB wall no gap (must spin)
  "44444",
  "00000",
  // P3: crate wall (must hurdle)
  "22222",
  "00000",
  // P4: safety corner double
  "75057",
  "05050",
  "00000",
  // P5: rare star powerup
  "00300",
  "00000",
  // P6: DT wall gap left
  "06660",
  "00000",
  "00000",
  // P7: DE + LB + corner
  "17471",
  "00000",
  // P8: crate + DT
  "26062",
  "00000",
  "00000",
  // P9: all safeties
  "55555",
  "00000",
  // P10: powerup then DT
  "03003",
  "66066",
  "00000",
  // P11: corner net
  "77777",
  "00000",
  // P12: DE + crate + LB
  "12421",
  "00000",
  "00000",
  // P13: mixed wall no gap
  "46164",
  "00000",
  // P14: DT + safety final push
  "65056",
  "16061",
  "00000",
  // P15: last powerup
  "33333",
  "00000",
  // ENDZONE
  "88888",
  "88888",
  "88888",
] as const;

// Default field map (High School) — used by spawner when stage isn't resolved
export const FIELD_MAP: readonly string[] = FIELD_MAP_HS;
export const MAP_ROWS = FIELD_MAP_HS.length;

// Stage → field map selector
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
