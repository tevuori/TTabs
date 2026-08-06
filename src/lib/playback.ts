// Song playback: walks the parsed chord lines of a song and strums each chord
// in sequence at a chosen tempo, using the Web Audio API. No audio assets.

import { ChordFingering, ParsedLine } from "./types";
import { getCtx, unlockAudio } from "./audio";

export interface PlaybackChord {
  // The fingering to strum (already resolved for transposition/capo).
  fingering: ChordFingering | null;
  // Display name, for the UI callback.
  name: string;
  // Index into the parsed lines (so the UI can highlight the current line).
  lineIndex: number;
}

export interface PlaybackOptions {
  bpm: number;
  beatsPerChord: number; // how many beats each chord lasts
  capo: number;
  // Called when a new chord starts (for highlighting).
  onChord?: (chord: PlaybackChord | null) => void;
  // Called when playback finishes or is stopped.
  onEnd?: () => void;
}

// Extract an ordered list of chords (with their line indices) from parsed lines.
// Only "chord" lines contribute; consecutive chords on the same line are played
// in order. Blank/section/lyric lines are skipped (they don't pause playback).
export function extractPlaybackChords(
  lines: ParsedLine[],
  resolveFingering: (chordName: string) => { name: string; fingerings: ChordFingering[] }
): PlaybackChord[] {
  const result: PlaybackChord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.type !== "chord") continue;
    for (const seg of line.segments) {
      if (!seg.chord) continue;
      const { name, fingerings } = resolveFingering(seg.chord);
      result.push({
        fingering: fingerings[0] || null,
        name,
        lineIndex: i,
      });
    }
  }
  return result;
}

// A self-contained playback controller. Call start() from a user gesture.
export class SongPlayer {
  private chords: PlaybackChord[];
  private options: PlaybackOptions;
  private running = false;
  private timers: number[] = [];
  private endTime = 0;

  constructor(chords: PlaybackChord[], options: PlaybackOptions) {
    this.chords = chords;
    this.options = options;
  }

  isRunning() {
    return this.running;
  }

  start() {
    const ctx = getCtx();
    if (!ctx || this.running) return;
    if (this.chords.length === 0) {
      this.options.onEnd?.();
      return;
    }
    unlockAudio();
    if (ctx.state === "suspended") void ctx.resume();

    this.running = true;
    const now = ctx.currentTime + 0.06;
    const secondsPerBeat = 60 / this.options.bpm;
    const chordDuration = secondsPerBeat * this.options.beatsPerChord;

    this.chords.forEach((chord, idx) => {
      const start = now + idx * chordDuration;
      if (chord.fingering) {
        this.scheduleStrum(chord.fingering, start, chordDuration);
      }
      // Visual callback timed to the audio clock.
      const delayMs = Math.max(0, (start - ctx.currentTime) * 1000);
      const t = window.setTimeout(() => {
        if (this.running) this.options.onChord?.(chord);
      }, delayMs);
      this.timers.push(t);
    });

    this.endTime = now + this.chords.length * chordDuration;
    const endDelay = Math.max(0, (this.endTime - ctx.currentTime) * 1000) + 100;
    const endT = window.setTimeout(() => {
      if (this.running) {
        this.running = false;
        this.options.onChord?.(null);
        this.options.onEnd?.();
      }
    }, endDelay);
    this.timers.push(endT);
  }

  stop() {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.options.onChord?.(null);
    this.options.onEnd?.();
  }

  private scheduleStrum(fingering: ChordFingering, start: number, duration: number) {
    const ctx = getCtx();
    if (!ctx) return;

    const capo = this.options.capo;
    const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
    const strumSpeed = 0.03;

    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    const notes: number[] = [];
    for (let i = 0; i < fingering.frets.length && i < OPEN_STRING_MIDI.length; i++) {
      const fret = fingering.frets[i];
      if (fret === -1) continue;
      notes.push(OPEN_STRING_MIDI[i] + fret + capo);
    }
    if (notes.length === 0) return;

    notes.forEach((midi, idx) => {
      const noteStart = start + idx * strumSpeed;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "triangle";
      osc2.type = "sawtooth";
      osc1.frequency.value = freq;
      osc2.frequency.value = freq;
      osc2.detune.value = 6;

      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.0001, noteStart);
      voiceGain.gain.exponentialRampToValueAtTime(0.14, noteStart + 0.008);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(8000, freq * 6);
      filter.Q.value = 0.7;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(master);

      osc1.start(noteStart);
      osc2.start(noteStart);
      osc1.stop(noteStart + duration + 0.05);
      osc2.stop(noteStart + duration + 0.05);
    });
  }
}
