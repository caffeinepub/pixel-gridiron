/**
 * GameCanvas.tsx v31 — 2D Canvas game view.
 * v31: Player GIF sprites rendered as real DOM <img> elements (positioned absolutely
 *      over the canvas) so the browser animates them natively every frame.
 *      Canvas handles field, obstacles, HUD, shadow, and spin arc only.
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
import Renderer2D from "../modules/renderer";
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

// GIF asset paths (served from /public/assets/)
const GIF_RUN =
  "/assets/3rd_person_low_angle_top_down_3d_runningback_ameri_custom-straight_forward_sprint_left_l_north-019d5fdc-fbd3-750c-a3ed-3ac454759bd6.gif";
const GIF_TURBO =
  "/assets/3rd_person_low_angle_top_down_3d_runningback_ameri_custom-sprinting_with_turbo_north_dir_north-019d5fdc-fbd0-721a-8d8a-d12d66e2ea3c.gif";
const GIF_SPIN =
  "/assets/3rd_person_low_angle_top_down_3d_runningback_ameri_custom-start_out_sprinting_do_a_360_a_north-019d5fdc-fbd6-7380-b121-d45289383c21.gif";

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

  // DOM refs for the animated GIF sprite elements
  const imgRunRef = useRef<HTMLImageElement>(null);
  const imgTurboRef = useRef<HTMLImageElement>(null);
  const imgSpinRef = useRef<HTMLImageElement>(null);
  // Track whether each GIF has loaded
  const gifLoadedRef = useRef({ run: false, turbo: false, spin: false });

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

    // ── Sync GIF img overlay position to canvas player pos ──────────────────
    const renderer = rendererRef.current;
    if (renderer && mountRef.current) {
      const pos = renderer.lastPlayerPos;
      const containerW = mountRef.current.offsetWidth;
      const containerH = mountRef.current.offsetHeight;
      const canvasW = renderer.W;
      const canvasH = renderer.H;

      // Scale from canvas pixels to container CSS pixels
      const scaleX = canvasW > 0 ? containerW / canvasW : 1;
      const scaleY = canvasH > 0 ? containerH / canvasH : 1;

      const cssX = pos.x * scaleX;
      const cssY = pos.y * scaleY;
      const cssSize = pos.size * scaleY;

      // GIF display size: 2x the player size slot, centered on cssX/cssY
      const gifH = cssSize * 2.2;
      const gifW = gifH; // treat as square; browser preserves aspect ratio

      const left = cssX - gifW * 0.5;
      const top = cssY - gifH * 0.92; // feet near bottom of GIF image

      // Decide which GIF is active
      const showSpin = gs.spinning && gifLoadedRef.current.spin;
      const showTurbo =
        gs.turboActive && !gs.spinning && gifLoadedRef.current.turbo;
      const showRun = !showSpin && !showTurbo && gifLoadedRef.current.run;

      // Hide all first, then show the active one
      const baseStyle = {
        position: "absolute" as const,
        width: `${gifW}px`,
        height: `${gifH}px`,
        left: `${left}px`,
        top: `${top}px`,
        imageRendering: "pixelated" as const,
        pointerEvents: "none" as const,
        objectFit: "contain" as const,
      };

      // Only show during playing phase
      const visible = gs.phase === "playing";

      if (imgRunRef.current) {
        Object.assign(imgRunRef.current.style, {
          ...baseStyle,
          display: visible && showRun ? "block" : "none",
        });
      }
      if (imgTurboRef.current) {
        Object.assign(imgTurboRef.current.style, {
          ...baseStyle,
          display: visible && showTurbo ? "block" : "none",
        });
      }
      if (imgSpinRef.current) {
        Object.assign(imgSpinRef.current.style, {
          ...baseStyle,
          display: visible && showSpin ? "block" : "none",
        });
      }
    }
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
    // GIF sprites are DOM img elements — disable canvas fallback
    r.useCanvasFallback = false;
    rendererRef.current = r;
    prevTsRef.current = 0;
    tackleFired.current = false;
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

  // GIF load handlers — when loaded, disable canvas fallback entirely
  const handleGifLoad = (key: "run" | "turbo" | "spin") => {
    gifLoadedRef.current[key] = true;
    // At least run GIF loaded — fully disable canvas fallback
    if (rendererRef.current) {
      rendererRef.current.useCanvasFallback = false;
    }
  };

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
      {/* Canvas mount — renderer writes here */}
      <div
        ref={mountRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      {/*
        Animated GIF overlay sprites.
        These are real <img> elements so the browser plays them as full GIFs.
        Positioned absolutely and synced to canvas player coords every RAF frame.
        Initial display:none — the loop reveals the correct one each frame.
      */}
      <img
        ref={imgRunRef}
        src={GIF_RUN}
        alt=""
        aria-hidden="true"
        onLoad={() => handleGifLoad("run")}
        style={{ display: "none", position: "absolute", pointerEvents: "none" }}
      />
      <img
        ref={imgTurboRef}
        src={GIF_TURBO}
        alt=""
        aria-hidden="true"
        onLoad={() => handleGifLoad("turbo")}
        style={{ display: "none", position: "absolute", pointerEvents: "none" }}
      />
      <img
        ref={imgSpinRef}
        src={GIF_SPIN}
        alt=""
        aria-hidden="true"
        onLoad={() => handleGifLoad("spin")}
        style={{ display: "none", position: "absolute", pointerEvents: "none" }}
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
