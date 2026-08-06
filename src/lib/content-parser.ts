// Parse UG tab content into renderable line structures
// UG format: [ch]G[/ch] for chords, [tab]...[/tab] for tab sections, \r\n for line breaks

import { ParsedLine, ChordSegment } from "./types";

export function parseTabContent(content: string): ParsedLine[] {
  // Remove [tab] and [/tab] markers
  let cleaned = content.replace(/\[\/?tab\]/g, "");
  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = cleaned.split("\n");
  const result: ParsedLine[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      result.push({ type: "blank" });
      continue;
    }

    // Check if it's a section label like [Verse], [Chorus], etc.
    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      result.push({ type: "section", label: sectionMatch[1] });
      continue;
    }

    // Check if line has chords — a line with only chords (no lyrics) or chords inline
    const hasChords = line.includes("[ch]");
    if (hasChords) {
      const segments = parseChordLine(line);
      result.push({ type: "chord", segments });
    } else {
      // Could be a lyric line or a tab line (numbers with dashes)
      result.push({ type: "lyric", text: line });
    }
  }

  return result;
}

// Parse a line containing [ch]...[/ch] markup into chord segments
function parseChordLine(line: string): ChordSegment[] {
  const segments: ChordSegment[] = [];
  // Match [ch]CHORD[/ch] or text between chords
  const regex = /\[ch\]([^\]]+)\[\/ch\]|([^\[]+)/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match[1] !== undefined) {
      // This is a chord
      segments.push({ chord: match[1], text: "" });
    } else if (match[2] !== undefined && match[2] !== "") {
      // This is text between chords (could be spaces or lyrics)
      segments.push({ chord: null, text: match[2] });
    }
  }

  // If no segments were created, return the raw line
  if (segments.length === 0) {
    segments.push({ chord: null, text: line });
  }

  return segments;
}

// Transpose parsed content — returns new chord names for each segment
export function getTransposedChords(
  lines: ParsedLine[],
  transposition: number,
  transposeFn: (chord: string) => string
): Map<string, string> {
  // Collect all unique chords from the content
  const chordSet = new Set<string>();
  for (const line of lines) {
    if (line.type === "chord") {
      for (const seg of line.segments) {
        if (seg.chord) chordSet.add(seg.chord);
      }
    }
  }

  // Map original -> transposed
  const map = new Map<string, string>();
  for (const chord of chordSet) {
    map.set(chord, transposeFn(chord));
  }
  return map;
}
