import { normalizeTeamName } from "./normalize";
import { isWaitlistedTeam, pendingRemovalNames } from "./team-status";
import type { CheckOutcome, MonitorState, TeamRecord, TournamentState, TriState } from "./types";

export const SCOUT_SCHEMA_VERSION = 1 as const;

export type ScoutTeamStatus = "listed" | "confirmed" | "paid" | "waitlisted" | "verify_removal";
export type ScoutRosterState = "current" | "retained" | "unavailable";

export interface ScoutTournamentTeamV1 {
  rawName: string;
  normalizedName: string;
  confirmed: TriState;
  paid: TriState;
  note?: string;
  status: ScoutTeamStatus;
}

export interface ScoutTournamentExportV1 {
  schemaVersion: typeof SCOUT_SCHEMA_VERSION;
  generatedAt: string;
  tournament: {
    id: string;
    name: string;
    organizer?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    division?: string;
    sourceUrl: string;
    rosterObservedAt: string | null;
    collection: {
      outcome: CheckOutcome;
      monitoringStatus: TournamentState["status"];
      checkedAt: string | null;
      lastSuccessfulAt: string | null;
      rosterState: ScoutRosterState;
    };
  };
  teams: ScoutTournamentTeamV1[];
}

export interface ScoutTournamentIndexEntryV1 {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  exportUrl: string;
  rosterObservedAt: string | null;
}

export interface ScoutTournamentIndexV1 {
  schemaVersion: typeof SCOUT_SCHEMA_VERSION;
  generatedAt: string;
  tournaments: ScoutTournamentIndexEntryV1[];
}

function rosterState(event: TournamentState): ScoutRosterState {
  if (event.teams.length === 0) return "unavailable";
  return event.outcome === "success" ? "current" : "retained";
}

function rosterObservedAt(event: TournamentState): string | null {
  if (event.teams.length === 0) return null;
  return event.lastSuccessfulCheck ?? event.checkedAt ?? null;
}

function teamStatus(team: TeamRecord, isPendingRemoval: boolean): ScoutTeamStatus {
  if (isPendingRemoval) return "verify_removal";
  if (isWaitlistedTeam(team)) return "waitlisted";
  if (team.paid === "yes") return "paid";
  if (team.confirmed === "yes") return "confirmed";
  return "listed";
}

function exportedTeams(event: TournamentState): ScoutTournamentTeamV1[] {
  const pendingNames = pendingRemovalNames(event.pendingRemovals);
  const uniqueTeams = new Map<string, TeamRecord>();

  for (const team of [...event.teams, ...event.pendingRemovals.map((item) => item.team)]) {
    const normalizedName = normalizeTeamName(team.rawName);
    if (!normalizedName || uniqueTeams.has(normalizedName)) continue;
    uniqueTeams.set(normalizedName, team);
  }

  return [...uniqueTeams.entries()].map(([normalizedName, team]) => ({
    rawName: team.rawName,
    normalizedName,
    confirmed: team.confirmed,
    paid: team.paid,
    ...(team.note ? { note: team.note } : {}),
    status: teamStatus(team, pendingNames.has(normalizedName)),
  }));
}

export function scoutTournamentExportPath(tournamentId: string): string {
  return `/scout/v1/tournaments/${encodeURIComponent(tournamentId)}.json`;
}

export function scoutImportUrl(tournamentId: string): string {
  return `https://scout.lineuphelper.com/import/tourneys?tournament=${encodeURIComponent(tournamentId)}`;
}

export function createScoutTournamentExport(
  event: TournamentState,
  generatedAt: string,
): ScoutTournamentExportV1 {
  return {
    schemaVersion: SCOUT_SCHEMA_VERSION,
    generatedAt,
    tournament: {
      id: event.id,
      name: event.name,
      ...(event.organizer ? { organizer: event.organizer } : {}),
      ...(event.startDate ? { startDate: event.startDate } : {}),
      ...(event.endDate ? { endDate: event.endDate } : {}),
      ...(event.location ? { location: event.location } : {}),
      ...(event.division ? { division: event.division } : {}),
      sourceUrl: event.sourceUrl,
      rosterObservedAt: rosterObservedAt(event),
      collection: {
        outcome: event.outcome,
        monitoringStatus: event.status,
        checkedAt: event.checkedAt ?? null,
        lastSuccessfulAt: event.lastSuccessfulCheck ?? null,
        rosterState: rosterState(event),
      },
    },
    teams: exportedTeams(event),
  };
}

export function createScoutTournamentExports(state: MonitorState): ScoutTournamentExportV1[] {
  return state.tournaments.map((event) => createScoutTournamentExport(event, state.generatedAt));
}

export function createScoutTournamentIndex(state: MonitorState): ScoutTournamentIndexV1 {
  return {
    schemaVersion: SCOUT_SCHEMA_VERSION,
    generatedAt: state.generatedAt,
    tournaments: state.tournaments.map((event) => ({
      id: event.id,
      name: event.name,
      ...(event.startDate ? { startDate: event.startDate } : {}),
      ...(event.endDate ? { endDate: event.endDate } : {}),
      exportUrl: scoutTournamentExportPath(event.id),
      rosterObservedAt: rosterObservedAt(event),
    })),
  };
}

export function hasScoutRoster(event: TournamentState): boolean {
  return exportedTeams(event).length > 0;
}
