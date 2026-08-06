// Chord transposition and parsing engine

// Chromatic scale using sharps and flats
const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "Eb", "E", "F", "Gb", "Ab", "A", "Bb", "B"];

// Keys that use flats
const FLAT_KEYS = ["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"];
// Keys that use sharps
const SHARP_KEYS = ["G", "D", "A", "E", "B", "F#", "Em", "Bm", "F#m", "C#m", "G#m", "D#m"];

export interface ParsedChord {
  root: string; // e.g. "C#", "Bb"
  quality: string; // e.g. "m", "maj7", "sus4", ""
  bass: string | null; // bass note for slash chords, e.g. "/G"
  raw: string;
}

// Parse a chord string into root, quality, and bass note
export function parseChord(chord: string): ParsedChord {
  // Match: root (A-G with # or b), then quality, then optional /bass
  const match = chord.match(/^([A-G])(#|b)?(.*)$/);
  if (!match) {
    return { root: chord, quality: "", bass: null, raw: chord };
  }
  const [, letter, accidental, rest] = match;
  const root = letter + (accidental || "");
  // Check for slash bass
  const slashIdx = rest.indexOf("/");
  if (slashIdx >= 0) {
    const quality = rest.slice(0, slashIdx);
    const bassPart = rest.slice(slashIdx + 1);
    const bassMatch = bassPart.match(/^([A-G])(#|b)?/);
    const bass = bassMatch ? bassMatch[1] + (bassMatch[2] || "") : bassPart;
    return { root, quality, bass, raw: chord };
  }
  return { root, quality: rest, bass: null, raw: chord };
}

// Get note index in chromatic scale (0-11)
function noteIndex(note: string): number {
  const normalized = note.charAt(0).toUpperCase() + note.slice(1);
  let idx = SHARP_NOTES.indexOf(normalized);
  if (idx === -1) {
    idx = FLAT_NOTES.indexOf(normalized);
  }
  if (idx === -1) {
    // Try lowercase accidental
    const lower = normalized.charAt(0) + (normalized.charAt(1) || "").toLowerCase();
    idx = SHARP_NOTES.indexOf(lower);
    if (idx === -1) idx = FLAT_NOTES.indexOf(lower);
  }
  return idx;
}

// Transpose a single note by semitones, using sharp or flat naming
export function transposeNote(note: string, semitones: number, useFlats: boolean): string {
  const idx = noteIndex(note);
  if (idx === -1) return note; // unknown note, return as-is
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return useFlats ? FLAT_NOTES[newIdx] : SHARP_NOTES[newIdx];
}

// Determine whether to use flats based on the target key
export function shouldUseFlats(key: string | null): boolean {
  if (!key) return false;
  if (FLAT_KEYS.some(k => key.startsWith(k))) return true;
  if (SHARP_KEYS.some(k => key.startsWith(k))) return false;
  return false;
}

// Transpose a full chord string
export function transposeChord(chord: string, semitones: number, useFlats: boolean): string {
  if (semitones === 0) return chord;
  const parsed = parseChord(chord);
  const newRoot = transposeNote(parsed.root, semitones, useFlats);
  const newBass = parsed.bass ? "/" + transposeNote(parsed.bass, semitones, useFlats) : "";
  return newRoot + parsed.quality + newBass;
}

// Detect the key from a list of chords
// Uses a simple heuristic: find the key whose scale best matches the chords
const MAJOR_SCALE_CHORDS: Record<string, string[]> = {
  // Key -> [I, ii, iii, IV, V, vi, vii°] chord qualities
};

// Major scale intervals (semitones from root): I, ii, iii, IV, V, vi, vii°
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
// Natural minor scale intervals: i, ii°, III, iv, v, VI, VII
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

export function detectKey(chords: string[]): string | null {
  if (chords.length === 0) return null;

  // Get unique chord roots (normalized to pitch classes)
  const roots = chords.map(c => {
    const p = parseChord(c);
    return { note: noteIndex(p.root), isMinor: p.quality.startsWith("m") && !p.quality.startsWith("maj") };
  }).filter(r => r.note !== -1);

  if (roots.length === 0) return null;

  // Count how many chords fit each major and minor key
  let bestKey: string | null = null;
  let bestScore = -1;

  for (let i = 0; i < 12; i++) {
    // Major key
    const majorScale = MAJOR_INTERVALS.map(interval => (i + interval) % 12);
    let majorScore = 0;
    for (const r of roots) {
      if (majorScale.includes(r.note)) {
        majorScore += 1;
        // Bonus if the chord quality matches expected (minor for ii, iii, vi)
        const scaleDegree = majorScale.indexOf(r.note);
        const expectedMinor = [1, 2, 5].includes(scaleDegree); // ii, iii, vi
        if (expectedMinor === r.isMinor) majorScore += 0.5;
      }
    }
    // Bonus if tonic (I) appears
    if (roots.some(r => r.note === i && !r.isMinor)) majorScore += 1;

    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestKey = SHARP_NOTES[i]; // Default to sharp, will refine
    }

    // Minor key
    const minorScale = MINOR_INTERVALS.map(interval => (i + interval) % 12);
    let minorScore = 0;
    for (const r of roots) {
      if (minorScale.includes(r.note)) {
        minorScore += 1;
        const scaleDegree = minorScale.indexOf(r.note);
        const expectedMinor = [0, 3, 4].includes(scaleDegree); // i, iv, v
        if (expectedMinor === r.isMinor) minorScore += 0.5;
      }
    }
    if (roots.some(r => r.note === i && r.isMinor)) minorScore += 1;

    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = SHARP_NOTES[i] + "m";
    }
  }

  // Refine sharp/flat naming — prefer sharps by default for guitar
  return bestKey;
}

// Get the note name for a key, preferring the standard naming
export function keyNoteName(key: string): string {
  return key;
}

// --- Fretboard visualization support ---

// Standard tuning note names per string (low E to high E), as pitch classes.
const STRING_ROOT_PC = [4, 9, 2, 7, 11, 4]; // E A D G B E (mod 12)

// Pitch-class -> note name (sharps).
const PC_TO_NAME = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Compute the chord tones (as pitch classes) for a chord name.
// Uses a simplified quality -> interval set map covering common qualities.
const QUALITY_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7], // major
  m: [0, 3, 7], // minor
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 2],
  m9: [0, 3, 7, 10, 2],
  add9: [0, 4, 7, 2],
  madd9: [0, 3, 7, 2],
  maj9: [0, 4, 7, 11, 2],
  m7b5: [0, 3, 6, 10],
  "11": [0, 4, 7, 10, 2, 5],
  "13": [0, 4, 7, 10, 2, 5, 9],
};

