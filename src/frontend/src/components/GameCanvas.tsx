/**
 * GameCanvas.tsx — Three.js 3D game view.
 * Owns the RAF loop. Calls modules in order each frame:
 *   movement → spawner → collision → ThreeRenderer
 * HTML overlay handles HUD, screens (no canvas drawing).
 */
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { detectCollisions } from "../modules/collision";
import {
  inputJump,
  inputLeft,
  inputRight,
  inputSpin,
  inputTurbo,
  updateMovement,
} from "../modules/movement";
import ThreeRenderer from "../modules/renderer";
import { tickSpawner } from "../modules/spawner";
import { CH, CW, type GameState, STAGE_NAMES } from "../types/game";

export interface GameCanvasHandle {
  pressLeft: () => void;
  pressRight: () => void;
  pressUp: () => void;
  pressSpin: () => void;
  pressTurbo: () => void;
  pressHurdle: () => void;
}

interface Props {
  gameStateRef: React.MutableRefObject<GameState>;
  onScoreUpdate: (score: number, hp: number, xp: number) => void;
  onTackled: (yards: number, xp: number, items: string[]) => void;
}

// ── Phase overlay screens ─────────────────────────────────────────────────────
function PhaseOverlay({
  gs,
  onStart,
  onNextPlay,
}: {
  gs: GameState;
  onStart: () => void;
  onNextPlay: () => void;
}) {
  const overlay: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "monospace",
    pointerEvents: "auto",
  };

  if (gs.phase === "idle") {
    return (
      <div
        style={{
          ...overlay,
          background: "rgba(0,0,0,0.82)",
        }}
        data-ocid="game.idle_state"
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: "bold",
            color: "#3FAE5A",
            letterSpacing: 2,
            lineHeight: 1,
          }}
        >
          PIXEL
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: "bold",
            color: "#e7e7e7",
            letterSpacing: 3,
            marginBottom: 8,
          }}
        >
          GRIDIRON
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#FFD700",
            fontWeight: "bold",
            marginBottom: 24,
            letterSpacing: 2,
          }}
        >
          {STAGE_NAMES[gs.careerStage]?.toUpperCase()}
        </div>
        <button
          style={{
            background: "#3FAE5A",
            border: "none",
            color: "#fff",
            fontFamily: "monospace",
            fontWeight: "bold",
            fontSize: 16,
            padding: "12px 32px",
            borderRadius: 8,
            cursor: "pointer",
            letterSpacing: 2,
            marginBottom: 20,
          }}
          onClick={onStart}
          type="button"
          data-ocid="game.primary_button"
        >
          ▶ PRESS START
        </button>
        <div
          style={{
            fontSize: 10,
            color: "rgba(150,160,170,0.8)",
            textAlign: "center",
            maxWidth: 260,
            lineHeight: 1.6,
          }}
        >
          TAP ◀ ▶ to change lanes · SPIN breaks defenders
          {"\n"}HURDLE jumps crates · TURBO for speed boost
        </div>
        {gs.teamName ? (
          <div
            style={{
              marginTop: 16,
              fontSize: 10,
              color: "rgba(255,255,255,0.28)",
              letterSpacing: 1,
            }}
          >
            {gs.teamName.toUpperCase()}
          </div>
        ) : null}
      </div>
    );
  }

  if (gs.phase === "paused") {
    return (
      <div
        style={{
          ...overlay,
          background: "rgba(0,0,0,0.72)",
        }}
        data-ocid="game.modal"
      >
        <div
          style={{
            fontSize: 30,
            fontWeight: "bold",
            color: "#e7e7e7",
            marginBottom: 16,
          }}
        >
          PAUSED
        </div>
        <button
          style={{
            background: "#3FAE5A",
            border: "none",
            color: "#fff",
            fontFamily: "monospace",
            fontWeight: "bold",
            fontSize: 14,
            padding: "10px 28px",
            borderRadius: 8,
            cursor: "pointer",
          }}
          onClick={onStart}
          type="button"
          data-ocid="game.confirm_button"
        >
          ▶ RESUME
        </button>
      </div>
    );
  }

  if (gs.phase === "tackled") {
    const elapsed = 1.8 - gs.tackleTimer;
    if (elapsed < 0.4) return null; // wait for animation
    return (
      <div
        style={{
          ...overlay,
          background: "rgba(0,0,0,0.8)",
        }}
        data-ocid="game.tackled_state"
      >
        {gs.touchdown ? (
          <>
            <div
              style={{
                fontSize: 36,
                fontWeight: "bold",
                color: "#FFD700",
                marginBottom: 8,
                textShadow: "0 0 20px rgba(255,215,0,0.8)",
              }}
            >
              TOUCHDOWN!
            </div>
            <div
              style={{
                fontSize: 20,
                color: "#3FAE5A",
                fontWeight: "bold",
                marginBottom: 4,
              }}
            >
              {Math.floor(gs.fieldZ)} YARDS
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 32,
                fontWeight: "bold",
                color: "#C63A3A",
                marginBottom: 8,
                textShadow: "0 0 12px rgba(198,58,58,0.6)",
              }}
            >
              TACKLED!
            </div>
            <div
              style={{
                fontSize: 20,
                color: "#e7e7e7",
                fontWeight: "bold",
                marginBottom: 4,
              }}
            >
              {Math.floor(gs.fieldZ)} YARDS
            </div>
          </>
        )}
        <div
          style={{
            fontSize: 12,
            color: "rgba(200,200,200,0.7)",
            marginBottom: 24,
          }}
        >
          +{gs.playXp} XP this play
        </div>
        <button
          style={{
            background: gs.touchdown ? "#b8860b" : "#3FAE5A",
            border: "none",
            color: "#fff",
            fontFamily: "monospace",
            fontWeight: "bold",
            fontSize: 14,
            padding: "12px 30px",
            borderRadius: 8,
            cursor: "pointer",
            letterSpacing: 1,
          }}
          onClick={onNextPlay}
          type="button"
          data-ocid="game.primary_button"
        >
          ▶ NEXT PLAY
        </button>
      </div>
    );
  }

  return null;
}

