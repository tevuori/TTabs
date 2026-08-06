"use client";

import { useState, useRef, useEffect } from "react";
import { ChordFingering } from "@/lib/types";
import { playChord, unlockAudio } from "@/lib/audio";
import ChordDiagram from "./ChordDiagram";

interface ChordTokenProps {
  chordName: string;
  fingerings: ChordFingering[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onPlay?: (fingering: ChordFingering) => void;
  capo?: number | null;
}

// A clickable chord that shows a popover with chord diagram and alternative fingerings
export default function ChordToken({
  chordName,
  fingerings,
  selectedIndex,
  onSelectIndex,
  onPlay,
  capo,
}: ChordTokenProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const hasFingerings = fingerings.length > 0;
  const currentFingering = hasFingerings ? fingerings[selectedIndex] : null;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentFingering) return;
    unlockAudio();
    if (onPlay) {
      onPlay(currentFingering);
    } else {
      playChord(currentFingering, { capo: capo ?? 0 });
    }
  };

  return (
    <span ref={ref} className="relative inline-block">
      <span
        className="chord-token"
        onClick={() => setOpen(!open)}
        title={hasFingerings ? `${chordName} — click for alternatives` : chordName}
      >
        {chordName}
      </span>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 bg-bg-card border border-bg-border rounded-lg shadow-2xl p-3 slide-down"
          style={{ minWidth: "200px" }}
        >
          {/* Chord diagram + play button */}
          {currentFingering ? (
            <div className="flex justify-center mb-2 relative">
              <ChordDiagram chordName={chordName} fingering={currentFingering} size="medium" />
              <button
                onClick={handlePlay}
                className="absolute top-0 right-0 w-7 h-7 flex items-center justify-center bg-bg-hover hover:bg-accent hover:text-white text-text-muted rounded-full transition-colors"
                title={`Play ${chordName}`}
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
                  <path d="M2 1L10 5.5L2 10V1Z" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="text-text-muted text-sm text-center py-4">
              No fingering data available for {chordName}
            </div>
          )}

          {/* Alternative fingerings */}
          {hasFingerings && fingerings.length > 1 && (
            <div className="border-t border-bg-border pt-2 mt-1">
              <div className="text-text-muted text-xs mb-1.5 font-medium">
                Alternatives ({fingerings.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {fingerings.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onSelectIndex(i);
                    }}
                    className={`px-2 py-1 rounded text-xs font-mono font-medium ${
                      i === selectedIndex
                        ? "bg-accent text-white"
                        : "bg-bg-hover text-text-muted hover:bg-bg-border"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Close hint */}
          <div className="text-text-dim text-xs text-center mt-2">Click outside to close</div>
        </div>
      )}
    </span>
  );
}
