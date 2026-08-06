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
