import assert from "node:assert/strict";
import test from "node:test";
import { currentOrFutureTournaments, pacificDateKey } from "../src/tournament-dates";

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
