# TTabs — Feature Ideas

A brainstormed list of potential features for TTabs, grouped by fit and effort. TTabs is currently a Next.js web app for searching, saving, and transposing guitar tabs and chords from Ultimate Guitar and Songsterr, with chord diagrams, key/capo detection, and an IndexedDB-based local library.

## Current state (as of brainstorm)

- Search across Ultimate Guitar and Songsterr
- Song viewer with chord diagrams, transposition, capo override, chord alternatives
- Library (save/delete/filter), per-song state persistence (IndexedDB)
- Auto-detected key, chord summary panel

The app is solidly in the "view and rearrange tabs" space. The biggest gaps are around **practice/playing**, **discovery**, and **export/sharing** — all of which fit the same guitar-player user without changing the architecture (still client-side, no backend needed).

---

## Tier 1 — High fit, low effort

### Autoscroll with speed control
The single most-requested feature in tab apps. While viewing a song, a play button starts auto-scrolling at an adjustable BPM/line-speed. Pure client-side, ~1 component + a small hook. Pairs naturally with the existing viewer.

### Chord audio preview (Web Audio API)
Click any chord diagram/token to hear it strummed or arpeggiated. No assets needed — synthesize from the fingering data already available (`frets`/`fingers`). Makes the chord-alternatives picker actually useful for comparing voicings.

### Font size + column controls for tab content
A simple Aa−/Aa+ control and a "chords-only / lyrics-only / both" toggle. Small but high-value for readability on different screens. The `tab-content` block in `SongViewer` is the only touch point.

### Search by chords / "beginner mode"
"I only know G, C, D, Em — show me songs I can play." Filter search results (or the library) by the chord set they use. `song.chords` is already extracted per tab, so this is mostly a filter UI on top of existing data. Huge for the beginner audience.

### Recently viewed (separate from saved)
A lightweight "continue playing" row on the home page. Just a small IndexedDB store or even `localStorage` of last N opened song IDs. Low effort, makes the app feel alive on return visits.

---

## Tier 2 — Medium effort, strong fit

### Metronome
Web Audio click track with BPM + time signature. Standalone floating widget usable on any page. Natural companion to autoscroll — eventually they sync.

### Setlists
Group library songs into ordered setlists (gig/practice). New IndexedDB store + a `/setlists` page + reorder UI. Reuses the existing song data model entirely. Export-to-text is a trivial follow-on.

### Shareable transposed link
Encode `transposition`, `chordOverrides`, and `capoOverride` into the URL query string so a `/song/[id]?t=2&capo=3&co=...` link opens with your exact setup. The per-song state is already persisted — exposing it via URL is a small change and makes the app genuinely shareable without a backend.

### PDF / print-friendly export
A print stylesheet (`@media print`) that lays out lyrics + chord diagrams cleanly, plus a "Download PDF" using the browser's print-to-PDF. No server, no dependency. Great for offline rehearsal.

### Chord library browser
A `/chords` page that browses the `@tombatossals/chords-db` already in use — search a chord name, see all voicings/inversions, by instrument (guitar/ukulele). Pure reuse of an existing dependency; turns TTabs into a reference tool too.

### Capo calculator / "play in X with shapes from Y"
"I want to sound in Bb but use G-shape chords — what capo?" This is the inverse of the transposition already implemented. Same `transposeChord` math, just a different UI entry point. Very on-brand.

---

## Tier 3 — Ambitious but distinctive

### Section looping + YouTube sync
Embed a YouTube video (searched via the song title) alongside the tab, with a manual "set loop A/B" on the video and the tab autoscroll synced to the same timeline. This is the feature that would make TTabs a real practice tool rather than a viewer. Bigger lift, but uniquely valuable.

### Strumming/song playback from chord data
Walk the parsed chord lines and synthesize a simple strum or arpeggio pattern through Web Audio so you can hear the progression of the actual song. Builds on the chord-audio work from Tier 1.

### Fretboard visualization
Show chord tones plotted on a full fretboard (not just a single-position diagram) — useful for finding voicings up the neck and understanding CAGED shapes. New component, but reuses the chord-db note data.

### PWA / offline mode
Service worker caching the app shell + saved songs so the library works fully offline. Vercel-friendly, and "saved songs on the go" is a compelling pitch.

---

## Suggested first feature

**Autoscroll + chord audio preview together** — both small, both make the viewer immediately more useful, and they set up the metronome/YouTube-sync work later.
