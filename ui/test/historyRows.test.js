import test from "node:test";
import assert from "node:assert/strict";
import { historyRows } from "../src/historyRows.js";

test("two games in one round both appear, ordered by match id", () => {
  const rows = historyRows([
    { round: 4, match: 20 },
    { round: 4, match: 11 },
  ], 8);

  assert.deepEqual(rows, [[
    { round: 4, match: 11 },
    { round: 4, match: 20 },
  ]]);
});

test("round 0 is included and rounds sort before match id", () => {
  const rows = historyRows([
    { round: 2, match: 5 },
    { round: 0, match: 9 },
    { round: 2, match: 3 },
  ], 8);

  assert.deepEqual(rows.flat().map((one) => one.match), [9, 3, 5]);
});

test("a zero cell width still returns every match", () => {
  const rows = historyRows([
    { round: 1, match: 1 },
    { round: 1, match: 2 },
  ], 0);

  assert.equal(rows.flat().length, 2);
});
