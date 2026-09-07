import type {
  ChangeRecord,
  CollectionResult,
  MonitorState,
  TeamRecord,
  TournamentConfig,
  TournamentState,
  TriState,
} from "./types";
import { normalizeTeamName } from "./normalize";

function changeId(tournamentId: string, type: string, team: string | undefined, at: string): string {
  return `${at}-${tournamentId}-${type}-${team ?? "event"}`.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

function makeChange(
  tournamentId: string,
  occurredAt: string,
  type: ChangeRecord["type"],
  detail: string,
  teamName?: string,
): ChangeRecord {
  return {
    id: changeId(tournamentId, type, teamName, occurredAt),
    tournamentId,
    occurredAt,
    type,
    teamName,
    detail,
  };
}

function blankState(config: TournamentConfig): TournamentState {
  return {
    ...config,
    outcome: "not_checked",
    teams: [],
    pendingRemovals: [],
  };
}

function isPageFurniture(value: string): boolean {
  const normalized = value.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  return /^(?:10U|12U|14U|16U|18U|16\/18U|All pricing is in USD|Refund Policy|Terms of Service|Privacy Policy|Park Addresses|College Showcases)$/i.test(normalized);
}

function strongestStatus(first: TriState, second: TriState): TriState {
  if (first === "yes" || second === "yes") return "yes";
  if (first === "no" || second === "no") return "no";
  return "unknown";
}

function byName(teams: TeamRecord[]): Map<string, TeamRecord> {
  const uniqueTeams = new Map<string, TeamRecord>();
  for (const team of teams) {
    const name = normalizeTeamName(team.rawName);
    if (!name || isPageFurniture(team.rawName)) continue;
    const existing = uniqueTeams.get(name);
    if (!existing) {
      uniqueTeams.set(name, team);
      continue;
    }
    uniqueTeams.set(name, {
      ...existing,
      normalizedName: name,
      confirmed: strongestStatus(existing.confirmed, team.confirmed),
      paid: strongestStatus(existing.paid, team.paid),
      note: existing.note ?? team.note,
    });
  }
  return uniqueTeams;
}

function readableRegistrationState(value: CollectionResult["registrationState"]): string {
  return (value ?? "unknown").replaceAll("_", " ");
}

export function applyResults(
  configs: TournamentConfig[],
  previous: MonitorState | undefined,
  results: CollectionResult[],
  generatedAt = new Date().toISOString(),
): MonitorState {
  const previousById = new Map(previous?.tournaments.map((event) => [event.id, event]) ?? []);
  const resultById = new Map(results.map((result) => [result.tournamentId, result]));
  const changes: ChangeRecord[] = (previous?.changes ?? []).filter((change) => {
    if (change.teamName && isPageFurniture(change.teamName)) return false;
    if (change.type !== "source_unhealthy") return true;
    return Boolean(previousById.get(change.tournamentId)?.lastSuccessfulCheck);
  });
  const tournaments = configs.map((config): TournamentState => {
    const old = previousById.get(config.id) ?? blankState(config);
    const result = resultById.get(config.id);
    if (!result) return old;

    if (result.outcome === "failure") {
      if (old.outcome !== "failure" && old.lastSuccessfulCheck) {
        changes.unshift(makeChange(config.id, result.checkedAt, "source_unhealthy", "The official source could not be read."));
      }
      return { ...old, ...config, outcome: "failure", checkedAt: result.checkedAt, diagnostic: result.diagnostic };
    }

    if (result.outcome === "not_published") {
      return {
        ...old,
        ...config,
        outcome: "not_published",
        checkedAt: result.checkedAt,
        lastSuccessfulCheck: result.checkedAt,
        registrationState: result.registrationState ?? old.registrationState,
        registrationStatus: result.registrationStatus ?? old.registrationStatus,
        registrationDeadline: result.registrationDeadline ?? old.registrationDeadline,
        registrationUrl: result.registrationUrl ?? old.registrationUrl,
        registrationObservedAt: result.registrationObservedAt ?? result.checkedAt,
        diagnostic: undefined,
      };
    }

    if (old.outcome === "failure" && old.lastSuccessfulCheck) {
      changes.unshift(makeChange(config.id, result.checkedAt, "source_recovered", "The official source is healthy again."));
    }
    if (config.status === "discovery" && old.outcome === "not_published" && result.outcome === "success") {
      changes.unshift(makeChange(config.id, result.checkedAt, "event_published", `${config.name} was published by the organizer.`));
    }

    const oldTeams = byName(old.teams);
    const newTeams = byName(result.teams);
    const pending = new Map(
      old.pendingRemovals
        .map((item) => [normalizeTeamName(item.team.rawName), item] as const)
        .filter(([name, item]) => Boolean(name) && !isPageFurniture(item.team.rawName)),
    );
    const priorTeams = new Map(oldTeams);
    for (const [name, item] of pending) {
      if (!priorTeams.has(name)) priorTeams.set(name, item.team);
    }
    const removedThisRun = new Set<string>();

    if (old.lastSuccessfulCheck) {
      if (old.registrationState && result.registrationState && old.registrationState !== result.registrationState) {
        changes.unshift(makeChange(
          config.id,
          result.checkedAt,
          "registration_status_changed",
          `Registration changed from ${readableRegistrationState(old.registrationState)} to ${readableRegistrationState(result.registrationState)}.`,
        ));
      }
      if (old.spotsRemaining !== undefined && result.spotsRemaining !== undefined && old.spotsRemaining !== result.spotsRemaining) {
        changes.unshift(makeChange(
          config.id,
          result.checkedAt,
          "spots_remaining_changed",
          `Published spots remaining changed from ${old.spotsRemaining} to ${result.spotsRemaining}.`,
        ));
      }
      if (old.registrationDeadline && result.registrationDeadline && old.registrationDeadline !== result.registrationDeadline) {
        changes.unshift(makeChange(
          config.id,
          result.checkedAt,
          "registration_deadline_changed",
          `Registration deadline changed from ${old.registrationDeadline} to ${result.registrationDeadline}.`,
        ));
      }
      for (const team of newTeams.values()) {
        const normalizedName = normalizeTeamName(team.rawName);
        const prior = priorTeams.get(normalizedName);
        pending.delete(normalizedName);
        if (!prior) {
          changes.unshift(makeChange(config.id, result.checkedAt, "team_added", `${team.rawName} joined the 12U field.`, team.rawName));
          continue;
        }
        if (prior.confirmed !== team.confirmed) {
          changes.unshift(makeChange(config.id, result.checkedAt, "confirmed_changed", `${team.rawName} confirmation changed to ${team.confirmed}.`, team.rawName));
        }
        if (prior.paid !== team.paid) {
          changes.unshift(makeChange(config.id, result.checkedAt, "paid_changed", `${team.rawName} payment status changed to ${team.paid}.`, team.rawName));
        }
      }

      for (const team of priorTeams.values()) {
        const normalizedName = normalizeTeamName(team.rawName);
        if (!normalizedName || newTeams.has(normalizedName)) continue;
        const existing = pending.get(normalizedName);
        if (existing && existing.observations >= 1) {
          pending.delete(normalizedName);
          removedThisRun.add(normalizedName);
          changes.unshift(makeChange(config.id, result.checkedAt, "team_removed", `${team.rawName} is no longer listed in the 12U field.`, team.rawName));
        } else {
          pending.set(normalizedName, {
            team,
            firstMissingAt: existing?.firstMissingAt ?? result.checkedAt,
            observations: (existing?.observations ?? 0) + 1,
          });
        }
      }
    }

    const displayedTeams = [
      ...newTeams.values(),
      ...[...pending.values()]
        .map((item) => item.team)
        .filter((team) => !removedThisRun.has(normalizeTeamName(team.rawName))),
    ];

    return {
      ...old,
      ...config,
      outcome: "success",
      checkedAt: result.checkedAt,
      lastSuccessfulCheck: result.checkedAt,
      officialName: result.officialName,
      teams: displayedTeams,
      pendingRemovals: [...pending.values()],
      capacity: result.capacity,
      spotsRemaining: result.spotsRemaining,
      capacityScope: result.capacityScope,
      registrationState: result.registrationState,
      registrationStatus: result.registrationStatus,
      registrationDeadline: result.registrationDeadline,
      registrationUrl: result.registrationUrl,
      registrationObservedAt: result.registrationObservedAt ?? result.checkedAt,
      diagnostic: undefined,
    };
  });

  return {
    generatedAt,
    baselineEstablished: true,
    tournaments,
    changes: changes.slice(0, 1000),
  };
}
