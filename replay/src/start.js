import mysql from "mysql2/promise";
import { readMatch, storeMatch, storeRanking } from "./mongo.js";
import Replay from "./replay/replay.js";
import { importTestLabMatches } from "./testlab.js";
import getOverview from "./timeline/overview.js";
import getTimeline from "./timeline/timeline.js";

function dbConfig() {
  return {
    host: process.env.TEST_LAB_DB_HOST || "127.0.0.1",
    port: Number(process.env.TEST_LAB_DB_PORT || 3307),
    user: process.env.TEST_LAB_DB_USER || "root",
    password: process.env.TEST_LAB_DB_PASSWORD || "testlab",
    database: process.env.TEST_LAB_DB_NAME || "sc_bot",
  };
}

async function go() {
  const pool = mysql.createPool(dbConfig());
  try {
    await importTestLabMatches({
      replayRoot: process.env.TEST_LAB_REPLAY_ROOT,
      query: async (sql, params) => {
        const [rows] = await pool.query(sql, params);
        return rows;
      },
      findMatch: readMatch,
      storeMatch,
      storeRanking,
      loadReplay: (file) => Replay.load(file),
      buildTimeline: (match) => getTimeline(match),
      buildOverview: (replay, timeline) => getOverview(replay, timeline),
    });
    console.log(new Date().toISOString(), "Done.");
    process.exit(0);
  } catch (error) {
    console.log(error && error.message ? error.message : error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

go();
