# Scout tournament export v1

FGF Tourney Tracker publishes a versioned, public JSON view of the same merged tournament state used to render its tournament cards. The export contains only tournament and team information already shown publicly.

## Endpoints

- Index: `/scout/v1/tournaments/index.json`
- Tournament: `/scout/v1/tournaments/{encodedTournamentId}.json`

Tournament IDs are encoded with `encodeURIComponent`. The index supplies the correct `exportUrl` for every configured tournament.

## `ScoutTournamentExportV1`

Every tournament document has `schemaVersion: 1`, the dashboard `generatedAt` timestamp, public tournament metadata, collection metadata, and a deduplicated `teams` list.

`tournament.rosterObservedAt` identifies when the exported roster was last observed successfully. `tournament.collection` contains:

- `outcome`: the tracker collection outcome (`success`, `failure`, `not_published`, or `not_checked`)
- `monitoringStatus`: the configured tracker status (`active` or `discovery`)
- `checkedAt`: the most recent collection attempt
- `lastSuccessfulAt`: the most recent successful collection
- `rosterState`: `current`, `retained`, or `unavailable`

When a collection fails, Tourneys preserves its last successfully observed roster. Scout receives that same roster with `outcome: "failure"` and `rosterState: "retained"`. If no nonempty roster has ever been collected, `rosterState` is `unavailable`, `rosterObservedAt` is `null`, and the card does not show a Scout import action.

## Team status

Each team retains `rawName`, the tracker’s canonical `normalizedName`, `confirmed`, `paid`, and any public `note`. Its `status` is one of:

1. `verify_removal` — missing once and awaiting the tracker’s second successful removal observation
2. `waitlisted` — explicitly marked with the tracker’s existing waitlist note
3. `paid` — payment is `yes`
4. `confirmed` — confirmation is `yes`
5. `listed` — no higher-precedence state applies

The export deduplicates current and pending-removal entries with the same normalized-name function used by Tourneys.

## Representative document

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-17T13:55:36.499Z",
  "tournament": {
    "id": "first-to-third-phil-mumma-2026",
    "name": "11th Annual Sorcerer/Phil Mumma Memorial",
    "organizer": "1st to 3rd Softball Events",
    "startDate": "2026-09-26",
    "endDate": "2026-09-27",
    "location": "Stockton / Tracy",
    "division": "12U",
    "sourceUrl": "https://softball.tournamentconnect.premiergirlsfastpitch.com/events/register/tournaments/provider/1stto3rdsoftballeventsinc",
    "rosterObservedAt": "2026-08-17T13:54:31.000Z",
    "collection": {
      "outcome": "success",
      "monitoringStatus": "active",
      "checkedAt": "2026-08-17T13:54:31.000Z",
      "lastSuccessfulAt": "2026-08-17T13:54:31.000Z",
      "rosterState": "current"
    }
  },
  "teams": [
    {
      "rawName": "Foothill Gold Fowler 2032",
      "normalizedName": "foothill gold fowler 2032",
      "confirmed": "unknown",
      "paid": "unknown",
      "status": "listed"
    }
  ]
}
```

## Versioning

Version 1 is immutable. Backward-compatible additions may be introduced cautiously, but any renamed field, removed field, changed meaning, or changed status vocabulary requires a new `/scout/v2/` contract and parallel endpoints while consumers migrate.
