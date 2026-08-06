// Build-mode switch for TTabs.
//
// The same codebase produces two artifacts:
//   - "server": the Vercel deploy with API routes, MongoDB, and auth.
//   - "mobile": a static export wrapped by Capacitor into an Android APK,
//     fully offline (no server/DB, no user management, local IndexedDB).
//
// NEXT_PUBLIC_* env vars are inlined by Next at build time, so the mobile
// bundle tree-shakes out server-only code paths.

export type AppMode = "server" | "mobile";

export const APP_MODE: AppMode =
  (process.env.NEXT_PUBLIC_APP_MODE as AppMode) || "server";

export const IS_MOBILE = APP_MODE === "mobile";
export const IS_SERVER = APP_MODE === "server";
