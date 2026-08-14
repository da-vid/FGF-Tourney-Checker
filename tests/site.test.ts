import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { splitChanges } from "../app/DashboardClient";
import type { MonitorState } from "../src/types";

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
  assert.match(html, /Primary plan/);
  assert.match(html, /Sandlot Dugout Wars/);
  assert.match(html, /Official source/);
  assert.match(html, /Event-wide|Availability not published|Registration open/);
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
