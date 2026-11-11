import assert from "node:assert/strict";
import test from "node:test";
import {
  durationLoops,
  lastLoopFromReplay,
  mapBaseName,
  opponentLabel,
  playerRace,
  shouldSkip,
  testBotName,
  toMatchDocument,
  toRanking,
  winnerName,
} from "../src/testlab.js";

test("built-in AI opponent is race and build", () => {
  assert.equal(opponentLabel({ opponent_race: "Protoss", opponent_build: "Macro" }), "Protoss Macro");
});

test("custom bot name wins over race and build", () => {
  assert.equal(opponentLabel({
    opponent_bot_name: "MarineCRUSH",
    opponent_race: "Terran",
    opponent_build: "Macro",
  }), "MarineCRUSH");
});

test("past version uses the bot directory and a 7 character hash", () => {
  assert.equal(opponentLabel({
    test_bot_name: "t-bone",
    test_bot_directory: "TBone",
    opponent_commit_hash: "abc1234ffff",
    opponent_bot_name: "ignored",
  }), "TBone_v_abc1234");
});

test("past version falls back to the test bot name", () => {
  assert.equal(opponentLabel({
    test_bot_name: "Terry",
    test_bot_directory: "",
    opponent_commit_hash: "abcdef123",
  }), "Terry_v_abcdef1");
});

test("replay test name wins over every other opponent field", () => {
  assert.equal(opponentLabel({
    replay_test_name: "natural fight",
    opponent_commit_hash: "abc1234ffff",
    opponent_bot_name: "MarineCRUSH",
    opponent_race: "Protoss",
    opponent_build: "Macro",
  }), "natural fight");
});

test("empty opponent is Unknown and a single race is kept", () => {
  assert.equal(opponentLabel({}), "Unknown");
  assert.equal(opponentLabel({ opponent_race: "Zerg", opponent_build: "" }), "Zerg");
});

test("empty test bot name is BotTato", () => {
  assert.equal(testBotName({}), "BotTato");
  assert.equal(testBotName({ test_bot_name: "t-bone" }), "t-bone");
});

test("winners follow Victory, Defeat, Tie, and Crash", () => {
  assert.equal(winnerName({ result: "Victory" }, "t-bone", "Protoss Macro"), "t-bone");
  assert.equal(winnerName({ result: "Defeat" }, "t-bone", "Protoss Macro"), "Protoss Macro");
  assert.equal(winnerName({ result: "Tie" }, "t-bone", "Protoss Macro"), "");
  assert.equal(winnerName({ result: "Crash" }, "t-bone", "Protoss Macro"), "");
});

test("map names keep the text through the first AIE", () => {
  assert.equal(mapBaseName("UltraloveAIE_v3"), "UltraloveAIE");
  assert.equal(mapBaseName("Acropolis"), "Acropolis");
  assert.equal(mapBaseName(null), "");
});

test("duration prefers a non-negative last loop", () => {
  assert.equal(durationLoops(90, 50), 50);
  assert.equal(durationLoops(90, 0), 0);
  assert.equal(durationLoops(90, undefined), 2016);
  assert.equal(durationLoops(null, -1), 0);
});

test("last loop is the highest event loop", () => {
  assert.equal(lastLoopFromReplay({ events: [{ loop: 10 }, { loop: 40 }, { loop: 15 }] }), 40);
  assert.equal(lastLoopFromReplay({ events: [] }), undefined);
  assert.equal(lastLoopFromReplay(null), undefined);
});

test("player races follow the spec fallbacks", () => {
  const row = {
    friendly_race: "Terran",
    test_bot_race: "Random",
    opponent_race: "Protoss",
    opponent_bot_name: "MarineCRUSH",
    opponent_bot_race: "Terran",
    opponent_commit_hash: "",
  };
  assert.equal(playerRace(row, "player1"), "Terran");
  assert.equal(playerRace({ test_bot_race: "Terran" }, "player1"), "Terran");
  assert.equal(playerRace(row, "player2"), "Terran");
  assert.equal(playerRace({ opponent_race: "Zerg" }, "player2"), "Zerg");
  assert.equal(playerRace({
    friendly_race: "Terran",
    test_bot_race: "Random",
    opponent_commit_hash: "abc1234",
    opponent_bot_name: "old",
    opponent_bot_race: "Zerg",
    opponent_race: "Protoss",
  }, "player2"), "Terran");
  assert.equal(playerRace({}, "player1"), "");
});

test("rankings are division 1 and do not set elo", () => {
  assert.deepEqual(toRanking("t-bone", "Terran"), {
    competition: 1,
    bot: "t-bone",
    division: 1,
    race: "Terran",
  });
});

test("shouldSkip leaves new matches and young parse failures", () => {
  assert.equal(shouldSkip(null), false);
  assert.equal(shouldSkip({ warnings: ["Failed to parse replay file."], parseAttempts: 2 }), false);
  assert.equal(shouldSkip({ warnings: ["Failed to parse replay file."], parseAttempts: 3 }), true);
  assert.equal(shouldSkip({ warnings: ["No replay file."], parseAttempts: 0 }), true);
  assert.equal(shouldSkip({ warnings: [], parseAttempts: 1 }), true);
});

test("a missing replay stores the no-replay warning and no overview", () => {
  const doc = toMatchDocument({
    id: 15,
    test_group_id: 83,
    map_name: "UltraloveAIE_v3",
    result: "Victory",
    duration_in_game_time: 90,
    start_timestamp: new Date("2026-11-06T18:33:04Z"),
    test_bot_name: "t-bone",
    opponent_race: "Protoss",
    opponent_build: "Macro",
  }, null);
  assert.equal(doc.competition, 1);
  assert.equal(doc.round, 83);
  assert.equal(doc.match, 15);
  assert.equal(doc.time, "2026-11-06T18:33:04.000Z");
  assert.equal(doc.map, "UltraloveAIE");
  assert.equal(doc.player1, "t-bone");
  assert.equal(doc.player2, "Protoss Macro");
  assert.equal(doc.winner, "t-bone");
  assert.equal(doc.duration, 2016);
  assert.equal(doc.side, 0);
  assert.equal(doc.replay, "");
  assert.deepEqual(doc.warnings, ["No replay file."]);
  assert.equal(doc.parseAttempts, 0);
  assert.equal("overview" in doc, false);
  assert.equal("timeline" in doc, false);
  assert.equal("review" in doc, false);
});

test("a parsed replay stores overview, timeline, and the success attempt", () => {
  const doc = toMatchDocument({
    id: 16,
    test_group_id: 84,
    map_name: "Acropolis",
    result: "Defeat",
    duration_in_game_time: 10,
    start_timestamp: "2026-11-06T18:00:00.000Z",
    test_bot_name: "t-bone",
    opponent_bot_name: "MarineCRUSH",
  }, {
    side: 2,
    warnings: ["Unable to read some of the game events!"],
    overview: { players: {} },
    timeline: [{ type: "stats" }],
    lastLoop: 400,
    replayPath: "/replays/16.SC2Replay",
    parseAttempts: 2,
  });
  assert.equal(doc.winner, "MarineCRUSH");
  assert.equal(doc.map, "Acropolis");
  assert.equal(doc.side, 2);
  assert.equal(doc.duration, 400);
  assert.equal(doc.replay, "/replays/16.SC2Replay");
  assert.deepEqual(doc.warnings, ["Unable to read some of the game events!"]);
  assert.equal(doc.parseAttempts, 2);
  assert.deepEqual(doc.overview, { players: {} });
  assert.deepEqual(doc.timeline, { version: 1, list: [{ type: "stats" }] });
});
