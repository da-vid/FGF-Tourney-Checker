import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { splitChanges } from "../app/DashboardClient";
import configsJson from "../config/tournaments.json" with { type: "json" };
import { currentOrFutureTournaments } from "../src/tournament-dates";
import type { MonitorState, TournamentConfig } from "../src/types";

test("static dashboard contains core product content and no starter copy", async () => {
  const html = await readFile("pages-dist/index.html", "utf8");
  assert.match(html, /FGF Tourney Tracker/);
  assert.doesNotMatch(html, /12U Field Watch|FIELD WATCH|Alternate field watch/);
  assert.doesNotMatch(html, /Who’s in the field/);
  assert.match(html, /apple-touch-icon-v2\.png/);
  assert.match(html, /favicon-32-v2\.png/);
  assert.match(html, /fgf-tourney-tracker-icon-v2\.png/);
  assert.doesNotMatch(html, /favicon\.svg/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /Latest movement/);
  assert.doesNotMatch(html, /Weekend board|Locked play weekend|class="section-number">0[12]</);
  assert.match(html, /\.events-section\s*\{\s*order:\s*1;/);
  assert.match(html, /\.change-panel\s*\{\s*order:\s*2;/);
  assert.match(html, /PGF 12U National Qualifier/);
  assert.match(html, /Compare 6 alternatives/);
  assert.match(html, /<details class="deferred-weekend"[^>]*data-weekend-id="2026-10-17"/);
  assert.match(html, /Oct 17–Oct 18/);
  assert.match(html, /Deferred weekend/);
  assert.match(html, /4 tracked tournament options/);
  assert.match(html, /Primary plan/);
  assert.match(html, /Considering/);
  assert.match(html, /Young Guns Bash for Cash/);
  assert.match(html, /Fall Bat Wars/);
  assert.match(html, /The Original Legacy Cup/);
  assert.match(html, /Sandlot Dugout Wars/);
  assert.match(html, /Official source/);
  assert.match(html, /Scout this tournament/);
  assert.match(html, /https:\/\/scout\.lineuphelper\.com\/import\/tourneys\?tournament=/);
  assert.match(html, /Event-wide|Availability not published|Registration open/);
  assert.doesNotMatch(html, /<h3>Fab 5<\/h3>/);
  assert.match(html, /font-family:\s*var\(--font-geist-sans, Arial\), Helvetica, sans-serif/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/);

  const state = JSON.parse(await readFile("data/state.json", "utf8")) as MonitorState;
  const recentIds = [...html.matchAll(/data-change-id="([^"]+)" data-change-scope="recent"/g)].map((match) => match[1]);
  const historyIds = [...html.matchAll(/data-change-id="([^"]+)" data-change-scope="history"/g)].map((match) => match[1]);
  assert.equal(recentIds.length, Math.min(6, state.changes.length));
  assert.equal(historyIds.length, Math.max(0, state.changes.length - 6));
  assert.equal(new Set([...recentIds, ...historyIds]).size, state.changes.length);
  if (state.changes.length > 6) {
    assert.match(html, new RegExp(`View ${state.changes.length - 6} earlier changes?`));
    assert.match(html, /data-history-expander/);
  }
});

test("static export emits the Scout v1 index and per-tournament JSON", async () => {
  const indexPath = "pages-dist/scout/v1/tournaments/index.json";
  await access(indexPath);
  const index = JSON.parse(await readFile(indexPath, "utf8")) as {
    schemaVersion: number;
    tournaments: Array<{ id: string; exportUrl: string }>;
  };
  const state = JSON.parse(await readFile("data/state.json", "utf8")) as MonitorState;
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.tournaments.length, currentOrFutureTournaments(configsJson as TournamentConfig[]).length);

  const representative = index.tournaments[0];
  assert.equal(representative?.exportUrl, `/scout/v1/tournaments/${encodeURIComponent(representative.id)}.json`);
  const exported = JSON.parse(await readFile(`pages-dist${representative?.exportUrl}`, "utf8")) as {
    schemaVersion: number;
    tournament: { id: string };
    teams: unknown[];
  };
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.tournament.id, representative?.id);
  assert.doesNotMatch(JSON.stringify(exported), /diagnostic|github/i);
});

test("full history control only appears when there are older changes", () => {
  const changes = Array.from({ length: 7 }, (_, index) => ({ id: String(index) })) as unknown as MonitorState["changes"];
  assert.equal(splitChanges(changes.slice(0, 6)).older.length, 0);
  assert.equal(splitChanges(changes).older.length, 1);
});

test("October 24 tracks Keep Humble as primary and Monster Mash as an alternate", async () => {
  const configs = JSON.parse(await readFile("config/tournaments.json", "utf8")) as Array<{ id: string; role: string; sourceUrl: string }>;
  const keepHumble = configs.find((event) => event.id === "legacy-keep-humble-pcfl-qualifier-2026-folsom");
  const monsterMash = configs.find((event) => event.id === "first-to-third-monster-mash-2026");
  assert.equal(keepHumble?.role, "primary");
  assert.match(keepHumble?.sourceUrl ?? "", /keep-humble-fall-pcfl-alliance-qualifier/);
  assert.equal(monsterMash?.role, "alternate");
});

test("November 14 tracks Young Guns as considering with same-weekend alternatives", async () => {
  const configs = JSON.parse(await readFile("config/tournaments.json", "utf8")) as Array<{
    id: string;
    weekendId: string;
    role: string;
  }>;
  const weekend = configs.filter((event) => event.weekendId === "2026-11-14");
  assert.deepEqual(
    weekend.map((event) => [event.id, event.role]),
    [
      ["first-to-third-young-guns-bash-2026", "considering"],
      ["ast-fall-bat-wars-2026-sacramento", "alternate"],
      ["wcp-original-legacy-cup-2026", "alternate"],
    ],
  );
});
