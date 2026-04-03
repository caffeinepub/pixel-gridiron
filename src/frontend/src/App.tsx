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
import { SkillTree } from "./components/SkillTree";
import { useAddXp, usePlayerProfile, useSubmitScore } from "./hooks/useQueries";
import {
  type GameState,
  type PlayerProfile,
  createInitialGameState,
  defaultProfile,
} from "./types/game";

type Screen = "game" | "leaderboard" | "skill_tree" | "legends" | "how_to_play";

export default function App() {
  const [screen, setScreen] = useState<Screen>("game");
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Separate tick state so we can force a re-render when game state changes
  // (running/paused/gameOver) without mutating React state inside the game loop.
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

  const gameStateRef = useRef<GameState>(createInitialGameState(profile));
  const canvasRef = useRef<GameCanvasHandle | null>(null);

  // Always read live state from the ref, never cache gs at render scope
  const getGs = () => gameStateRef.current;

  const syncGameState = useCallback((p: PlayerProfile) => {
    const gs = gameStateRef.current;
    // Always sync skills regardless of running state — this is the fix for
    // skill points not taking effect in-game.
    gs.skills = { ...p.skills };
    gs.careerStage = p.careerStage;
    if (!gs.running) {
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
    if (!gs.running && !gs.gameOver) {
      gs.running = true;
      gs.paused = false;
    } else if (gs.paused) {
      gs.paused = false;
      gs.running = true;
    } else if (gs.running) {
      gs.paused = true;
    }
    forceUpdate();
  };

  const handleRestart = useCallback(() => {
    const fresh = createInitialGameState(profile);
    fresh.activeLegend = activeLegend;
    // Replace the contents of the ref so the existing RAF loop picks it up
    gameStateRef.current = fresh;
    setScore(0);
    setHp(profile.hp);
    setXp(profile.xp);
    setShowGameOver(false);
    forceUpdate();
  }, [profile, activeLegend, forceUpdate]);

  const handleScoreUpdate = useCallback((s: number, h: number, x: number) => {
    setScore(s);
    setHp(h);
    setXp(x);
  }, []);

  const handleGameOver = useCallback(
    (finalScore: number, xpGained: number) => {
      setGameOverScore(finalScore);
      setGameOverXp(xpGained);
      setShowGameOver(true);
      forceUpdate();
    },
    [forceUpdate],
  );

  const handleSaveScore = async () => {
    const name = playerName.trim() || profile.displayName || "Player";
    const newXp = localProfile.xp + gameOverXp;
    const newLevel = Math.floor(newXp / 100) + 1;
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

  // Read live values from ref every render (gameTick ensures re-render when needed)
  const gs = gameStateRef.current;
  const hpPct = Math.max(0, (hp / 100) * 100);
  const xpPct = Math.max(0, ((xp % 100) / 100) * 100);
  const hpColor = hp > 50 ? "#3FAE5A" : hp > 25 ? "#D4A017" : "#C63A3A";

  // Suppress unused var warning — gameTick is read to force renders
  void gameTick;

  const NAV_ITEMS: { id: Screen; label: string }[] = [
    { id: "skill_tree", label: "SKILL TREE" },
    { id: "legends", label: "LEGENDS" },
    { id: "leaderboard", label: "LEADERBOARD" },
    { id: "how_to_play", label: "HOW TO PLAY" },
  ];

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
      {/* Game canvas fills entire screen */}
      <GameCanvas
        ref={canvasRef}
        gameStateRef={gameStateRef}
        onScoreUpdate={handleScoreUpdate}
        onGameOver={handleGameOver}
      />

      {/* HUD overlay — top bar */}
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
              style={{ fontSize: 9, color: "#2E7BD6", fontFamily: "monospace" }}
            >
              Lv.{profile.level}
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

      {/* Hamburger menu button — top left */}
      <button
        type="button"
        style={{
          ...btnBase,
          top: 56,
          left: 10,
          width: 40,
          height: 36,
          background: "rgba(0,0,0,0.55)",
          borderRadius: 8,
          border: "1px solid rgba(63,174,90,0.3)",
          color: "#3FAE5A",
          fontSize: 18,
        }}
        onClick={() => setMenuOpen(true)}
      >
        ☰
      </button>

      {/* START / PAUSE button — top right */}
      <button
        type="button"
        style={{
          ...btnBase,
          top: 56,
          right: 10,
          width: 80,
          height: 36,
          background: getGs().running
            ? "rgba(42,80,60,0.7)"
            : "rgba(63,174,90,0.85)",
          borderRadius: 8,
          border: `1px solid ${getGs().running ? "rgba(63,174,90,0.4)" : "#60CF80"}`,
          color: "#FFF",
          fontSize: 11,
          letterSpacing: "0.08em",
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          if (getGs().gameOver) handleRestart();
          else handleStart();
        }}
      >
        {getGs().running ? "PAUSE" : getGs().gameOver ? "RETRY" : "START"}
      </button>

      {/* LEFT arrow — bottom left */}
      <button
        type="button"
        style={{
          ...btnBase,
          bottom: 20,
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
      >
        ◀
      </button>

      {/* RIGHT arrow — bottom left, next to left arrow */}
      <button
        type="button"
        style={{
          ...btnBase,
          bottom: 20,
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
      >
        ▶
      </button>

      {/* SPIN — bottom right top-left */}
      <button
        type="button"
        style={{
          ...btnBase,
          bottom: 100,
          right: 92,
          width: 72,
          height: 52,
          background: gs.playerSpinning
            ? "rgba(46,123,214,0.7)"
            : "rgba(46,123,214,0.45)",
          borderRadius: "50%",
          border: "2px solid #4A8FD6",
          color: "#fff",
          fontSize: 11,
          letterSpacing: "0.05em",
          boxShadow: gs.playerSpinning
            ? "0 0 16px rgba(46,123,214,0.8)"
            : "none",
        }}
        {...makePointerHandlers(() => canvasRef.current?.pressSpin())}
        aria-label="Spin move"
      >
        SPIN
      </button>

      {/* TURBO — bottom right top-right */}
      <button
        type="button"
        style={{
          ...btnBase,
          bottom: 100,
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
          boxShadow: gs.turboActive ? "0 0 16px rgba(198,58,58,0.8)" : "none",
        }}
        {...makePointerHandlers(() => canvasRef.current?.pressTurbo())}
        aria-label="Turbo boost"
      >
        TURBO
      </button>

      {/* HURDLE — bottom right bottom-center */}
      <button
        type="button"
        style={{
          ...btnBase,
          bottom: 24,
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
      >
        HURDLE
      </button>

      {/* Nav menu overlay */}
      {menuOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontWeight: 800,
              fontSize: 24,
              color: "#3FAE5A",
              letterSpacing: "0.12em",
              marginBottom: 12,
            }}
          >
            PIXEL <span style={{ color: "#E7E7E7" }}>GRIDIRON</span>
          </div>

          {/* Auth */}
          <div
            style={{
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {isLoggedIn ? (
              <>
                <Badge
                  style={{
                    fontSize: 11,
                    background: "rgba(63,174,90,0.15)",
                    borderColor: "rgba(63,174,90,0.4)",
                    color: "#3FAE5A",
                  }}
                >
                  Lv.{profile.level} {profile.displayName}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clear}
                  style={{
                    fontSize: 10,
                    padding: "4px 12px",
                    height: "auto",
                    borderColor: "rgba(255,255,255,0.15)",
                    color: "#A9B0B6",
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
                style={{
                  fontSize: 11,
                  padding: "6px 20px",
                  height: "auto",
                  background: "rgba(43,51,58,0.9)",
                  border: "1px solid rgba(74,84,93,0.8)",
                  color: "#E7E7E7",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                }}
              >
                {isLoggingIn ? "CONNECTING..." : "LOGIN"}
              </Button>
            )}
          </div>

          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              style={{
                width: 240,
                padding: "14px 0",
                background:
                  screen === item.id
                    ? "rgba(63,174,90,0.15)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  screen === item.id
                    ? "rgba(63,174,90,0.5)"
                    : "rgba(255,255,255,0.08)"
                }`,
                borderRadius: 10,
                color: screen === item.id ? "#3FAE5A" : "#E7E7E7",
                fontFamily: "monospace",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.1em",
                cursor: "pointer",
              }}
              onClick={() => {
                setScreen(item.id);
                setMenuOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            style={{
              marginTop: 8,
              width: 240,
              padding: "14px 0",
              background: "rgba(63,174,90,0.9)",
              border: "none",
              borderRadius: 10,
              color: "#000",
              fontFamily: "monospace",
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
            onClick={() => {
              setScreen("game");
              setMenuOpen(false);
            }}
          >
            ▶ BACK TO GAME
          </button>
        </div>
      )}

      {/* Screen overlays (non-game screens) */}
      {screen !== "game" && (
        <div
          data-scroll="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,12,15,0.97)",
            zIndex: 40,
            overflowY: "auto",
            WebkitOverflowScrolling:
              "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          }}
        >
          {/* Back button */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 41,
              background: "rgba(10,12,15,0.98)",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(42,49,56,0.6)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setScreen("game")}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "#A9B0B6",
                padding: "6px 14px",
                fontSize: 11,
                fontFamily: "monospace",
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.08em",
              }}
            >
              ◀ BACK
            </button>
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                fontSize: 13,
                color: "#3FAE5A",
                letterSpacing: "0.1em",
              }}
            >
              {screen === "skill_tree" && "SKILL TREE"}
              {screen === "legends" && "LEGENDS"}
              {screen === "leaderboard" && "LEADERBOARD"}
              {screen === "how_to_play" && "HOW TO PLAY"}
            </span>
          </div>

          {screen === "leaderboard" && <Leaderboard />}
          {screen === "skill_tree" && (
            <SkillTree
              profile={profile}
              onProfileUpdate={handleProfileUpdate}
              isLoggedIn={isLoggedIn}
            />
          )}
          {screen === "legends" && (
            <Legends
              profile={profile}
              onProfileUpdate={handleProfileUpdate}
              onSetActiveLegend={handleSetActiveLegend}
              activeLegend={activeLegend}
            />
          )}
          {screen === "how_to_play" && <HowToPlay />}
        </div>
      )}

      {/* Game Over dialog */}
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
