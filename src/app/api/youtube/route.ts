// YouTube search without an API key, using the public nokey endpoint.
// Returns the top video IDs for a query.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  if (!query.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  try {
    // Use YouTube's public search page and parse video IDs from the HTML.
    // This avoids requiring a YouTube Data API key.
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " official audio")}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // Don't cache so results stay fresh.
      cache: "no-store",
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `YouTube search failed (${resp.status})` },
        { status: 502 }
      );
    }

    const html = await resp.text();

    // Extract video IDs. YouTube embeds a JSON blob in the page; video IDs
    // appear as "videoId":"<11-char-id>". Collect unique IDs in order.
    const ids: string[] = [];
    const seen = new Set<string>();
    const regex = /"videoId":"([A-Za-z0-9_-]{11})"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const id = match[1];
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      if (ids.length >= 8) break;
    }

    // Also try the watch URL pattern as a fallback.
    if (ids.length === 0) {
      const fallback = /\/watch\?v=([A-Za-z0-9_-]{11})/g;
      while ((match = fallback.exec(html)) !== null) {
        const id = match[1];
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
        if (ids.length >= 8) break;
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ results: [], error: "No videos found" });
    }

    // Fetch titles for the top results via the oEmbed endpoint (no key needed).
    const results = await Promise.all(
      ids.slice(0, 6).map(async id => {
        try {
          const oembed = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
          );
          if (oembed.ok) {
            const data = await oembed.json();
            return {
              id,
              title: data.title as string,
              author: data.author_name as string,
            };
          }
        } catch {
          // ignore
        }
        return { id, title: id, author: "" };
      })
    );

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: `YouTube search failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
