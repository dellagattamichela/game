"use client";

/**
 * The four skill tests.
 *
 * Each is a small, self-contained puzzle that reports pass or fail and nothing
 * else — the engine owns every consequence. Puzzles are generated from a seed
 * derived from the run and the scene, so once rooms exist every spectator can
 * watch the same puzzle the spotlight player is failing.
 *
 * All four are on-theme for an investigation rather than generic arcade filler:
 * holding a hand steady, remembering a code, scanning a manifest, and putting a
 * timeline in order. They are deliberately short — twenty seconds at most —
 * because five other people are watching.
 *
 * Styling is layout only; this is still a mechanic prototype.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mulberry32 } from "@/engine/rng";
import type { MinigameSpec, MinigameType } from "@/engine/types";

export type MinigameProps = {
  spec: MinigameSpec & { difficulty: number };
  /** Deterministic puzzle seed. */
  seed: number;
  onDone: (passed: boolean) => void;
};

const DEFAULT_PROMPTS: Record<MinigameType, string> = {
  timing: "Hold it steady.",
  memory: "Remember the code.",
  search: "Find the entries that do not belong.",
  order: "Put the night back in order.",
};

export function Minigame({ spec, seed, onDone }: MinigameProps) {
  const Game = { timing: Timing, memory: Memory, search: Search, order: Order }[spec.type];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm opacity-70">{spec.prompt ?? DEFAULT_PROMPTS[spec.type]}</p>
      <Game spec={spec} seed={seed} onDone={onDone} />
    </div>
  );
}

/** Fires `onDone` at most once, however many times a puzzle tries. */
function useSettle(onDone: (passed: boolean) => void) {
  const done = useRef(false);
  return useCallback(
    (passed: boolean) => {
      if (done.current) return;
      done.current = true;
      onDone(passed);
    },
    [onDone],
  );
}

// ---------------------------------------------------------------------------
// Timing — a marker sweeps a bar, stop it inside the zone
// ---------------------------------------------------------------------------

function Timing({ spec, seed, onDone }: MinigameProps) {
  const settle = useSettle(onDone);
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const dirRef = useRef(1);

  // Harder means a narrower target and a faster sweep.
  const zoneWidth = Math.max(7, 30 - spec.difficulty * 4);
  const zoneStart = useMemo(() => {
    const rand = mulberry32(seed);
    // Kept off both ends so the target is never trivially parked at an edge.
    return 15 + rand() * (70 - zoneWidth);
  }, [seed, zoneWidth]);
  const speed = 45 + spec.difficulty * 18;

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let next = posRef.current + dirRef.current * speed * dt;
      if (next >= 100) {
        next = 100;
        dirRef.current = -1;
      } else if (next <= 0) {
        next = 0;
        dirRef.current = 1;
      }
      posRef.current = next;
      setPos(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speed]);

  const stop = () => settle(posRef.current >= zoneStart && posRef.current <= zoneStart + zoneWidth);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-10 border">
        <div
          className="absolute inset-y-0 border-x bg-emerald-600/30"
          style={{ left: `${zoneStart}%`, width: `${zoneWidth}%` }}
        />
        <div className="absolute inset-y-0 w-1 bg-current" style={{ left: `${pos}%` }} />
      </div>
      <button type="button" className="self-start border-2 px-4 py-1 font-semibold" onClick={stop}>
        Stop
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory — a code is shown, then entered from memory
// ---------------------------------------------------------------------------

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

