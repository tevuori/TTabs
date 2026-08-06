"use client";

import { useMemo } from "react";
import { getFretboardNotes } from "@/lib/chords";

interface FretboardProps {
  chordName: string;
  maxFret?: number;
}

// A full-fretboard visualization showing all chord-tone positions for a chord.
// Roots are highlighted in accent color; other chord tones are lighter.
// Useful for finding voicings up the neck and understanding CAGED shapes.
export default function Fretboard({ chordName, maxFret = 12 }: FretboardProps) {
  const notes = useMemo(() => getFretboardNotes(chordName, maxFret), [chordName, maxFret]);

  // Layout
  const numStrings = 6;
  const numFrets = maxFret;
  const fretGap = 26;
  const stringGap = 20;
  const marginLeft = 24;
  const marginTop = 20;
  const w = marginLeft + numFrets * fretGap + 8;
  const h = marginTop + (numStrings - 1) * stringGap + 16;

  // String labels (low E to high E).
  const stringNames = ["E", "A", "D", "G", "B", "E"];

  // Group notes by string+fret for quick lookup.
  const noteMap = useMemo(() => {
    const map = new Map<string, (typeof notes)[number]>();
    for (const n of notes) {
      map.set(`${n.string}-${n.fret}`, n);
    }
    return map;
  }, [notes]);

  if (notes.length === 0) {
    return (
      <div className="text-text-muted text-xs text-center py-4">
        No fretboard data for {chordName}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="fretboard-viz">
        {/* Fret markers (single dots at 3, 5, 7, 9; double at 12) */}
        {[3, 5, 7, 9].map(f => (
          <circle
            key={`dot-${f}`}
            cx={marginLeft + (f - 0.5) * fretGap}
            cy={marginTop + 2.5 * stringGap}
            r={2.5}
            fill="#26262e"
          />
        ))}
        <circle cx={marginLeft + (12 - 0.5) * fretGap} cy={marginTop + 1.5 * stringGap} r={2.5} fill="#26262e" />
        <circle cx={marginLeft + (12 - 0.5) * fretGap} cy={marginTop + 3.5 * stringGap} r={2.5} fill="#26262e" />

        {/* Nut (thick line at fret 0) */}
        <rect x={marginLeft - 2} y={marginTop - stringGap / 2} width={3} height={(numStrings - 1) * stringGap + stringGap} fill="#e4e4e7" />

        {/* Fret lines */}
        {Array.from({ length: numFrets + 1 }).map((_, f) => (
          <line
            key={`fret-${f}`}
            x1={marginLeft + f * fretGap}
            y1={marginTop - stringGap / 2}
            x2={marginLeft + f * fretGap}
            y2={marginTop + (numStrings - 1) * stringGap + stringGap / 2}
            stroke="#26262e"
            strokeWidth={1}
          />
        ))}

        {/* String lines (low E thicker) */}
        {Array.from({ length: numStrings }).map((_, s) => (
          <g key={`string-${s}`}>
            <line
              x1={marginLeft}
              y1={marginTop + s * stringGap}
              x2={marginLeft + numFrets * fretGap}
              y2={marginTop + s * stringGap}
              stroke="#3a3a44"
              strokeWidth={s === 0 ? 2 : s === 5 ? 1.5 : 1}
            />
            {/* String name label */}
            <text
              x={marginLeft - 8}
              y={marginTop + s * stringGap + 3}
              textAnchor="middle"
              fill="#52525b"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              {stringNames[s]}
            </text>
          </g>
        ))}

        {/* Fret numbers */}
        {[3, 5, 7, 9, 12].map(f => (
          <text
            key={`fretnum-${f}`}
            x={marginLeft + (f - 0.5) * fretGap}
            y={h - 2}
            textAnchor="middle"
            fill="#52525b"
            fontSize={8}
            fontFamily="JetBrains Mono, monospace"
          >
            {f}
          </text>
        ))}

        {/* Chord-tone dots */}
        {notes.map((n, i) => {
          const x = marginLeft + (n.fret - 0.5) * fretGap;
          const y = marginTop + n.string * stringGap;
          return (
            <g key={`note-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={n.isRoot ? 7 : 5.5}
                fill={n.isRoot ? "#f97316" : "#27272a"}
                stroke={n.isRoot ? "#fb923c" : "#3f3f46"}
                strokeWidth={1}
              />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                fill={n.isRoot ? "#0a0a0b" : "#a1a1aa"}
                fontSize={n.isRoot ? 8 : 7}
                fontWeight={n.isRoot ? 700 : 500}
                fontFamily="JetBrains Mono, monospace"
              >
                {n.noteName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
