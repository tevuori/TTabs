// Server-side proxy to LRCLib for synced lyrics.
// Keeps the User-Agent and API URL off the client and avoids CORS issues.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const trackName = params.get("track_name") || "";
  const artistName = params.get("artist_name") || "";
  const durationStr = params.get("duration");
  const duration = durationStr ? parseInt(durationStr, 10) : undefined;

  if (!trackName.trim() || !artistName.trim()) {
    return NextResponse.json(
      { error: "track_name and artist_name are required" },
      { status: 400 }
    );
  }

  const qs = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
  });
  if (duration && duration > 0 && duration < 3600) {
    qs.set("duration", String(duration));
  }

  try {
    const resp = await fetch(`https://lrclib.net/api/get?${qs.toString()}`, {
      headers: {
        "User-Agent": "TTabs/1.0 (https://github.com/tevuori/TTabs)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (resp.status === 404) {
      // No match on /api/get — try /api/search as a fallback and pick the
      // best result with synced lyrics.
      const searchQs = new URLSearchParams({
        track_name: trackName,
        artist_name: artistName,
      });
      const searchResp = await fetch(
        `https://lrclib.net/api/search?${searchQs.toString()}`,
        {
          headers: {
            "User-Agent": "TTabs/1.0 (https://github.com/tevuori/TTabs)",
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );

      if (!searchResp.ok) {
        return NextResponse.json(
          { error: `LRCLib search failed (${searchResp.status})` },
          { status: 502 }
        );
      }

      const results = (await searchResp.json()) as LrclibRecord[];
      const withSynced = results.filter(r => r.syncedLyrics);
      if (withSynced.length === 0) {
        return NextResponse.json({
          syncedLyrics: null,
          instrumental: results.some(r => r.instrumental),
          duration: null,
          found: false,
        });
      }

      // Pick the result whose duration is closest to the requested one.
      let best = withSynced[0];
      if (duration) {
        best = withSynced.reduce((acc, r) => {
          if (r.duration == null) return acc;
          const da = Math.abs((r.duration ?? 0) - duration);
          const db = Math.abs((acc.duration ?? 0) - duration);
          return da < db ? r : acc;
        }, withSynced[0]);
      }

      return NextResponse.json({
        syncedLyrics: best.syncedLyrics,
        instrumental: best.instrumental,
        duration: best.duration,
        found: true,
      });
    }

    if (!resp.ok) {
      return NextResponse.json(
        { error: `LRCLib fetch failed (${resp.status})` },
        { status: 502 }
      );
    }

    const record = (await resp.json()) as LrclibRecord;
    return NextResponse.json({
      syncedLyrics: record.syncedLyrics,
      instrumental: record.instrumental,
      duration: record.duration,
      found: !!record.syncedLyrics,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `LRCLib fetch failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
