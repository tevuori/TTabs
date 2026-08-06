// Ultimate Guitar scraper — fetches search results and tab details
// Runs server-side in API routes to avoid CORS

import * as cheerio from "cheerio";
import { SearchResult, SongTab, ChordFingering } from "./types";
import { detectKey } from "./chords";

const UG_BASE = "https://www.ultimate-guitar.com";
const UG_TABS_BASE = "https://tabs.ultimate-guitar.com";

// Headers to mimic a real browser request
const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Extract the embedded JSON data from a UG page
function extractUGData(html: string): any | null {
  const $ = cheerio.load(html);
  const storeDiv = $(".js-store").first();
  if (storeDiv.length === 0) return null;
  const dataContent = storeDiv.attr("data-content");
  if (!dataContent) return null;
  try {
    return JSON.parse(dataContent);
  } catch {
    return null;
  }
}

// Search UG for tabs
export async function searchUG(query: string, page: number = 1): Promise<{
  results: SearchResult[];
  totalPages: number;
  currentPage: number;
}> {
  const url = `${UG_BASE}/search.php?search_type=title&value=${encodeURIComponent(query)}&page=${page}`;
  const resp = await fetch(url, { headers: FETCH_HEADERS });
  if (!resp.ok) {
    throw new Error(`UG search failed: ${resp.status}`);
  }
  const html = await resp.text();
  const data = extractUGData(html);
  if (!data) {
    throw new Error("Could not parse UG search results");
  }

  const pageData = data.store?.page?.data;
  if (!pageData) {
    throw new Error("UG search data structure unexpected");
  }

  const rawResults = pageData.results || [];
  const results: SearchResult[] = [];

  for (const r of rawResults) {
    const type = r.type;
    // Skip Pro and Official tabs (not freely accessible)
    if (!type || type === "Pro" || type === "Official") continue;
    results.push({
      provider: "ug",
      id: r.tab_url,
      artistName: r.artist_name,
      songName: r.song_name,
      type,
      version: r.version,
      rating: r.rating,
      votes: r.votes,
      url: r.tab_url,
      difficulty: r.difficulty,
    });
  }

  return {
    results,
    totalPages: pageData.pagination?.total || 1,
    currentPage: pageData.pagination?.current || 1,
  };
}

// Fetch a single UG tab with full details
export async function fetchUGTab(tabUrl: string): Promise<SongTab> {
  // Normalize URL — ensure it starts with the tabs subdomain
  let url = tabUrl;
  if (url.startsWith("/")) {
    url = UG_TABS_BASE + url;
  } else if (!url.startsWith("http")) {
    url = UG_TABS_BASE + "/" + url;
  }

  const resp = await fetch(url, { headers: FETCH_HEADERS });
  if (!resp.ok) {
    throw new Error(`UG tab fetch failed: ${resp.status}`);
  }
  const html = await resp.text();
  const data = extractUGData(html);
  if (!data) {
    throw new Error("Could not parse UG tab page");
  }

  const tabData = data.store?.page?.data;
  if (!tabData) {
    throw new Error("UG tab data structure unexpected");
  }

  const tab = tabData.tab;
  const tabView = tabData.tab_view;

  // Extract content
  const content = tabView?.wiki_tab?.content || "";

  // Extract capo and tuning
  const meta = tabView?.meta || {};
  const capo = typeof meta.capo === "number" ? meta.capo : null;
  const tuning = meta.tuning ? `${meta.tuning.value} (${meta.tuning.name})` : undefined;

  // Extract applicature (chord fingerings from UG)
  const applicature: Record<string, ChordFingering[]> = {};
  if (tabView?.applicature) {
    for (const [chordName, variants] of Object.entries(tabView.applicature)) {
      applicature[chordName] = (variants as any[]).map(v => {
        const frets = v.frets as number[];
        const fingers = v.fingers as number[];
        const nonZeroFrets = frets.filter(f => f > 0);
        // baseFret is 1 (nut) if chord uses open strings or low frets;
        // otherwise it's the lowest fret shown
        const minFret = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : 1;
        const hasOpenStrings = frets.some(f => f === 0);
        const baseFret = hasOpenStrings || minFret <= 4 ? 1 : minFret;

        const fingering: ChordFingering = {
          frets: frets.slice().reverse(), // UG stores high-to-low, we want low-to-high
          fingers: fingers.slice().reverse(),
          baseFret,
        };
        return fingering;
      });
    }
  }

  // Extract unique chords from content
  const chordMatches = content.matchAll(/\[ch\]([^\]]+)\[\/ch\]/g);
  const chordSet = new Set<string>();
  for (const m of chordMatches) {
    chordSet.add(m[1]);
  }
  const chords = Array.from(chordSet);

  // Detect key from chords
  const key = detectKey(chords);

  // Generate unique ID from URL path
  const urlObj = new URL(url);
  const id = `ug_${urlObj.pathname.replace(/\//g, "_")}`;

  return {
    id,
    provider: "ug",
    url,
    artistName: tab.artist_name,
    songName: tab.song_name,
    type: tab.type,
    version: tab.version || 1,
    rating: tab.rating || 0,
    difficulty: tabView.ug_difficulty,
    capo,
    tuning,
    key,
    content,
    chords,
    applicature,
    savedAt: Date.now(),
  };
}
