// Optional, synthesised sound effects (no audio files). Muted by default; the browser only allows sound after a tap,
// so the context is created when a viewer turns sound on. Client only.

let context: AudioContext | null = null;

/** Turns sound on or off. Called from a tap, which is what lets the browser start audio. Always muted at the start of a draw. */
export function setSoundEnabled(on: boolean): void {
  if (on && !context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) context = new Ctor();
  }
  if (on) void context?.resume();
}

function tone(frequency: number, start: number, length: number, volume: number, type: OscillatorType = "sine") {
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  const at = context.currentTime + start;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

export type Cue = "reveal" | "place" | "seed" | "done";

export function playCue(cue: Cue, enabled: boolean): void {
  if (!enabled || !context) return;
  if (cue === "reveal") {
    tone(392, 0, 0.18, 0.05, "triangle");
  } else if (cue === "place") {
    tone(523.25, 0, 0.16, 0.06, "triangle");
    tone(783.99, 0.06, 0.22, 0.04, "sine");
  } else if (cue === "seed") {
    tone(261.63, 0, 0.5, 0.06, "triangle");
    tone(392, 0.08, 0.5, 0.05, "triangle");
    tone(523.25, 0.16, 0.6, 0.05, "sine");
  } else {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.7, 0.06, "triangle"));
  }
}
