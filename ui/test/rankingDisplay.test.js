import test from "node:test";
import assert from "node:assert/strict";
import { compareRankings, formatWinRate } from "../src/rankingDisplay.js";

test("a missing win rate formats as an empty string", () => {
  assert.equal(formatWinRate(undefined), "");
  assert.equal(formatWinRate(50), "50.00%");
});

test("a missing elo sorts as zero within a division", () => {
  const rows = [
    { bot: "b", division: 1, elo: 10 },
    { bot: "a", division: 1 },
    { bot: "c", division: 1, elo: 30 },
  ].sort(compareRankings);

  assert.deepEqual(rows.map((one) => one.bot), ["c", "b", "a"]);
});
