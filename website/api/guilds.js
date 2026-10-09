import { resolveInstanceName } from "../lib/generated/instances.js";
import { getSession } from "../lib/session.js";
import { canManageGuild, describeGuildFetchFailure, fetchGuilds, guildIconUrl } from "../lib/discord.js";
import { findInstancesByGuild } from "../lib/mongo.js";
import { guildsWithPremium } from "../lib/entitlements.js";

/**
 * The servers the signed-in user administers, each with the Vibe bots actually in it.
 *
 * This is the answer to the question OAuth alone cannot reach: `guilds` tells us which servers
 * the *user* is in, never which of the four bots are in them. The bots write their own presence
 * rows (`src/database/models/GuildInstance.model.js`) and this joins the two sides.
 *
 * Filtered to manageable servers before anything is read from the database. Someone's full server
 * list is not ours to enumerate against our own data, and a request for a guild they merely
 * belong to should not confirm which bots are in it.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // GET only, like the other read endpoints: one that answers a POST behaves differently from its siblings for
  // no reason, and makes a CSRF write look plausible to try.
  if (req.method !== "GET") {
    res.status(405).json({ error: "Use GET." });
    return;
  }

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
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

  const manageable = guilds.filter(canManageGuild);

  let byGuild;
  try {
    byGuild = await findInstancesByGuild(manageable.map((guild) => guild.id));
  } catch {
    res.status(503).json({ error: "Server settings are unavailable right now." });
    return;
  }

  // Only for servers that run a Vibe: a server with none has nothing to badge, and the lookup stays small.
  const premium = await guildsWithPremium(manageable.filter((guild) => byGuild.has(guild.id)).map((guild) => guild.id));

  res.status(200).json({
    guilds: manageable
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guildIconUrl(guild),
        premium: premium.has(guild.id),
        instances: (byGuild.get(guild.id) ?? [])
          .map((row) => ({
            clientId: row.clientId,
            // Resolved from the client id first: `row.name` is a snapshot taken at reconcile
            // time and is empty on rows written before that field existed.
            name: resolveInstanceName(row.clientId, row.name),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      // Servers that have a Vibe in them first — the rest are only useful as an invite prompt.
      .sort((a, b) => b.instances.length - a.instances.length || a.name.localeCompare(b.name)),
  });
}

