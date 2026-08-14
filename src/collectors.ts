import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type Page, type Response } from "playwright";
import {
  findPgfQualifierRows,
  isLegacyTeamResponseUrl,
  parseAstAvailability,
  parseAstText,
  parseLegacyAvailability,
  parseLegacyRows,
  parseRegistrationText,
  parseTournamentConnectDialog,
  parseUsssaAvailability,
  parseUsssaRows,
  parseWcpText,
  type RegistrationSignal,
} from "./parsers";
import type { CollectionResult, TournamentConfig } from "./types";

const NAVIGATION_TIMEOUT = 35_000;

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText({ timeout: 15_000 });
}

function observed(signal: ReturnType<typeof parseRegistrationText>, checkedAt: string) {
  return { ...signal, registrationObservedAt: checkedAt };
}

function tournamentConnectSignal(cardText: string, registrationControl: boolean) {
  const signal = parseRegistrationText(cardText);
  if (signal.registrationState !== "unknown") return signal;
  if (registrationControl) return { ...signal, registrationState: "open" as const, registrationStatus: "Registration open" };
  return { ...signal, registrationState: "not_public" as const, registrationStatus: "No public registration" };
}

async function readTournamentConnect12UDialog(page: Page): Promise<string> {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 15_000 });

  // The dialog shell appears before TournamentConnect finishes loading the event.
  // Waiting for the event block prevents an incomplete shell from becoming a false zero.
  await dialog.locator(".entityTitle").waitFor({ state: "visible", timeout: 30_000 });
  const entityText = await dialog.locator(".entityTitle").innerText();
  if (!/Date:\s*\w{3}\s+\d{1,2}/i.test(entityText)) {
    throw new Error("Committed Teams dialog did not finish loading");
  }

  const division = dialog.locator("a.g-division").filter({ hasText: /^\s*12U\s*-\s*Girls\b/i }).first();
  const anyDivision = dialog.locator("a.g-division").first();
  const globalEmpty = dialog.getByText("No team found.", { exact: true });
  const loadedState = await Promise.race([
    anyDivision.waitFor({ state: "visible", timeout: 30_000 }).then(() => "divisions" as const),
    globalEmpty.waitFor({ state: "visible", timeout: 30_000 }).then(() => "empty" as const),
  ]);
  if (loadedState === "empty") return "Committed Teams\nNo team found.";
  if ((await division.count()) === 0) return "12U - Girls\nNo team found.\n14U - Girls";

  await division.click();
  const expanded = division.locator('xpath=following-sibling::div[contains(@class,"d-well")][1]');
  await expanded.waitFor({ state: "visible", timeout: 15_000 });
  const teamRows = expanded.locator('div[ng-repeat^="team in skill.teams."]');
  const teamNames = (await teamRows.allInnerTexts()).map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (teamNames.length === 0) return "12U - Girls\nNo team found.\n14U - Girls";
  return ["12U - Girls", ...teamNames, "14U - Girls"].join("\n");
}

async function inspectLinkedRegistration(
  page: Page,
  linkHref: string | null,
  baseUrl: string,
  expectedName: string,
): Promise<RegistrationSignal & { registrationUrl?: string }> {
  if (!linkHref) return parseRegistrationText("");
  if (/^javascript:/i.test(linkHref)) {
    return { ...parseRegistrationText(""), registrationStatus: "Registration link not active" };
  }
  const registrationUrl = new URL(linkHref, baseUrl).href;
  try {
    await page.goto(registrationUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
    await page.waitForTimeout(3_000);
    const text = await bodyText(page);
    const stopWords = new Set(["the", "event", "tournament", "classic", "awareness", "championship", "challenge", "2026"]);
    const expectedWords = expectedName.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 3 && !stopWords.has(word)) ?? [];
    const registrationText = text.toLowerCase();
    const matchingWords = expectedWords.filter((word) => registrationText.includes(word));
    const requiredMatches = Math.min(2, expectedWords.length);
    if (requiredMatches > 0 && matchingWords.length < requiredMatches) {
      return {
        ...parseRegistrationText(""),
        registrationStatus: "Registration link points to another event",
        registrationUrl,
      };
    }
    return { ...parseRegistrationText(text), registrationUrl };
  } catch {
    return { ...parseRegistrationText(""), registrationUrl };
  }
}

