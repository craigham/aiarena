# Test lab Kibitz importer

## Goal

Show finished test-lab games on a separate Kibitz site. `/bot/t-bone` uses the existing rounds grid: each column is a test group id, each row is an opponent, and a cell opens the existing match page (build order, army, timeline). Test lab pages do not change. The written Gemini review is not generated.

This work happens in `craigham/aiarena`. The aiarena.net ladder scrape is replaced. This deploy uses its own MongoDB, so a test-lab match id is the Kibitz match id.

## Architecture

The UI, API shape, replay parser, timeline, and overview stay. A new importer in the replay job reads finished matches from the test lab MySQL database and reads `.SC2Replay` files from the directories test lab already writes. `/test_lab/replay/{id}/` launches StarCraft and returns no file, so it is not a download URL.

The worker needs read-only MySQL credentials and the test lab `aiarena` directory mounted at `TEST_LAB_REPLAY_ROOT`.

Competition id is `1`, from the `COMPETITION` environment variable (default `1`), in both the replay job and the API. Ladder competition `37` is not used.

## Components

### Importer (`replay/src/testlab.js`, new)

Pure mapping plus two I/O functions. The mapping functions take plain objects and return plain objects so tests do not need MySQL or Mongo.

- `selectFinishedMatches(query)` runs the SQL below and returns rows. `query` is an async function `(sql, params) => rows` so the MySQL driver stays at the edge.
- `resolveReplayPath(root, matchId)` returns the replay path or `null`.
- `assertReplayRoot(root)` throws if `root` is missing or not a directory.
- `opponentLabel(row)` returns the player 2 name.
- `winnerName(row, player1, player2)` returns the winner or `""`.
- `mapBaseName(name)` strips any suffix after `AIE`.
- `durationLoops(seconds, lastLoop)` returns game loops.
- `toMatchDocument(row, parsed)` returns the Mongo match document.
- `toRanking(name, race)` returns the ranking document.
- `shouldSkip(existing)` returns whether a stored match is left alone.

`parsed` is `{ side, warnings, overview, timeline, lastLoop, replayPath }` or `null` when there is no file.

### Job (`replay/src/start.js`)

Remove the aiarena.net login, round picker, and Elo update. The job:

1. Calls `assertReplayRoot`. On failure, log and exit non-zero before any write.
2. Loads finished matches in ascending match id.
3. For each row, if `shouldSkip` is true, continue.
4. Resolves and parses the replay inside a per-match try/catch. A thrown parse stores `Failed to parse replay file.` and continues.
5. Calls the existing `storeMatch` and `storeRanking`. Does not call `getReview`.

`getTimeline` and `getOverview` stay as they are. `storeMatch` and `storeRanking` in `replay/src/mongo.js` stay as they are.

### API

`api/src/mongo.js` reads `process.env.COMPETITION` (default `1`) everywhere it currently uses `37`.

Remove `POST /api/replay/*` from `api/src/server.js`. That route logs into aiarena.net to fetch a ladder replay URL.

### Match page

In `ui/src/Match.js`, remove the “Download replay” link to `https://aiarena.net/matches/{id}`. `ReviewCard` already renders nothing when `review` is absent.

### Dependencies and config

Add `mysql2` to `replay/package.json`.

Environment variables, with test lab quickstart defaults:

| Variable | Default |
| --- | --- |
| `COMPETITION` | `1` |
| `TEST_LAB_DB_HOST` | `127.0.0.1` |
| `TEST_LAB_DB_PORT` | `3307` |
| `TEST_LAB_DB_USER` | `root` |
| `TEST_LAB_DB_PASSWORD` | `testlab` |
| `TEST_LAB_DB_NAME` | `sc_bot` |
| `TEST_LAB_REPLAY_ROOT` | required, no default |

Document these, and the volume mount of the test lab `aiarena` directory, in `replay/README.md`. Do not change the ingress host in `kubernetes.yaml`.

## Data flow

Import every finished match on every run. There is no “latest group only” path. A match already stored successfully is skipped, so later runs only do new ids and parse retries.

SQL, against tables `match`, `custom_bot`, and `replay_test`:

```sql
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
```

`Pending`, `Queued`, and `Undecided` wait. `Crash` is imported with an empty winner. `Aborted` is a results-page label, not a stored result, and is not queried.

Opponent label, first matching rule wins:

1. Non-empty `replay_test_name`.
2. Non-empty `opponent_commit_hash`: `{directory}_v_{hash7}`, where `directory` is `test_bot_directory` when set, otherwise the test bot name, and `hash7` is the first 7 characters of the hash.
3. Non-empty `opponent_bot_name`.
4. `opponent_race` and `opponent_build` joined with a single space, skipping empty parts.
5. Otherwise `Unknown`.

The label does not include difficulty. If two matches in one test group share a label, the higher match id is the one stored last and is the cell the grid shows. `storeMatch` upserts by match id, so both documents exist; the UI shows both only when they land on different rounds or opponents. Same round and same opponent: `Rounds.js` keeps the later cell assignment while iterating matches. Process order is ascending id, so the higher id wins.

