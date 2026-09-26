import { authorizeUrl, redirectUri } from "../../lib/discord.js";
import { issueState } from "../../lib/session.js";

/**
 * Starts the Discord login. A redirect, not a link on the page, so the CSRF state can be issued
 * and stored in the same response that sends the user to Discord.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
export default function handler(req, res) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    res.status(500).json({ error: "Login is not configured on this deployment." });
    return;
  }

  const state = issueState(res);
  res.writeHead(302, {
    Location: authorizeUrl({ state, redirect: redirectUri(req) }),
    // The redirect carries a fresh, single-use state; a cached copy would send the next
    // visitor to Discord with a state their browser has no cookie for.
    "Cache-Control": "no-store",
  });
  res.end();
}
