# Test lab Kibitz

This fork shows finished games from the StarCraft test lab. It does not scrape aiarena.net, and it does not change the test lab site.

Open `/bot/<test-bot-name>` (for T-Bone, `/bot/t-bone`). Each column is a test group id. Each row is an opponent. A cell opens the match page: build order, army, and timeline. There is no written Gemini review, and the Elo tab stays empty. The rankings page lists the same bots with win rate and Elo left blank.

The replay job imports every finished match (Victory, Defeat, Tie, Crash) into its own MongoDB. A test-lab match id is the Kibitz match id. Later runs skip matches that already imported, and retry a failed parse up to three times. A match with no replay file is stored once and then left alone.

## What to run

Four pieces, on one Docker network:

| Piece | Image | Role |
| --- | --- | --- |
| `mongo` | `mongo:7` | Database `aiarena`. The hostname must be `mongo`. The API and the replay job connect to `mongodb://mongo:27017` with no environment override. |
| `api` | build `api/Dockerfile` | Express on port 3000. `GET /api/bot/*`, `/api/match/*`, `/api/rankings`, `/api/recent`. |
| `ui` | build `ui/Dockerfile` | nginx on port 80. Static files only. The browser calls the API URL baked into the bundle. |
| `replay` | build `replay/Dockerfile` | One-shot importer. Run it about every 10 minutes. It exits when the pass finishes. |

`kubernetes.yaml` is the old public-ladder manifest. It still names `aiarena.superskill.me` and `docker.io/stephanzlatarev/*`. Do not apply it for this deploy.

`ui/Dockerfile` and `replay/Dockerfile` copy `node_modules` from the build context. Run `npm install` in `ui/` and `replay/` before those image builds. `api/Dockerfile` installs its own production dependencies. `package-lock.json` is gitignored.

## Point the UI at this API

`ui/src/Api.js` still has:

```javascript
const API = "https://aiarena.superskill.me/api/";
```

Change that to this deploy's API (for example `https://kibitz.v.quailholdings.com/api/`) and rebuild the UI image. Until that change, the new site shows the public ladder.

`ui/nginx.conf` sets `server_name aiarena.superskill.me`. That name does not have to match the new host. nginx is the only server in the image, so it still serves the files.

## Replay job

The job reads the test lab MySQL database `sc_bot` and reads `.SC2Replay` files from disk. `/test_lab/replay/{id}/` launches StarCraft and returns no file, so it is not a download URL.

Set `TEST_LAB_REPLAY_ROOT` to the test lab `aiarena` directory. The job exits before any write when that directory is missing. It looks up a replay in this order:

1. `{TEST_LAB_REPLAY_ROOT}/runs/{match id}/replays/*.SC2Replay`
2. `{TEST_LAB_REPLAY_ROOT}/blizzard_ai_runs/{match id}_*.SC2Replay`

| Variable | Default |
| --- | --- |
| `COMPETITION` | `1` |
| `TEST_LAB_DB_HOST` | `127.0.0.1` |
| `TEST_LAB_DB_PORT` | `3307` |
| `TEST_LAB_DB_USER` | `root` |
| `TEST_LAB_DB_PASSWORD` | `testlab` |
| `TEST_LAB_DB_NAME` | `sc_bot` |
| `TEST_LAB_REPLAY_ROOT` | required |

Use the same `COMPETITION` on the API and the replay job. Leave it unset, or set both to `1`. Those defaults match the test lab quickstart. A real deploy needs the test lab database host and a read-only mount of the replay directory.

More detail is in [replay/README.md](replay/README.md).

## Check

After the first replay run, open `/bot/t-bone`. The latest test group is a column, each opponent is a row, and a cell shows build order, army, and timeline with no review text.
