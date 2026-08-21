import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import configsJson from "../config/tournaments.json" with { type: "json" };
import { applyResults } from "../src/change-detection";
import { collectAll } from "../src/collectors";
import { currentOrFutureTournaments } from "../src/tournament-dates";
import type { MonitorState, TournamentConfig } from "../src/types";

const configs = configsJson as TournamentConfig[];
const activeConfigs = currentOrFutureTournaments(configs);
const statePath = resolve("data/state.json");

async function readPrevious(): Promise<MonitorState | undefined> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as MonitorState;
  } catch {
    return undefined;
  }
}

const previous = await readPrevious();
const results = await collectAll(activeConfigs);
const generatedAt = new Date().toISOString();
const next = applyResults(activeConfigs, previous, results, generatedAt);
const dateKey = generatedAt.slice(0, 10);

await mkdir(dirname(statePath), { recursive: true });
await mkdir("data/history", { recursive: true });
await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
await writeFile(`data/history/${dateKey}.json`, `${JSON.stringify(next, null, 2)}\n`, "utf8");

const failures = results.filter((result) => result.outcome === "failure");
for (const result of results) {
  console.log(`${result.tournamentId}: ${result.outcome} (${result.teams.length} teams)`);
}

if (failures.length) {
  console.warn(`${failures.length} source(s) failed; previous successful rosters were preserved.`);
  process.exitCode = 2;
}
