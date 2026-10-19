import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardClient, splitChanges } from "../app/DashboardClient";
import { dashboardState } from "../app/page";
import { hasScoutRoster, createScoutTournamentIndex } from "../src/scout-export";
import { splitChanges } from "../app/DashboardClient";
import configsJson from "../config/tournaments.json" with { type: "json" };
import { currentOrFutureTournaments, pacificDateKey } from "../src/tournament-dates";
import type { MonitorState, TournamentConfig, TournamentState } from "../src/types";

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
  // Use the build's date: Pacific midnight can pass before this test runs.
  const date = html.match(/<meta name="dashboard-date" content="(\d{4}-\d{2}-\d{2})"/);
  assert.ok(date, "export records its Pacific filtering date");
  const expected = dashboardState(date[1]);
  const escapeText = (text: string) => renderToStaticMarkup(createElement("h3", null, text)).slice(4, -5);
  assert.deepEqual([...html.matchAll(/<article\b[^>]*>[\s\S]*?<h3>(.*?)<\/h3>/g)].map(match => match[1]).sort(),
    expected.tournaments.map(event => escapeText(event.name)).sort());
  const counts = new Map<string, number>();
  for (const event of expected.tournaments) counts.set(event.weekendId, (counts.get(event.weekendId) ?? 0) + 1);
  assert.deepEqual([...html.matchAll(/<strong>Compare (\d+) alternatives?<\/strong>/g)].map(match => Number(match[1])).sort(),
    [...counts.values()].filter(count => count > 1).map(count => count - 1).sort());
  assert.equal((html.match(/>Official source </g) ?? []).length, expected.tournaments.length);
  assert.equal((html.match(/>Scout this tournament </g) ?? []).length, expected.tournaments.filter(hasScoutRoster).length);
  if (!expected.tournaments.length) assert.match(html, /No tournament weekends match these filters/);
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
  const html = await readFile("pages-dist/index.html", "utf8");
  const date = html.match(/name="dashboard-date" content="([^"]+)"/);
  assert.ok(date);
  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.tournaments.map(event => event.id).sort(),
    currentOrFutureTournaments(configsJson as TournamentConfig[], date[1]).map(event => event.id).sort());

  // Check every export, including the valid case of no upcoming tournaments.
  for (const representative of index.tournaments) {
    assert.equal(representative.exportUrl, `/scout/v1/tournaments/${encodeURIComponent(representative.id)}.json`);
    const exported = JSON.parse(await readFile(`pages-dist${representative.exportUrl}`, "utf8")) as {
      schemaVersion: number;
      tournament: { id: string };
      teams: unknown[];
  };
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.tournament.id, representative.id);
  assert.doesNotMatch(JSON.stringify(exported), /diagnostic|github/i);
  }
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

function fixtureEvent(id: string, weekendId: string, role: TournamentState["role"] = "alternate"): TournamentState {
  return {
    id, name: `Fixture ${id}`, organizer: "Fixture organizer", location: "Sacramento",
    startDate: weekendId, endDate: weekendId === "2026-10-10" ? "2026-10-11" : "2026-10-18",
    weekendId, role, division: "12U", sourceType: "ast", sourceUrl: `https://example.com/${id}`,
    status: "active", outcome: "success", teams: [], pendingRemovals: [], registrationState: "open",
  };
}

const fixture: MonitorState = {
  generatedAt: "2026-10-10T18:00:00Z", baselineEstablished: true, changes: [],
  tournaments: [
    ...Array.from({ length: 7 }, (_, i) => fixtureEvent(`first-${i}`, "2026-10-10", i === 0 ? "primary" : "alternate")),
    ...Array.from({ length: 4 }, (_, i) => fixtureEvent(`deferred-${i}`, "2026-10-17", i === 0 ? "considering" : "alternate")),
  ],
};

for (const [instant, count, alternatives] of [
  ["2026-10-12T06:59:59Z", 11, [6, 3]],
  ["2026-10-12T07:00:00Z", 4, [3]],
  ["2026-10-19T06:59:59Z", 4, [3]],
  ["2026-10-19T07:00:00Z", 0, []],
] as const) {
  test(`dashboard and Scout fixtures at Pacific rollover ${instant}`, () => {
    const date = pacificDateKey(new Date(instant));
    const state = { ...fixture, tournaments: currentOrFutureTournaments(fixture.tournaments, date) };
    const html = renderToStaticMarkup(createElement(DashboardClient, { state }));
    assert.equal((html.match(/data-event-card="true"/g) ?? []).length, count);
    assert.deepEqual([...html.matchAll(/<strong>Compare (\d+) alternatives?<\/strong>/g)].map(match => Number(match[1])), alternatives);
    if (count) {
      assert.match(html, /<details class="deferred-weekend"[^>]*data-weekend-id="2026-10-17"/);
      assert.match(html, /Oct 17\u2013Oct 18/);
      assert.match(html, /Deferred weekend/);
      assert.match(html, /4 tracked tournament options/);
      assert.match(html, /Considering/);
      assert.match(html, /Registration open/);
      if (count === 11) assert.match(html, /Primary plan/);
    } else {
      assert.match(html, /No upcoming event/);
      assert.match(html, /No tournament weekends match these filters/);
      assert.doesNotMatch(html, /class="deferred-weekend"/);
    }
    assert.deepEqual(createScoutTournamentIndex(state).tournaments.map(event => event.id), state.tournaments.map(event => event.id));
    // Also exercise the production config/state merge at each boundary.
    assert.deepEqual(dashboardState(date).tournaments.map(event => event.id),
      (configsJson as TournamentConfig[]).filter(event => event.endDate >= date).map(event => event.id));
  });
}

test("future tournaments without observations render without Scout links", () => {
  const future = { ...fixtureEvent("future", "2099-01-01", "primary"), endDate: "2099-01-02", outcome: "not_checked" as const };
  const state = { ...fixture, tournaments: currentOrFutureTournaments([future], "2098-12-31") };
  const html = renderToStaticMarkup(createElement(DashboardClient, { state }));
  assert.match(html, /Fixture future/);
  assert.match(html, /First check pending/);
  assert.doesNotMatch(html, /Scout this tournament|Compare \d+ alternative/);
  assert.equal(createScoutTournamentIndex(state).tournaments[0].id, "future");
});