async function collectAst(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const text = await bodyText(page);
  if (!/Locations?:/i.test(text) || !/Age\s*\/\s*Class:/i.test(text)) {
    throw new Error("All Star event details did not finish loading");
  }
  if ((await page.getByText("TEAMS", { exact: true }).count()) === 0) {
    const checkedAt = new Date().toISOString();
    return {
      tournamentId: config.id,
      checkedAt,
      outcome: "success",
      officialName: config.name,
      sourceUrl: config.sourceUrl,
      teams: [],
      registrationState: "unknown",
      registrationStatus: "Event posted; 12U roster section is not published yet",
      registrationObservedAt: checkedAt,
    };
  }
  const checkedAt = new Date().toISOString();
  const availability = parseAstAvailability(text, config.locationScope ?? "SACRAMENTO");
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: config.name,
    sourceUrl: config.sourceUrl,
    teams: parseAstText(text, config.locationScope ?? "SACRAMENTO"),
    ...observed(availability, checkedAt),
  };
}

async function collectLegacy(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const teamsHeading = page.getByText("Teams Signed Up To This Event", { exact: true });
  await teamsHeading.waitFor({ state: "visible", timeout: 20_000 });
  const divisionRow = page.locator("tr").filter({ hasText: /^\s*12U Division\s*$/ }).first();
  await divisionRow.waitFor({ state: "visible", timeout: 20_000 });
  const availabilityContainer = page.locator("#leftover-text-container");
  await availabilityContainer.waitFor({ state: "visible", timeout: 20_000 });
  let responseCount = 0;
  let lastResponseAt = 0;
  let responseFailure: Response | undefined;
  const observeResponse = (response: Response) => {
    if (!isLegacyTeamResponseUrl(response.url())) return;
    responseCount += 1;
    lastResponseAt = Date.now();
    if (!response.ok()) responseFailure = response;
  };
  page.on("response", observeResponse);
  try {
    // Legacy lazily calculates event capacity separately from the 12U roster.
    // Both components must enter the viewport before their Airtable-backed values settle.
    await availabilityContainer.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const value = document.querySelector("#leftover-text-container")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return /Spots Left:\s*\d+|Spots are Filled|Event Full|waitlist/i.test(value);
    }, undefined, { timeout: 15_000 }).catch(() => undefined);
    await divisionRow.scrollIntoViewIfNeeded();
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(250);
      if (responseFailure) {
        throw new Error(`Legacy Airtable request returned HTTP ${responseFailure.status()}`);
      }
      if (responseCount > 0 && Date.now() - lastResponseAt >= 2_000) break;
    }
    if (responseCount === 0 || Date.now() - lastResponseAt < 2_000) {
      throw new Error("Legacy Airtable team requests did not finish loading");
    }
    // A second pass covers pages where only the roster scroll started the shared request.
    await availabilityContainer.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const value = document.querySelector("#leftover-text-container")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return /Spots Left:\s*\d+|Spots are Filled|Event Full|waitlist/i.test(value);
    }, undefined, { timeout: 15_000 }).catch(() => undefined);
    await divisionRow.scrollIntoViewIfNeeded();
  } finally {
    page.off("response", observeResponse);
  }
  await page.waitForTimeout(250);
  const text = await bodyText(page);
  const teamRows = page.locator("#team-list-table-body-12u tr");
  const rowCells = await teamRows.evaluateAll((rows) =>
    rows.map((row) => Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent?.trim() ?? "")),
  );
  if (rowCells.length === 0) throw new Error("Legacy 12U team rows were not found after loading");
  const checkedAt = new Date().toISOString();
  const teams = parseLegacyRows(rowCells);
  const parsedAvailability = parseLegacyAvailability(text);
  const availability = teams.some((team) => team.note === "Waitlist") && parsedAvailability.registrationState === "unknown"
    ? { ...parsedAvailability, registrationState: "waitlist" as const, registrationStatus: "Waitlist visible" }
    : parsedAvailability;
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: config.name,
    sourceUrl: config.sourceUrl,
    teams,
    ...observed(availability, checkedAt),
  };
}

