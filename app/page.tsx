import configsJson from "../config/tournaments.json";
import stateJson from "../data/state.json";
import type { MonitorState, TournamentConfig, TournamentState } from "../src/types";
import { DashboardClient } from "./DashboardClient";

export function dashboardState(): MonitorState {
  const configs = configsJson as TournamentConfig[];
  const state = stateJson as MonitorState;
  const stateById = new Map(state.tournaments.map((event) => [event.id, event]));
  const tournaments = configs.map((config): TournamentState => {
    const previous = stateById.get(config.id);
    if (previous) return { ...previous, ...config };
    return {
      ...config,
      outcome: config.status === "discovery" ? "not_published" : "not_checked",
      teams: [],
      pendingRemovals: [],
      registrationState: config.status === "discovery" ? "not_published" : "unknown",
      registrationStatus: config.status === "discovery" ? "Not yet published by the organizer" : undefined,
    };
  });
  return { ...state, tournaments };
}

export default function Home() {
  return <DashboardClient state={dashboardState()} />;
}
