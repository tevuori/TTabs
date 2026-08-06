// Core type definitions for TTabs

export type Provider = "ug" | "songsterr";

export interface SearchResult {
  provider: Provider;
  id: string;
  artistName: string;
  songName: string;
  type: string; // "chords", "tab", "ukulele", etc.
  version?: number;
  rating?: number;
  votes?: number;
  url: string;
  difficulty?: string;
}

export interface ChordFingering {
  frets: number[]; // 6 strings, low E to high E; -1 = muted, 0 = open
  fingers: number[]; // 6 strings, 0 = open, 1-4 = finger
  barres?: { fret: number; fromString: number; toString: number }[];
  baseFret: number; // the lowest fret shown in the diagram
}

export interface SongTab {
  id: string; // unique ID for storage
  provider: Provider;
  url: string;
  artistName: string;
  songName: string;
  type: string;
  version: number;
  rating: number;
  difficulty?: string;
  capo: number | null;
  tuning?: string;
  key: string | null; // detected or provided key
  content: string; // raw UG content with [ch]...[/ch] markup
  chords: string[]; // unique chord names used in the song
  applicature: Record<string, ChordFingering[]>; // UG-provided fingerings
  savedAt: number;
  // User-saved state
  transposition?: number;
  chordOverrides?: Record<string, number>; // chord name -> index into alternatives
  capoOverride?: number | null;
}

export interface SongState {
  transposition: number;
  chordOverrides: Record<string, number>;
  capoOverride: number | null;
  updatedAt: number;
}

// Parsed line types for rendering
export type ParsedLine =
  | { type: "chord"; segments: ChordSegment[] }
  | { type: "lyric"; text: string }
  | { type: "section"; label: string }
  | { type: "blank" };

export interface ChordSegment {
  chord: string | null;
  text: string;
}

export interface SongsterrResult {
  id: number;
  title: string;
  artist: { name: string; id: number };
  hasChords: boolean;
  url: string;
}
