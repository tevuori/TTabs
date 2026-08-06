// Metronome engine using the Web Audio API.
// Schedules click samples ahead of time for rock-solid timing.

import { unlockAudio, getCtx } from "./audio";

export interface MetronomeOptions {
  bpm: number;
  beatsPerBar: number;
  onBeat?: (beatIndex: number) => void;
}

// A lookahead scheduler: every tick, schedule any clicks that fall within
// the next SCHEDULE_WINDOW seconds. This is the standard Web Audio pattern
// for sample-accurate timing that stays stable even if the main thread is busy.
const LOOKAHEAD_MS = 25; // how often we re-check
const SCHEDULE_WINDOW = 0.1; // schedule clicks up to this far ahead (seconds)

export class Metronome {
  private bpm: number;
  private beatsPerBar: number;
  private onBeat?: (beatIndex: number) => void;

  private running = false;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private currentBeat = 0; // 0-indexed within the bar

  constructor(options: MetronomeOptions) {
    this.bpm = options.bpm;
    this.beatsPerBar = options.beatsPerBar;
    this.onBeat = options.onBeat;
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  setBeatsPerBar(beats: number) {
    this.beatsPerBar = beats;
  }

  isRunning() {
    return this.running;
  }

  start() {
    const ctx = getCtx();
    if (!ctx || this.running) return;
    unlockAudio();
    if (ctx.state === "suspended") void ctx.resume();

    this.running = true;
    this.currentBeat = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.scheduler();
  }

  stop() {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scheduler = () => {
    if (!this.running) return;
    const ctx = getCtx();
    if (!ctx) return;

    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_WINDOW) {
      this.scheduleClick(this.currentBeat, this.nextNoteTime);
      // Advance to the next beat.
      const secondsPerBeat = 60 / this.bpm;
      this.nextNoteTime += secondsPerBeat;
      this.currentBeat = (this.currentBeat + 1) % this.beatsPerBar;
    }

    this.timerId = window.setTimeout(this.scheduler, LOOKAHEAD_MS);
  };

  private scheduleClick(beatIndex: number, time: number) {
    const ctx = getCtx();
    if (!ctx) return;

    const isDownbeat = beatIndex === 0;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Downbeat: higher pitch & louder. Off-beats: lower & softer.
    osc.frequency.value = isDownbeat ? 1500 : 900;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.5 : 0.3, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);

    // Fire the visual callback at the right time using the audio clock.
    if (this.onBeat) {
      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
      window.setTimeout(() => this.onBeat?.(beatIndex), delayMs);
    }
  }
}
