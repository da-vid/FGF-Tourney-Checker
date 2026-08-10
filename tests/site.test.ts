import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("static dashboard contains core product content and no starter copy", async () => {
  const html = await readFile("pages-dist/index.html", "utf8");
  assert.match(html, /FGF Tourney Tracker/);
  assert.doesNotMatch(html, /12U Field Watch|FIELD WATCH|Alternate field watch/);
  assert.doesNotMatch(html, /Who’s in the field/);
  assert.match(html, /apple-touch-icon\.png/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /Weekend board/);
  assert.match(html, /PGF 12U National Qualifier/);
  assert.match(html, /Compare 6 alternatives/);
  assert.match(html, /Primary plan/);
  assert.match(html, /Sandlot Dugout Wars/);
  assert.match(html, /Official source/);
  assert.match(html, /Event-wide|Availability not published|Registration open/);
  assert.match(html, /font-family:\s*var\(--font-geist-sans, Arial\), Helvetica, sans-serif/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/);
});
