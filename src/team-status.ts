import { normalizeTeamName } from "./normalize";
import type { PendingRemoval, TeamRecord } from "./types";

export function isWaitlistedTeam(team: TeamRecord): boolean {
  return team.note?.trim().toLocaleLowerCase("en-US") === "waitlist";
}

export function pendingRemovalNames(pendingRemovals: PendingRemoval[]): Set<string> {
  return new Set(
    pendingRemovals
      .map((item) => normalizeTeamName(item.team.rawName))
      .filter(Boolean),
  );
}
