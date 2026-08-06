// Chord shape/fingering lookup using @tombatossals/chords-db
// Provides alternative fingerings for any chord name

import { ChordFingering } from "./types";
import { parseChord, transposeChord, shouldUseFlats } from "./chords";

// Import the guitar chords database
import guitarChordsData from "@tombatossals/chords-db/lib/guitar.json";

interface DbPosition {
  frets: number[] | string; // chords-db uses number[] (e.g. [0,2,2,0,0,0])
  fingers: number[] | string;
  baseFret: number;
  barres: number[];
  midi?: number[];
}

interface DbChord {
  key: string;
  suffix: string;
  positions: DbPosition[];
}

const chordDbData = guitarChordsData as unknown as {
  chords: Record<string, DbChord[]>;
  suffixes: string[];
};

// Map note names to chords-db key names
const NOTE_TO_DB_KEY: Record<string, string> = {
  "C": "C",
  "C#": "Csharp",
  "Db": "Csharp", // chords-db doesn't have Db, use Csharp
  "D": "D",
  "D#": "Eb",
  "Eb": "Eb",
  "E": "E",
  "F": "F",
  "F#": "Fsharp",
  "Gb": "Fsharp",
  "G": "G",
  "G#": "Ab",
  "Ab": "Ab",
  "A": "A",
  "A#": "Bb",
  "Bb": "Bb",
  "B": "B",
};

// Map UG chord quality/suffix to chords-db suffix
const QUALITY_TO_DB_SUFFIX: Record<string, string> = {
  "": "major",
  "m": "minor",
  "maj7": "maj7",
  "m7": "m7",
  "7": "7",
  "sus2": "sus2",
  "sus4": "sus4",
  "7sus4": "7sus4",
  "dim": "dim",
  "dim7": "dim7",
  "aug": "aug",
  "6": "6",
  "m6": "m6",
  "9": "9",
  "m9": "m9",
  "add9": "add9",
  "madd9": "madd9",
  "maj9": "maj9",
  "maj11": "maj11",
  "maj13": "maj13",
  "mmaj7": "mmaj7",
  "m7b5": "m7b5",
  "11": "11",
  "13": "13",
  "7b9": "7b9",
  "7#9": "7#9",
  "69": "69",
  "m69": "m69",
  "aug7": "aug7",
  "aug9": "aug9",
  "9b5": "9b5",
  "7b5": "7b5",
};

// Chord shape cache
const chordShapeCache = new Map<string, ChordFingering[]>();

// Convert chords-db position format to our ChordFingering format
function convertPosition(pos: DbPosition): ChordFingering {
  // chords-db stores frets/fingers as arrays of numbers (e.g. [0,2,2,0,0,0])
  // Handle both array and string formats for robustness
  const rawFrets = Array.isArray(pos.frets) ? pos.frets : String(pos.frets).split("");
  const rawFingers = Array.isArray(pos.fingers) ? pos.fingers : String(pos.fingers).split("");

  const fretsArr = rawFrets.map(f => {
    if (typeof f === "number") return f;
    return f === "x" ? -1 : parseInt(f, 10);
  });
  const fingersArr = rawFingers.map(f => {
    if (typeof f === "number") return f;
    return f === "x" ? 0 : parseInt(f, 10);
  });

  const result: ChordFingering = {
    frets: fretsArr,
    fingers: fingersArr,
    baseFret: pos.baseFret || 1,
  };

  if (pos.barres && pos.barres.length > 0) {
    result.barres = pos.barres.map(barreFret => {
      const fromString = fretsArr.indexOf(barreFret);
      const toString = fretsArr.lastIndexOf(barreFret);
      return { fret: barreFret, fromString, toString };
    });
  }

  return result;
}

// Get all known fingerings for a chord name from the database
export function getChordShapes(chordName: string): ChordFingering[] {
  if (chordShapeCache.has(chordName)) {
    return chordShapeCache.get(chordName)!;
  }

  const parsed = parseChord(chordName);
  const dbKey = NOTE_TO_DB_KEY[parsed.root];

  let shapes: ChordFingering[] = [];

  if (dbKey && chordDbData.chords[dbKey]) {
    // Map quality to db suffix
    let dbSuffix = QUALITY_TO_DB_SUFFIX[parsed.quality];

    // Try to find the chord with the mapped suffix
    let match: DbChord | undefined;
    if (dbSuffix) {
      match = chordDbData.chords[dbKey].find(c => c.suffix === dbSuffix);
    }

    // If no exact match, try some fallbacks
    if (!match) {
      // Try matching the quality directly (some qualities might match db suffixes directly)
      match = chordDbData.chords[dbKey].find(c => c.suffix === parsed.quality);
    }
    if (!match && parsed.quality === "") {
      match = chordDbData.chords[dbKey].find(c => c.suffix === "major");
    }
    if (!match && parsed.quality === "m") {
      match = chordDbData.chords[dbKey].find(c => c.suffix === "minor");
    }

    if (match) {
      shapes = match.positions.map(convertPosition);
    } else {
      // Last resort: try major chord as fallback
      const major = chordDbData.chords[dbKey].find(c => c.suffix === "major");
      if (major) {
        shapes = major.positions.map(convertPosition);
      }
    }
  }

  // Sort by ease of playing (fewest frets pressed, lower frets first)
  shapes.sort((a, b) => {
    const aPressed = a.frets.filter(f => f > 0).length;
    const bPressed = b.frets.filter(f => f > 0).length;
    if (aPressed !== bPressed) return aPressed - bPressed;
    return a.baseFret - b.baseFret;
  });

  chordShapeCache.set(chordName, shapes);
  return shapes;
}

// Get fingerings for a chord, combining UG applicature data with chords-db
export function getChordFingerings(
  chordName: string,
  ugApplicature?: Record<string, ChordFingering[]>
): ChordFingering[] {
  // First check UG applicature (these are the original fingerings from the tab)
  if (ugApplicature && ugApplicature[chordName] && ugApplicature[chordName].length > 0) {
    return ugApplicature[chordName];
  }

  // Fall back to chords-db
  return getChordShapes(chordName);
}

// Get fingerings for a transposed chord
export function getTransposedChordFingerings(
  originalChord: string,
  semitones: number,
  key: string | null,
  ugApplicature?: Record<string, ChordFingering[]>
): { chordName: string; fingerings: ChordFingering[] } {
  const useFlats = shouldUseFlats(key);
  const transposedName = transposeChord(originalChord, semitones, useFlats);

  // For transposed chords, we don't use UG applicature (it's for original chords)
  // Use chords-db instead
  const fingerings = getChordShapes(transposedName);
  return { chordName: transposedName, fingerings };
}
