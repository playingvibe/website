const API = "https://discord.com/api/v10";

/**
 * A non-2xx from Discord, carrying **only** which call failed and the status.
 *
 * Deliberately not the response body: the token endpoint echoes the authorization code back inside
 * its error payload, and this error is logged. Step and status are enough to act on — a 401 from
 * `token_exchange` means our own credentials are wrong, a 503 means Discord is having a moment,
 * and those want opposite responses.
 */
export class DiscordApiError extends Error {
  /**
   * @param {"token_exchange"|"user_fetch"} step
   * @param {number} status
   */
  constructor(step, status) {
    super("Discord " + step + " failed (" + status + ")");
    this.name = "DiscordApiError";
    this.step = step;
    this.status = status;
  }
}

/**
 * The scopes the dashboard asks for, and nothing beyond them.
 *
 * `identify` names the account. `guilds` lists the servers the user is in, with their permission
 * bitfield — which is what lets the dashboard show only the servers they can actually configure,
 * without the bot needing the privileged `GuildMembers` intent. Deliberately **not** requested:
 * `email` (never used, and it would put an email address in the privacy policy), `guilds.join`,
 * and `applications.commands` (this is a login, not an install — installation contexts only
 * matter when that scope is present).
 */
export const SCOPES = ["identify", "guilds"];

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {string} The site's own origin, so one deployment works on the production alias, a
 *          preview URL and localhost without a per-environment redirect URI being hardcoded.
 *          Built from proxy headers because a Vercel function never sees the public host itself.
 */
export function originOf(req) {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/$/, "");

  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  return `${proto}://${host}`;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {string}
 */
export function redirectUri(req) {
  return `${originOf(req)}/api/auth/callback`;
}

/**
 * @param {object} options
 * @param {string} options.state
 * @param {string} options.redirect
 * @returns {string}
 */
export function authorizeUrl({ state, redirect }) {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    // Skips the consent screen for a user who has already approved these exact scopes, so
    // returning to the dashboard is one redirect rather than a re-authorization.
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

/**
 * Exchanges an authorization code for an access token.
 *
 * Server-side only — the client secret never reaches the browser, which is the entire reason
 * this is a serverless function rather than a fetch from the page.
 * @param {object} options
 * @param {string} options.code
 * @param {string} options.redirect
 * @returns {Promise<{access_token: string, expires_in: number}>}
 */
export async function exchangeCode({ code, redirect }) {
  const response = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    }),
  });

  if (!response.ok) {
    // The body can echo the code back; carrying only the status keeps it out of the logs.
    throw new DiscordApiError("token_exchange", response.status);
  }
  return response.json();
}

/**
 * @param {string} accessToken
 * @param {string} path
 * @returns {Promise<any>}
 */
async function asUser(accessToken, path) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new DiscordApiError("user_fetch", response.status);
  return response.json();
}

/**
 * @param {string} accessToken
 * @returns {Promise<{id: string, username: string, global_name: ?string, avatar: ?string}>}
 */
export function fetchUser(accessToken) {
  return asUser(accessToken, "/users/@me");
}

/**
 * @param {string} accessToken
 * @returns {Promise<Array<{id: string, name: string, icon: ?string, permissions: string}>>}
 */
export function fetchGuilds(accessToken) {
  return asUser(accessToken, "/users/@me/guilds");
}

/**
 * Whether the user may configure the bot for this server.
 *
 * **The counterpart of `canManageGuild()` in `src/domain/permissions.js`, and the only rule this
 * side is allowed to restate.** It exists separately because the website cannot import the bot's
 * code (it is not part of this repository) and because OAuth hands over a permission bitfield as a
 * *string* plus an `owner` flag, not a discord.js `GuildMember`. Any further authorization the
 * dashboard needs belongs behind an endpoint that asks the bot, not in a growing copy of the
 * bot's rules here: a second permission model drifts from the first.
 * @param {{permissions?: string, owner?: boolean}} guild - As returned by `/users/@me/guilds`.
 * @returns {boolean}
 */
export function canManageGuild(guild) {
  if (guild?.owner) return true;

  let permissions;
  try {
    // A string, because the bitfield exceeds Number.MAX_SAFE_INTEGER — parsing it as a number
    // silently loses the high bits, and the newer permissions all live up there.
    permissions = BigInt(guild?.permissions ?? "0");
  } catch {
    return false;
  }

  // Administrator is checked explicitly, and that is not belt-and-braces. discord.js's `has()`
  // treats Administrator as implying everything (its `checkAdmin` default), which is what the
  // bot-side `canManageGuild()` relies on — but the `permissions` field on an OAuth partial
  // guild is documented as *excluding* implicit permissions, so an administrator without an
  // explicit Manage Server bit arrives here as plain `8`. Without this line the dashboard would
  // refuse people the bot itself accepts, for servers they fully own the administration of.
  if ((permissions & ADMINISTRATOR) === ADMINISTRATOR) return true;
  return (permissions & MANAGE_GUILD) === MANAGE_GUILD;
}

/**
 * @param {{id: string, avatar: ?string}} user
 * @returns {string} A CDN URL, falling back to Discord's default avatar for an unset one.
 */
export function avatarUrl(user) {
  if (user?.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  }
  // The modern (post-discriminator) default: user id shifted by 22, modulo the six variants.
  const index = Number((BigInt(user?.id ?? "0") >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/**
 * @param {{id: string, icon: ?string}} guild
 * @returns {?string}
 */
export function guildIconUrl(guild) {
  if (!guild?.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
}
