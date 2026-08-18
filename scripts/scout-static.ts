import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createScoutTournamentExports,
  createScoutTournamentIndex,
  scoutTournamentExportPath,
} from "../src/scout-export";
import type { MonitorState } from "../src/types";

export async function writeScoutExports(outputRoot: string, state: MonitorState): Promise<void> {
  const outputDirectory = join(outputRoot, "scout", "v1", "tournaments");
  await mkdir(outputDirectory, { recursive: true });

  for (const tournament of createScoutTournamentExports(state)) {
    const relativePath = scoutTournamentExportPath(tournament.tournament.id).replace(/^\//, "");
    await writeFile(join(outputRoot, relativePath), `${JSON.stringify(tournament, null, 2)}\n`, "utf8");
  }

  const index = createScoutTournamentIndex(state);
  await writeFile(join(outputDirectory, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}
