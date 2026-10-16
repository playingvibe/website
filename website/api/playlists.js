import { getSession } from "../lib/session.js";
import { readJson } from "../lib/http.js";
import { isForSale } from "../lib/entitlements.js";

/**
 * The signed-in person's own playlists, read and edited through the bot.
 *
 * `GET  /api/playlists` — their playlists with their songs (titles and a ref each, never a link), what they
 *   may do, and `forSale`: whether a subscription can be bought at all.
 * `POST /api/playlists` — one change: `{ op: { kind: "create" | "rename" | "delete" | "remove" | "move", … } }`.
 *   Never adds a song: that needs a search, which this site has none of.
 *
 * **This function decides who is asking, and nothing else.** It checks the Discord sign-in and sends the id from
 * that session, never one from the request, to the bot with the shared secret (`GUILD_API_SECRET`). The bot owns
 * the rules (the names, the cap, the subscription, what a reorder does to a list that changed meanwhile) and
 * writes with the code `/playlist` uses, so none of it is repeated here.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Use GET or POST." });
    return;
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }

  const secret = process.env.GUILD_API_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Playlist editing isn't available on the website yet." });
    return;
  }

  const origin = (process.env.BOT_API_ORIGIN || "https://api.playvibe.gg").replace(/\/$/, "");
  const headers = { authorization: `Bearer ${secret}` };
  let response;

  try {
    if (req.method === "GET") {
      response = await fetch(`${origin}/internal/playlists?user=${encodeURIComponent(session.id)}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
    } else {
      // A JSON body only: a cross-site form cannot send one without a preflight the browser refuses.
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        res.status(415).json({ error: "Send JSON." });
        return;
      }
      const body = await readJson(req);
      if (!body || typeof body.op !== "object" || body.op === null) {
        res.status(400).json({ error: "Nothing to change." });
        return;
      }
      response = await fetch(`${origin}/internal/playlists`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        // Only what the bot expects, and the user id from the session, never from the request.
        body: JSON.stringify({ userId: session.id, op: body.op }),
        signal: AbortSignal.timeout(8000),
      });
    }
  } catch {
    res.status(502).json({ error: "Couldn't reach Vibe right now. Try again in a moment." });
    return;
  }

  const payload = await response.json().catch(() => null);

  // The bot's own refusals ("there's already a playlist with that name") are the person's to read.
  if (response.status === 400 && payload?.message) {
    res.status(400).json({ error: payload.message, code: payload.error });
    return;
  }
  if (!response.ok || !payload) {
    res.status(502).json({ error: "Vibe couldn't do that right now. Try again in a moment." });
    return;
  }

  // Whether a subscription can be bought at all is the site's to know (the same answer `/api/appearance` gives):
  // without it the page cannot tell "greyed, here is why" from "no trace of it".
  res.status(200).json({ ...payload, forSale: isForSale() });
}