function Memory({ spec, seed, onDone }: MinigameProps) {
  const settle = useSettle(onDone);
  const length = 2 + spec.difficulty;
  const code = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length }, () => KEYPAD[Math.floor(rand() * KEYPAD.length)]);
  }, [seed, length]);

  const [showing, setShowing] = useState(true);
  const [entered, setEntered] = useState<string[]>([]);

  useEffect(() => {
    // Roughly a second per digit, so a longer code is harder to hold but not
    // unfairly brief to read.
    const timer = setTimeout(() => setShowing(false), 900 + length * 500);
    return () => clearTimeout(timer);
  }, [length]);

  const press = (digit: string) => {
    const next = [...entered, digit];
    if (digit !== code[next.length - 1]) return settle(false);
    if (next.length === code.length) return settle(true);
    setEntered(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 font-mono text-2xl">
        {code.map((digit, i) => (
          <span key={i} className="flex h-10 w-8 items-center justify-center border">
            {showing ? digit : entered[i] ? "•" : ""}
          </span>
        ))}
      </div>
      {showing ? (
        <p className="text-xs opacity-60">Memorising…</p>
      ) : (
        <div className="flex max-w-xs flex-wrap gap-1">
          {KEYPAD.map((digit) => (
            <button
              key={digit}
              type="button"
              className="h-10 w-10 border font-mono"
              onClick={() => press(digit)}
            >
              {digit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search — find the entries that do not belong, against a clock
// ---------------------------------------------------------------------------

function Search({ spec, seed, onDone }: MinigameProps) {
  const settle = useSettle(onDone);
  const size = 16 + spec.difficulty * 8;
  const targetCount = 1 + spec.difficulty;

  const { cells, targets } = useMemo(() => {
    const rand = mulberry32(seed);
    const picked = new Set<number>();
    while (picked.size < targetCount) picked.add(Math.floor(rand() * size));
    return {
      cells: Array.from({ length: size }, (_, i) => (picked.has(i) ? "8" : "B")),
      targets: picked,
    };
  }, [seed, size, targetCount]);

  const [found, setFound] = useState<Set<number>>(new Set());
  const [msLeft, setMsLeft] = useState(4000 + targetCount * 2200);

  useEffect(() => {
    const started = performance.now();
    const total = 4000 + targetCount * 2200;
    let frame = 0;
    const tick = () => {
      const left = total - (performance.now() - started);
      setMsLeft(left);
      if (left <= 0) return settle(false);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targetCount, settle]);

  const click = (i: number) => {
    // A wrong pick costs time rather than ending it: on a phone, a mis-tap
    // should not be the whole result.
    if (!targets.has(i)) return;
    const next = new Set(found).add(i);
    setFound(next);
    if (next.size === targets.size) settle(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs tabular-nums opacity-60">
        {found.size}/{targets.size} found · {Math.max(0, msLeft / 1000).toFixed(1)}s
      </p>
      <div className="flex max-w-md flex-wrap gap-1 font-mono">
        {cells.map((cell, i) => (
          <button
            key={i}
            type="button"
            className={`h-8 w-8 border ${found.has(i) ? "bg-emerald-600/40" : ""}`}
            onClick={() => click(i)}
          >
            {cell}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order — put the night's timestamps back in sequence
// ---------------------------------------------------------------------------

function Order({ spec, seed, onDone }: MinigameProps) {
  const settle = useSettle(onDone);
  const count = 2 + spec.difficulty;

  const { shuffled, correct } = useMemo(() => {
    const rand = mulberry32(seed);
    const minutes: number[] = [];
    let clock = 60 + Math.floor(rand() * 120);
    for (let i = 0; i < count; i++) {
      clock += 7 + Math.floor(rand() * 40);
      minutes.push(clock % (24 * 60));
    }
    const label = (m: number) =>
      `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const ordered = [...minutes].sort((a, b) => a - b).map(label);
    const deck = [...ordered];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { shuffled: deck, correct: ordered };
  }, [seed, count]);

  const [placed, setPlaced] = useState<string[]>([]);

  const place = (value: string) => {
    const next = [...placed, value];
    if (value !== correct[next.length - 1]) return settle(false);
    if (next.length === correct.length) return settle(true);
    setPlaced(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-60">Earliest first.</p>
      <div className="flex min-h-10 flex-wrap items-center gap-1 border border-dashed p-1 font-mono">
        {placed.length === 0 ? (
          <span className="px-2 text-xs opacity-40">nothing placed yet</span>
        ) : (
          placed.map((value) => (
            <span key={value} className="border px-2 py-1">
              {value}
            </span>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-1 font-mono">
        {shuffled
          .filter((value) => !placed.includes(value))
          .map((value) => (
            <button key={value} type="button" className="border px-2 py-1" onClick={() => place(value)}>
              {value}
            </button>
          ))}
      </div>
    </div>
  );
}
