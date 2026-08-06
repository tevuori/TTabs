"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { SongTab, ChordFingering, ParsedLine, SongState } from "@/lib/types";
import { parseTabContent } from "@/lib/content-parser";
import { transposeChord, shouldUseFlats, detectKey } from "@/lib/chords";
import { getChordFingerings, getChordShapes } from "@/lib/chord-shapes";
import { saveSong, saveSongState, getSongState, deleteSongState } from "@/lib/storage";
import ChordToken from "./ChordToken";
import ChordDiagram from "./ChordDiagram";
import TransposeControls from "./TransposeControls";

interface SongViewerProps {
  song: SongTab;
  isSaved: boolean;
  onSaveToggle: () => void;
}

export default function SongViewer({ song, isSaved, onSaveToggle }: SongViewerProps) {
  const [transposition, setTransposition] = useState(0);
  const [chordOverrides, setChordOverrides] = useState<Record<string, number>>({});
  const [capoOverride, setCapoOverride] = useState<number | null>(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [showAllChords, setShowAllChords] = useState(true);

  // Load saved state on mount
  useEffect(() => {
    if (song.id) {
      getSongState(song.id).then(state => {
        if (state) {
          setTransposition(state.transposition || 0);
          setChordOverrides(state.chordOverrides || {});
          setCapoOverride(state.capoOverride ?? null);
        }
        setStateLoaded(true);
      });
    } else {
      setStateLoaded(true);
    }
  }, [song.id]);

  // Auto-save state when it changes (after initial load)
  useEffect(() => {
    if (!stateLoaded || !song.id) return;
    const state: SongState = {
      transposition,
      chordOverrides,
      capoOverride,
      updatedAt: Date.now(),
    };
    saveSongState(song.id, state);
  }, [transposition, chordOverrides, capoOverride, stateLoaded, song.id]);

  // Parse the tab content
  const parsedLines = useMemo(() => parseTabContent(song.content), [song.content]);

  // Determine the effective key (with transposition)
  const useFlats = shouldUseFlats(song.key);
  const transposedKey = useMemo(() => {
    if (!song.key) return null;
    // Transpose the key note
    const keyMatch = song.key.match(/^([A-G])(#|b)?(m?)$/);
    if (!keyMatch) return song.key;
    const [, letter, accidental, minor] = keyMatch;
    const note = letter + (accidental || "");
    const transposed = transposeChord(note, transposition, useFlats);
    return transposed + (minor || "");
  }, [song.key, transposition, useFlats]);

  // Transpose function for current context
  const transposeFn = useCallback(
    (chord: string) => transposeChord(chord, transposition, useFlats),
    [transposition, useFlats]
  );

  // Get the display name for a chord (with transposition applied)
  const getDisplayChord = useCallback(
    (originalChord: string) => {
      if (transposition === 0) return originalChord;
      return transposeFn(originalChord);
    },
    [transposition, transposeFn]
  );

  // Get fingerings for a chord (considering transposition and overrides)
  const getChordWithFingerings = useCallback(
    (originalChord: string): { displayName: string; fingerings: ChordFingering[]; selectedIndex: number } => {
      const displayName = getDisplayChord(originalChord);

      // Get fingerings: use UG applicature for non-transposed, chords-db for transposed
      let fingerings: ChordFingering[];
      if (transposition === 0 && song.applicature[originalChord]) {
        fingerings = getChordFingerings(originalChord, song.applicature);
      } else {
        fingerings = getChordShapes(displayName);
        // If chords-db doesn't have it, try UG applicature as fallback
        if (fingerings.length === 0 && song.applicature[originalChord]) {
          fingerings = song.applicature[originalChord];
        }
      }

      const selectedIndex = chordOverrides[originalChord] || 0;
      return { displayName, fingerings, selectedIndex };
    },
    [transposition, song.applicature, chordOverrides, getDisplayChord]
  );

  // Handle chord alternative selection
  const handleChordSelect = useCallback((originalChord: string, index: number) => {
    setChordOverrides(prev => ({ ...prev, [originalChord]: index }));
  }, []);

  // Reset transposition and chord overrides
  const handleReset = useCallback(() => {
    setTransposition(0);
    setChordOverrides({});
    setCapoOverride(null);
  }, []);

  // Save state explicitly (also saves the song)
  const handleSaveState = useCallback(async () => {
    if (song.id) {
      await saveSong({ ...song, transposition, chordOverrides, capoOverride });
      await saveSongState(song.id, {
        transposition,
        chordOverrides,
        capoOverride,
        updatedAt: Date.now(),
      });
      onSaveToggle();
    }
  }, [song, transposition, chordOverrides, capoOverride, onSaveToggle]);

  // Clear saved state
  const handleClearState = useCallback(async () => {
    if (song.id) {
      await deleteSongState(song.id);
      setTransposition(0);
      setChordOverrides({});
      setCapoOverride(null);
    }
  }, [song.id]);

  // Unique chords for the chord summary section
  const uniqueChords = useMemo(() => {
    const set = new Set<string>();
    for (const line of parsedLines) {
      if (line.type === "chord") {
        for (const seg of line.segments) {
          if (seg.chord) set.add(seg.chord);
        }
      }
    }
    return Array.from(set);
  }, [parsedLines]);

  const effectiveCapo = capoOverride !== null ? capoOverride : song.capo;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-text truncate">{song.songName}</h1>
            <p className="text-text-muted text-lg truncate">{song.artistName}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSaveState}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                isSaved
                  ? "bg-bg-hover text-text-muted border border-bg-border"
                  : "bg-accent hover:bg-accent-hover text-white"
              }`}
            >
              {isSaved ? "Update Saved" : "Save Song"}
            </button>
            <a
              href={song.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-lg text-text-muted text-sm transition-colors"
              title="Open original"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 2H4C2.9 2 2 2.9 2 4V12C2 13.1 2.9 14 4 14H12C13.1 14 14 13.1 14 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M9 2H14V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 2L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>

        {/* Key, capo, tuning info */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {song.key && (
            <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
              <span className="text-text-dim">Key: </span>
              <span className="text-text font-mono font-semibold">{song.key}</span>
              {transposedKey && transposedKey !== song.key && (
                <>
                  <span className="text-text-dim mx-1">→</span>
                  <span className="text-accent font-mono font-semibold">{transposedKey}</span>
                </>
              )}
            </div>
          )}
          <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
            <span className="text-text-dim">Capo: </span>
            <span className="text-text font-mono font-semibold">
              {effectiveCapo !== null ? `Fret ${effectiveCapo}` : "None"}
            </span>
          </div>
          {song.tuning && (
            <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
              <span className="text-text-dim">Tuning: </span>
              <span className="text-text-muted font-mono text-xs">{song.tuning}</span>
            </div>
          )}
          <div className="px-3 py-1 bg-bg-card border border-bg-border rounded-lg text-sm">
            <span className="text-text-dim">Type: </span>
            <span className="text-text-muted capitalize">{song.type}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <TransposeControls
            transposition={transposition}
            onTranspose={setTransposition}
            onReset={handleReset}
            currentKey={song.key}
            transposedKey={transposedKey}
          />

          {/* Capo override */}
          <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-xl p-2">
            <span className="text-text-muted text-xs font-medium px-2">Capo</span>
            <button
              onClick={() => setCapoOverride(Math.max(0, (capoOverride ?? song.capo ?? 0) - 1))}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors text-sm"
            >
              −
            </button>
            <span className="text-text font-mono font-semibold text-sm min-w-[30px] text-center">
              {capoOverride ?? song.capo ?? 0}
            </span>
            <button
              onClick={() => setCapoOverride((capoOverride ?? song.capo ?? 0) + 1)}
              className="w-8 h-8 flex items-center justify-center bg-bg-hover hover:bg-bg-border rounded-lg text-text transition-colors text-sm"
            >
              +
            </button>
          </div>

          <button
            onClick={() => setShowAllChords(!showAllChords)}
            className="px-3 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
          >
            {showAllChords ? "Hide" : "Show"} Chords
          </button>

          {(transposition !== 0 || Object.keys(chordOverrides).length > 0 || capoOverride !== null) && (
            <button
              onClick={handleClearState}
              className="px-3 py-2 text-text-muted hover:text-accent text-sm transition-colors"
            >
              Clear Changes
            </button>
          )}
        </div>
      </div>

      {/* Chord summary — all unique chords with diagrams */}
      {showAllChords && uniqueChords.length > 0 && (
        <div className="mb-6 bg-bg-card border border-bg-border rounded-xl p-4">
          <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-3">
            Chords Used ({uniqueChords.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {uniqueChords.map(originalChord => {
              const { displayName, fingerings, selectedIndex } = getChordWithFingerings(originalChord);
              const fingering = fingerings[selectedIndex] || fingerings[0];
              return (
                <div key={originalChord} className="bg-bg-hover rounded-lg p-1">
                  {fingering ? (
                    <ChordDiagram chordName={displayName} fingering={fingering} size="small" />
                  ) : (
                    <div className="w-[70px] h-[80px] flex flex-col items-center justify-center">
                      <span className="text-accent font-mono font-semibold text-sm">{displayName}</span>
                      <span className="text-text-dim text-xs mt-1">no diagram</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-6 overflow-x-auto">
        <div className="tab-content text-sm">
          {parsedLines.map((line, lineIdx) => renderLine(line, lineIdx, getChordWithFingerings, handleChordSelect))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between text-xs text-text-dim">
        <span>
          Provider: <span className="text-text-muted capitalize">{song.provider}</span>
        </span>
        {song.rating > 0 && (
          <span>
            Rating: <span className="text-text-muted">{song.rating.toFixed(1)}/5</span>
          </span>
        )}
      </div>
    </div>
  );
}

// Render a single parsed line
function renderLine(
  line: ParsedLine,
  lineIdx: number,
  getChordWithFingerings: (chord: string) => { displayName: string; fingerings: ChordFingering[]; selectedIndex: number },
  handleChordSelect: (chord: string, index: number) => void
): React.ReactNode {
  switch (line.type) {
    case "blank":
      return <div key={lineIdx} className="h-4" />;

    case "section":
      return (
        <div key={lineIdx} className="text-accent font-semibold text-sm mt-4 mb-1">
          {line.label}
        </div>
      );

    case "lyric":
      return (
        <div key={lineIdx} className="text-text">
          {line.text}
        </div>
      );

    case "chord":
      return (
        <div key={lineIdx} className="chord-line">
          {line.segments.map((seg, segIdx) => {
            if (seg.chord) {
              const { displayName, fingerings, selectedIndex } = getChordWithFingerings(seg.chord);
              return (
                <ChordToken
                  key={segIdx}
                  chordName={displayName}
                  fingerings={fingerings}
                  selectedIndex={selectedIndex}
                  onSelectIndex={(i) => handleChordSelect(seg.chord!, i)}
                />
              );
            }
            return (
              <span key={segIdx} className="text-text">
                {seg.text}
              </span>
            );
          })}
        </div>
      );

    default:
      return null;
  }
}
