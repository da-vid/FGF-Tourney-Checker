import assert from "node:assert/strict";
import test from "node:test";
import { applyResults } from "../src/change-detection";
import { normalizeTeamName } from "../src/normalize";
import {
  findPgfQualifierRows,
  isLegacyTeamResponseUrl,
  parseAstText,
  parseLegacyRows,
  parseLegacyText,
  parseTournamentConnectDialog,
  parseUsssaRows,
  parseWcpText,
} from "../src/parsers";
import type { CollectionResult, MonitorState, TournamentConfig } from "../src/types";

const config: TournamentConfig = {
  id: "event",
  name: "Test Event",
  organizer: "Test",
  startDate: "2026-10-10",
  endDate: "2026-10-11",
  location: "Stockton",
  division: "12U",
  weekendId: "2026-10-10",
  role: "primary",
  sourceType: "ast",
  sourceUrl: "https://example.com",
  status: "active",
};

test("AST isolates Sacramento 12U and parses statuses", () => {
  const teams = parseAstText(`TEAMS
SOUTH BAY
12U
Wrong Team Pd
14U
SACRAMENTO
10U
Little Team
12U
Foothill Gold Fowler-Wong-conf
OC Batbusters-Murillo Pd
14U
Older Team`, "SACRAMENTO");
  assert.deepEqual(teams.map((team) => team.rawName), ["Foothill Gold Fowler-Wong", "OC Batbusters-Murillo"]);
  assert.equal(teams[0].confirmed, "yes");
  assert.equal(teams[1].paid, "yes");
});

test("Legacy distinguishes explicit zero from loaded teams", () => {
  assert.deepEqual(parseLegacyText("12U Division\nNo Teams Found.\n14U Division"), []);
  const teams = parseLegacyText("12U Division\nFoothill Gold\nYes\nNo\nAnother Club\nNo\nYes\n14U Division");
  assert.equal(teams.length, 2);
  assert.equal(teams[0].confirmed, "yes");
  assert.equal(teams[1].paid, "yes");
});

test("Legacy recognizes only the completed Airtable team request", () => {
  assert.equal(isLegacyTeamResponseUrl("https://api.airtable.com/v0/appExample/Teams?view=Grid%20view"), true);
  assert.equal(isLegacyTeamResponseUrl("https://api.airtable.com/v0/appExample/Events"), false);
  assert.equal(isLegacyTeamResponseUrl("https://example.com/v0/appExample/Teams"), false);
});

test("Legacy parses structured table rows after the lazy component loads", () => {
  const teams = parseLegacyRows([
    ["1", "Athletics Mercado Cole 2032", "No", ""],
    ["2", "OC Batbusters Murillo 12u", "Yes", "Paid"],
    ["3", "Foothill Gold Kiloh 2033", "Waitlist", ""],
  ]);
  assert.equal(teams.length, 3);
  assert.equal(teams[0].confirmed, "no");
  assert.equal(teams[1].paid, "yes");
  assert.equal(teams[2].note, "Waitlist");
});

test("TournamentConnect reads 12U and handles explicit zero", () => {
  assert.deepEqual(parseTournamentConnectDialog("Close\nNo team found."), []);
  const teams = parseTournamentConnectDialog("Committed Teams\n10U - Girls\nTiny\n12U - Girls\nFoothill Gold\nYard Sharks\n14U - Girls\nOlder");
  assert.deepEqual(teams.map((team) => team.rawName), ["Foothill Gold", "Yard Sharks"]);
});

test("West Coast Premier isolates the 12U roster", () => {
  const teams = parseWcpText("Register\n12u\nFirecrackers Zeigler\nSwat Turner\n14u\nOlder Team");
  assert.deepEqual(teams.map((team) => team.rawName), ["Firecrackers Zeigler", "Swat Turner"]);
});

test("USSSA parses team-name cells from the 12U table", () => {
  const teams = parseUsssaRows([
    ["Team Class", "Team Name", "State - City"],
    ["12B", "Foothill Gold Fowler", "CA - Sacramento"],
  ]);
  assert.deepEqual(teams.map((team) => team.rawName), ["Foothill Gold Fowler"]);
});

test("PGF discovery accepts only a nearby Stockton or Tracy 12U row", () => {
  assert.deepEqual(findPgfQualifierRows(["STOCKTON 12U 10/10/2026 10/11/2026 12U CA Western"], "2026-10-10").length, 1);
  assert.deepEqual(findPgfQualifierRows(["STOCKTON 14U 10/10/2026", "TRACY 12U 01/24/2026"], "2026-10-10"), []);
});

test("normalization removes status suffixes without collapsing teams", () => {
  assert.equal(normalizeTeamName("  OC Batbusters – Murillo Pd "), "oc batbusters-murillo");
  assert.notEqual(normalizeTeamName("Foothill Gold Fowler"), normalizeTeamName("Foothill Gold Wong"));
});

function result(teams: string[], checkedAt: string, outcome: CollectionResult["outcome"] = "success"): CollectionResult {
  return {
    tournamentId: "event",
    checkedAt,
    outcome,
    sourceUrl: config.sourceUrl,
    teams: teams.map((name) => ({ rawName: name, normalizedName: normalizeTeamName(name), confirmed: "unknown", paid: "unknown" })),
  };
}

test("first success is baseline, additions log, removals require two successes", () => {
  const first = applyResults([config], undefined, [result(["Alpha", "Bravo"], "2026-08-01T10:00:00Z")]);
  assert.equal(first.changes.length, 0);
  const second = applyResults([config], first, [result(["Alpha", "Bravo", "Charlie"], "2026-08-02T10:00:00Z")]);
  assert.equal(second.changes[0].type, "team_added");
  const missingOnce = applyResults([config], second, [result(["Alpha", "Charlie"], "2026-08-03T10:00:00Z")]);
  assert.equal(missingOnce.tournaments[0].pendingRemovals.length, 1);
  assert.equal(missingOnce.tournaments[0].teams.length, 3);
  const missingTwice = applyResults([config], missingOnce, [result(["Alpha", "Charlie"], "2026-08-04T10:00:00Z")]);
  assert.equal(missingTwice.changes[0].type, "team_removed");
  assert.equal(missingTwice.tournaments[0].teams.length, 2);
});

test("a failed source preserves the last successful roster", () => {
  const previous = applyResults([config], undefined, [result(["Alpha"], "2026-08-01T10:00:00Z")]);
  const failed = applyResults([config], previous, [result([], "2026-08-02T10:00:00Z", "failure")]);
  assert.equal(failed.tournaments[0].teams[0].rawName, "Alpha");
  assert.equal(failed.tournaments[0].outcome, "failure");
});

test("published discovery emits an event change", () => {
  const discovery = { ...config, status: "discovery" as const, sourceType: "pgfDiscovery" as const };
  const previous: MonitorState = {
    generatedAt: "2026-08-01T10:00:00Z",
    baselineEstablished: true,
    tournaments: [{ ...discovery, outcome: "not_published", teams: [], pendingRemovals: [] }],
    changes: [],
  };
  const next = applyResults([discovery], previous, [result([], "2026-08-02T10:00:00Z")]);
  assert.equal(next.changes[0].type, "event_published");
});
