"use client";

/**
 * Sound cues, synthesised rather than loaded.
 *
 * There are no audio assets yet, and the same reasoning applies as to the
 * character art: build the mechanism now on stand-ins, so that swapping in
 * real sound is a change to one file. These are a few oscillator notes — a
 * blip, a chime, a buzz — which is enough to tell whether cues fire at the
 * right moments, which is the part that is actually hard to get right.
 *
 * Nothing is created until a cue is first played, because a browser will not
 * let a page open an AudioContext before the person has interacted with it.
 */

type Cue = "turn" | "star" | "crisis" | "pass" | "fail" | "ending";

/** Frequencies in Hz and lengths in seconds. Stand-ins, deliberately plain. */
const CUES: Record<Cue, { notes: number[]; length: number; type: OscillatorType }> = {
  turn: { notes: [523], length: 0.09, type: "sine" },
  star: { notes: [784, 1047], length: 0.1, type: "sine" },
  crisis: { notes: [147, 139], length: 0.3, type: "sawtooth" },
  pass: { notes: [659, 880], length: 0.12, type: "triangle" },
  fail: { notes: [330, 220], length: 0.18, type: "square" },
  ending: { notes: [523, 659, 784], length: 0.2, type: "sine" },
};

const MUTED_KEY = "pilot-season:muted";

let context: AudioContext | null = null;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    // Storage refused. Sound on is the friendlier default to fall back to.
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Not remembering the preference is a smaller failure than crashing on it.
  }
}

export function playCue(cue: Cue): void {
  if (isMuted()) return;

  try {
    context ??= new AudioContext();
    // A context created before the first gesture starts suspended; asking it
    // to resume is harmless when it is already running.
    void context.resume();

    const { notes, length, type } = CUES[cue];
    notes.forEach((frequency, i) => {
      const at = context!.currentTime + i * length * 0.8;
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;
      // A short fade out, so a square wave does not end on a click.
      gain.gain.setValueAtTime(0.06, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);

      oscillator.connect(gain).connect(context!.destination);
      oscillator.start(at);
      oscillator.stop(at + length);
    });
  } catch {
    // No Web Audio, or the browser refused. A silent game is still a game.
  }
}
