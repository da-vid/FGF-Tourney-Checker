import assert from "node:assert/strict";
import test from "node:test";
import { currentOrFutureTournaments, pacificDateKey, pacificDaysUntil } from "../src/tournament-dates";

test("Pacific date key changes at Pacific midnight", () => {
  assert.equal(pacificDateKey(new Date("2026-08-21T06:59:59Z")), "2026-08-20");
  assert.equal(pacificDateKey(new Date("2026-08-21T07:00:00Z")), "2026-08-21");
});

test("tournaments remain active through their end date", () => {
  const tournaments = [
    { id: "past", endDate: "2026-08-20" },
    { id: "today", endDate: "2026-08-21" },
    { id: "future", endDate: "2026-08-22" },
  ];
  assert.deepEqual(
    currentOrFutureTournaments(tournaments, "2026-08-21").map((event) => event.id),
    ["today", "future"],
  );
});

test("countdown uses Pacific calendar days, including DST and month boundaries", () => {
  for (const now of ["2026-09-06T08:00:00Z", "2026-09-07T06:59:59Z"]) assert.equal(pacificDaysUntil("2026-09-12", new Date(now)), 6);
  assert.equal(pacificDaysUntil("2026-09-12", new Date("2026-09-07T07:00:00Z")), 5);
  assert.equal(pacificDaysUntil("2026-11-02", new Date("2026-11-01T07:01:00Z")), 1);
  assert.equal(pacificDaysUntil("2026-12-01", new Date("2026-11-30T08:01:00Z")), 1);
  assert.equal(pacificDaysUntil("2026-09-06", new Date("2026-09-07T06:59:59Z")), 0);
});
