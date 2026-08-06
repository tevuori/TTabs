"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getChordLibrary, getChordPositions } from "@/lib/chord-shapes";
import { ChordFingering } from "@/lib/types";
import ChordDiagram from "@/components/ChordDiagram";
import { playChord, unlockAudio } from "@/lib/audio";

export default function ChordsPage() {
  const router = useRouter();
  const library = useMemo(() => getChordLibrary(), []);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ root: string; suffix: string; display: string } | null>(null);

  // Filter the library by the search query (matches display name).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter(e => e.display.toLowerCase().includes(q));
  }, [library, query]);

  // Group filtered entries by root for display.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof library>();
    for (const e of filtered) {
      if (!map.has(e.root)) map.set(e.root, []);
      map.get(e.root)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const positions = useMemo(() => {
    if (!selected) return [];
    return getChordPositions(selected.root, selected.suffix);
  }, [selected]);

  const handlePlay = (fingering: ChordFingering) => {
    unlockAudio();
    playChord(fingering);
  };

  return (
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
            <button onClick={() => router.push("/chords")} className="px-3 py-1.5 text-sm font-medium text-text hover:text-accent transition-colors">Chords</button>
            <button onClick={() => router.push("/capo")} className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors">Capo</button>
            <button onClick={() => router.push("/setlists")} className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors">Setlists</button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-2">Chord Library</h1>
        <p className="text-text-muted text-sm mb-6">
          Browse every guitar chord in the database. Click a chord to see all voicings and hear it.
        </p>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search chords, e.g. Am, G7, maj9..."
            className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-bg-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Chord grid */}
          <div>
            {grouped.length === 0 ? (
              <p className="text-text-muted text-sm py-8 text-center">No chords match &quot;{query}&quot;.</p>
            ) : (
              <div className="space-y-6">
                {grouped.map(([root, entries]) => (
                  <div key={root}>
                    <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                      {root}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {entries.map(e => (
                        <button
                          key={`${e.root}-${e.suffix}`}
                          onClick={() => setSelected({ root: e.root, suffix: e.suffix, display: e.display })}
                          className={`px-3 py-1.5 rounded-lg font-mono text-sm font-medium transition-colors ${
                            selected?.root === e.root && selected?.suffix === e.suffix
                              ? "bg-accent text-white"
                              : "bg-bg-card border border-bg-border text-text-muted hover:text-text hover:border-accent/40"
                          }`}
                        >
                          {e.display}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="lg:sticky lg:top-4 self-start">
            {!selected ? (
              <div className="bg-bg-card border border-bg-border rounded-xl p-6 text-center">
                <p className="text-text-muted text-sm">Select a chord to see its voicings.</p>
              </div>
            ) : (
              <div className="bg-bg-card border border-bg-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-text font-bold text-lg font-mono">{selected.display}</h3>
                  <span className="text-text-dim text-xs">{positions.length} voicing{positions.length !== 1 ? "s" : ""}</span>
                </div>
                {positions.length === 0 ? (
                  <p className="text-text-muted text-sm">No voicings available.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
                    {positions.map((fingering, i) => (
                      <div key={i} className="group relative bg-bg-hover rounded-lg p-2 flex flex-col items-center">
                        <ChordDiagram chordName={selected.display} fingering={fingering} size="medium" />
                        <span className="text-text-dim text-xs mt-1">Voicing {i + 1}</span>
                        <button
                          onClick={() => handlePlay(fingering)}
                          className="mt-1 w-7 h-7 flex items-center justify-center bg-bg-card hover:bg-accent hover:text-white text-text-muted rounded-full transition-colors"
                          title={`Play ${selected.display}`}
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
                            <path d="M2 1L10 5.5L2 10V1Z" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
