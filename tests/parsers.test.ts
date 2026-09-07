import assert from "node:assert/strict";
import test from "node:test";
import { applyResults } from "../src/change-detection";
import { normalizeTeamName } from "../src/normalize";
import {
  findPgfQualifierRows,
  isLegacyTeamResponseUrl,
  parseAstAvailability,
  parseAstText,
  parseLegacyAvailability,
  parseLegacyRows,
  parseLegacyText,
  parsePgfApprovedTeamRows,
  parseRegistrationText,
  parseTournamentConnectDialog,
  parseUsssaAvailability,
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

test("AST availability is scoped to the selected 12U section", () => {
  const otherDivision = parseAstAvailability(`TEAMS
SACRAMENTO
12U
Foothill Gold
14U
2 spots open`, "SACRAMENTO");
  assert.equal(otherDivision.registrationState, "unknown");

  const twelveU = parseAstAvailability(`TEAMS
SACRAMENTO
12U
Foothill Gold
2 spots open
14U
Older Team`, "SACRAMENTO");
  assert.equal(twelveU.registrationState, "limited");
  assert.equal(twelveU.spotsRemaining, 2);
  assert.equal(twelveU.capacityScope, "12U");
});

test("registration wording distinguishes full, closed, waitlist, and deadlines", () => {
  assert.equal(parseRegistrationText("Spots are Filled!").registrationState, "full");
  assert.equal(parseRegistrationText("Event Full - Sign Ups Closed").registrationState, "closed");
  assert.equal(parseRegistrationText("Waitlist available").registrationState, "waitlist");
  const fullWaitlist = parseRegistrationText("Spots are Filled! If you sign up you will be placed on waitlist.");
  assert.equal(fullWaitlist.registrationState, "waitlist");
  assert.equal(fullWaitlist.spotsRemaining, 0);
  assert.equal(parseRegistrationText("Registration is unavailable").registrationState, "closed");
  assert.equal(parseRegistrationText("This division is at capacity").registrationState, "full");
  assert.equal(parseRegistrationText("Registration Closed. Deadline: Oct 4").registrationDeadline, "Oct 4");
  assert.equal(parseRegistrationText("Entry Deadline: September 19th").registrationDeadline, "September 19th");
});

test("Legacy and USSSA preserve capacity scope", () => {
  const legacy = parseLegacyAvailability("Event Spots Available: 40\nSpots Left: 13");
  assert.equal(legacy.spotsRemaining, 13);
  assert.equal(legacy.capacityScope, "event");
  const legacyWaitlist = parseLegacyAvailability("Event Spots Available: 30\nSpots are Filled! If you sign up you will be placed on waitlist.");
  assert.equal(legacyWaitlist.registrationState, "waitlist");
  assert.equal(legacyWaitlist.registrationStatus, "Full · Waitlist available");
  assert.equal(legacyWaitlist.spotsRemaining, 0);
  const legacyClosed = parseLegacyAvailability("Event Full - Sign Ups Closed\nEvent Spots Available: 30\nSpots Left: 4");
  assert.equal(legacyClosed.registrationState, "closed");
  assert.equal(legacyClosed.spotsRemaining, 4);
  const legacyBoilerplate = parseLegacyAvailability('*please note: events may be marked "Event Full - Sign Ups Closed".');
  assert.equal(legacyBoilerplate.registrationState, "unknown");
  const usssa = parseUsssaAvailability("12U Tournament Division Max Entries: 8", true);
  assert.equal(usssa.registrationState, "open");
  assert.equal(usssa.capacity, 8);
  assert.equal(usssa.capacityScope, "12U");
  const usssaTable = parseUsssaAvailability("Division Entry Fee Max Entries Game 12U $709 8 4 League", true);
  assert.equal(usssaTable.capacity, 8);
  const usssaLines = parseUsssaAvailability("Division\tEntry Fee\tGate Fee\tMax Entries\tGame Guarantee\tFormat\n12U\t$709\t8\t4\tLeague", true);
  assert.equal(usssaLines.capacity, 8);
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
  const teams = parseTournamentConnectDialog("Committed Teams\n10U - Girls\nNo team found.\n12U - Girls\n1st to 3rd\nFoothill Gold\nYard Sharks\n14U - Girls\nOlder");
  assert.deepEqual(teams.map((team) => team.rawName), ["Foothill Gold", "Yard Sharks"]);
  assert.deepEqual(parseTournamentConnectDialog("12U - Girls\nNo team found.\n14U - Girls"), []);
});

test("West Coast Premier isolates the 12U roster", () => {
  const teams = parseWcpText("Register\n12u\n\u200BFirecrackers Zeigler\nSwat Turner\nRefund Policy\nPrivacy Policy\n\u200B\n14u\nOlder Team");
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
  assert.deepEqual(findPgfQualifierRows(["STOCKTON 2/20/2027 2/21/2027 CA Western"], "2027-02-20", true).length, 1);
});

test("PGF approved teams parser keeps only 12U and marks them confirmed", () => {
  const teams = parsePgfApprovedTeamRows([
    ["Division", "Team Name", "State", "Status"],
    ["10U", "Younger Club", "CA", "Approved"],
    ["12U", "Foothill Gold Fowler", "CA", "Approved"],
    ["12U", "Yard Sharks", "NV", "Approved"],
    ["14U", "Older Club", "CA", "Approved"],
  ]);
  assert.deepEqual(teams.map((team) => team.rawName), ["Foothill Gold Fowler", "Yard Sharks"]);
  assert.equal(teams.every((team) => team.confirmed === "yes"), true);
  const eventWideTeams = parsePgfApprovedTeamRows([
    ["Team Name", "State", "Status"],
    ["Foothill Gold Fowler", "CA", "Approved"],
    ["Yard Sharks", "NV", "Approved"],
  ], true);
  assert.deepEqual(eventWideTeams.map((team) => team.rawName), ["Foothill Gold Fowler", "Yard Sharks"]);
});

test("normalization removes status suffixes without collapsing teams", () => {
  assert.equal(normalizeTeamName("  OC Batbusters – Murillo Pd "), "oc batbusters murillo");
  assert.equal(normalizeTeamName("Natomas Lady Tigers-Stoll"), normalizeTeamName("Natomas Lady Tigers Stoll"));
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

test("a team returning during removal verification is not logged as a new addition", () => {
  const first = applyResults([config], undefined, [result(["Alpha", "Bravo"], "2026-08-01T10:00:00Z")]);
  const missingOnce = applyResults([config], first, [result(["Alpha"], "2026-08-02T10:00:00Z")]);
  const recovered = applyResults([config], missingOnce, [result(["Alpha", "Bravo"], "2026-08-03T10:00:00Z")]);

  assert.equal(recovered.tournaments[0].pendingRemovals.length, 0);
  assert.equal(recovered.changes.some((change) => change.type === "team_added" && change.teamName === "Bravo"), false);
});

test("a previously removed and re-added team remains visible during a later removal check", () => {
  const first = applyResults([config], undefined, [result(["Alpha"], "2026-08-01T10:00:00Z")]);
  const missingOnce = applyResults([config], first, [result([], "2026-08-02T10:00:00Z")]);
  const removed = applyResults([config], missingOnce, [result([], "2026-08-03T10:00:00Z")]);
  const readded = applyResults([config], removed, [result(["Alpha"], "2026-08-04T10:00:00Z")]);
  const missingAgain = applyResults([config], readded, [result([], "2026-08-05T10:00:00Z")]);
  const recovered = applyResults([config], missingAgain, [result(["Alpha"], "2026-08-06T10:00:00Z")]);

  assert.deepEqual(missingAgain.tournaments[0].teams.map((team) => team.rawName), ["Alpha"]);
  assert.equal(missingAgain.tournaments[0].pendingRemovals.length, 1);
  assert.equal(recovered.changes.filter((change) => change.type === "team_added" && change.teamName === "Alpha").length, 1);
});

test("normalized duplicate roster rows produce one team and one change", () => {
  const previous = applyResults([config], undefined, [result(["Alpha"], "2026-08-01T10:00:00Z")]);
  const duplicate = result(["Alpha", "Davis Dynamite-Carreira", "Davis Dynamite – Carreira"], "2026-08-02T10:00:00Z");
  duplicate.teams[1].paid = "yes";

  const next = applyResults([config], previous, [duplicate]);

  assert.deepEqual(next.tournaments[0].teams.map((team) => team.rawName), ["Alpha", "Davis Dynamite-Carreira"]);
  assert.equal(next.tournaments[0].teams[1].paid, "yes");
  assert.equal(next.changes.filter((change) => change.type === "team_added").length, 1);
  assert.equal(new Set(next.changes.map((change) => change.id)).size, next.changes.length);
});

test("a failed source preserves the last successful roster", () => {
  const previous = applyResults([config], undefined, [result(["Alpha"], "2026-08-01T10:00:00Z")]);
  const failed = applyResults([config], previous, [result([], "2026-08-02T10:00:00Z", "failure")]);
  assert.equal(failed.tournaments[0].teams[0].rawName, "Alpha");
  assert.equal(failed.tournaments[0].outcome, "failure");
});

test("page furniture never becomes a team or a removal alert", () => {
  const previous = applyResults([config], undefined, [result(["Alpha", "Refund Policy", "\u200B14u"], "2026-08-01T10:00:00Z")]);
  assert.deepEqual(previous.tournaments[0].teams.map((team) => team.rawName), ["Alpha"]);
  const next = applyResults([config], previous, [result(["Alpha"], "2026-08-02T10:00:00Z")]);
  assert.equal(next.changes.some((change) => /Refund Policy|14u/i.test(change.teamName ?? "")), false);
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

test("registration changes are logged after a structured baseline", () => {
  const firstResult = { ...result([], "2026-08-01T10:00:00Z"), registrationState: "limited" as const, spotsRemaining: 4 };
  const first = applyResults([config], undefined, [firstResult]);
  const nextResult = { ...result([], "2026-08-02T10:00:00Z"), registrationState: "closed" as const, spotsRemaining: 0 };
  const next = applyResults([config], first, [nextResult]);
  assert.equal(next.changes.some((change) => change.type === "registration_status_changed"), true);
  assert.equal(next.changes.some((change) => change.type === "spots_remaining_changed"), true);
});
