// Chord audio preview using the Web Audio API.
// Synthesizes a strummed chord from a ChordFingering (no audio assets needed).

import { ChordFingering } from "./types";

// Standard tuning open-string MIDI notes, low E to high E.
const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    sharedCtx = new Ctor();
  }
  // Resume if suspended (autoplay policies suspend until a user gesture).
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

export interface PlayChordOptions {
  capo?: number | null;
  strumSpeed?: number; // seconds between adjacent strings
  duration?: number; // seconds
}

// Play a chord as a slow downward strum across the strings.
export function playChord(
  fingering: ChordFingering,
  options: PlayChordOptions = {}
): void {
  const ctx = getCtx();
  if (!ctx) return;

  const capo = options.capo ?? 0;
  const strumSpeed = options.strumSpeed ?? 0.035;
  const duration = options.duration ?? 1.6;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Build the list of (stringIndex, midi) pairs, low -> high so the strum
  // sweeps downward (low strings first).
  const notes: { midi: number; stringIdx: number }[] = [];
  for (let i = 0; i < fingering.frets.length && i < OPEN_STRING_MIDI.length; i++) {
    const fret = fingering.frets[i];
    if (fret === -1) continue; // muted string
    const midi = OPEN_STRING_MIDI[i] + fret + capo;
    notes.push({ midi, stringIdx: i });
  }
  if (notes.length === 0) return;

  notes.forEach((note, idx) => {
    const start = now + idx * strumSpeed;
    const freq = midiToFreq(note.midi);

    // Two detuned oscillators for a richer, guitar-ish tone.
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "triangle";
    osc2.type = "sawtooth";
    osc1.frequency.value = freq;
    osc2.frequency.value = freq;
    osc2.detune.value = 6;

    const voiceGain = ctx.createGain();
    // Pluck-style envelope: fast attack, exponential decay.
    voiceGain.gain.setValueAtTime(0.0001, start);
    voiceGain.gain.exponentialRampToValueAtTime(0.18, start + 0.008);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    // A gentle low-pass to tame the sawtooth harshness.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(8000, freq * 6);
    filter.Q.value = 0.7;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(master);

    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + duration + 0.05);
    osc2.stop(start + duration + 0.05);
  });
}

// Some browsers require the AudioContext to be created/resumed inside a user
// gesture. Call this from a click handler to "unlock" audio on first use.
export function unlockAudio(): void {
  getCtx();
}
