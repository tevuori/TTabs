"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { findCapoSolutions, BEGINNER_CHORDS } from "@/lib/chords";
import { AuthGuard } from "@/components/AuthGuard";

export default function CapoCalculatorPage() {
  const router = useRouter();
  const [songChordsInput, setSongChordsInput] = useState("");
  const [knownChordsInput, setKnownChordsInput] = useState(
    BEGINNER_CHORDS.join(", ")
  );
  const [maxCapo, setMaxCapo] = useState(7);

  const songChords = useMemo(() => {
    return songChordsInput
      .split(/[,\s]+/)
      .map(c => c.trim())
      .filter(Boolean);
  }, [songChordsInput]);

  const knownChords = useMemo(() => {
    return knownChordsInput
      .split(/[,\s]+/)
      .map(c => c.trim())
      .filter(Boolean);
  }, [knownChordsInput]);

  const solutions = useMemo(
    () => findCapoSolutions(songChords, knownChords, maxCapo),
    [songChords, knownChords, maxCapo]
  );

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-bg-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M5 3V15M9 3V15M13 3V15M3 6H15M3 10H15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-xl font-bold text-text">TTabs</span>
          </div>
          <nav className="flex items-center gap-1">
            <button onClick={() => router.push("/")} className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors">Search</button>
            <button onClick={() => router.push("/library")} className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors">Library</button>
            <button onClick={() => router.push("/chords")} className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors">Chords</button>
            <button onClick={() => router.push("/capo")} className="px-3 py-1.5 text-sm font-medium text-text hover:text-accent transition-colors">Capo</button>
            <button onClick={() => router.push("/setlists")} className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors">Setlists</button>
            <button onClick={() => router.push("/settings")} className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors">Settings</button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-2">Capo Calculator</h1>
        <p className="text-text-muted text-sm mb-6">
          Find the best capo position so you can play a song using chord shapes you already know.
        </p>

        {/* Inputs */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              Song chords
            </label>
            <input
              type="text"
              value={songChordsInput}
              onChange={e => setSongChordsInput(e.target.value)}
              placeholder="e.g. Bb, F, Gm, Eb"
              className="w-full px-4 py-2.5 bg-bg-card border border-bg-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              Chords you know
            </label>
            <input
              type="text"
              value={knownChordsInput}
              onChange={e => setKnownChordsInput(e.target.value)}
              placeholder="e.g. G, C, D, Em, Am"
              className="w-full px-4 py-2.5 bg-bg-card border border-bg-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm"
            />
            <p className="text-text-dim text-xs mt-1.5">
              Pre-filled with common beginner open chords. Edit to match your own vocabulary.
            </p>
          </div>

          <div>
            <label className="block text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              Max capo fret: <span className="text-text font-mono">{maxCapo}</span>
            </label>
            <input
              type="range"
              min={1}
              max={9}
              value={maxCapo}
              onChange={e => setMaxCapo(parseInt(e.target.value, 10))}
              className="w-full accent-accent"
            />
          </div>
        </div>

        {/* Results */}
        {songChords.length === 0 ? (
          <div className="text-center py-12 text-text-muted text-sm">
            Enter the song&apos;s chords above to see capo options.
          </div>
        ) : solutions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted text-sm mb-2">No capo position covers any of these chords.</p>
            <p className="text-text-dim text-xs">Try adding more chords to your &quot;chords you know&quot; list.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wider">
              {solutions.length} option{solutions.length > 1 ? "s" : ""}
            </h2>
            {solutions.map(sol => {
              const fullMatch = sol.matched === sol.total;
              return (
                <div
                  key={sol.capo}
                  className={`bg-bg-card border rounded-xl p-4 ${
                    fullMatch ? "border-accent/40" : "border-bg-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-text font-semibold">Capo fret {sol.capo}</span>
                      {fullMatch && (
                        <span className="px-2 py-0.5 bg-accent/15 text-accent text-xs rounded-md font-medium">
                          Full match
                        </span>
                      )}
                    </div>
                    <span className="text-text-muted text-xs">
                      {sol.matched}/{sol.total} chords
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(sol.shapes).map(([song, shape]) => (
                      <div
                        key={song}
                        className="flex items-center gap-1.5 bg-bg-hover rounded-lg px-2.5 py-1.5"
                      >
                        <span className="text-text-muted font-mono text-sm">{song}</span>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-dim">
                          <path d="M4 3L8 6L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-accent font-mono text-sm font-semibold">{shape}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </main>
      </div>
    </AuthGuard>
  );
}
