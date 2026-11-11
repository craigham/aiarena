import fs from "node:fs";
import path from "node:path";

const LOOPS_PER_SECOND = 22.4;
export const NO_REPLAY = "No replay file.";
export const PARSE_FAILED = "Failed to parse replay file.";

export function competitionId() {
  const value = Number(process.env.COMPETITION || 1);
  return Number.isFinite(value) ? value : 1;
}

function nonEmpty(value) {
  return value !== undefined && value !== null && String(value) !== "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (nonEmpty(value)) return String(value);
  }
  return "";
}

export function testBotName(row) {
  return firstNonEmpty(row.test_bot_name) || "BotTato";
}

export function opponentLabel(row) {
  if (nonEmpty(row.replay_test_name)) return String(row.replay_test_name);
  if (nonEmpty(row.opponent_commit_hash)) {
    const directory = firstNonEmpty(row.test_bot_directory) || testBotName(row);
    return directory + "_v_" + String(row.opponent_commit_hash).slice(0, 7);
  }
  if (nonEmpty(row.opponent_bot_name)) return String(row.opponent_bot_name);
  const parts = [row.opponent_race, row.opponent_build].filter(nonEmpty).map(String);
  return parts.length ? parts.join(" ") : "Unknown";
}

export function winnerName(row, player1, player2) {
  if (row.result === "Victory") return player1;
  if (row.result === "Defeat") return player2;
  return "";
}

export function mapBaseName(name) {
  if (!nonEmpty(name)) return "";
  const text = String(name);
  const index = text.indexOf("AIE");
  if (index < 0) return text;
  return text.slice(0, index + 3);
}

export function durationLoops(seconds, lastLoop) {
  if (typeof lastLoop === "number" && lastLoop >= 0) return lastLoop;
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * LOOPS_PER_SECOND);
}

export function lastLoopFromReplay(replay) {
  if (!replay || !Array.isArray(replay.events)) return undefined;
  let last = -1;
  for (const event of replay.events) {
    if (typeof event.loop === "number" && event.loop > last) last = event.loop;
  }
  return last >= 0 ? last : undefined;
}

export function playerRace(row, side) {
  if (side === "player1") return firstNonEmpty(row.friendly_race, row.test_bot_race);
  if (nonEmpty(row.opponent_commit_hash)) return firstNonEmpty(row.friendly_race, row.test_bot_race);
  if (nonEmpty(row.opponent_bot_name)) return firstNonEmpty(row.opponent_bot_race);
  return firstNonEmpty(row.opponent_race);
}

export function toRanking(name, race) {
  return {
    competition: competitionId(),
    bot: name,
    division: 1,
    race: race || "",
  };
}

export function shouldSkip(existing) {
  if (!existing) return false;
  const warnings = Array.isArray(existing.warnings) ? existing.warnings : [];
  if (warnings.includes(NO_REPLAY)) return true;
  if (warnings.includes(PARSE_FAILED)) return Number(existing.parseAttempts || 0) >= 3;
  return true;
}

function toIso(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function toMatchDocument(row, parsed) {
  const player1 = testBotName(row);
  const player2 = opponentLabel(row);
  const doc = {
    competition: competitionId(),
    round: row.test_group_id,
    match: row.id,
    time: toIso(row.start_timestamp),
    map: mapBaseName(row.map_name),
    side: parsed && parsed.side ? parsed.side : 0,
    player1,
    player2,
    duration: durationLoops(row.duration_in_game_time, parsed ? parsed.lastLoop : undefined),
    winner: winnerName(row, player1, player2),
    replay: parsed && parsed.replayPath ? parsed.replayPath : "",
    warnings: parsed ? (parsed.warnings || []) : [NO_REPLAY],
    parseAttempts: parsed && Number.isFinite(parsed.parseAttempts) ? parsed.parseAttempts : 0,
  };
  if (parsed && parsed.overview) doc.overview = parsed.overview;
  if (parsed && parsed.timeline) doc.timeline = { version: 1, list: parsed.timeline };
  return doc;
}

export function assertReplayRoot(root) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error("TEST_LAB_REPLAY_ROOT is not a directory: " + root);
  }
}

function firstReplay(directory, prefix) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return null;
  const names = fs.readdirSync(directory)
    .filter(name => name.endsWith(".SC2Replay") && (!prefix || name.startsWith(prefix)))
    .sort();
  if (!names.length) return null;
  return path.join(directory, names[0]);
}

export function resolveReplayPath(root, matchId) {
  const id = String(matchId);
  const fromRuns = firstReplay(path.join(root, "runs", id, "replays"));
  if (fromRuns) return fromRuns;
  return firstReplay(path.join(root, "blizzard_ai_runs"), id + "_");
}

export const FINISHED_MATCHES_SQL = `
SELECT
  m.id,
  m.test_group_id,
  m.map_name,
  m.result,
  m.duration_in_game_time,
  m.start_timestamp,
  m.opponent_race,
  m.opponent_build,
  m.opponent_commit_hash,
  m.friendly_race,
  tb.name AS test_bot_name,
  tb.race AS test_bot_race,
  tb.bot_directory AS test_bot_directory,
  ob.name AS opponent_bot_name,
  ob.race AS opponent_bot_race,
  rt.name AS replay_test_name
FROM match m
LEFT JOIN custom_bot tb ON tb.id = m.test_bot_id
LEFT JOIN custom_bot ob ON ob.id = m.opponent_bot_id
LEFT JOIN replay_test rt ON rt.id = m.replay_test_id
WHERE m.test_group_id >= 0
  AND m.result IN ('Victory', 'Defeat', 'Tie', 'Crash')
ORDER BY m.id ASC
`;

export async function selectFinishedMatches(query) {
  return await query(FINISHED_MATCHES_SQL, []);
}

async function storeBothRankings(storeRanking, row) {
  await storeRanking(toRanking(testBotName(row), playerRace(row, "player1")));
  await storeRanking(toRanking(opponentLabel(row), playerRace(row, "player2")));
}

export async function importTestLabMatches(deps) {
  assertReplayRoot(deps.replayRoot);
  const rows = await selectFinishedMatches(deps.query);
  for (const row of rows) {
    const existing = await deps.findMatch(row.id);
    if (shouldSkip(existing)) continue;
    const previousAttempts = existing && Number.isFinite(Number(existing.parseAttempts))
      ? Number(existing.parseAttempts)
      : 0;
    let doc;
    try {
      const replayPath = resolveReplayPath(deps.replayRoot, row.id);
      if (!replayPath) {
        doc = toMatchDocument(row, null);
      } else {
        const replay = await deps.loadReplay(replayPath);
        const timeline = await deps.buildTimeline({ id: row.id, replay: replayPath });
        const overview = await deps.buildOverview(replay, timeline);
        doc = toMatchDocument(row, {
          side: replay.side || 0,
          warnings: replay.warnings ? [...replay.warnings] : [],
          overview,
          timeline,
          lastLoop: lastLoopFromReplay(replay),
          replayPath,
          parseAttempts: previousAttempts + 1,
        });
      }
    } catch (error) {
      console.log(error && error.message ? error.message : error);
      doc = toMatchDocument(row, {
        warnings: [PARSE_FAILED],
        parseAttempts: previousAttempts + 1,
      });
    }
    await deps.storeMatch(doc);
    await storeBothRankings(deps.storeRanking, row);
  }
}