async function collectTournamentConnect(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const matchText = config.eventMatch ?? config.name;
  const eventName = page.getByText(matchText, { exact: false }).first();
  await eventName.waitFor({ state: "visible", timeout: 25_000 });
  const card = eventName.locator('xpath=ancestor::*[.//a[normalize-space()="Committed Teams"]][1]');
  const cardText = await card.innerText();
  const dateNeedle = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${config.startDate}T12:00:00Z`),
  );
  if (!cardText.includes(dateNeedle)) {
    throw new Error(`Matched event did not contain expected date ${dateNeedle}`);
  }
  const hasRegistrationControl = (await card.getByText("Register", { exact: true }).count()) > 0
    || (await card.locator('input[type="checkbox"]:not([disabled])').count()) > 0;
  const availability = tournamentConnectSignal(cardText, hasRegistrationControl);
  await card.getByText("Committed Teams", { exact: true }).click();
  const dialogText = await readTournamentConnect12UDialog(page);
  const checkedAt = new Date().toISOString();
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: matchText,
    sourceUrl: config.sourceUrl,
    teams: parseTournamentConnectDialog(dialogText),
    ...observed(availability, checkedAt),
  };
}

async function collectTournamentConnectListing(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const matchText = config.eventMatch ?? config.name;
  const eventName = page.getByText(matchText, { exact: false }).first();
  const published = await eventName.waitFor({ state: "visible", timeout: 25_000 }).then(() => true).catch(() => false);
  if (!published) {
    const checkedAt = new Date().toISOString();
    return {
      tournamentId: config.id,
      checkedAt,
      outcome: "not_published",
      sourceUrl: config.sourceUrl,
      teams: [],
      registrationState: "not_published",
      registrationStatus: "Event is not currently published by the organizer",
      registrationObservedAt: checkedAt,
    };
  }

  const card = eventName.locator('xpath=ancestor::div[contains(@class,"event-container")][1]');
  const cardText = await card.innerText();
  const dateNeedle = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${config.startDate}T12:00:00Z`),
  );
  if (!cardText.includes(dateNeedle)) throw new Error(`Matched event did not contain expected date ${dateNeedle}`);

  const hasRegistrationControl = (await card.getByText("Register", { exact: true }).count()) > 0
    || (await card.locator('input[type="checkbox"]:not([disabled])').count()) > 0;
  const availability = tournamentConnectSignal(cardText, hasRegistrationControl);
  const committed = card.getByText("Committed Teams", { exact: true });
  if ((await committed.count()) === 0) {
    const checkedAt = new Date().toISOString();
    return {
      tournamentId: config.id,
      checkedAt,
      outcome: "success",
      officialName: matchText,
      sourceUrl: config.sourceUrl,
      teams: [],
      ...observed(availability, checkedAt),
    };
  }

  await committed.click();
  const dialogText = await readTournamentConnect12UDialog(page);
  const checkedAt = new Date().toISOString();
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: matchText,
    sourceUrl: config.sourceUrl,
    teams: parseTournamentConnectDialog(dialogText),
    ...observed(availability, checkedAt),
  };
}

async function collectWcp(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const text = await bodyText(page);
  const registerHref = await page.getByRole("link", { name: /register|pencil in/i }).first().getAttribute("href").catch(() => null);
  const linked = await inspectLinkedRegistration(page, registerHref, config.sourceUrl, config.name);
  const availability = linked.registrationState === "unknown" && linked.registrationStatus === "Availability not published"
    ? { ...linked, registrationStatus: linked.registrationUrl ? "Registration page available" : "Availability not published" }
    : linked;
  const checkedAt = new Date().toISOString();
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: config.name,
    sourceUrl: config.sourceUrl,
    teams: parseWcpText(text),
    ...observed(availability, checkedAt),
  };
}

