/**
 * Mega Man X-style 6×6 dot-grid password system.
 *
 * Grid layout: 36 cells = 36 bits, read left-to-right, top-to-bottom.
 * Each filled dot = bit 1, empty dot = bit 0.
 *
 * Bit layout (36 total):
 *  [0-4]   level        (0–31, clamped)
 *  [5-7]   careerStage  (0–4)
 *  [8-11]  skillPoints  (0–15, clamped)
 *  [12-15] skill.speed  (0–10, 4 bits)
 *  [16-19] skill.power  (0–10, 4 bits)
 *  [20-23] skill.agility(0–10, 4 bits)
 *  [24-27] skill.spin   (0–10, 4 bits)
 *  [28-31] skill.hurdle (0–10, 4 bits)
 *  [32-34] highScoreTier(0–7, score/1000 clamped, 3 bits)
 *  [35]    parity       (XOR of all previous bits)
 */

import { useState } from "react";
import type { CareerStage, PlayerProfile } from "../types/game";
import { CAREER_STAGES, defaultProfile } from "../types/game";

// ─── Encode ───────────────────────────────────────────────────────────────────

export function encodePassword(profile: PlayerProfile): boolean[] {
  const bits: boolean[] = new Array(36).fill(false);

  function writeBits(value: number, startBit: number, numBits: number) {
    const clamped = Math.max(
      0,
      Math.min((1 << numBits) - 1, Math.floor(value)),
    );
    for (let i = 0; i < numBits; i++) {
      bits[startBit + i] = ((clamped >> (numBits - 1 - i)) & 1) === 1;
    }
  }

  const stageIdx = CAREER_STAGES.indexOf(profile.careerStage);

  writeBits(profile.level, 0, 5); // bits 0–4
  writeBits(stageIdx < 0 ? 0 : stageIdx, 5, 3); // bits 5–7
  writeBits(profile.skillPoints, 8, 4); // bits 8–11
  writeBits(profile.skills.speed, 12, 4); // bits 12–15
  writeBits(profile.skills.power, 16, 4); // bits 16–19
  writeBits(profile.skills.agility, 20, 4); // bits 20–23
  writeBits(profile.skills.spin, 24, 4); // bits 24–27
  writeBits(profile.skills.hurdle, 28, 4); // bits 28–31
  writeBits(Math.floor(profile.highScore / 1000), 32, 3); // bits 32–34

  // Parity bit 35: XOR of all previous bits
  const parity = bits.slice(0, 35).reduce((acc, b) => acc ^ (b ? 1 : 0), 0);
  bits[35] = parity === 1;

  return bits;
}

// ─── Decode ───────────────────────────────────────────────────────────────────

export function decodePassword(bits: boolean[]): {
  profile: PlayerProfile;
  valid: boolean;
} {
  if (bits.length !== 36) return { profile: defaultProfile, valid: false };

  function readBits(startBit: number, numBits: number): number {
    let val = 0;
    for (let i = 0; i < numBits; i++) {
      if (bits[startBit + i]) val |= 1 << (numBits - 1 - i);
    }
    return val;
  }

  // Verify parity
  const expectedParity = bits
    .slice(0, 35)
    .reduce((acc, b) => acc ^ (b ? 1 : 0), 0);
  const actualParity = bits[35] ? 1 : 0;
  const valid = expectedParity === actualParity;

  const level = Math.max(1, readBits(0, 5));
  const stageIdx = Math.min(CAREER_STAGES.length - 1, readBits(5, 3));
  const skillPts = readBits(8, 4);
  const speed = readBits(12, 4);
  const power = readBits(16, 4);
  const agility = readBits(20, 4);
  const spin = readBits(24, 4);
  const hurdle = readBits(28, 4);
  const scoreTier = readBits(32, 3);

  const profile: PlayerProfile = {
    ...defaultProfile,
    level,
    xp: (level - 1) * (level - 1) * 50, // approximate XP from level
    careerStage: CAREER_STAGES[stageIdx] as CareerStage,
    skillPoints: skillPts,
    skills: {
      speed,
      power,
      agility,
      spin,
      hurdle,
      breakTackle: 0,
      vision: 0,
      burst: 0,
    },
    highScore: scoreTier * 1000,
  };

  return { profile, valid };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  profile: PlayerProfile;
  onLoad: (profile: PlayerProfile) => void;
}

const GRID = 6; // 6×6
const CELL = 36; // px per cell

