import assert from "node:assert/strict";
import test from "node:test";
import { applyResults } from "../src/change-detection";
import { normalizeTeamName } from "../src/normalize";
import {
  createScoutTournamentExport,
  createScoutTournamentIndex,
  hasScoutRoster,
  scoutImportUrl,
  type ScoutTeamStatus,
} from "../src/scout-export";
import type { CollectionResult, MonitorState, TeamRecord, TournamentConfig, TournamentState } from "../src/types";

const config: TournamentConfig = {
  id: "event/with space?",
  name: "Test Tournament",
  organizer: "Public Organizer",
  startDate: "2026-10-10",
  endDate: "2026-10-11",
  location: "Stockton",
  division: "12U",
  weekendId: "2026-10-10",
  role: "primary",
  sourceType: "ast",
  sourceUrl: "https://example.com/tournament",
  status: "active",
};

function team(
  rawName: string,
  confirmed: TeamRecord["confirmed"] = "unknown",
  paid: TeamRecord["paid"] = "unknown",
  note?: string,
): TeamRecord {
  return { rawName, normalizedName: normalizeTeamName(rawName), confirmed, paid, ...(note ? { note } : {}) };
}

function event(overrides: Partial<TournamentState> = {}): TournamentState {
  return {
    ...config,
    outcome: "success",
    checkedAt: "2026-08-17T12:00:00Z",
    lastSuccessfulCheck: "2026-08-17T12:00:00Z",
    teams: [],
    pendingRemovals: [],
    ...overrides,
  };
}

test("ScoutTournamentExportV1 has the exact schema version and required public fields", () => {
  const exported = createScoutTournamentExport(event({ teams: [team("Alpha")] }), "2026-08-17T12:05:00Z");
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.generatedAt, "2026-08-17T12:05:00Z");
  assert.deepEqual(exported.tournament, {
    id: config.id,
    name: config.name,
    organizer: config.organizer,
    startDate: config.startDate,
    endDate: config.endDate,
    location: config.location,
    division: config.division,
    sourceUrl: config.sourceUrl,
    rosterObservedAt: "2026-08-17T12:00:00Z",
    collection: {
      outcome: "success",
      monitoringStatus: "active",
      checkedAt: "2026-08-17T12:00:00Z",
      lastSuccessfulAt: "2026-08-17T12:00:00Z",
      rosterState: "current",
    },
  });
});

test("listed, confirmed, and paid statuses use the documented precedence", () => {
  const exported = createScoutTournamentExport(event({
    teams: [team("Listed"), team("Confirmed", "yes"), team("Paid", "yes", "yes")],
  }), "2026-08-17T12:05:00Z");
  const statuses = Object.fromEntries(exported.teams.map((entry) => [entry.rawName, entry.status])) as Record<string, ScoutTeamStatus>;
  assert.deepEqual(statuses, { Listed: "listed", Confirmed: "confirmed", Paid: "paid" });
});

test("waitlisted status uses the same explicit waitlist note as the dashboard", () => {
  const exported = createScoutTournamentExport(event({ teams: [team("Waitlisted", "yes", "yes", "Waitlist")] }), "2026-08-17T12:05:00Z");
  assert.equal(exported.teams[0].status, "waitlisted");
  assert.equal(exported.teams[0].note, "Waitlist");
});

test("pending removals become verify_removal", () => {
  const pending = team("Pending Club", "yes", "yes", "Waitlist");
  const exported = createScoutTournamentExport(event({
    teams: [pending],
    pendingRemovals: [{ team: pending, firstMissingAt: "2026-08-17T12:00:00Z", observations: 1 }],
  }), "2026-08-17T12:05:00Z");
  assert.equal(exported.teams[0].status, "verify_removal");
});

test("current and pending-removal overlap is deduplicated with existing name normalization", () => {
  const current = team("OC Batbusters – Murillo");
  const pending = team("OC Batbusters-Murillo");
  const exported = createScoutTournamentExport(event({
    teams: [current],
    pendingRemovals: [{ team: pending, firstMissingAt: "2026-08-17T12:00:00Z", observations: 1 }],
  }), "2026-08-17T12:05:00Z");
  assert.equal(exported.teams.length, 1);
  assert.equal(exported.teams[0].normalizedName, "oc batbusters murillo");
  assert.equal(exported.teams[0].status, "verify_removal");
});

test("a failed collection exports the retained last-successful roster and observation time", () => {
  const successfulResult: CollectionResult = {
    tournamentId: config.id,
    checkedAt: "2026-08-16T12:00:00Z",
    outcome: "success",
    sourceUrl: config.sourceUrl,
    teams: [team("Retained Club")],
  };
  const previous = applyResults([config], undefined, [successfulResult], "2026-08-16T12:01:00Z");
  const failedResult: CollectionResult = {
    tournamentId: config.id,
    checkedAt: "2026-08-17T12:00:00Z",
    outcome: "failure",
    sourceUrl: config.sourceUrl,
    teams: [],
    diagnostic: "private collector detail",
  };
  const failed = applyResults([config], previous, [failedResult], "2026-08-17T12:01:00Z");
  const exported = createScoutTournamentExport(failed.tournaments[0], failed.generatedAt);
  assert.deepEqual(exported.teams.map((entry) => entry.rawName), ["Retained Club"]);
  assert.equal(exported.tournament.collection.outcome, "failure");
  assert.equal(exported.tournament.collection.rosterState, "retained");
  assert.equal(exported.tournament.rosterObservedAt, "2026-08-16T12:00:00Z");
  assert.equal(exported.tournament.collection.checkedAt, "2026-08-17T12:00:00Z");
  assert.equal(hasScoutRoster(failed.tournaments[0]), true);
});

test("Scout import links URL encode tournament IDs", () => {
  assert.equal(
    scoutImportUrl(config.id),
    "https://scout.lineuphelper.com/import/tourneys?tournament=event%2Fwith%20space%3F",
  );
});

test("the index points to each encoded per-tournament export", () => {
  const state: MonitorState = {
    generatedAt: "2026-08-17T12:05:00Z",
    baselineEstablished: true,
    tournaments: [event({ teams: [team("Alpha")] })],
    changes: [],
  };
  const index = createScoutTournamentIndex(state);
  assert.deepEqual(index.tournaments[0], {
    id: config.id,
    name: config.name,
    startDate: config.startDate,
    endDate: config.endDate,
    exportUrl: "/scout/v1/tournaments/event%2Fwith%20space%3F.json",
    rosterObservedAt: "2026-08-17T12:00:00Z",
  });
});

test("public Scout JSON omits diagnostics, registration internals, and unrelated monitor data", () => {
  const exported = createScoutTournamentExport(event({
    teams: [team("Alpha")],
    diagnostic: "private collector detail",
    registrationUrl: "https://example.com/internal-registration-hop",
    registrationStatus: "internal status detail",
  }), "2026-08-17T12:05:00Z");
  const json = JSON.stringify(exported);
  assert.doesNotMatch(json, /diagnostic|private collector detail|registrationUrl|internal-registration-hop|registrationStatus|github/i);
});
