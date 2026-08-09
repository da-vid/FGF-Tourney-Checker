import configsJson from "../config/tournaments.json" with { type: "json" };
import { collectAll } from "../src/collectors";
import type { TournamentConfig } from "../src/types";

const requestedId = process.argv[2];
const configs = configsJson as TournamentConfig[];
const selected = configs.filter((config) => !requestedId || config.id === requestedId);
if (selected.length === 0) throw new Error(`Unknown tournament id: ${requestedId}`);

const results = await collectAll(selected);
console.log(JSON.stringify(results, null, 2));
