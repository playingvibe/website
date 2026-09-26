import { getSession } from "../lib/session.js";
import { canManageGuild, fetchGuilds } from "../lib/discord.js";
import { findGuildConfig, findInstancesByGuild, saveGuildOverrides } from "../lib/mongo.js";
import { readJson } from "../lib/http.js";
// Shared with `guilds.js`. The reasoning for *which* three fields, and why it is narrower than the
// bot's own list, is there.
import { OVERRIDABLE, pickOverrides } from "../lib/overrides.js";


/**
 * One server's settings, and one instance's overrides of them.
 *
 * `GET  /api/guild?id=<guildId>` — the shared config plus every present instance's overrides.
 * `PATCH /api/guild?id=<guildId>&clientId=<clientId>` — set or clear that instance's overrides.
 *
 * **Authorization is re-checked on every call**, against Discord rather than against anything the
 * request carries. A guild id in a query string is a claim, not a permission, and the previous
 * request having been allowed says nothing about this one.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const guildId = url.searchParams.get("id");
  if (!guildId) {
    res.status(400).json({ error: "Missing guild id." });
    return;
  }

  let guilds;
  try {
    guilds = await fetchGuilds(session.accessToken);
  } catch {
    res.status(401).json({ error: "Your Discord sign-in expired. Sign in again." });
    return;
  }

  const guild = guilds.find((entry) => entry.id === guildId);
  // One 403 for both "not your server" and "not an administrator of it". Telling them apart
  // would turn this into a way to test whether a given server exists and who is in it.
  if (!guild || !canManageGuild(guild)) {
    res.status(403).json({ error: "You don't manage that server." });
    return;
  }

  if (req.method === "GET") return sendGuild(res, guildId, guild);
  if (req.method === "PATCH") return patchGuild(req, res, url, guildId, guild);

  res.status(405).json({ error: "Use GET or PATCH." });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {string} guildId
 * @param {object} guild
 * @returns {Promise<void>}
 */
async function sendGuild(res, guildId, guild) {
  let shared;
  let instances;
  try {
    [shared, instances] = await Promise.all([
      findGuildConfig(guildId),
      findInstancesByGuild([guildId]).then((map) => map.get(guildId) ?? []),
    ]);
  } catch {
    res.status(503).json({ error: "Server settings are unavailable right now." });
    return;
  }

  res.status(200).json({
    id: guildId,
    name: guild.name,
    // No document means nobody has run a command in this server yet, which is a normal state and
    // not a missing-resource error. The schema defaults are what the bot would use.
    shared: {
      djRoles: shared?.djRoles ?? [],
      logChannelId: shared?.logChannelId ?? null,
      voiceChannels: shared?.voiceChannels ?? [],
      commandsChannels: readCommandsChannels(shared),
      announcements: shared?.announcements !== false,
    },
    instances: instances
      .map((row) => ({
        clientId: row.clientId,
        name: row.name,
        overrides: pickOverrides(row.overrides),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {string} guildId
 * @param {object} guild
 * @returns {Promise<void>}
 */
async function patchGuild(req, res, url, guildId, guild) {
  const clientId = url.searchParams.get("clientId");
  if (!clientId) {
    res.status(400).json({ error: "Missing clientId." });
    return;
  }

  // The instance has to actually be in this server. Without this the endpoint would write
  // overrides for any client id at all, creating rows for bots that were never there.
  // The only database call on this path that was not already wrapped — the sibling reads and the
  // write both answer 503, and an unguarded one here made the same outage look like two different
  // faults depending on which call happened to run first.
  let instances;
  try {
    instances = (await findInstancesByGuild([guildId])).get(guildId) ?? [];
  } catch {
    res.status(503).json({ error: "Server settings are unavailable right now." });
    return;
  }
  if (!instances.some((row) => row.clientId === clientId)) {
    res.status(404).json({ error: "That bot isn't in this server." });
    return;
  }

  const body = await readJson(req);
  if (!body) {
    res.status(400).json({ error: "Expected a JSON body." });
    return;
  }

  const patch = {};
  for (const field of OVERRIDABLE) {
    if (!(field in body)) continue;
    const value = body[field];

    // null always means "clear this override", for every field — see saveGuildOverrides().
    if (value === null) {
      patch[field] = null;
      continue;
    }
    if (field === "announcements") {
      if (typeof value !== "boolean") return badField(res, field);
      patch[field] = value;
      continue;
    }
    if (!Array.isArray(value) || !value.every(isSnowflake)) return badField(res, field);
    // An empty array is a real setting — "this instance is unrestricted" — and is why neither
    // list needs the `"none"` sentinel the old single-id field did. `null` still clears.
    patch[field] = value.slice(0, 25);
  }

  if (!Object.keys(patch).length) {
    res.status(400).json({ error: "Nothing to change." });
    return;
  }

  try {
    await saveGuildOverrides(clientId, guildId, patch);
  } catch {
    res.status(503).json({ error: "Couldn't save that right now." });
    return;
  }

  return sendGuild(res, guildId, guild);
}

/**
 * Mirrors `readCommandsChannels()` in `src/database/repositories/GuildRepository.js`.
 *
 * Duplicated rather than imported for the reason `lib/mongo.js` documents: the Vercel deploy root
 * is `website/`, so nothing under `src/` is in this bundle. The two must keep agreeing — an
 * explicit empty array wins over the legacy single-id field, because `[]` is a real setting
 * ("unrestricted") and must not fall through to the older `commandsChannelId` field.
 * @param {?object} source
 * @returns {string[]}
 */
function readCommandsChannels(source) {
  if (Array.isArray(source?.commandsChannels)) return source.commandsChannels;
  return source?.commandsChannelId ? [source.commandsChannelId] : [];
}

/**
 * @param {unknown} value
 * @returns {boolean} Whether it looks like a Discord snowflake. Shape only — this endpoint has no
 *          way to confirm a channel exists. Storing an id for a channel that is later deleted is
 *          a state the bot handles: `channelDelete` scrubs both the shared config and every
 *          instance's overrides, including ones written from here.
 *
 * Exported for `tests/websiteLib.test.js`. Vercel ignores named exports on an API route; only the
 * default one is the handler.
 */
export function isSnowflake(value) {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {string} field
 * @returns {void}
 */
function badField(res, field) {
  res.status(400).json({ error: `Invalid value for ${field}.` });
}

