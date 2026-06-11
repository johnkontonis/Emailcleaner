/*
 * Shared Dion-vs-John scoreboard (serverless, Vercel).
 *
 * Persists to an Upstash/Vercel KV Redis store via its REST API — no npm
 * dependency, just fetch. If the store isn't configured (env vars absent), it
 * returns { configured: false } so the client falls back to local-only mode.
 *
 * Set up: in the Vercel dashboard add a KV / Upstash Redis store to this
 * project; Vercel injects KV_REST_API_URL + KV_REST_API_TOKEN automatically.
 */
const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "scoreboard:v2";

async function redis(cmd) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).result;
}

const empty = () => ({ h2h: { Dion: 0, John: 0, ties: 0 }, best: {}, recent: [] });

async function readBoard() {
  const v = await redis(["GET", KEY]);
  return v ? JSON.parse(v) : empty();
}

function betterBest(b, user, rec) {
  if (rec && (!b.best[user] || rec.wins > b.best[user].wins)) b.best[user] = rec;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL || !TOKEN) {
    res.status(200).json({ configured: false });
    return;
  }
  try {
    if (req.method === "GET") {
      res.status(200).json({ configured: true, ...(await readBoard()) });
      return;
    }
    if (req.method === "POST") {
      const body =
        req.body && typeof req.body === "object" ? req.body : await readBody(req);
      const b = await readBoard();
      if (body.type === "h2h" && body.winner) {
        if (body.winner === "tie") b.h2h.ties = (b.h2h.ties || 0) + 1;
        else b.h2h[body.winner] = (b.h2h[body.winner] || 0) + 1;
        // records is a { playerName: {wins,losses,grade,strength} } map.
        const records = body.records || {};
        b.recent.unshift({
          winner: body.winner,
          players: body.players,
          records,
          date: body.date,
        });
        b.recent = b.recent.slice(0, 20);
        for (const name of Object.keys(records)) betterBest(b, name, records[name]);
      } else if (body.type === "solo" && body.user) {
        betterBest(b, body.user, {
          wins: body.wins,
          losses: body.losses,
          grade: body.grade,
          strength: body.strength,
        });
      }
      await redis(["SET", KEY, JSON.stringify(b)]);
      res.status(200).json({ configured: true, ...b });
      return;
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    // Fail soft so the client keeps working locally.
    res.status(200).json({ configured: false, error: String(e) });
  }
};

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(d || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