export interface FretboardNote {
  string: number; // 0 = low E, 5 = high E
  fret: number;
  noteName: string; // e.g. "G"
  pc: number; // pitch class 0-11
  isRoot: boolean;
  isChordTone: boolean;
}

// Compute all positions of a chord's tones across the fretboard (0-12 frets).
export function getFretboardNotes(
  chordName: string,
  maxFret: number = 12
): FretboardNote[] {
  const parsed = parseChord(chordName);
  const rootPc = noteIndex(parsed.root);
  if (rootPc === -1) return [];

  const intervals = QUALITY_INTERVALS[parsed.quality];
  if (!intervals) return []; // unknown quality — don't guess

  const chordPcs = new Set(intervals.map(i => (rootPc + i) % 12));
  const notes: FretboardNote[] = [];

  for (let string = 0; string < 6; string++) {
    const stringPc = STRING_ROOT_PC[string];
    for (let fret = 0; fret <= maxFret; fret++) {
      const pc = (stringPc + fret) % 12;
      if (chordPcs.has(pc)) {
        notes.push({
          string,
          fret,
          noteName: PC_TO_NAME[pc],
          pc,
          isRoot: pc === rootPc,
          isChordTone: true,
        });
      }
    }
  }
  return notes;
}

// Normalize a chord name for comparison: root (enharmonic-stable) + quality,
// ignoring slash bass notes. e.g. "G/B" -> "G", "Am7" -> "Am7", "Db" -> "C#".
const ENHARMONIC_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

export function normalizeChordName(chord: string): string {
  const parsed = parseChord(chord);
  const root = ENHARMONIC_TO_SHARP[parsed.root] || parsed.root;
  return root + parsed.quality;
}

// A common beginner open-chord vocabulary.
export const BEGINNER_CHORDS = [
  "G", "C", "D", "Em", "Am", "E", "A", "Dm",
  "G7", "C7", "D7", "A7", "E7",
];

// True if every chord in `songChords` is contained in `knownChords`
// (compared by normalized name so enharmonics/slash basses don't cause misses).
export function songUsesOnlyKnownChords(
  songChords: string[],
  knownChords: string[]
): boolean {
  if (songChords.length === 0) return false;
  const known = new Set(knownChords.map(normalizeChordName));
  return songChords.every(c => known.has(normalizeChordName(c)));
}

// Find capo positions that let you play `songChords` using only shapes from
// `knownChords`. Returns each viable capo fret with the shape you'd use for
// every song chord (i.e. the chord you finger, which sounds as the real chord
// once the capo is applied).
export interface CapoSolution {
  capo: number;
  // song chord -> the open shape you'd finger to sound it
  shapes: Record<string, string>;
  // how many of the song's chords are playable with this capo
  matched: number;
  total: number;
}

export function findCapoSolutions(
  songChords: string[],
  knownChords: string[],
  maxCapo: number = 7
): CapoSolution[] {
  if (songChords.length === 0 || knownChords.length === 0) return [];

  const uniqueSong = Array.from(new Set(songChords));
  const knownNotes = knownChords.map(c => {
    const p = parseChord(c);
    return { note: noteIndex(p.root), quality: p.quality, raw: c };
  });

  const solutions: CapoSolution[] = [];

  for (let capo = 0; capo <= maxCapo; capo++) {
    const shapes: Record<string, string> = {};
    let matched = 0;

    for (const songChord of uniqueSong) {
      const p = parseChord(songChord);
      const songNote = noteIndex(p.root);
      if (songNote === -1) continue;

      // To sound `songChord` with capo `capo`, you finger a shape whose
      // open pitch is `capo` semitones lower: shapeNote = songNote - capo.
      const shapeNote = ((songNote - capo) % 12 + 12) % 12;

      const known = knownNotes.find(
        k => k.note === shapeNote && k.quality === p.quality
      );
      if (known) {
        shapes[songChord] = known.raw;
        matched++;
      }
    }

    if (matched > 0) {
      solutions.push({ capo, shapes, matched, total: uniqueSong.length });
    }
  }

  // Best matches first (most chords covered), then lowest capo.
  solutions.sort((a, b) =>
    b.matched - a.matched || a.capo - b.capo
  );
  return solutions;
}
