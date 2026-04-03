// Game types and constants
export type CareerStage =
  | "HighSchool"
  | "College"
  | "Pro"
  | "SuperBowl"
  | "HallOfFame";

export interface Skills {
  speed: number;
  power: number;
  agility: number;
  spin: number;
  hurdle: number;
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
}

export interface LeaderboardEntry {
  playerName: string;
  score: number;
  principal: string;
}

export interface PowerUp {
  type: "speed" | "shield" | "extra_down" | "multiplier";
  label: string;
  color: string;
}

export interface Obstacle {
  lane: number;
  y: number;
  type: "defender" | "crate";
  hp: number;
  powerUp?: PowerUp;
  width: number;
  height: number;
  broken?: boolean;
  breakAnim?: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface GameState {
  running: boolean;
  paused: boolean;
  gameOver: boolean;
  score: number;
  yardage: number;
  lane: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpGained: number;
  level: number;
  speed: number;
  baseSpeed: number;
  obstacles: Obstacle[];
  floatingTexts: FloatingText[];
  fieldOffset: number;
  tilePosition: number;
  lastSpawnTile: number;
  playerY: number;
  playerJumping: boolean;
  jumpVelocity: number;
  playerSpinning: boolean;
  spinFrames: number;
  turboActive: boolean;
  turboFrames: number;
  shieldActive: boolean;
  shieldFrames: number;
  multiplier: number;
  multiplierFrames: number;
  activeLegend: string | null;
  careerStage: CareerStage;
  skills: Skills;
  frameCount: number;
  lastObstacleFrame: number;
  obstacleInterval: number;
  targetLane: number;
  laneTransition: number;
  hurtFlash: number;
  // Tutorial system
  tutorialActive: boolean;
  tutorialMessage: string;
  tutorialTimer: number;
  shownTutorialMask: number;
}

export const LANE_COUNT = 5;
export const CANVAS_W = 300;
export const CANVAS_H = 300;
export const PLAYER_BASE_Y = 255;
export const JUMP_HEIGHT = 48;
export const GRAVITY = 0.18;

export const TILE_SIZE = 60;
export const FIELD_LENGTH = 500;
export const BASE_SPEED = 5;

export const LANE_X = [30, 90, 150, 210, 270];
export const PLAYER_LANE_X = [90, 120, 150, 180, 210];
export const LANE_WIDTHS = [40, 50, 60, 50, 40];

export const defaultSkills: Skills = {
  speed: 0,
  power: 0,
  agility: 0,
  spin: 0,
  hurdle: 0,
};

export const defaultProfile: PlayerProfile = {
  xp: 0,
  hp: 100,
  level: 1,
  skillPoints: 0,
  highScore: 0,
  careerStage: "HighSchool",
  unlockedLegends: [],
  skills: defaultSkills,
  displayName: "Player",
};

export const CAREER_STAGES: CareerStage[] = [
  "HighSchool",
  "College",
  "Pro",
  "SuperBowl",
  "HallOfFame",
];

export const CAREER_STAGE_NAMES: Record<CareerStage, string> = {
  HighSchool: "High School",
  College: "College",
  Pro: "Pro",
  SuperBowl: "Super Bowl",
  HallOfFame: "Hall of Fame",
};

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
    description: "Bulldozes defenders, breaks any crate",
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
    description: "Ghost through the line like a freight train",
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
    description: "The Bus never stops. Pure power machine",
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
    description: "The greatest. Speed, grace, unstoppable",
  },
];

export function careerStageMultiplier(stage: CareerStage): number {
  switch (stage) {
    case "HighSchool":
      return 1;
    case "College":
      return 1.5;
    case "Pro":
      return 2;
    case "SuperBowl":
      return 3;
    case "HallOfFame":
      return 5;
  }
}

export function createInitialGameState(profile: PlayerProfile): GameState {
  return {
    running: false,
    paused: false,
    gameOver: false,
    score: 0,
    yardage: 0,
    lane: 2,
    hp: profile.hp,
    maxHp: 100,
    xp: profile.xp,
    xpGained: 0,
    level: profile.level,
    speed: BASE_SPEED + profile.skills.speed * 0.5,
    baseSpeed: BASE_SPEED + profile.skills.speed * 0.5,
    obstacles: [],
    floatingTexts: [],
    fieldOffset: 0,
    tilePosition: 0,
    lastSpawnTile: -10,
    playerY: PLAYER_BASE_Y,
    playerJumping: false,
    jumpVelocity: 0,
    playerSpinning: false,
    spinFrames: 0,
    turboActive: false,
    turboFrames: 0,
    shieldActive: false,
    shieldFrames: 0,
    multiplier: 1,
    multiplierFrames: 0,
    activeLegend: null,
    careerStage: profile.careerStage,
    skills: profile.skills,
    frameCount: 0,
    lastObstacleFrame: 0,
    obstacleInterval: 0,
    targetLane: 2,
    laneTransition: 1,
    hurtFlash: 0,
    tutorialActive: false,
    tutorialMessage: "",
    tutorialTimer: 0,
    shownTutorialMask: 0,
  };
}
