import type { TeamRecord, TriState } from "./types";

const STATUS_SUFFIX = /(?:\s*[-–—]\s*|\s+)(pd|paid|conf|confirmed)\.?$/i;

export function normalizeTeamName(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(STATUS_SUFFIX, "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function parseTeamLine(rawValue: string, confirmed: TriState = "unknown", paid: TriState = "unknown"): TeamRecord {
  const rawName = rawValue.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  const suffixes = [...rawName.matchAll(/(?:^|[-–—\s])(pd|paid|conf|confirmed)\.?\b/gi)].map(
    (match) => match[1].toLowerCase(),
  );

  return {
    rawName: rawName.replace(STATUS_SUFFIX, "").trim(),
    normalizedName: normalizeTeamName(rawName),
    confirmed: suffixes.some((value) => value.startsWith("conf")) ? "yes" : confirmed,
    paid: suffixes.some((value) => value === "pd" || value === "paid") ? "yes" : paid,
  };
}

export function triState(value: string | undefined): TriState {
  if (!value) return "unknown";
  if (/^(yes|y|true|confirmed|paid)$/i.test(value.trim())) return "yes";
  if (/^(no|n|false)$/i.test(value.trim())) return "no";
  return "unknown";
}
