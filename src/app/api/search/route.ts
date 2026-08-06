// API route: Search across UG and Songsterr
// GET /api/search?query=...&providers=ug,songsterr&page=1

import { NextRequest, NextResponse } from "next/server";
import { searchUG } from "@/lib/ug-scraper";
import { searchSongsterr } from "@/lib/songsterr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query") || "";
  const providersParam = searchParams.get("providers") || "ug";
  const page = parseInt(searchParams.get("page") || "1", 10);

  if (!query.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const providers = providersParam.split(",").filter(Boolean);
  const results: any[] = [];
  const errors: string[] = [];

  // Search UG if selected
  if (providers.includes("ug")) {
    try {
      const ugResult = await searchUG(query, page);
      results.push(...ugResult.results);
    } catch (e) {
      errors.push(`UG: ${(e as Error).message}`);
    }
  }

  // Search Songsterr if selected
  if (providers.includes("songsterr")) {
    try {
      const songsterrResults = await searchSongsterr(query);
      results.push(...songsterrResults);
    } catch (e) {
      errors.push(`Songsterr: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
