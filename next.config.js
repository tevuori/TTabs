/** @type {import('next').NextConfig} */

// Mobile builds use a static export (output: "export") so the result can be
// wrapped by Capacitor into an Android APK. Server builds keep the default
// (server) output for Vercel.
const isMobile = process.env.NEXT_PUBLIC_APP_MODE === "mobile";

const nextConfig = {
  output: isMobile ? "export" : undefined,
  // Static export requires unoptimized images (no server-side optimizer).
  images: isMobile ? { unoptimized: true } : undefined,
  // Trailing slashes make the static export's file structure match the
  // routes Capacitor serves from the local asset folder.
  trailingSlash: isMobile,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

module.exports = nextConfig;
