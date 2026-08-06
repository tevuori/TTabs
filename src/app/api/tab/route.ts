// API route: Fetch a single UG tab with full details
// GET /api/tab?url=...

import { NextRequest, NextResponse } from "next/server";
import { fetchUGTab } from "@/lib/ug-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url") || "";

  if (!url.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const tab = await fetchUGTab(url);
    return NextResponse.json(tab);
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to fetch tab: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
