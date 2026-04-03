/**
 * GameCanvas.tsx — the canvas component.
 * Owns the RAF loop. Calls modules in order each frame:
 *   movement → spawner → collision → renderer
 */
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
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
import { drawFrame } from "../modules/renderer";
import { tickSpawner } from "../modules/spawner";
import { CH, CW, type GameState } from "../types/game";

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
  canvasStyle?: React.CSSProperties;
}

const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(
  { gameStateRef, onScoreUpdate, onTackled, canvasStyle },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const prevTsRef = useRef(0);
  const tackleFired = useRef(false);

  // Input handlers — just call module functions
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
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dt = Math.min(
        (prevTsRef.current === 0 ? 0 : ts - prevTsRef.current) / 1000,
        0.05,
      );
      prevTsRef.current = ts;

      const gs = gameStateRef.current;
      gs.frame += 1;

      if (gs.phase === "playing") {
        // ── MODULE PIPELINE ──────────────────────────────────
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
        // fire callback once — this shows the play result screen, NOT game over
        if (!tackleFired.current) {
          tackleFired.current = true;
          onTackled(Math.floor(gs.playYards), gs.playXp, gs.playItems);
        }
      }

      drawFrame(ctx, gs);
    },
    [gameStateRef, onScoreUpdate, onTackled],
  );

  useEffect(() => {
    prevTsRef.current = 0;
    tackleFired.current = false;
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        ...canvasStyle,
      }}
    />
  );
});

export default GameCanvas;