// ── Main GameCanvas component ─────────────────────────────────────────────────
const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(
  { gameStateRef, onScoreUpdate, onTackled },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeRenderer | null>(null);
  const rafRef = useRef(0);
  const prevTsRef = useRef(0);
  const tackleFired = useRef(false);
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // Input handlers
  const pressLeft = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.phase === "playing") inputLeft(gs);
  }, [gameStateRef]);
  const pressRight = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.phase === "playing") inputRight(gs);
  }, [gameStateRef]);
  const pressUp = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.phase === "playing") inputJump(gs);
  }, [gameStateRef]);
  const pressSpin = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.phase === "playing") inputSpin(gs);
  }, [gameStateRef]);
  const pressTurbo = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.phase === "playing") inputTurbo(gs);
  }, [gameStateRef]);
  const pressHurdle = useCallback(() => pressUp(), [pressUp]);

  useImperativeHandle(ref, () => ({
    pressLeft,
    pressRight,
    pressUp,
    pressSpin,
    pressTurbo,
    pressHurdle,
  }));

  const loop = useCallback(
    (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!rendererRef.current) return;

      const dt = Math.min(
        (prevTsRef.current === 0 ? 0 : ts - prevTsRef.current) / 1000,
        0.05,
      );
      prevTsRef.current = ts;

      const gs = gameStateRef.current;
      gs.frame += 1;

      if (gs.phase === "playing") {
        // ── MODULE PIPELINE ─────────────────────────────────
        updateMovement(gs, dt);
        tickSpawner(gs);
        detectCollisions(gs);
        // ────────────────────────────────────────────────────

        // Advance floating texts
        for (const ft of gs.floats) {
          ft.y -= 38 * dt;
          ft.life -= dt;
        }
        gs.floats = gs.floats.filter((f) => f.life > 0);

        // Tutorial timer
        if (gs.tutActive) {
          gs.tutTimer -= dt;
          if (gs.tutTimer <= 0) gs.tutActive = false;
        }

        onScoreUpdate(gs.score, gs.hp, gs.xp);
      } else if (gs.phase === "tackled") {
        gs.tackleTimer -= dt;
        if (!tackleFired.current) {
          tackleFired.current = true;
          onTackled(Math.floor(gs.playYards), gs.playXp, gs.playItems);
        }
        // Force re-render so the tackle overlay appears
        forceUpdate();
      }

      // Render 3D scene
      rendererRef.current?.update(gs, dt);
    },
    [gameStateRef, onScoreUpdate, onTackled, forceUpdate],
  );

  // Mount Three.js renderer on div
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const tr = new ThreeRenderer();
    tr.init(mount, CW, CH);
    rendererRef.current = tr;
    prevTsRef.current = 0;
    tackleFired.current = false;
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      tr.dispose();
      rendererRef.current = null;
    };
  }, [loop]);

  // Resize handler
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const obs = new ResizeObserver(() => {
      const rect = mount.getBoundingClientRect();
      rendererRef.current?.resize(rect.width, rect.height);
    });
    obs.observe(mount);
    return () => obs.disconnect();
  }, []);

  const gs = gameStateRef.current;

  const handleStart = useCallback(() => {
    const g = gameStateRef.current;
    if (g.phase === "idle") {
      g.phase = "playing";
    } else if (g.phase === "playing") {
      g.phase = "paused";
    } else if (g.phase === "paused") {
      g.phase = "playing";
    }
    forceUpdate();
  }, [gameStateRef, forceUpdate]);

  const handleNextPlay = useCallback(() => {
    const g = gameStateRef.current;
    if (g.phase === "tackled") {
      // Signal to parent that a new play should begin
      // The parent (App.tsx) owns "handleRestart / nextPlay" logic
      // We just bump the phase to idle so the START screen shows
      // and the parent's "onTackled" callback resets the game state.
      g.phase = "idle";
      tackleFired.current = false;
      forceUpdate();
    }
  }, [gameStateRef, forceUpdate]);

  return (
    <div
      data-ocid="game.canvas_target"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#02020f",
      }}
    >
      {/* Three.js mount */}
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {/* Phase screens */}
      <PhaseOverlay gs={gs} onStart={handleStart} onNextPlay={handleNextPlay} />

      {/* Hurt flash */}
      {gs.hurtFlash > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `rgba(198,58,58,${Math.min(0.55, gs.hurtFlash * 1.4).toFixed(2)})`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
});

export default GameCanvas;
