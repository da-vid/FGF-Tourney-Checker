import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";
import { readTournamentConnect12UDialog } from "../src/collectors";
import { parseTournamentConnectDialog } from "../src/parsers";

test("TournamentConnect reads current markup after delayed division and roster rendering", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const captured = await readFile("tests/fixtures/tournament-connect-current.html", "utf8");
    await page.setContent(`<div role="dialog">${captured}</div>`);
    const expected = await page.locator(".p-text > div").allTextContents();
    // The observed source has no ng-repeat attributes. Delay its actual rows.
    await page.evaluate(() => {
      const roster = document.querySelector(".p-text")!;
      const rows = roster.innerHTML;
      roster.innerHTML = "";
      setTimeout(() => { roster.innerHTML = rows; }, 100);
    });
    const teams = parseTournamentConnectDialog(await readTournamentConnect12UDialog(page, 2000));
    assert.equal(teams.length, 17);
    assert.deepEqual(teams.map(team => team.rawName), expected);
    assert.ok(teams.some(team => team.rawName === "Foothill Gold Fowler 2032"));
  } finally { await browser.close(); }
});

test("TournamentConnect missing division and empty loading shell fail closed", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const title = '<div class="entityTitle">Date: Nov 14, 2026</div>';
    await page.setContent(`<div role="dialog">${title}<a class="g-division">10U - Girls</a><p>No team found.</p></div>`);
    await assert.rejects(readTournamentConnect12UDialog(page, 200), /Timeout/);
    await page.setContent(`<div role="dialog">${title}<a class="g-division">12U - Girls</a><div class="d-well"><div class="p-text"></div></div></div>`);
    await assert.rejects(readTournamentConnect12UDialog(page, 200), /Timeout/);
    await page.locator('.d-well').evaluate(element => { element.innerHTML = '<p>No team found.</p>'; });
    assert.deepEqual(parseTournamentConnectDialog(await readTournamentConnect12UDialog(page, 200)), []);
  } finally { await browser.close(); }
});
