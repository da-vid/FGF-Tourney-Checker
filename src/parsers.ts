import { parseTeamLine, triState } from "./normalize";
import type { TeamRecord } from "./types";

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isAgeHeading(value: string): boolean {
  return /^(?:8U|10U|12U|14U|16U|18U|16\/18U)(?:\s+(?:Division|Girls))?$/i.test(value);
}

export function parseAstText(text: string, locationScope: string): TeamRecord[] {
  const all = lines(text);
  const teamMarker = all.findIndex((value) => value.toUpperCase() === "TEAMS");
  const searchStart = teamMarker >= 0 ? teamMarker : 0;
  const locationIndex = all.findIndex(
    (value, index) => {
      if (index <= searchStart) return false;
      const normalized = value.toUpperCase();
      const scope = locationScope.toUpperCase();
      if (scope === "SACRAMENTO") return /^(?:ROSEVILLE\/)?SACRAMENTO\b/.test(normalized);
      if (scope === "SALINAS") return /^SALINAS\b/.test(normalized);
      return normalized === scope;
    },
  );
  if (locationIndex < 0) throw new Error(`Location section ${locationScope} was not found`);

  const divisionIndex = all.findIndex(
    (value, index) => index > locationIndex && /^12U(?:\s+Division)?$/i.test(value),
  );
  if (divisionIndex < 0) throw new Error(`12U section was not found under ${locationScope}`);

  const nextHeading = all.findIndex(
    (value, index) => index > divisionIndex && (isAgeHeading(value) || ["SACRAMENTO", "SOUTHBAY", "SOUTH BAY", "EAST BAY"].includes(value.toUpperCase())),
  );
  const section = all.slice(divisionIndex + 1, nextHeading < 0 ? all.length : nextHeading);

  return section
    .filter((value) => !/spots? open|submit payment|register|game times|hotels?/i.test(value))
    .map((value) => parseTeamLine(value));
}

export function parseLegacyText(text: string): TeamRecord[] {
  const all = lines(text);
  const divisionIndex = all.findIndex((value) => /^12U Division$/i.test(value));
  if (divisionIndex < 0) throw new Error("Legacy 12U division was not found");
  const nextHeading = all.findIndex((value, index) => index > divisionIndex && isAgeHeading(value));
  const section = all.slice(divisionIndex + 1, nextHeading < 0 ? all.length : nextHeading);
  if (section.some((value) => /^No Teams Found\.?$/i.test(value))) return [];

  const result: TeamRecord[] = [];
  for (let index = 0; index < section.length; index += 1) {
    const value = section[index];
    if (/^(Team|Confirmed\?|Paid\?|Please wait)/i.test(value)) continue;
    const confirmedValue = section[index + 1];
    const paidValue = section[index + 2];
    if (/^(yes|no)$/i.test(confirmedValue ?? "") && /^(yes|no)$/i.test(paidValue ?? "")) {
      result.push(parseTeamLine(value, triState(confirmedValue), triState(paidValue)));
      index += 2;
    } else {
      result.push(parseTeamLine(value));
    }
  }
  return result;
}

export function isLegacyTeamResponseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "api.airtable.com" && /\/v0\/[^/]+\/Teams(?:$|\/)/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function parseLegacyRows(rows: string[][]): TeamRecord[] {
  if (rows.some((cells) => cells.some((value) => /^No Teams Found\.?$/i.test(value.trim())))) return [];

  return rows.flatMap((cells) => {
    const values = cells.map((value) => value.replace(/\s+/g, " ").trim());
    const teamName = values[1];
    if (!teamName || !/^\d+$/.test(values[0] ?? "")) return [];
    const record = parseTeamLine(teamName, triState(values[2]), triState(values[3]));
    if (/waitlist/i.test(values[2] ?? "")) record.note = "Waitlist";
    return [record];
  });
}

export function parseTournamentConnectDialog(text: string): TeamRecord[] {
  if (/No team found\.?/i.test(text)) return [];
  const all = lines(text).filter((value) => !/^(×|Close|Committed Teams)$/i.test(value));
  const divisionIndex = all.findIndex((value) => /^12U(?:\s*-\s*Girls)?$/i.test(value));
  if (divisionIndex < 0) return [];
  const nextHeading = all.findIndex(
    (value, index) => index > divisionIndex && /^(?:10U|14U|16U|18U)(?:\s*-\s*Girls)?$/i.test(value),
  );
  return all
    .slice(divisionIndex + 1, nextHeading < 0 ? all.length : nextHeading)
    .filter((value) => !/^(Date:|Location:)/i.test(value))
    .map((value) => parseTeamLine(value));
}

export function parseWcpText(text: string): TeamRecord[] {
  const all = lines(text);
  const divisionIndex = all.findIndex((value) => /^12U$/i.test(value));
  if (divisionIndex < 0) throw new Error("West Coast Premier 12U section was not found");
  const nextHeading = all.findIndex(
    (value, index) => index > divisionIndex && /^(?:14U|16U|18U|16\/18U)$/i.test(value),
  );
  return all
    .slice(divisionIndex + 1, nextHeading < 0 ? all.length : nextHeading)
    .filter((value) => !/^(?:register|pencil|who'?s coming|fall tournaments|home page|tournaments)$/i.test(value))
    .map((value) => parseTeamLine(value));
}

export function parseUsssaRows(rows: string[][]): TeamRecord[] {
  return rows.flatMap((cells) => {
    const values = cells.map((value) => value.replace(/\s+/g, " ").trim());
    if (/team class/i.test(values[0] ?? "")) return [];
    const teamName = values[1];
    return teamName ? [parseTeamLine(teamName)] : [];
  });
}

export function findPgfQualifierRows(rows: string[], expectedStartDate: string): string[] {
  const expected = new Date(`${expectedStartDate}T12:00:00Z`).getTime();
  return rows.filter((row) => {
    if (!/\b(STOCKTON|TRACY)\b/i.test(row) || !/\b12U\b/i.test(row)) return false;
    const match = row.match(/(\d{1,2}\/\d{1,2}\/2026)/);
    if (!match) return false;
    const [month, day, year] = match[1].split("/").map(Number);
    const candidate = Date.UTC(year, month - 1, day, 12);
    return Math.abs(candidate - expected) <= 14 * 24 * 60 * 60 * 1000;
  });
}
