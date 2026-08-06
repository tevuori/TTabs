// Server component wrapper for the song page.
//
// Exports generateStaticParams so the dynamic /song/[id] route works with
// Next.js static export (output: "export") in mobile mode. In mobile mode
// we return an empty array — no song pages are pre-rendered because song
// IDs are only known at runtime (synced via QR). Client-side routing in the
// Capacitor WebView handles navigation to any song ID.
//
// In server mode, generateStaticParams is not needed (the route is
// server-rendered on demand), but returning [] is harmless.

import SongPageClient from "./SongPageClient";

// Pre-generate a placeholder song page so the route exists in the static
// export. In the Capacitor WebView, client-side routing handles navigation
// to any song ID — the placeholder is just so Next.js doesn't error.
export async function generateStaticParams() {
  return [{ id: "_" }];
}

export default function SongPage({ params }: { params: Promise<{ id: string }> }) {
  return <SongPageClient params={params} />;
}
