"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Metronome } from "@/lib/metronome";

// A floating metronome widget — available on every page via the root layout.
// Collapsed: a small circular button in the bottom-right corner.
// Expanded: a panel with BPM, time signature, start/stop, and a beat indicator.
export default function MetronomeWidget() {
  const [open, setOpen] = useState(false);
  const [bpm, setBpm] = useState(90);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [running, setRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState(-1);

  const metronomeRef = useRef<Metronome | null>(null);

  // Lazily create the Metronome instance, keeping its callbacks in sync.
  useEffect(() => {
    const m = new Metronome({
      bpm,
      beatsPerBar,
      onBeat: (i) => setActiveBeat(i),
    });
    metronomeRef.current = m;
    return () => m.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the engine in sync with the controls.
  useEffect(() => {
    metronomeRef.current?.setBpm(bpm);
  }, [bpm]);
  useEffect(() => {
    metronomeRef.current?.setBeatsPerBar(beatsPerBar);
  }, [beatsPerBar]);

  const toggleRun = useCallback(() => {
    const m = metronomeRef.current;
    if (!m) return;
    if (running) {
      m.stop();
      setRunning(false);
      setActiveBeat(-1);
    } else {
      m.start();
      setRunning(true);
    }
  }, [running]);

  // Stop when the widget is closed.
  useEffect(() => {
    if (!open && running) {
      metronomeRef.current?.stop();
      setRunning(false);
      setActiveBeat(-1);
    }
  }, [open, running]);

  const adjustBpm = (delta: number) => {
    setBpm(b => Math.min(240, Math.max(40, b + delta)));
  };

  return (
    <div className="fixed bottom-4 right-3 sm:right-4 z-50 print:hidden">
      {open ? (
        <div className="bg-bg-card border border-bg-border rounded-2xl shadow-2xl p-4 w-60 sm:w-64 fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-text font-semibold text-sm">Metronome</span>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text rounded transition-colors"
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Beat indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-4 h-6">
            {Array.from({ length: beatsPerBar }).map((_, i) => (
              <span
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  running && activeBeat === i
                    ? i === 0
                      ? "bg-accent"
                      : "bg-text"
                    : "bg-bg-border"
                }`}
              />
            ))}
          </div>

          {/* BPM display + controls */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => adjustBpm(-5)}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text text-xs font-bold transition-colors"
              title="-5 BPM"
            >
              −5
            </button>
            <button
              onClick={() => adjustBpm(-1)}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors"
              title="-1 BPM"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M3 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <div className="text-center">
              <div className="text-text font-mono font-bold text-2xl leading-none">{bpm}</div>
              <div className="text-text-dim text-[10px] uppercase tracking-wider">BPM</div>
            </div>
            <button
              onClick={() => adjustBpm(1)}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors"
              title="+1 BPM"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 3V7M3 5H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => adjustBpm(5)}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text text-xs font-bold transition-colors"
              title="+5 BPM"
            >
              +5
            </button>
          </div>

          {/* BPM slider */}
          <input
            type="range"
            min={40}
            max={240}
            value={bpm}
            onChange={e => setBpm(parseInt(e.target.value, 10))}
            className="w-full accent-accent mb-3"
          />

          {/* Time signature */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-muted text-xs">Time signature</span>
            <div className="flex items-center gap-1">
              {[2, 3, 4, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setBeatsPerBar(n)}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-medium transition-colors ${
                    beatsPerBar === n
                      ? "bg-accent text-white"
                      : "bg-bg-hover text-text-muted hover:text-text"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Start/stop */}
          <button
            onClick={toggleRun}
            className={`w-full py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
              running
                ? "bg-bg-hover text-text border border-bg-border hover:bg-bg-border"
                : "bg-accent hover:bg-accent-hover text-white"
            }`}
          >
            {running ? (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="2" width="3" height="8" rx="1" />
                  <rect x="7" y="2" width="3" height="8" rx="1" />
                </svg>
                Stop
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 1L11 6L2 11V1Z" />
                </svg>
                Start
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`w-12 h-12 flex items-center justify-center rounded-full shadow-2xl transition-colors ${
            running ? "bg-accent text-white" : "bg-bg-card border border-bg-border text-text-muted hover:text-text"
          }`}
          title="Metronome"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M9 2L13 2L17 18H5L9 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M7 11L15 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="11" cy="8" r="1.2" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}