const DOT_COLORS = [
  "#E63946", // red
  "#F4A261", // orange
  "#2A9D8F", // teal
  "#E9C46A", // yellow
  "#457B9D", // blue
  "#A8DADC", // light blue
];

function dotColor(row: number, col: number): string {
  return DOT_COLORS[(row + col * 2) % DOT_COLORS.length];
}

export function PasswordSave({ profile, onLoad }: Props) {
  const savedBits = encodePassword(profile);

  // Input grid state (for entering a password)
  const [inputBits, setInputBits] = useState<boolean[]>(
    new Array(36).fill(false),
  );
  const [tab, setTab] = useState<"save" | "load">("save");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadSuccess, setLoadSuccess] = useState(false);

  const toggleInputCell = (idx: number) => {
    setInputBits((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
    setLoadError(null);
    setLoadSuccess(false);
  };

  const handleLoad = () => {
    const { profile: loaded, valid } = decodePassword(inputBits);
    if (!valid) {
      setLoadError("Invalid password — check your dots and try again.");
      setLoadSuccess(false);
      return;
    }
    setLoadError(null);
    setLoadSuccess(true);
    onLoad(loaded);
  };

  const handleClear = () => {
    setInputBits(new Array(36).fill(false));
    setLoadError(null);
    setLoadSuccess(false);
  };

  return (
    <div
      style={{
        padding: "20px 16px",
        fontFamily: "monospace",
        maxWidth: 380,
        margin: "0 auto",
        color: "#E7E7E7",
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#3FAE5A",
            letterSpacing: "0.12em",
            marginBottom: 4,
          }}
        >
          PASSWORD
        </div>
        <div
          style={{ fontSize: 10, color: "#4A545D", letterSpacing: "0.08em" }}
        >
          FILL IN DOTS TO SAVE OR RESTORE YOUR CAREER
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 20,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {(["save", "load"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setLoadError(null);
              setLoadSuccess(false);
            }}
            style={{
              flex: 1,
              padding: "10px 0",
              background:
                tab === t ? "rgba(63,174,90,0.18)" : "rgba(255,255,255,0.03)",
              border: "none",
              color: tab === t ? "#3FAE5A" : "#6A7480",
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.1em",
              cursor: "pointer",
              borderBottom:
                tab === t ? "2px solid #3FAE5A" : "2px solid transparent",
            }}
          >
            {t === "save" ? "SAVE" : "LOAD"}
          </button>
        ))}
      </div>

      {tab === "save" && <SaveTab bits={savedBits} profile={profile} />}

      {tab === "load" && (
        <LoadTab
          bits={inputBits}
          onToggle={toggleInputCell}
          onLoad={handleLoad}
          onClear={handleClear}
          error={loadError}
          success={loadSuccess}
        />
      )}
    </div>
  );
}

// ─── Save Tab ─────────────────────────────────────────────────────────────────

