import { getSession } from "../lib/session.js";
import { canManageGuild, describeGuildFetchFailure, fetchGuilds } from "../lib/discord.js";
import { readJson } from "../lib/http.js";

/**
 * One server's full settings, read and written through the bot.
 *
 * `GET  /api/guild-settings?id=<guildId>` — the settings, the roles and channels the pickers offer,
 *   and each bot's overrides.
 * `POST /api/guild-settings?id=<guildId>` — one change: `{ change: { field, value } }` for a
 *   server-wide setting, or `{ instance: { clientId, field, value } }` / `{ instance: { clientId,
 *   reset: true } }` for one bot's override.
 *
 * **This function decides who is asking, and nothing else.** It checks the Discord sign-in and that
 * the user manages the server, then hands the request to the bot with a shared secret
 * (`GUILD_API_SECRET`). The bot owns the rules: it knows the server's real roles and channels, applies
 * the caps, and writes with the same code `/config` uses, so there is no second copy of any of it here.
 * That is also why this site holds no bot token.
 *
 * **Authorization is re-checked on every call**, against Discord rather than against anything the
 * request carries: a guild id in a query string is a claim, not a permission.
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
    res.status(503).json({ error: "Server settings aren't available on the website yet." });
    return;
  }

  const guildId = new URL(req.url, "http://localhost").searchParams.get("id");
  if (!guildId || !/^\d{17,20}$/.test(guildId)) {
    res.status(400).json({ error: "Missing or invalid guild id." });
    return;
  }

  let guilds;
  try {
    guilds = await fetchGuilds(session.accessToken);
  } catch (error) {
    // 401 only for a token Discord refuses; a rate limit or an outage is a 503, which keeps the page.
    const { status, message } = describeGuildFetchFailure(error);
    res.status(status).json({ error: message });
    return;
  }

  const guild = guilds.find((entry) => entry.id === guildId);
  // One 403 for both "not your server" and "not an administrator of it": telling them apart would turn
  // this into a way to test whether a given server exists and who is in it.
  if (!guild || !canManageGuild(guild)) {
    res.status(403).json({ error: "You don't manage that server." });
    return;
  }

  const origin = (process.env.BOT_API_ORIGIN || "https://api.playvibe.gg").replace(/\/$/, "");
  const headers = { authorization: `Bearer ${secret}` };
  let response;

  try {
    if (req.method === "GET") {
      response = await fetch(`${origin}/internal/guild-settings?guild=${guildId}`, {
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
      if (!body || (!body.change && !body.instance)) {
        res.status(400).json({ error: "Nothing to change." });
        return;
      }
      response = await fetch(`${origin}/internal/guild-settings`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        // Only what the bot expects, and the user id from the session, never from the request.
        body: JSON.stringify({ guildId, userId: session.id, change: body.change, instance: body.instance }),
        signal: AbortSignal.timeout(8000),
      });
    }
  } catch {
    res.status(502).json({ error: "Couldn't reach Vibe right now. Try again in a moment." });
    return;
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 404) {
    res.status(404).json({ error: "That server's settings can't be reached: Vibe may not be in it." });
    return;
  }
  // The bot's own refusals ("that isn't one of this server's roles") are the person's to read.
  if (response.status === 400 && payload?.message) {
    res.status(400).json({ error: payload.message, code: payload.error });
    return;
  }
  if (!response.ok || !payload) {
    res.status(502).json({ error: "Vibe couldn't do that right now. Try again in a moment." });
    return;
  }

  res.status(200).json(payload);
}
