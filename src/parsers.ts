import { parseTeamLine, triState } from "./normalize";
import type { CapacityScope, RegistrationState, TeamRecord } from "./types";

export interface RegistrationSignal {
  registrationState: RegistrationState;
  registrationStatus: string;
  registrationDeadline?: string;
  spotsRemaining?: number;
  capacity?: number;
  capacityScope?: CapacityScope;
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isAgeHeading(value: string): boolean {
  return /^(?:8U|10U|12U|14U|16U|18U|16\/18U)(?:\s+(?:Division|Girls))?$/i.test(value);
}

function ast12uSection(text: string, locationScope: string): string[] {
  const all = lines(text);
  const teamMarker = all.findIndex((value) => value.toUpperCase() === "TEAMS");
  const searchStart = teamMarker >= 0 ? teamMarker : 0;
  const locationIndex = all.findIndex((value, index) => {
    if (index <= searchStart) return false;
    const normalized = value.toUpperCase();
    const scope = locationScope.toUpperCase();
    if (scope === "SACRAMENTO") return /^(?:ROSEVILLE\/)?SACRAMENTO\b/.test(normalized);
    if (scope === "SALINAS") return /^SALINAS\b/.test(normalized);
    return normalized === scope;
  });
  if (locationIndex < 0) throw new Error(`Location section ${locationScope} was not found`);

  const divisionIndex = all.findIndex(
    (value, index) => index > locationIndex && /^12U(?:\s+Division)?$/i.test(value),
  );
  if (divisionIndex < 0) throw new Error(`12U section was not found under ${locationScope}`);

  const nextHeading = all.findIndex(
    (value, index) => index > divisionIndex && (isAgeHeading(value) || /^(?:SACRAMENTO|SALINAS|SOUTH\s*BAY|SOUTHBAY|EAST BAY)$/i.test(value)),
  );
  return all.slice(divisionIndex + 1, nextHeading < 0 ? all.length : nextHeading);
}

export function parseRegistrationText(text: string): RegistrationSignal {
  const all = lines(text);
  const compact = all.join(" \n ");
  const deadline = compact.match(/\b(?:entry\s+)?deadline:?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1];
  const spotsMatch = all.map((line) => line.match(/\bSpots Left:\s*(\d+)\b/i)).find(Boolean)
    ?? all.map((line) => line.match(/\b(\d+)\s+spots?\s+(?:open|left|remaining|available)\b/i)).find(Boolean);
  const spotsRemaining = spotsMatch ? Number(spotsMatch[1]) : undefined;

  if (/\binvite[ -]?only\b/i.test(compact)) {
    return { registrationState: "invite_only", registrationStatus: "Invite only", registrationDeadline: deadline };
  }
  if (/\bwait\s*list\b|\bwaitlisted\b/i.test(compact)) {
    const fieldIsFull = /spots are filled|\bsold out\b|\bevent full\b|\bdivision full\b|\bat capacity\b/i.test(compact)
      || spotsRemaining === 0;
    return {
      registrationState: "waitlist",
      registrationStatus: fieldIsFull ? "Full · Waitlist available" : "Waitlist available",
      registrationDeadline: deadline,
      spotsRemaining: fieldIsFull ? 0 : spotsRemaining,
    };
  }
  if (/registration (?:is )?(?:closed|unavailable|not available)|sign[ -]?ups? closed|entries closed|closed to registration|registration has ended|no longer accepting (?:registrations|entries)/i.test(compact)) {
    return { registrationState: "closed", registrationStatus: "Registration closed", registrationDeadline: deadline, spotsRemaining };
  }
  if (/spots are filled|\bsold out\b|\bevent full\b|\bdivision full\b|\bat capacity\b/i.test(compact) || spotsRemaining === 0) {
    return { registrationState: "full", registrationStatus: "Full", registrationDeadline: deadline, spotsRemaining: 0 };
  }
  if (spotsRemaining !== undefined) {
    return {
      registrationState: "limited",
      registrationStatus: `${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`,
      registrationDeadline: deadline,
      spotsRemaining,
    };
  }
  return { registrationState: "unknown", registrationStatus: "Availability not published", registrationDeadline: deadline };
}

export function parseAstAvailability(text: string, locationScope: string): RegistrationSignal {
  const signal = parseRegistrationText(ast12uSection(text, locationScope).join("\n"));
  return signal.registrationState === "unknown"
    ? { ...signal, registrationStatus: "12U availability not published", capacityScope: "12U" }
    : { ...signal, capacityScope: "12U" };
}

export function parseLegacyAvailability(text: string): RegistrationSignal {
  const all = lines(text);
  const capacityMatch = text.match(/Event Spots Available:\s*(\d+)/i);
  const spotsLineIndex = all.findIndex((line) => /^Spots Left:/i.test(line));
  const sameLine = spotsLineIndex >= 0 ? all[spotsLineIndex].match(/^Spots Left:\s*(\d+)$/i) : undefined;
  const nextLine = spotsLineIndex >= 0 ? all[spotsLineIndex + 1]?.match(/^(\d+)$/) : undefined;
  const spotsRemaining = Number((sameLine ?? nextLine)?.[1]);
  const hasSpots = Number.isFinite(spotsRemaining);
  const closed = all.some((line) => /^Event Full\s*-\s*Sign Ups Closed\.?$/i.test(line));
  const waitlist = all.some((line) => /^Spots are Filled!?(?:\s+If you sign up you will be placed on (?:the )?waitlist\.?)$/i.test(line));
  const full = all.some((line) => /^Spots are Filled!?$/i.test(line)) || (hasSpots && spotsRemaining === 0);
  const registrationState: RegistrationState = closed ? "closed" : waitlist ? "waitlist" : full ? "full" : hasSpots ? "limited" : "unknown";
  const registrationStatus = closed
    ? "Registration closed"
    : waitlist
      ? "Full · Waitlist available"
    : full
      ? "Full"
      : hasSpots
        ? `${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`
        : "Availability not published";
  return {
    registrationState,
    registrationStatus,
    spotsRemaining: waitlist ? 0 : hasSpots ? spotsRemaining : undefined,
    capacity: capacityMatch ? Number(capacityMatch[1]) : undefined,
    capacityScope: "event",
  };
}

export function parseUsssaAvailability(text: string, registrationOpen: boolean): RegistrationSignal {
  const all = lines(text);
  const compact = all.join(" ");
  const division = compact.match(/12U\s+Tournament Division([\s\S]*?)(?:14U\s+Tournament Division|$)/i)?.[1] ?? compact;
  const maxMatch = division.match(/Max Entries\s*:?\s*(\d+)/i);
  const tableMaxMatch = compact.match(/Division\s+Entry Fee\s+Max Entries\s+Game\s+12U\s+\$[\d,.]+\s+(\d+)/i);
  const rowMaxMatch = all.map((line) => line.match(/^12U\s+\$[\d,.]+\s+(?:\$[\d,.]+\s+)?(\d+)\s+\d+\b/i)).find(Boolean);
  const capacity = Number((maxMatch ?? tableMaxMatch ?? rowMaxMatch)?.[1]);
  const hasCapacity = Number.isFinite(capacity);
  const generic = parseRegistrationText(division);
  if (generic.registrationState !== "unknown") {
    return { ...generic, capacity: hasCapacity ? capacity : undefined, capacityScope: "12U" };
  }
  return {
    registrationState: registrationOpen ? "open" : "unknown",
    registrationStatus: registrationOpen ? "Registration open" : "Availability not published",
    registrationDeadline: generic.registrationDeadline,
    capacity: hasCapacity ? capacity : undefined,
    capacityScope: "12U",
  };
}

export function parseAstText(text: string, locationScope: string): TeamRecord[] {
  const section = ast12uSection(text, locationScope);

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
  const all = lines(text).filter((value) => !/^(×|Close|Committed Teams)$/i.test(value));
  const divisionIndex = all.findIndex((value) => /^12U(?:\s*-\s*Girls)?$/i.test(value));
  if (divisionIndex < 0) return [];
  const nextHeading = all.findIndex(
    (value, index) => index > divisionIndex && /^(?:10U|14U|16U|18U)(?:\s*-\s*Girls)?$/i.test(value),
  );
  const division = all.slice(divisionIndex + 1, nextHeading < 0 ? all.length : nextHeading);
  if (division.some((value) => /^No team found\.?$/i.test(value))) return [];
  return division
    .filter((value) => !/^(Date:|Location:|1st to 3rd)$/i.test(value))
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
    .filter((value) => !/^(?:register|pencil|who'?s coming|fall tournaments|home page|tournaments|all pricing is in USD|refund policy|terms of service|privacy policy|park addresses|college showcases)$/i.test(value))
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