Player 1 is `test_bot_name`, or `BotTato` when that is empty.

Winner:

- `Victory` → player 1
- `Defeat` → player 2
- `Tie` or `Crash` → `""`

Map: if `map_name` contains `AIE`, keep through the first `AIE` and drop the rest (`UltraloveAIE_v3` → `UltraloveAIE`). Otherwise keep `map_name`. Null becomes `""`.

Duration: `lastLoop` from the parsed replay when it is a number greater than or equal to 0. Otherwise `Math.round((duration_in_game_time or 0) * 22.4)`.

Replay path, first hit wins:

1. `{TEST_LAB_REPLAY_ROOT}/runs/{id}/replays/*.SC2Replay`
2. `{TEST_LAB_REPLAY_ROOT}/blizzard_ai_runs/{id}_*.SC2Replay`

Use the first path returned by a directory listing sorted by filename. No file returns `null`.

Match document fields written by `storeMatch`:

- `competition`: `1`
- `round`: `test_group_id`
- `match`: `id`
- `time`: `start_timestamp` as an ISO string
- `map`, `side`, `player1`, `player2`, `duration`, `winner`
- `side`: parser `side`, or `0` when there is no successful parse
- `replay`: absolute path, or `""` when there is no file
- `warnings`: array of strings
- `overview`: omitted when there is no successful parse
- `timeline`: `{ version: 1, list }` on success, omitted otherwise
- `review`: not set
- `parseAttempts`: see error handling

Ranking document, upserted for player 1 and player 2:

- `competition`: `1`
- `bot`: the player name
- `division`: `1`
- `race`: player 1 uses `friendly_race`, then `test_bot_race`. Player 2 uses `opponent_bot_race` when the opponent is a custom bot, otherwise `opponent_race`. A past-version opponent uses the test bot race (`friendly_race`, then `test_bot_race`). Empty string when none of those are set.
- Elo is not set.

The rounds grid lists every ranking whose `bot` is not the page bot. Division 1 puts opponents on that grid. The Elo tab stays empty because no Elo documents are written. Sparring can show win rates from these matches because it only needs rankings that share a division.

## Error handling

One match failing does not stop the run.

- MySQL or Mongo is unreachable: log the error and exit non-zero. Do not delete stored matches.
- `TEST_LAB_REPLAY_ROOT` is missing or not a directory: log and exit non-zero before any match write.
- No replay file: store the match with warning `No replay file.` and `parseAttempts` `0`. Do not retry.
- Parse throws: store warning `Failed to parse replay file.`, increment `parseAttempts`. Retry on later runs while `parseAttempts` is less than 3. At 3, leave the warning and skip.
- A later successful parse clears `warnings` and leaves `parseAttempts` at the attempt that succeeded.
- Empty test bot name: `BotTato`. Empty opponent label: `Unknown`. Missing duration and no parsed loop: `0`, which the clock shows as `00:00`.

`shouldSkip(existing)`:

- No existing document: do not skip.
- Warnings include `No replay file.`: skip.
- Warnings include `Failed to parse replay file.` and `parseAttempts` is less than 3: do not skip.
- Otherwise: skip.

## Testing

Automated tests live in `replay/test/testlab.js` and use `node --test`. Add a `test` script in `replay/package.json`. They do not connect to MySQL or Mongo. Cover:

- Opponent labels for built-in AI (`Protoss Macro`), custom bot name, past version (`TBone_v_abc1234` when the directory is `TBone`), replay-test name, empty test bot (`BotTato`), and empty opponent (`Unknown`). Replay-test name wins over the other fields when it is set.
- Winners for `Victory`, `Defeat`, `Tie`, and `Crash`.
- Map suffix stripping, including a name with no `AIE`.
- Duration from `lastLoop` and from seconds times 22.4.
- Replay lookup in a temporary directory: `runs/{id}/replays/` wins over `blizzard_ai_runs/`, the blizzard path is used when the runs path is absent, and a missing file returns `null`.
- `shouldSkip` for a clean stored match, a parse failure under 3 attempts, a parse failure at 3 attempts, and `No replay file.`
- `assertReplayRoot` throws when the directory is missing, and does not write.

The existing `replay/test/*.js` scripts only print a sample replay. Leave them unchanged. They are not part of `node --test`.

Manual check after a deploy: run the job against the test lab database and open `/bot/t-bone`. The latest test group is a column, each opponent is a row, and a cell opens build order, army, and timeline with no review text.

## Out of scope

- Changes to `sc_bot_test_lab` pages or a new download endpoint.
- Gemini, `summary.js`, and `summary.prompt`.
- Elo calculation.
- Ingress, DNS, and hosting for `kibitz.v.quailholdings.com`. The required environment variables and volume mount are documented so that deploy can be done separately.
