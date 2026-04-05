/**
 * GameCanvas.tsx v24 — 2D Canvas game view.
 * Uses pure Canvas2D renderer (no Three.js).
 * RAF loop is stable — stored in a ref, never recreated on re-render.
 */
import type React from "react";
import {
  forwardRef,
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
import Renderer2D, { type SpriteSet } from "../modules/renderer";
import { tickSpawner } from "../modules/spawner";
import { type GameState, STAGE_NAMES } from "../types/game";

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

// ── Phase overlay screens ─────────────────────────────────────────────────────────────────
function PhaseOverlay({
  gs,
  onStart,
  onNextPlay,
  tick,
}: {
  gs: GameState;
  onStart: () => void;
  onNextPlay: () => void;
  tick: number;
}) {
  void tick;

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
        style={{ ...overlay, background: "rgba(0,0,0,0.82)" }}
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
          TAP ◄ ► to change lanes · SPIN breaks defenders{"\n"}
          HURDLE jumps crates · TURBO for speed boost
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
        style={{ ...overlay, background: "rgba(0,0,0,0.72)" }}
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
    if (elapsed < 0.4) return null;
    return (
      <div
        style={{ ...overlay, background: "rgba(0,0,0,0.8)" }}
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

// ── Main GameCanvas ───────────────────────────────────────────────────────────────────
const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(
  { gameStateRef, onScoreUpdate, onTackled },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer2D | null>(null);
  const rafRef = useRef(0);
  const prevTsRef = useRef(0);
  const tackleFired = useRef(false);
  const [phaseTick, setPhaseTick] = useState(0);
  const phaseTickRef = useRef(0);

  const bumpPhaseTick = () => {
    phaseTickRef.current += 1;
    setPhaseTick(phaseTickRef.current);
  };

  // Stable RAF loop ref — never recreated
  const loopRef = useRef<(ts: number) => void>(() => {});

  loopRef.current = (ts: number) => {
    rafRef.current = requestAnimationFrame(loopRef.current);
    if (!rendererRef.current) return;

    const dt = Math.min(
      prevTsRef.current === 0 ? 0 : (ts - prevTsRef.current) / 1000,
      0.05,
    );
    prevTsRef.current = ts;

    const gs = gameStateRef.current;
    gs.elapsedTime = (gs.elapsedTime ?? 0) + dt;
    gs.frame += 1;

    if (gs.phase === "playing") {
      updateMovement(gs, dt);
      tickSpawner(gs);
      detectCollisions(gs);

      for (const ft of gs.floats) {
        ft.y -= 38 * dt;
        ft.life -= dt;
      }
      gs.floats = gs.floats.filter((f) => f.life > 0);

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
        bumpPhaseTick();
      }
    }

    rendererRef.current?.update(gs, dt);
  };

  // Mount renderer — runs ONCE
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const rect = mount.getBoundingClientRect();
    const w = Math.max(360, rect.width || 360);
    const h = Math.max(400, rect.height || 600);
    const r = new Renderer2D();
    r.init(mount, w, h);
    rendererRef.current = r;
    prevTsRef.current = 0;
    tackleFired.current = false;

    // Load user GIF sprites
    const loadImg = (src: string): HTMLImageElement => {
      const img = new Image();
      img.src = src;
      return img;
    };
    const sprites: SpriteSet = {
      run: loadImg(
        "/assets/3rd_person_low_angle_top_down_3d_runningback_ameri_custom-straight_forward_sprint_left_l_north-019d5fdc-fbd3-750c-a3ed-3ac454759bd6.gif",
      ),
      turbo: loadImg(
        "/assets/3rd_person_low_angle_top_down_3d_runningback_ameri_custom-sprinting_with_turbo_north_dir_north-019d5fdc-fbd0-721a-8d8a-d12d66e2ea3c.gif",
      ),
      spin: loadImg(
        "/assets/3rd_person_low_angle_top_down_3d_runningback_ameri_custom-start_out_sprinting_do_a_360_a_north-019d5fdc-fbd6-7380-b121-d45289383c21.gif",
      ),
    };
    r.sprites = sprites;

    rafRef.current = requestAnimationFrame((ts) => loopRef.current(ts));
    return () => {
      cancelAnimationFrame(rafRef.current);
      r.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize
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

  // Input
  useImperativeHandle(
    ref,
    () => ({
      pressLeft: () => {
        if (gameStateRef.current.phase === "playing")
          inputLeft(gameStateRef.current);
      },
      pressRight: () => {
        if (gameStateRef.current.phase === "playing")
          inputRight(gameStateRef.current);
      },
      pressUp: () => {
        if (gameStateRef.current.phase === "playing")
          inputJump(gameStateRef.current);
      },
      pressSpin: () => {
        if (gameStateRef.current.phase === "playing")
          inputSpin(gameStateRef.current);
      },
      pressTurbo: () => {
        if (gameStateRef.current.phase === "playing")
          inputTurbo(gameStateRef.current);
      },
      pressHurdle: () => {
        if (gameStateRef.current.phase === "playing")
          inputJump(gameStateRef.current);
      },
    }),
    [gameStateRef],
  );

  const gs = gameStateRef.current;

  const handleStart = () => {
    const g = gameStateRef.current;
    if (g.phase === "idle") g.phase = "playing";
    else if (g.phase === "playing") g.phase = "paused";
    else if (g.phase === "paused") g.phase = "playing";
    bumpPhaseTick();
  };

  const handleNextPlay = () => {
    const g = gameStateRef.current;
    if (g.phase === "tackled") {
      g.phase = "idle";
      tackleFired.current = false;
      bumpPhaseTick();
    }
  };

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
      <div
        ref={mountRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <PhaseOverlay
        gs={gs}
        onStart={handleStart}
        onNextPlay={handleNextPlay}
        tick={phaseTick}
      />
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
