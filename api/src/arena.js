import fs from "fs";
import https from "https";

const TRACE = false;
const SECRETS = JSON.parse(fs.readFileSync("./secrets/secrets.json"));
const COOKIES = [];

function call(method, path, data) {
  const json = JSON.stringify(data ? data : "");
  const options = {
    hostname: "aiarena.net",
    port: 443,
    path: path,
    method: method,
    headers: {
      "Cookie": COOKIES.join("; "),
      "Content-Type": "application/json",
      "Content-Length": json.length,
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      response.setEncoding("utf8");
      let body = "";

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        if (TRACE) console.log("<<", response.statusCode);
        const cookies = response.headers["set-cookie"];
        if (cookies && cookies.length) for (const cookie of cookies) COOKIES.push(cookie);

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          if (TRACE) {
            console.log("<<", response.headers);
            console.log(error);
          }

          resolve(undefined);
        }
      });
    });

    request.on("error", (error) => {
      reject(error);
    });

    if (TRACE) console.log(">>", method, path);
    if (TRACE) console.log(">>", json);
    request.write(json);
    request.end();
  });
}

export async function getReplayFileUrl(matchId) {
  console.log(new Date().toISOString(), "Connecting to AI Arena...");
  await call("POST", "/api/auth/login/", SECRETS);

  console.log(new Date().toISOString(), "Reading match data...");
  const match = await call("GET", "/api/matches/" + matchId + "/");
  console.log(matchId, ">>", JSON.stringify(match, null, 2));
  return match?.result?.replay_file;
}