async function collectWcpSchedule(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const cards = page.locator(".content-color-box-wrapper");
  const dateText = config.eventMatch ?? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${config.startDate}T12:00:00Z`),
  );
  const candidates = cards.filter({ hasText: dateText }).filter({ hasText: config.locationScope ?? config.location });
  if ((await candidates.count()) === 0) {
    const checkedAt = new Date().toISOString();
    return {
      tournamentId: config.id,
      checkedAt,
      outcome: "not_published",
      sourceUrl: config.sourceUrl,
      teams: [],
      registrationState: "not_published",
      registrationStatus: "Event is not currently published by West Coast Premier",
      registrationObservedAt: checkedAt,
    };
  }
  const card = candidates.first();
  const registerHref = await card.getByRole("link", { name: /register|pencil in/i }).first().getAttribute("href").catch(() => null);
  const rosterHref = await card.getByText(/who's coming/i).first().getAttribute("href");
  const linked = await inspectLinkedRegistration(page, registerHref, config.sourceUrl, config.name);
  const availability = linked.registrationState === "unknown" && linked.registrationStatus === "Availability not published"
    ? { ...linked, registrationStatus: linked.registrationUrl ? "Registration page available" : "Availability not published" }
    : linked;
  if (!rosterHref || /^javascript:/i.test(rosterHref)) {
    const checkedAt = new Date().toISOString();
    return {
      tournamentId: config.id,
      checkedAt,
      outcome: "success",
      officialName: config.name,
      sourceUrl: config.sourceUrl,
      teams: [],
      ...observed(availability, checkedAt),
    };
  }
  const rosterUrl = new URL(rosterHref, config.sourceUrl).href;
  await page.goto(rosterUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const checkedAt = new Date().toISOString();
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: config.name,
    sourceUrl: rosterUrl,
    teams: parseWcpText(await bodyText(page)),
    ...observed(availability, checkedAt),
  };
}

async function collectUsssa(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  const maxEntriesHeader = page.getByText("Max Entries", { exact: true }).first();
  await maxEntriesHeader.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(4_000);
  const eventText = await bodyText(page);
  const registrationOpen = (await page.getByRole("link", { name: /^Register$/i }).count()) > 0;
  const availability = parseUsssaAvailability(eventText, registrationOpen);
  await page.getByText("Who's Coming", { exact: true }).click();
  await Promise.race([
    page.getByText(/12\s*&\s*Under.*Teams/i).first().waitFor({ state: "visible", timeout: 20_000 }),
    page.getByText("No team data found for this event", { exact: true }).waitFor({ state: "visible", timeout: 20_000 }),
  ]);
  if ((await page.getByText("No team data found for this event", { exact: true }).count()) > 0) {
    const checkedAt = new Date().toISOString();
    return {
      tournamentId: config.id,
      checkedAt,
      outcome: "success",
      officialName: config.name,
      sourceUrl: config.sourceUrl,
      teams: [],
      ...observed(availability, checkedAt),
    };
  }
  const heading = page.getByText(/12\s*&\s*Under.*Teams/i).first();
  const table = heading.locator("xpath=following::table[1]");
  const rowCells = await table.locator("tr").evaluateAll((rows) =>
    rows.map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim() ?? "")),
  );
  const checkedAt = new Date().toISOString();
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: config.name,
    sourceUrl: config.sourceUrl,
    teams: parseUsssaRows(rowCells),
    ...observed(availability, checkedAt),
  };
}

async function collectPgfDiscovery(page: Page, config: TournamentConfig): Promise<CollectionResult> {
  await page.goto(config.sourceUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
  await page.getByText("National Qualifiers", { exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
  const rows = await page.locator("tr").allInnerTexts();
  const candidates = findPgfQualifierRows(rows, config.startDate);
  if (candidates.length === 0) {
    const checkedAt = new Date().toISOString();
    return {
      tournamentId: config.id,
      checkedAt,
      outcome: "not_published",
      sourceUrl: config.sourceUrl,
      teams: [],
      registrationState: "not_published",
      registrationStatus: "Not yet published by PGF",
      registrationObservedAt: checkedAt,
    };
  }
  if (candidates.length > 1) throw new Error(`Ambiguous PGF qualifier match: ${candidates.join(" | ")}`);
  const checkedAt = new Date().toISOString();
  return {
    tournamentId: config.id,
    checkedAt,
    outcome: "success",
    officialName: candidates[0].replace(/\s+/g, " ").trim(),
    sourceUrl: config.sourceUrl,
    teams: [],
    registrationState: "unknown",
    registrationStatus: "Published by PGF; committed-team source pending",
    registrationObservedAt: checkedAt,
  };
}

async function collectOne(browser: Browser, config: TournamentConfig): Promise<CollectionResult> {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  try {
    if (config.sourceType === "ast") return await collectAst(page, config);
    if (config.sourceType === "legacy") return await collectLegacy(page, config);
    if (config.sourceType === "tournamentConnect") return await collectTournamentConnect(page, config);
    if (config.sourceType === "tournamentConnectListing") return await collectTournamentConnectListing(page, config);
    if (config.sourceType === "wcp") return await collectWcp(page, config);
    if (config.sourceType === "wcpSchedule") return await collectWcpSchedule(page, config);
    if (config.sourceType === "usssa") return await collectUsssa(page, config);
    return await collectPgfDiscovery(page, config);
  } catch (error) {
    await mkdir(".artifacts", { recursive: true });
    await page.screenshot({ path: `.artifacts/${config.id}.png`, fullPage: true }).catch(() => undefined);
    await writeFile(`.artifacts/${config.id}.html`, await page.content().catch(() => ""), "utf8").catch(() => undefined);
    return {
      tournamentId: config.id,
      checkedAt: new Date().toISOString(),
      outcome: "failure",
      sourceUrl: config.sourceUrl,
      teams: [],
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close();
  }
}

export async function collectAll(configs: TournamentConfig[]): Promise<CollectionResult[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = new Array<CollectionResult>(configs.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < configs.length) {
        const index = nextIndex;
        nextIndex += 1;
        const config = configs[index];
        let result: CollectionResult | undefined;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          result = await collectOne(browser, config);
          if (result.outcome !== "failure" || attempt === 3) break;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
        }
        results[index] = result as CollectionResult;
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, configs.length) }, () => worker()));
    return results;
  } finally {
    await browser.close();
  }
}
