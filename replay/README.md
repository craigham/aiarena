# Test lab replay importer

`npm start` reads finished matches from the test lab MySQL database and parses `.SC2Replay` files from disk. It does not call Gemini and it does not log into aiarena.net.

## Environment

| Variable | Default |
| --- | --- |
| `COMPETITION` | `1` |
| `TEST_LAB_DB_HOST` | `127.0.0.1` |
| `TEST_LAB_DB_PORT` | `3307` |
| `TEST_LAB_DB_USER` | `root` |
| `TEST_LAB_DB_PASSWORD` | `testlab` |
| `TEST_LAB_DB_NAME` | `sc_bot` |
| `TEST_LAB_REPLAY_ROOT` | required |

Mount the test lab `aiarena` directory at `TEST_LAB_REPLAY_ROOT`. That directory contains `runs/{match id}/replays/*.SC2Replay` and `blizzard_ai_runs/{match id}_*.SC2Replay`.

MongoDB is `mongodb://mongo:27017`, database `aiarena`. This deploy uses its own database. A test-lab match id is the Kibitz match id.
