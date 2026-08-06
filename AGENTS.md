# TTabs — Build & Development Notes

## Build modes

- **Server** (Vercel deploy): `npm run build:server` — standard Next.js build with API routes, MongoDB, auth
- **Mobile** (Android APK): `npm run build:mobile` — static export (no API routes), wrapped by Capacitor

## Local APK build

Prerequisites:
- JDK 21 (Gradle 8.x doesn't support Java 25+)
- Android SDK with platform-tools, platforms;android-36, build-tools;36.0.0

```bash
# 1. Build the mobile web app (static export to out/)
npm run build:mobile

# 2. Sync web assets into the Android project
npx cap sync android

# 3. Build the debug APK
export JAVA_HOME=~/jdk21    # or wherever JDK 21 is installed
export ANDROID_HOME=~/Android/Sdk
cd android && ./gradlew assembleDebug --no-daemon

# APK output: android/app/build/outputs/apk/debug/app-debug.apk
```

## Lint

```bash
npm run lint
```

## CI

GitHub Actions workflows in `.github/workflows/`:
- `build-apk.yml` — builds debug APK on push to main / v* tags, attaches to releases
- `build-server.yml` — lints + builds server target on PRs to main

CI uses Node 22 and Java 21 (Capacitor 8 requires both).
