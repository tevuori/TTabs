# TTabs

A modern Next.js web app for searching, saving, and transposing guitar tabs and chords from Ultimate Guitar and Songsterr. Designed for Vercel hosting.

## Features

- **Search** across Ultimate Guitar and Songsterr with toggle checkboxes
- **Save songs** to your local library (stored in browser via IndexedDB)
- **Chord diagrams** — every chord shows how to play it with SVG fingering charts
- **Key & Capo display** — automatically detected key and capo position shown for every song
- **Transposition** — transpose chords up/down by semitones; chord diagrams update automatically
- **Chord alternatives** — click any chord to see alternative fingerings and pick the one you prefer
- **State persistence** — your transposition and chord alternative choices are saved per song
- **Modern dark UI** — clean, smooth interface designed for readability

## Tech Stack

- **Next.js 15** (App Router) with TypeScript
- **Tailwind CSS** for styling
- **@tombatossals/chords-db** for chord fingering data
- **IndexedDB** (via `idb`) for client-side song storage — works on Vercel with no backend database needed
- **Cheerio** for parsing Ultimate Guitar pages server-side

## Data Storage

Songs are stored client-side using IndexedDB. This approach:
- Works on Vercel free tier with no external database setup
- Persists across sessions in the user's browser
- Handles large tab data without size limits

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deployment

Deploy to Vercel:

```bash
vercel
```

Or connect the GitHub repo to Vercel for automatic deployments.

## How It Works

### Ultimate Guitar Integration
- Server-side API routes scrape UG pages to extract tab content, chord fingerings (applicature), capo, tuning, and key
- Chords are parsed from UG's `[ch]...[/ch]` markup format
- Key is auto-detected from the chord set when not explicitly available

### Songsterr Integration
- Uses Songsterr's public JSON API for search
- Opens songs on Songsterr's website (redirects to their player)

### Chord Transposition
- Parses each chord into root note + quality + bass note
- Shifts the root by the requested semitones
- Uses sharp/flat naming based on the target key
- Looks up alternative fingerings from the chord database
