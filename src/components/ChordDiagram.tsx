"use client";

import { ChordFingering } from "@/lib/types";

interface ChordDiagramProps {
  chordName: string;
  fingering: ChordFingering;
  size?: "small" | "medium" | "large";
}

// Render an SVG chord diagram showing fret positions and finger numbers
export default function ChordDiagram({ chordName, fingering, size = "medium" }: ChordDiagramProps) {
  const dims = {
    small: { w: 70, h: 80, stringGap: 10, fretGap: 12, dotR: 3.5, fontSize: 8 },
    medium: { w: 90, h: 105, stringGap: 13, fretGap: 16, dotR: 4.5, fontSize: 10 },
    large: { w: 120, h: 140, stringGap: 17, fretGap: 21, dotR: 6, fontSize: 12 },
  }[size];

  const { w, h, stringGap, fretGap, dotR, fontSize } = dims;

  const numStrings = 6;
  const numFrets = 5;
  const marginLeft = 18;
  const marginTop = 16;

  const frets = fingering.frets; // low E to high E
  const fingers = fingering.fingers;
  const baseFret = fingering.baseFret || 1;

  // Determine which strings are muted (x) or open (o)
  const stringStates = frets.map(f => (f === -1 ? "muted" : f === 0 ? "open" : "pressed"));

  return (
    <div className="chord-diagram fade-in">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* Chord name */}
        <text
          x={w / 2}
          y={10}
          textAnchor="middle"
          fill="#f97316"
          fontSize={fontSize + 2}
          fontWeight="600"
          fontFamily="JetBrains Mono, monospace"
        >
          {chordName}
        </text>

        {/* Base fret label (if not starting at nut) */}
        {baseFret > 1 && (
          <text
            x={w - 4}
            y={marginTop + fretGap}
            textAnchor="end"
            fill="#71717a"
            fontSize={fontSize - 1}
            fontFamily="JetBrains Mono, monospace"
          >
            {baseFret}fr
          </text>
        )}

        {/* Open/muted string indicators */}
        {stringStates.map((state, i) => {
          const x = marginLeft + i * stringGap;
          if (state === "open") {
            return (
              <circle
                key={`ind-${i}`}
                cx={x}
                cy={marginTop - 4}
                r={3}
                fill="none"
                stroke="#52525b"
                strokeWidth={1}
              />
            );
          } else if (state === "muted") {
            return (
              <text
                key={`ind-${i}`}
                x={x}
                y={marginTop - 2}
                textAnchor="middle"
                fill="#52525b"
                fontSize={fontSize}
                fontFamily="JetBrains Mono, monospace"
              >
                ×
              </text>
            );
          }
          return null;
        })}

        {/* Nut (thick line at top if base fret is 1) */}
        {baseFret === 1 && (
          <rect
            x={marginLeft - stringGap / 2}
            y={marginTop}
            width={stringGap * (numStrings - 1) + stringGap}
            height={2.5}
            fill="#e4e4e7"
          />
        )}

        {/* Fret lines */}
        {Array.from({ length: numFrets + 1 }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={marginLeft - stringGap / 2}
            y1={marginTop + i * fretGap}
            x2={marginLeft + (numStrings - 1) * stringGap + stringGap / 2}
            y2={marginTop + i * fretGap}
            stroke="#26262e"
            strokeWidth={1}
          />
        ))}

        {/* String lines */}
        {Array.from({ length: numStrings }).map((_, i) => (
          <line
            key={`string-${i}`}
            x1={marginLeft + i * stringGap}
            y1={marginTop}
            x2={marginLeft + i * stringGap}
            y2={marginTop + numFrets * fretGap}
            stroke="#3a3a44"
            strokeWidth={1}
          />
        ))}

        {/* Barre */}
        {fingering.barres?.map((barre, bi) => {
          const barreFretIdx = barre.fret - baseFret;
          if (barreFretIdx < 0 || barreFretIdx >= numFrets) return null;
          const y = marginTop + barreFretIdx * fretGap + fretGap / 2;
          const x1 = marginLeft + barre.fromString * stringGap;
          const x2 = marginLeft + barre.toString * stringGap;
          return (
            <rect
              key={`barre-${bi}`}
              x={x1 - dotR}
              y={y - dotR}
              width={x2 - x1 + dotR * 2}
              height={dotR * 2}
              rx={dotR}
              fill="#f97316"
              opacity={0.85}
            />
          );
        })}

        {/* Finger dots */}
        {frets.map((fret, i) => {
          if (fret <= 0) return null;
          const fretIdx = fret - baseFret;
          if (fretIdx < 0 || fretIdx >= numFrets) return null;

          const x = marginLeft + i * stringGap;
          const y = marginTop + fretIdx * fretGap + fretGap / 2;
          const finger = fingers[i] || 0;

          // Check if this dot is covered by a barre — if so, skip individual dot
          const isBarred = fingering.barres?.some(
            b => b.fret === fret && i >= b.fromString && i <= b.toString
          );

          if (isBarred) return null;

          return (
            <g key={`dot-${i}`}>
              <circle cx={x} cy={y} r={dotR} fill="#f97316" />
              {finger > 0 && (
                <text
                  x={x}
                  y={y + dotR * 0.35}
                  textAnchor="middle"
                  fill="#0a0a0b"
                  fontSize={dotR * 1.1}
                  fontWeight="700"
                  fontFamily="Inter, sans-serif"
                >
                  {finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
