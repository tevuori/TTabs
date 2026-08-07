/** @type {import('next').NextConfig} */

// Mobile builds use a static export (output: "export") so the result can be
// wrapped by Capacitor into an Android APK. Server builds keep the default
// (server) output for Vercel.
const isMobile = process.env.NEXT_PUBLIC_APP_MODE === "mobile";

const nextConfig = {
  output: isMobile ? "export" : undefined,
  // Static export requires unoptimized images (no server-side optimizer).
  images: isMobile ? { unoptimized: true } : undefined,
  // No trailing slashes — in Capacitor's WebView, trailing slashes cause
  // the WebView to look for /song/id/index.html which doesn't exist for
  // dynamic routes. Without trailing slashes, Next.js client-side routing
  // handles navigation entirely in JavaScript.
  trailingSlash: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

module.exports = nextConfig;
