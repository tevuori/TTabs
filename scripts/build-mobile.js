#!/usr/bin/env node
// Mobile build script.
//
// Next.js static export (output: "export") does not support API routes.
// In mobile mode the app is fully offline — no API routes are needed — so
// we temporarily move the api/ directory out of the way during the build,
// then restore it afterwards.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "..", "src", "app");
const API_DIR = path.join(APP_DIR, "api");
// Move api/ completely outside src/app/ so Next.js doesn't discover it.
const API_BAK = path.join(__dirname, "..", ".api-bak");

function move(src, dest) {
  fs.renameSync(src, dest);
}

let moved = false;
try {
  if (fs.existsSync(API_DIR)) {
    move(API_DIR, API_BAK);
    moved = true;
    console.log("[build-mobile] Temporarily moved src/app/api out of the way");
  }

  execSync("next build", {
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_APP_MODE: "mobile" },
  });
} finally {
  // Always restore the api directory, even if the build failed.
  if (moved && fs.existsSync(API_BAK)) {
    move(API_BAK, API_DIR);
    console.log("[build-mobile] Restored src/app/api");
  }
}
