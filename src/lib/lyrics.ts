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

// Align LRC lines to parsed tab lines using Dynamic Time Warping (DP).
//
// The previous greedy approach used a strict monotonic cursor — once a tab
// line was matched, it could never be matched again. This caused problems
// with repeated sections (e.g. a chorus that appears twice): if lines in
// between failed to match, the cursor wouldn't advance, and subsequent LRC
// lines would jump ahead to match later tab lines, skipping entire verses.
//
// The DP approach finds the globally optimal alignment by considering all
// possible paths through the LRC×candidate matrix. It allows:
//   - Match: LRC line matches a candidate, both advance (normal case)
//   - Repeat: LRC line matches the current candidate again, LRC advances
//     only (for repeated sections where the tab has lyrics once)
//   - Skip LRC: LRC line doesn't match anything, LRC advances only
//     (instrumental gaps, spoken interludes)
//   - Skip candidate: tab line not in the LRC, candidate advances only
//
// After alignment, gaps are filled by interpolating line indices so the
// scroll moves smoothly through unmatched sections instead of jumping.
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

  // Filter to non-empty LRC lines (keep track of original time).
  const lrcItems = lrcLines.filter(l => l.text.trim());
  if (lrcItems.length === 0) return [];

  const n = lrcItems.length;
  const m = candidates.length;
  const SIM_THRESHOLD = 0.45;
  const SKIP_PENALTY = -0.1;   // penalty for skipping a line (LRC or candidate)
  const REPEAT_FACTOR = 0.5;   // repeat matches score lower than first-time matches
  const NEG_INF = -1e9;

  // Build similarity matrix.
  const sim: number[][] = [];
  for (let i = 0; i < n; i++) {
    sim[i] = [];
    for (let j = 0; j < m; j++) {
      sim[i][j] = similarity(lrcItems[i].text, candidates[j].text);
    }
  }

  // DP table: dp[i][j] = best score aligning lrcItems[0..i-1] with
  // candidates[0..j-1].
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(NEG_INF)
  );
  // Back pointers: 0 = match, 1 = repeat/skip-lrc, 2 = skip-candidate
  const back: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(-1)
  );

  dp[0][0] = 0;
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] + SKIP_PENALTY;
    back[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] + SKIP_PENALTY;
    back[i][0] = 1;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sim[i - 1][j - 1];
      const isMatch = s > SIM_THRESHOLD;

      // Option 0: Match — from (i-1, j-1), advance both.
      if (isMatch) {
        const score = dp[i - 1][j - 1] + s;
        if (score > dp[i][j]) {
          dp[i][j] = score;
          back[i][j] = 0;
        }
      }

      // Option 1: Repeat or skip LRC — from (i-1, j), advance LRC only.
      // If the LRC line matches the current candidate, it's a repeat
      // (same tab line sung again). Otherwise it's a skip.
      {
        const score = dp[i - 1][j] + (isMatch ? s * REPEAT_FACTOR : SKIP_PENALTY);
        if (score > dp[i][j]) {
          dp[i][j] = score;
          back[i][j] = 1;
        }
      }

      // Option 2: Skip candidate — from (i, j-1), advance candidate only.
      {
        const score = dp[i][j - 1] + SKIP_PENALTY;
        if (score > dp[i][j]) {
          dp[i][j] = score;
          back[i][j] = 2;
        }
      }
    }
  }

  // Find the best endpoint: max dp[n][j] for any j.
  let bestJ = 0;
  let bestScore = dp[n][0];
  for (let j = 1; j <= m; j++) {
    if (dp[n][j] > bestScore) {
      bestScore = dp[n][j];
      bestJ = j;
    }
  }

  // Traceback to extract matched pairs.
  const matches: { lrcIdx: number; candIdx: number }[] = [];
  let i = n, j = bestJ;
  while (i > 0 || j > 0) {
    const transition = back[i][j];
    if (transition === 0) {
      // Match: LRC i-1 → candidate j-1
      matches.push({ lrcIdx: i - 1, candIdx: j - 1 });
      i--; j--;
    } else if (transition === 1) {
      // Repeat or skip LRC
      if (j > 0 && sim[i - 1][j - 1] > SIM_THRESHOLD) {
        // Repeat: LRC i-1 → candidate j-1 (again)
        matches.push({ lrcIdx: i - 1, candIdx: j - 1 });
      }
      i--;
    } else if (transition === 2) {
      // Skip candidate
      j--;
    }
  }
  matches.reverse();

  // Convert to LyricAlignment[].
  const alignments: LyricAlignment[] = matches.map(m => ({
    lineIndex: candidates[m.candIdx].index,
    time: lrcItems[m.lrcIdx].time,
  }));

  // Fill gaps: between consecutive alignments, if there are skipped tab
  // lines, interpolate their times so the scroll moves smoothly instead
  // of jumping over entire sections.
  return fillGaps(alignments);
}

// Fill gaps in the alignment by interpolating line indices between
// consecutive matched alignments. This ensures the scroll moves through
// all tab lines even when some lines weren't directly matched to LRC
// timestamps (e.g. instrumental sections, failed matches).
function fillGaps(alignments: LyricAlignment[]): LyricAlignment[] {
  if (alignments.length < 2) return alignments;

  const result: LyricAlignment[] = [alignments[0]];
  for (let i = 1; i < alignments.length; i++) {
    const prev = alignments[i - 1];
    const curr = alignments[i];
    const lineGap = curr.lineIndex - prev.lineIndex;
    const timeGap = curr.time - prev.time;

    if (lineGap > 1 && timeGap > 0) {
      // Interpolate intermediate lines, distributing the time gap evenly.
      for (let k = 1; k < lineGap; k++) {
        const t = prev.time + (timeGap * k) / lineGap;
        result.push({ lineIndex: prev.lineIndex + k, time: t });
      }
    }
    result.push(curr);
  }
  return result;
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
