# FGF Tourney Tracker

A public, coach-friendly dashboard that checks official tournament registration pages every morning and records changes to the 12U field.

## What it monitors

- All Star Tournaments event pages
- Legacy Sports Fastpitch event pages
- 1st to 3rd / TournamentConnect committed-team dialogs
- The PGF National Qualifiers listing for a Stockton or Tracy qualifier around the configured date

The phase-one tournament list lives in `config/tournaments.json`. Each entry identifies the event, dates, location, source URL, and collector type. Add future 2026–27 tournaments there using an existing source type; add a new collector in `src/collectors.ts` only when a new registration platform is introduced.

## Daily operation

The GitHub Actions workflow runs at 6:17 a.m. Pacific every day and can also be started manually. It:

1. Opens each public source with Playwright.
2. Reads only the 12U field and related registration status.
3. Compares the result with the last successful snapshot.
4. Records additions, removals, source outages, recoveries, and PGF publication status.
5. Commits the new state/history and republishes the GitHub Pages dashboard.

Team removals require two consecutive successful checks, reducing false alerts when a source briefly renders incomplete data. A failed source never replaces a previously known roster with an empty list. Diagnostic screenshots and page captures are retained in the failed workflow run for seven days.

## Local setup

Requirements: Node.js 22.13 or newer.

```bash
npm install
npx playwright install chromium
npm run collect
npm test
npm run dev
```

Useful commands:

- `npm run collect` checks the live sources and updates `data/state.json` plus the daily file in `data/history/`.
- `npm run check:source -- <tournament-id>` checks one source without changing saved dashboard data.
- `npm run export:pages` produces the static GitHub Pages site in `pages-dist/`.
- `npm test` runs parser/change tests, verifies the exported site, and performs a production build.
- `npm run dev` opens the interactive local dashboard.

## Public data and maintenance

The site intentionally contains only public tournament information and no player or coach contact details. Official source links are displayed on every tournament card.

If a registration site changes its layout, the dashboard marks that source as needing attention while preserving its last successful roster. Use the workflow's diagnostic artifact to update the matching collector and its fixture test.

The historical JSON files are plain data and can later support weekly summaries, team appearance comparisons, notification feeds, or an expanded 2026–27 view without changing the collection model.

## Scout integration

The static build publishes a versioned Scout tournament index at `/scout/v1/tournaments/index.json` and one public export per configured tournament. Tournament cards with a known roster link to Scout for import. See [`docs/scout-export-v1.md`](docs/scout-export-v1.md) for the `ScoutTournamentExportV1` contract, status precedence, and retained-roster behavior.
