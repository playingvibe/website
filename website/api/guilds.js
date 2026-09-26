import { resolveInstanceName } from "../lib/generated/instances.js";
import { getSession } from "../lib/session.js";
import { canManageGuild, fetchGuilds, guildIconUrl } from "../lib/discord.js";
import { findInstancesByGuild } from "../lib/mongo.js";
import { pickOverrides } from "../lib/overrides.js";

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

  // Gated like `guild.js` and `appearance.js` already are. A read endpoint that answers a
  // POST is not a vulnerability by itself, but it is a surface that behaves differently from
  // its siblings for no reason, and it is what makes a CSRF write look plausible to try.
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
  } catch {
    // Almost always an expired or revoked token. 401 puts the page back on the sign-in view,
    // which is the actual remedy, rather than showing an error about a server list.
    res.status(401).json({ error: "Your Discord sign-in expired. Sign in again." });
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

  res.status(200).json({
    guilds: manageable
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guildIconUrl(guild),
        instances: (byGuild.get(guild.id) ?? [])
          .map((row) => ({
            clientId: row.clientId,
            // Resolved from the client id first: `row.name` is a snapshot taken at reconcile
            // time and is empty on rows written before that field existed.
            name: resolveInstanceName(row.clientId, row.name),
            // Included here rather than left to a per-guild call: the dashboard needs each
            // instance's current setting to render its toggle, and fetching them separately
            // would be one request per server for data already in hand.
            overrides: pickOverrides(row.overrides),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      // Servers that have a Vibe in them first — the rest are only useful as an invite prompt.
      .sort((a, b) => b.instances.length - a.instances.length || a.name.localeCompare(b.name)),
  });
}

