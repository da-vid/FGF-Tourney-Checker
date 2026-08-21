import configsJson from "../config/tournaments.json" with { type: "json" };
import { collectAll } from "../src/collectors";
import { currentOrFutureTournaments } from "../src/tournament-dates";
import type { TournamentConfig } from "../src/types";

const requestedId = process.argv[2];
const configs = configsJson as TournamentConfig[];
const matching = configs.filter((config) => !requestedId || config.id === requestedId);
if (matching.length === 0) throw new Error(`Unknown tournament id: ${requestedId}`);
const selected = currentOrFutureTournaments(matching);
if (selected.length === 0) throw new Error(`Tournament has ended and is no longer monitored: ${requestedId}`);

const results = await collectAll(selected);
console.log(JSON.stringify(results, null, 2));
