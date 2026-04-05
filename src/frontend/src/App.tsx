import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { useInternetIdentity } from "@/hooks/useInternetIdentity";
import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { GameCanvasHandle } from "./components/GameCanvas";
import GameCanvas from "./components/GameCanvas";
import { HowToPlay } from "./components/HowToPlay";
import { Leaderboard } from "./components/Leaderboard";
import { Legends } from "./components/Legends";
import { PasswordSave } from "./components/PasswordSave";
import { SkillTree } from "./components/SkillTree";
import { useAddXp, usePlayerProfile, useSubmitScore } from "./hooks/useQueries";
import {
  type GameState,
  type PlayResult,
  type PlayerProfile,
  createGameState,
  defaultProfile,
  levelFromXp,
  xpForNextLevel,
} from "./types/game";

type Tab = "game" | "skills" | "legends" | "scores" | "howto" | "save";

const TAB_BAR_H = 52;

export default function App() {
  const [tab, setTab] = useState<Tab>("game");
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(100);
  const [xp, setXp] = useState(0);
  const [activeLegend, setActiveLegend] = useState<string | null>(null);
  const [showGameOver, setShowGameOver] = useState(false);
  const [gameOverScore, setGameOverScore] = useState(0);
  const [gameOverXp, setGameOverXp] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [localProfile, setLocalProfile] =
    useState<PlayerProfile>(defaultProfile);

  // Play result state (tackled but not game over)
  const [showPlayResult, setShowPlayResult] = useState(false);
  const [playResult, setPlayResult] = useState<PlayResult | null>(null);

  // Separate tick state so we can force a re-render when game state changes
  const [gameTick, setGameTick] = useState(0);
  const forceUpdate = useCallback(() => setGameTick((t) => t + 1), []);

  const { data: backendProfile, isLoading: profileLoading } =
    usePlayerProfile();
  const addXp = useAddXp();
  const submitScore = useSubmitScore();
  const qc = useQueryClient();

  const { login, loginStatus, identity, clear } = useInternetIdentity();
  const isLoggedIn = !!identity;
  const isLoggingIn = loginStatus === "logging-in";

  const profile = backendProfile ?? localProfile;
  // Ref always points to latest profile — used in stable callbacks to avoid stale closures
  const profileRef = useRef<typeof profile>(profile);
  profileRef.current = profile;

  const gameStateRef = useRef<GameState>(createGameState(profile));
  const canvasRef = useRef<GameCanvasHandle | null>(null);

  const getGs = () => gameStateRef.current;

  const syncGameState = useCallback((p: PlayerProfile) => {
    const gs = gameStateRef.current;
    gs.skills = { ...p.skills };
    gs.careerStage = p.careerStage;
    if (gs.phase !== "playing") {
      gs.hp = p.hp;
      gs.xp = p.xp;
      gs.level = p.level;
    }
  }, []);

  if (backendProfile && !profileLoading) {
    syncGameState(backendProfile);
  }

  const handleStart = () => {
    const gs = gameStateRef.current;
    if (gs.phase === "idle") {
      gs.phase = "playing";
    } else if (gs.phase === "playing") {
      gs.phase = "paused";
    } else if (gs.phase === "paused") {
      gs.phase = "playing";
    } else if (gs.phase === "tackled") {
      /* handled by NEXT PLAY button */ return;
    }
    forceUpdate();
  };

  const handleRestart = useCallback(() => {
    const fresh = createGameState(profile);
    fresh.activeLegend = activeLegend;
    gameStateRef.current = fresh;
    setScore(0);
    setHp(profile.hp);
    setXp(profile.xp);
    setShowGameOver(false);
    setShowPlayResult(false);
    setPlayResult(null);
    forceUpdate();
  }, [profile, activeLegend, forceUpdate]);

  const handleScoreUpdate = useCallback((s: number, h: number, x: number) => {
    setScore(s);
    setHp(h);
    setXp(x);
  }, []);

  // Called when a tackle ends the play (not game over)
  const handleTackled = useCallback(
    (yards: number, xpGained: number, items: string[]) => {
      // Use ref so this callback never goes stale — upgrading skills won't reset the RAF loop
      const p = profileRef.current;
      const newXp = p.xp + xpGained;
      const newLevel = levelFromXp(newXp);
      const leveledUp = newLevel > p.level;
      const bonusPoints = leveledUp ? newLevel - p.level : 0;

      const updatedProfile: PlayerProfile = {
        ...p,
        xp: newXp,
        level: newLevel,
        skillPoints: p.skillPoints + bonusPoints,
        highScore: Math.max(p.highScore, gameStateRef.current.score),
      };
      setLocalProfile(updatedProfile);
      qc.setQueryData(["profile"], updatedProfile);

      if (isLoggedIn) {
        addXp.mutateAsync(xpGained).catch(() => {});
      }

      setPlayResult({
        yards,
        xpGained,
        items,
        leveledUp,
        newLevel,
        touchdown: gameStateRef.current.touchdown ?? false,
      });
      setShowPlayResult(true);
      forceUpdate();
    },
    // Stable deps only — profileRef.current is read at call time, not captured
    [isLoggedIn, addXp, qc, forceUpdate],
  );

  const handleNextPlay = useCallback(() => {
    // Use profileRef to always get the freshest profile (including just-upgraded skills)
    const p = profileRef.current;
    const careerYards =
      (gameStateRef.current.careerYards || 0) + (playResult?.yards || 0);
    const fresh = createGameState(p);
    fresh.activeLegend = activeLegend;
    fresh.careerYards = careerYards;
    gameStateRef.current = fresh;
    setScore(0);
    setHp(fresh.hp);
    setXp(p.xp);
    setShowPlayResult(false);
    setPlayResult(null);
    forceUpdate();
  }, [activeLegend, playResult, forceUpdate]);

  const handleSaveScore = async () => {
    const name = playerName.trim() || profile.displayName || "Player";
    const newXp = localProfile.xp + gameOverXp;
    const newLevel = levelFromXp(newXp);
    const bonusPoints =
      newLevel > localProfile.level ? newLevel - localProfile.level : 0;
    const updatedLocal: PlayerProfile = {
      ...localProfile,
      xp: newXp,
      level: newLevel,
      skillPoints: localProfile.skillPoints + bonusPoints,
      highScore: Math.max(localProfile.highScore, gameOverScore),
      displayName: name,
    };
    setLocalProfile(updatedLocal);
    qc.setQueryData(["profile"], updatedLocal);

    if (isLoggedIn) {
      try {
        await Promise.all([
          addXp.mutateAsync(gameOverXp),
          submitScore.mutateAsync({ score: gameOverScore, playerName: name }),
        ]);
        toast.success("Score saved!");
      } catch {
        toast.error("Failed to save to blockchain");
      }
    } else {
      toast.success("Score saved locally! Login to save to leaderboard.");
    }
    setShowGameOver(false);
    handleRestart();
  };

  const handleProfileUpdate = (updated: PlayerProfile) => {
    setLocalProfile(updated);
    qc.setQueryData(["profile"], updated);
    syncGameState(updated);
  };

  const handleSetActiveLegend = (legendId: string | null) => {
    setActiveLegend(legendId);
    gameStateRef.current.activeLegend = legendId;
  };

  const gs = gameStateRef.current;
  const hpPct = Math.max(0, (hp / 100) * 100);
  const currentLevel = levelFromXp(xp);
  const xpThisLevel =
    xp - (currentLevel > 1 ? (currentLevel - 1) * (currentLevel - 1) * 50 : 0);
  const xpNeeded =
    xpForNextLevel(currentLevel) -
    (currentLevel > 1 ? (currentLevel - 1) * (currentLevel - 1) * 50 : 0);
  const xpPct = Math.max(0, Math.min(100, (xpThisLevel / xpNeeded) * 100));
  const hpColor = hp > 50 ? "#3FAE5A" : hp > 25 ? "#D4A017" : "#C63A3A";

  void gameTick;

  // ─── Shared style helpers ────────────────────────────────────────────────
  const btnBase: React.CSSProperties = {
    position: "absolute",
    zIndex: 20,
    WebkitUserSelect: "none",
    userSelect: "none",
    touchAction: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "monospace",
    fontWeight: 700,
  };

  const makePointerHandlers = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      fn();
    },
  });

  // ─── Tab bar config ───────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "game", label: "GAME", icon: "🏈" },
    { id: "skills", label: "SKILLS", icon: "⚡" },
    { id: "legends", label: "LEGENDS", icon: "🌟" },
    { id: "scores", label: "SCORES", icon: "🏆" },
    { id: "howto", label: "HOW TO", icon: "❓" },
    { id: "save", label: "SAVE", icon: "💾" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ──────────────────────────────────────────────────────────────────
          GAME LAYER — canvas always mounted, just hidden behind other tabs
          ────────────────────────────────────────────────────────────────── */}
      <GameCanvas
        ref={canvasRef}
        gameStateRef={gameStateRef}
        onScoreUpdate={handleScoreUpdate}
        onTackled={handleTackled}
      />

      {/* ── HUD overlay — top bar (game tab only) ─────────────────────── */}
      {tab === "game" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 48,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            gap: 8,
            zIndex: 15,
            pointerEvents: "none",
            borderBottom: "1px solid rgba(63,174,90,0.2)",
          }}
        >
          {/* HP bar */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: "#A9B0B6",
                  fontFamily: "monospace",
                  fontWeight: 700,
                }}
              >
                HP
              </span>
              <span
                style={{ fontSize: 9, color: hpColor, fontFamily: "monospace" }}
              >
                {hp}
              </span>
            </div>
            <div
              style={{
                height: 5,
                background: "rgba(255,255,255,0.1)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${hpPct}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: hpColor,
                  transition: "width 0.15s",
                }}
              />
            </div>
          </div>

          {/* Score center */}
          <div style={{ textAlign: "center", minWidth: 90 }}>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 16,
                fontWeight: 700,
                color: "#3FAE5A",
                letterSpacing: "0.08em",
              }}
            >
              {String(score).padStart(6, "0")}
            </div>
            <div
              style={{ fontFamily: "monospace", fontSize: 8, color: "#4A545D" }}
            >
              HI: {String(profile.highScore).padStart(6, "0")}
            </div>
          </div>

          {/* XP bar */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: "#A9B0B6",
                  fontFamily: "monospace",
                  fontWeight: 700,
                }}
              >
                XP
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "#2E7BD6",
                  fontFamily: "monospace",
                }}
              >
                Lv.{currentLevel}
              </span>
            </div>
            <div
              style={{
                height: 5,
                background: "rgba(255,255,255,0.1)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${xpPct}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: "#2E7BD6",
                  transition: "width 0.15s",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── START / PAUSE button — top right (game tab only) ────────────── */}
      {tab === "game" && (
        <button
          type="button"
          data-ocid="game.start.button"
          style={{
            ...btnBase,
            top: 56,
            right: 10,
            width: 80,
            height: 36,
            background:
              getGs().phase === "playing"
                ? "rgba(42,80,60,0.7)"
                : "rgba(63,174,90,0.85)",
            borderRadius: 8,
            border: `1px solid ${
              getGs().phase === "playing" ? "rgba(63,174,90,0.4)" : "#60CF80"
            }`,
            color: "#FFF",
            fontSize: 11,
            letterSpacing: "0.08em",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            handleStart();
          }}
        >
          {getGs().phase === "playing"
            ? "PAUSE"
            : getGs().phase === "paused"
              ? "RESUME"
              : "START"}
        </button>
      )}

      {/* ── Auth badge (game tab, top-left below HUD) ───────────────────── */}
      {tab === "game" && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 10,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {isLoggedIn ? (
            <>
              <Badge
                style={{
                  fontSize: 10,
                  background: "rgba(63,174,90,0.15)",
                  borderColor: "rgba(63,174,90,0.4)",
                  color: "#3FAE5A",
                  cursor: "default",
                }}
              >
                Lv.{profile.level} {profile.displayName || "Runner"}
              </Badge>
              <button
                type="button"
                data-ocid="game.logout.button"
                onClick={clear}
                style={{
                  fontSize: 9,
                  padding: "3px 8px",
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  color: "#6A7480",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.06em",
                }}
              >
                OUT
              </button>
            </>
          ) : (
            <button
              type="button"
              data-ocid="game.login.button"
              onClick={login}
              disabled={isLoggingIn}
              style={{
                fontSize: 10,
                padding: "5px 12px",
                background: "rgba(43,51,58,0.85)",
                border: "1px solid rgba(74,84,93,0.7)",
                borderRadius: 6,
                color: "#E7E7E7",
                fontFamily: "monospace",
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              {isLoggingIn ? "..." : "LOGIN"}
            </button>
          )}
        </div>
      )}

      {/* ── Touch controls (game tab only) — bottom offset by tab bar ──── */}
      {tab === "game" && (
        <>
          {/* LEFT arrow */}
          <button
            type="button"
            style={{
              ...btnBase,
              bottom: TAB_BAR_H + 20,
              left: 12,
              width: 88,
              height: 68,
              background: "rgba(0,0,0,0.5)",
              borderRadius: 14,
              border: "2px solid rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: 32,
            }}
            {...makePointerHandlers(() => canvasRef.current?.pressLeft())}
            aria-label="Move left"
            data-ocid="game.left.button"
          >
            ◀
          </button>

          {/* RIGHT arrow */}
          <button
            type="button"
            style={{
              ...btnBase,
              bottom: TAB_BAR_H + 20,
              left: 112,
              width: 88,
              height: 68,
              background: "rgba(0,0,0,0.5)",
              borderRadius: 14,
              border: "2px solid rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: 32,
            }}
            {...makePointerHandlers(() => canvasRef.current?.pressRight())}
            aria-label="Move right"
            data-ocid="game.right.button"
          >
            ▶
          </button>

          {/* SPIN */}
          <button
            type="button"
            style={{
              ...btnBase,
              bottom: TAB_BAR_H + 100,
              right: 92,
              width: 72,
              height: 52,
              background: gs.spinning
                ? "rgba(46,123,214,0.7)"
                : "rgba(46,123,214,0.45)",
              borderRadius: "50%",
              border: "2px solid #4A8FD6",
              color: "#fff",
              fontSize: 11,
              letterSpacing: "0.05em",
              boxShadow: gs.spinning ? "0 0 16px rgba(46,123,214,0.8)" : "none",
            }}
            {...makePointerHandlers(() => canvasRef.current?.pressSpin())}
            aria-label="Spin move"
            data-ocid="game.spin.button"
          >
            SPIN
          </button>

          {/* TURBO */}
          <button
            type="button"
            style={{
              ...btnBase,
              bottom: TAB_BAR_H + 100,
              right: 12,
              width: 72,
              height: 52,
              background: gs.turboActive
                ? "rgba(198,58,58,0.7)"
                : "rgba(198,58,58,0.45)",
              borderRadius: "50%",
              border: "2px solid #E05050",
              color: "#fff",
              fontSize: 11,
              letterSpacing: "0.05em",
              boxShadow: gs.turboActive
                ? "0 0 16px rgba(198,58,58,0.8)"
                : "none",
            }}
            {...makePointerHandlers(() => canvasRef.current?.pressTurbo())}
            aria-label="Turbo boost"
            data-ocid="game.turbo.button"
          >
            TURBO
          </button>

          {/* HURDLE */}
          <button
            type="button"
            style={{
              ...btnBase,
              bottom: TAB_BAR_H + 24,
              right: 40,
              width: 96,
              height: 60,
              background: "rgba(63,174,90,0.45)",
              borderRadius: "50%",
              border: "2px solid #50C860",
              color: "#fff",
              fontSize: 11,
              letterSpacing: "0.05em",
            }}
            {...makePointerHandlers(() => canvasRef.current?.pressHurdle())}
            aria-label="Hurdle jump"
            data-ocid="game.hurdle.button"
          >
            HURDLE
          </button>
        </>
      )}

      {/* ── Non-game tab panels ───────────────────────────────────────────── */}
      {tab !== "game" && (
        <div
          data-scroll="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,12,15,0.98)",
            zIndex: 40,
            overflowY: "auto",
            WebkitOverflowScrolling:
              "touch" as React.CSSProperties["WebkitOverflowScrolling"],
            paddingBottom: TAB_BAR_H + 8,
          }}
        >
          {/* Top bar with title + auth */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 41,
              background: "rgba(10,12,15,0.98)",
              padding: "10px 14px",
              borderBottom: "1px solid rgba(63,174,90,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 800,
                fontSize: 13,
                color: "#3FAE5A",
                letterSpacing: "0.12em",
              }}
            >
              {tab === "skills" && "⚡ SKILL TREE"}
              {tab === "legends" && "🌟 LEGENDS"}
              {tab === "scores" && "🏆 LEADERBOARD"}
              {tab === "howto" && "❓ HOW TO PLAY"}
              {tab === "save" && "💾 PASSWORD SAVE"}
            </span>

            {/* Auth controls in panel header */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isLoggedIn ? (
                <>
                  <Badge
                    style={{
                      fontSize: 10,
                      background: "rgba(63,174,90,0.15)",
                      borderColor: "rgba(63,174,90,0.4)",
                      color: "#3FAE5A",
                    }}
                  >
                    Lv.{profile.level} {profile.displayName || "Runner"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clear}
                    data-ocid="panel.logout.button"
                    style={{
                      fontSize: 10,
                      padding: "3px 10px",
                      height: "auto",
                      borderColor: "rgba(255,255,255,0.12)",
                      color: "#6A7480",
                    }}
                  >
                    LOGOUT
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={login}
                  disabled={isLoggingIn}
                  data-ocid="panel.login.button"
                  style={{
                    fontSize: 11,
                    padding: "5px 16px",
                    height: "auto",
                    background: "rgba(43,51,58,0.9)",
                    border: "1px solid rgba(74,84,93,0.7)",
                    color: "#E7E7E7",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  {isLoggingIn ? "CONNECTING..." : "LOGIN"}
                </Button>
              )}
            </div>
          </div>

          {/* Tab content */}
          {tab === "scores" && <Leaderboard />}
          {tab === "skills" && (
            <SkillTree
              profile={profile}
              onProfileUpdate={handleProfileUpdate}
              isLoggedIn={isLoggedIn}
            />
          )}
          {tab === "legends" && (
            <Legends
              profile={profile}
              onProfileUpdate={handleProfileUpdate}
              onSetActiveLegend={handleSetActiveLegend}
              activeLegend={activeLegend}
            />
          )}
          {tab === "howto" && <HowToPlay />}
          {tab === "save" && (
            <PasswordSave
              profile={profile}
              onLoad={(loaded) => {
                handleProfileUpdate({
                  ...loaded,
                  displayName: profile.displayName,
                  teamName: profile.teamName,
                  jerseyNumber: profile.jerseyNumber,
                });
              }}
            />
          )}
        </div>
      )}

      {/* ── Play Result overlay (tackled — not game over) ─────────────────── */}
      {showPlayResult && playResult && (
        <div
          data-ocid="play_result.panel"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            paddingBottom: TAB_BAR_H,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 28,
              fontWeight: 800,
              color: "#C63A3A",
              letterSpacing: "0.12em",
            }}
          >
            TACKLED!
          </div>

          {playResult.leveledUp && (
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 16,
                fontWeight: 700,
                color: "#FFD700",
                letterSpacing: "0.1em",
              }}
            >
              ⭐ LEVEL UP! → Lv.{playResult.newLevel}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              width: 280,
            }}
          >
            <div
              style={{
                background: "rgba(63,174,90,0.12)",
                border: "1px solid rgba(63,174,90,0.3)",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#3FAE5A",
                }}
              >
                {playResult.yards}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#6A7480",
                  fontFamily: "monospace",
                }}
              >
                YARDS
              </div>
            </div>
            <div
              style={{
                background: "rgba(46,123,214,0.12)",
                border: "1px solid rgba(46,123,214,0.3)",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#2E7BD6",
                }}
              >
                +{playResult.xpGained}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#6A7480",
                  fontFamily: "monospace",
                }}
              >
                XP GAINED
              </div>
            </div>
          </div>

          {playResult.items.length > 0 && (
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 22,
                letterSpacing: 4,
              }}
            >
              {playResult.items.join(" ")}
            </div>
          )}

          {/* XP bar showing new level progress */}
          <div style={{ width: 280 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
                fontSize: 11,
                color: "#6A7480",
                fontFamily: "monospace",
              }}
            >
              <span>Lv.{profile.level}</span>
              <span>
                {profile.xp} / {xpForNextLevel(profile.level)} XP
              </span>
            </div>
            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,0.08)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "#2E7BD6",
                  borderRadius: 4,
                  width: `${Math.min(100, (profile.xp / xpForNextLevel(profile.level)) * 100)}%`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button
              type="button"
              data-ocid="play_result.next.button"
              onClick={handleNextPlay}
              style={{
                fontFamily: "monospace",
                fontWeight: 800,
                fontSize: 16,
                background: "linear-gradient(135deg, #3FAE5A, #2A8040)",
                color: "#FFF",
                border: "none",
                borderRadius: 12,
                padding: "14px 36px",
                letterSpacing: "0.1em",
                cursor: "pointer",
              }}
            >
              ▶ NEXT PLAY
            </button>
            <button
              type="button"
              data-ocid="play_result.save.button"
              onClick={() => {
                setShowPlayResult(false);
                setShowGameOver(true);
                setGameOverScore(score);
                setGameOverXp(playResult.xpGained);
              }}
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                fontSize: 12,
                background: "rgba(255,255,255,0.06)",
                color: "#A9B0B6",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "14px 20px",
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              SAVE SCORE
            </button>
          </div>

          {/* Career stats */}
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "#4A545D",
              textAlign: "center",
            }}
          >
            CAREER:{" "}
            {(
              gameStateRef.current.careerYards + playResult.yards
            ).toLocaleString()}{" "}
            TOTAL YARDS
          </div>
        </div>
      )}

      {/* ── Game Over dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={showGameOver}
        onOpenChange={(open) => !open && setShowGameOver(false)}
      >
        <DialogContent
          data-ocid="game_over.dialog"
          style={{
            background: "linear-gradient(135deg, #1A1F24, #14181D)",
            border: "1px solid rgba(198,58,58,0.4)",
            boxShadow: "0 0 30px rgba(198,58,58,0.2)",
          }}
        >
          <DialogHeader>
            <DialogTitle
              className="font-display text-xl"
              style={{ color: "#C63A3A", letterSpacing: "0.1em" }}
            >
              GAME OVER
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Great run! Save your score to the leaderboard.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div
                className="p-3 rounded-lg text-center"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="font-display text-2xl font-bold"
                  style={{ color: "#3FAE5A" }}
                >
                  {gameOverScore.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">SCORE</div>
              </div>
              <div
                className="p-3 rounded-lg text-center"
                style={{
                  background: "rgba(46,123,214,0.1)",
                  border: "1px solid rgba(46,123,214,0.3)",
                }}
              >
                <div
                  className="font-display text-2xl font-bold"
                  style={{ color: "#2E7BD6" }}
                >
                  +{gameOverXp}
                </div>
                <div className="text-xs text-muted-foreground">XP GAINED</div>
              </div>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="player-name"
                style={{ fontSize: 12, color: "#A9B0B6" }}
              >
                PLAYER NAME
              </Label>
              <Input
                id="player-name"
                data-ocid="game_over.input"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={profile.displayName || "Enter your name"}
                inputMode="text"
                enterKeyHint="done"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#E7E7E7",
                  fontFamily: "monospace",
                }}
                maxLength={20}
              />
            </div>
            {!isLoggedIn && (
              <p className="text-xs text-muted-foreground text-center">
                Login to save to global leaderboard
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              data-ocid="game_over.cancel_button"
              variant="outline"
              onClick={() => {
                setShowGameOver(false);
                handleRestart();
              }}
              style={{
                borderColor: "rgba(255,255,255,0.1)",
                color: "#A9B0B6",
                fontSize: 11,
              }}
            >
              SKIP
            </Button>
            <Button
              data-ocid="game_over.submit_button"
              onClick={handleSaveScore}
              disabled={addXp.isPending || submitScore.isPending}
              style={{
                background: "linear-gradient(135deg, #3FAE5A, #2A8040)",
                color: "#FFF",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              {addXp.isPending || submitScore.isPending
                ? "SAVING..."
                : "SAVE SCORE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bottom Tab Bar ──────────────────────────────────────────────────── */}
      <nav
        data-ocid="nav.tab_bar"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: TAB_BAR_H,
          background: "rgba(8,10,12,0.97)",
          borderTop: "1px solid rgba(63,174,90,0.2)",
          display: "flex",
          zIndex: 50,
        }}
      >
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-ocid={`nav.${t.id}.tab`}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                background: isActive ? "rgba(63,174,90,0.2)" : "transparent",
                borderTop: isActive
                  ? "2px solid #3FAE5A"
                  : "2px solid transparent",
                border: "none",
                borderTopWidth: 2,
                borderTopStyle: "solid",
                borderTopColor: isActive ? "#3FAE5A" : "transparent",
                color: isActive ? "#3FAE5A" : "#6A7480",
                fontFamily: "monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                transition: "color 0.15s, background 0.15s",
                WebkitTapHighlightColor: "transparent",
                userSelect: "none",
                WebkitUserSelect: "none",
                touchAction: "manipulation",
                padding: 0,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "#1A1F24",
            border: "1px solid rgba(63,174,90,0.3)",
            color: "#E7E7E7",
          },
        }}
      />
    </div>
  );
}
