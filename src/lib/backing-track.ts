// Synthesized backing track: plays the song's chord progression with
// toggleable chord pads, bass line, and drum patterns via the Web Audio API.
// No audio assets needed — everything is synthesized from oscillators + noise.
//
// Uses the same lookahead-scheduler pattern as the Metronome (25ms tick,
// 100ms schedule window) for tight, drift-free timing.

import { PlaybackChord } from "./playback";
import { ChordFingering } from "./types";
import { getCtx, unlockAudio } from "./audio";
import { parseChord } from "./chords";

export type BackingLayer = "chords" | "bass" | "drums";

export interface BackingTrackOptions {
  bpm: number;
  beatsPerChord: number; // how many beats each chord lasts
  capo: number;
  layers: Set<BackingLayer>; // which layers are active
  onChord?: (chord: PlaybackChord | null) => void; // for UI highlighting
  onEnd?: () => void;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_WINDOW = 0.1; // seconds

// Standard tuning open-string MIDI notes, low E to high E.
const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];

// Chromatic scale (sharps) for converting note names to MIDI.
const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_TO_SHARP: Record<string, string> = {
  "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
};

function noteToMidi(note: string, octave: number): number {
  let n = note;
  if (FLAT_TO_SHARP[n]) n = FLAT_TO_SHARP[n];
  const idx = SHARP_NOTES.indexOf(n);
  if (idx === -1) return -1;
  return idx + (octave + 1) * 12;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class BackingTrack {
  private chords: PlaybackChord[];
  private options: BackingTrackOptions;
  private running = false;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private currentBeat = 0; // global beat counter across the whole song
  private currentChordIdx = 0;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(chords: PlaybackChord[], options: BackingTrackOptions) {
    this.chords = chords;
    this.options = options;
  }

  setLayers(layers: Set<BackingLayer>) {
    this.options.layers = layers;
  }

  setBpm(bpm: number) {
    this.options.bpm = bpm;
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

    // Pre-render a white-noise buffer for snare/hihat synthesis.
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.running = true;
    this.currentBeat = 0;
    this.currentChordIdx = 0;
    this.nextNoteTime = ctx.currentTime + 0.06;
    this.scheduler();
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.options.onChord?.(null);
    this.options.onEnd?.();
  }

  private scheduler = () => {
    if (!this.running) return;
    const ctx = getCtx();
    if (!ctx) return;

    const secondsPerBeat = 60 / this.options.bpm;
    const chordDuration = secondsPerBeat * this.options.beatsPerChord;
    const totalBeats = this.chords.length * this.options.beatsPerChord;

    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_WINDOW) {
      if (this.currentBeat >= totalBeats) {
        // Song finished — schedule the end callback slightly after the last beat.
        const endDelay = Math.max(0, (this.nextNoteTime - ctx.currentTime) * 1000) + 50;
        this.timerId = window.setTimeout(() => {
          if (this.running) {
            this.running = false;
            this.options.onChord?.(null);
            this.options.onEnd?.();
          }
        }, endDelay);
        return;
      }

      const beatInSong = this.currentBeat;
      const chordIdx = Math.floor(beatInSong / this.options.beatsPerChord);
      const beatInChord = beatInSong % this.options.beatsPerChord;

      // Fire the chord-change callback when a new chord begins.
      if (beatInChord === 0 && chordIdx !== this.currentChordIdx) {
        this.currentChordIdx = chordIdx;
        const delayMs = Math.max(0, (this.nextNoteTime - ctx.currentTime) * 1000);
        const chord = this.chords[chordIdx];
        window.setTimeout(() => {
          if (this.running) this.options.onChord?.(chord);
        }, delayMs);
      } else if (beatInSong === 0) {
        // First chord — fire immediately.
        const delayMs = Math.max(0, (this.nextNoteTime - ctx.currentTime) * 1000);
        const chord = this.chords[0];
        window.setTimeout(() => {
          if (this.running) this.options.onChord?.(chord);
        }, delayMs);
      }

      this.scheduleBeat(chordIdx, beatInChord, this.nextNoteTime, chordDuration);
      this.nextNoteTime += secondsPerBeat;
      this.currentBeat++;
    }

    this.timerId = window.setTimeout(this.scheduler, LOOKAHEAD_MS);
  };

  private scheduleBeat(chordIdx: number, beatInChord: number, time: number, chordDuration: number) {
    const ctx = getCtx();
    if (!ctx) return;
    const chord = this.chords[chordIdx];

    // Chord pads: play on beat 0 of each chord, sustained for the full duration.
    if (beatInChord === 0 && this.options.layers.has("chords") && chord?.fingering) {
      this.scheduleChordPad(chord.fingering, time, chordDuration);
    }

    // Bass: play on beat 0, and on the middle beat if the chord is long enough.
    if (this.options.layers.has("bass") && chord) {
      if (beatInChord === 0) {
        this.scheduleBass(chord.name, time, Math.min(chordDuration, 0.9));
      } else if (this.options.beatsPerChord >= 4 && beatInChord === Math.floor(this.options.beatsPerChord / 2)) {
        this.scheduleBass(chord.name, time, Math.min(chordDuration * 0.5, 0.7));
      }
    }

    // Drums: 4/4 pattern. Beat 0 = beat 1 of the bar, etc.
    if (this.options.layers.has("drums")) {
      const beatInBar = beatInChord % 4;
      this.scheduleDrums(beatInBar, time);
    }
  }

  private scheduleChordPad(fingering: ChordFingering, start: number, duration: number) {
    const ctx = getCtx();
    if (!ctx) return;

    const capo = this.options.capo;
    const master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);

    const notes: number[] = [];
    for (let i = 0; i < fingering.frets.length && i < OPEN_STRING_MIDI.length; i++) {
      const fret = fingering.frets[i];
      if (fret === -1) continue;
      notes.push(OPEN_STRING_MIDI[i] + fret + capo);
    }
    if (notes.length === 0) return;

    notes.forEach(midi => {
      const freq = midiToFreq(midi);

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      // Pad envelope: soft attack (50ms), sustain, gentle release.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.05);
      gain.gain.setValueAtTime(0.18, start + duration - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(5000, freq * 4);
      filter.Q.value = 0.5;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(start);
      osc.stop(start + duration + 0.05);
    });
  }

  private scheduleBass(chordName: string, start: number, duration: number) {
    const ctx = getCtx();
    if (!ctx) return;

    // Extract the root note (or slash bass if present).
    const parsed = parseChord(chordName);
    const bassNote = parsed.bass || parsed.root;
    // Drop to octave 2 (MIDI 36-47 range).
    const midi = noteToMidi(bassNote, 2);
    if (midi < 0) return;
    const freq = midiToFreq(midi);

    const master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    // Add a sine sub-oscillator one octave below for depth.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq / 2;

    const gain = ctx.createGain();
    // Pluck envelope: fast attack, exponential decay.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.7;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    osc.start(start);
    sub.start(start);
    osc.stop(start + duration + 0.05);
    sub.stop(start + duration + 0.05);
  }

  private scheduleDrums(beatInBar: number, time: number) {
    const ctx = getCtx();
    if (!ctx) return;

    // Kick on beats 0 and 2 (1 and 3 in 1-indexed terms).
    if (beatInBar === 0 || beatInBar === 2) {
      this.scheduleKick(time);
    }
    // Snare on beats 1 and 3 (2 and 4 in 1-indexed terms).
    if (beatInBar === 1 || beatInBar === 3) {
      this.scheduleSnare(time);
    }
    // Hihat on every beat (and the off-beat — handled by the 8th-note caller).
    this.scheduleHihat(time, beatInBar === 0 ? 0.12 : 0.08);
    // Off-beat hihat (halfway between beats).
    const secondsPerBeat = 60 / this.options.bpm;
    this.scheduleHihat(time + secondsPerBeat / 2, 0.06);
  }

  private scheduleKick(time: number) {
    const ctx = getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    // Pitch drop from 120Hz to 40Hz.
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.4, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  private scheduleSnare(time: number) {
    const ctx = getCtx();
    if (!ctx || !this.noiseBuffer) return;

    // Noise burst through a bandpass filter.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = 1.5;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.25, time + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(time);
    noise.stop(time + 0.15);

    // Tonal body: triangle wave at 180Hz.
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 180;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, time);
    oscGain.gain.exponentialRampToValueAtTime(0.12, time + 0.005);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.1);
  }

  private scheduleHihat(time: number, volume: number) {
    const ctx = getCtx();
    if (!ctx || !this.noiseBuffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = 2;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 8000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(time);
    noise.stop(time + 0.05);
  }
}