function SaveTab({
  bits,
  profile,
}: {
  bits: boolean[];
  profile: PlayerProfile;
}) {
  return (
    <div>
      <div
        style={{
          background: "rgba(10,12,15,0.9)",
          border: "2px solid rgba(63,174,90,0.3)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#4A545D",
            letterSpacing: "0.1em",
            marginBottom: 14,
            textAlign: "center",
          }}
        >
          YOUR CURRENT PASSWORD
        </div>
        <PasswordGrid bits={bits} interactive={false} onToggle={() => {}} />
      </div>

      {/* Profile summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <StatBox label="LEVEL" value={`${profile.level}`} color="#FFD700" />
        <StatBox
          label="STAGE"
          value={profile.careerStage
            .replace(/([A-Z])/g, " $1")
            .trim()
            .split(" ")[0]
            .toUpperCase()}
          color="#3FAE5A"
        />
        <StatBox label="SP" value={`${profile.skillPoints}`} color="#2E7BD6" />
      </div>

      <div
        style={{
          fontSize: 9,
          color: "#4A545D",
          textAlign: "center",
          letterSpacing: "0.06em",
          lineHeight: 1.6,
        }}
      >
        Write down or screenshot these dots.
        <br />
        Enter them on the LOAD screen to restore your career.
      </div>
    </div>
  );
}

// ─── Load Tab ─────────────────────────────────────────────────────────────────

function LoadTab({
  bits,
  onToggle,
  onLoad,
  onClear,
  error,
  success,
}: {
  bits: boolean[];
  onToggle: (idx: number) => void;
  onLoad: () => void;
  onClear: () => void;
  error: string | null;
  success: boolean;
}) {
  const { profile: preview } = decodePassword(bits);
  const anyFilled = bits.some(Boolean);

  return (
    <div>
      <div
        style={{
          background: "rgba(10,12,15,0.9)",
          border: `2px solid ${
            error
              ? "rgba(198,58,58,0.5)"
              : success
                ? "rgba(63,174,90,0.5)"
                : "rgba(255,255,255,0.08)"
          }`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#4A545D",
            letterSpacing: "0.1em",
            marginBottom: 14,
            textAlign: "center",
          }}
        >
          TAP DOTS TO ENTER PASSWORD
        </div>
        <PasswordGrid bits={bits} interactive={true} onToggle={onToggle} />
      </div>

      {error && (
        <div
          style={{
            color: "#C63A3A",
            fontSize: 10,
            textAlign: "center",
            marginBottom: 12,
            letterSpacing: "0.06em",
          }}
        >
          ✗ {error}
        </div>
      )}

      {success && (
        <div
          style={{
            color: "#3FAE5A",
            fontSize: 10,
            textAlign: "center",
            marginBottom: 12,
            letterSpacing: "0.06em",
          }}
        >
          ✓ PASSWORD ACCEPTED — CAREER LOADED!
        </div>
      )}

      {/* Preview of what will load */}
      {anyFilled && !success && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 16,
            opacity: 0.7,
          }}
        >
          <StatBox label="LEVEL" value={`${preview.level}`} color="#FFD700" />
          <StatBox
            label="STAGE"
            value={preview.careerStage
              .replace(/([A-Z])/g, " $1")
              .trim()
              .split(" ")[0]
              .toUpperCase()}
            color="#3FAE5A"
          />
          <StatBox
            label="SP"
            value={`${preview.skillPoints}`}
            color="#2E7BD6"
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onClear}
          style={{
            flex: 1,
            padding: "12px 0",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            color: "#6A7480",
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          CLEAR
        </button>
        <button
          type="button"
          onClick={onLoad}
          style={{
            flex: 2,
            padding: "12px 0",
            background: "linear-gradient(135deg, #3FAE5A, #2A8040)",
            border: "none",
            borderRadius: 10,
            color: "#FFF",
            fontFamily: "monospace",
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          LOAD CAREER
        </button>
      </div>
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function PasswordGrid({
  bits,
  interactive,
  onToggle,
}: {
  bits: boolean[];
  interactive: boolean;
  onToggle: (idx: number) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${GRID}, ${CELL}px)`,
        gap: 6,
        justifyContent: "center",
        userSelect: "none",
      }}
    >
      {bits.map((filled, idx) => {
        const row = Math.floor(idx / GRID);
        const col = idx % GRID;
        const cellKey = `cell-r${row}-c${col}`;
        const color = dotColor(row, col);
        // bit 35 is the parity bit — mark it differently
        const isParity = idx === 35;

        return (
          <button
            key={cellKey}
            type="button"
            onClick={() => interactive && onToggle(idx)}
            style={{
              width: CELL,
              height: CELL,
              borderRadius: "50%",
              border: `2px solid ${
                filled
                  ? color
                  : isParity
                    ? "rgba(255,215,0,0.3)"
                    : "rgba(255,255,255,0.12)"
              }`,
              background: filled
                ? color
                : isParity
                  ? "rgba(255,215,0,0.06)"
                  : "rgba(255,255,255,0.03)",
              cursor: interactive ? "pointer" : "default",
              transition: "background 0.1s, border-color 0.1s, transform 0.08s",
              transform: interactive && filled ? "scale(0.92)" : "scale(1)",
              boxShadow: filled ? `0 0 8px ${color}88` : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
            aria-label={`Cell ${idx + 1} ${
              filled ? "filled" : "empty"
            }${isParity ? " (parity)" : ""}`}
          >
            {/* Inner dot when filled */}
            {filled && (
              <div
                style={{
                  width: CELL * 0.38,
                  height: CELL * 0.38,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.6)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Stat Box ─────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: `${color}11`,
        border: `1px solid ${color}33`,
        borderRadius: 8,
        padding: "10px 8px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color,
          letterSpacing: "0.05em",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9, color: "#4A545D", letterSpacing: "0.08em" }}>
        {label}
      </div>
    </div>
  );
}
