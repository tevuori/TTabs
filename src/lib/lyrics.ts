// LRC parsing and alignment of synced lyrics to parsed tab lines.

import { ParsedLine } from "./types";

export interface LrcLine {
  time: number; // seconds (absolute, from start of song)
  text: string;
}

export interface LyricAlignment {
  // Index into the parsed lines array.
  lineIndex: number;
  // The LRC timestamp for this line.
  time: number;
}

// Parse an LRC blob into a sorted list of { time, text }.
// Handles `[mm:ss.xx]` and `[mm:ss]` timestamps. Skips metadata tags like
// `[ar:...]`, `[ti:...]`, `[length:...]`, etc.
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const raw of lrc.split("\n")) {
    timeRegex.lastIndex = 0;
    const matches = [...raw.matchAll(timeRegex)];
    if (matches.length === 0) continue;

    // The text is whatever follows the last timestamp on the line.
    const lastMatch = matches[matches.length - 1];
    const text = raw.slice(lastMatch.index! + lastMatch[0].length).trim();

    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
      const time = min * 60 + sec + ms / 1000;
      lines.push({ time, text });
    }
  }

  // Sort by time, then deduplicate (keep first occurrence of each time).
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

// Normalize text for fuzzy comparison: lowercase, collapse whitespace,
// strip punctuation and common filler words.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance on normalized strings.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// Similarity score in [0, 1] between two strings.
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  // Use the shorter string's length as the denominator so partial matches
  // (e.g. LRC line is a subset of the tab line) still score well.
  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

// Align LRC lines to parsed tab lines.
//
// Strategy: for each LRC line with non-empty text, find the best-matching
// "lyric" or "chord"-type ParsedLine (chord lines carry the lyric text in
// their non-chord segments). We enforce monotonic ordering — once a tab line
// is matched, subsequent LRC lines can only match later tab lines — which
// prevents the same lyric from matching multiple times across repeats.
//
// Returns a list of { lineIndex, time } sorted by time, one per matched LRC
// line. Unmatched LRC lines (instrumental gaps, spoken interludes) are
// skipped.
export function alignLyrics(
  lrcLines: LrcLine[],
  parsedLines: ParsedLine[]
): LyricAlignment[] {
  // Collect candidate tab lines (lyric or chord lines with text).
  const candidates: { index: number; text: string }[] = [];
  for (let i = 0; i < parsedLines.length; i++) {
    const line = parsedLines[i];
    if (line.type === "lyric") {
      if (line.text.trim()) candidates.push({ index: i, text: line.text });
    } else if (line.type === "chord") {
      // Reconstruct the lyric text from non-chord segments.
      const text = line.segments
        .map(seg => (seg.chord ? "" : seg.text))
        .join("")
        .trim();
      if (text) candidates.push({ index: i, text });
    }
  }

  if (candidates.length === 0) return [];

  const SIM_THRESHOLD = 0.45;
  const alignments: LyricAlignment[] = [];
  let searchStart = 0; // monotonic cursor into candidates

  for (const lrc of lrcLines) {
    if (!lrc.text.trim()) continue; // skip empty LRC lines

    let bestIdx = -1;
    let bestScore = SIM_THRESHOLD;
    let bestCandidateIdx = searchStart;

    for (let c = searchStart; c < candidates.length; c++) {
      const score = similarity(lrc.text, candidates[c].text);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = candidates[c].index;
        bestCandidateIdx = c;
      }
    }

    if (bestIdx >= 0) {
      alignments.push({ lineIndex: bestIdx, time: lrc.time });
      // Advance the cursor past this candidate so future LRC lines only
      // match later tab lines.
      searchStart = bestCandidateIdx + 1;
    }
  }

  return alignments;
}

// Given the alignment and a current playback time (seconds), return the index
// of the parsed line that should currently be highlighted/visible. Returns
// null if we're before the first aligned line.
export function lineAtTime(
  alignments: LyricAlignment[],
  time: number,
  offsetSec: number = 0
): number | null {
  const t = time - offsetSec;
  if (alignments.length === 0) return null;
  if (t < alignments[0].time) return null;

  // Binary search for the last alignment with time <= t.
  let lo = 0;
  let hi = alignments.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (alignments[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return alignments[lo].lineIndex;
}
