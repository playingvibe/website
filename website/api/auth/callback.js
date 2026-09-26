import { DiscordApiError, exchangeCode, fetchUser, redirectUri } from "../../lib/discord.js";
import { SessionConfigError, setSession, verifyState } from "../../lib/session.js";

/**
 * Which `/dashboard?error=` reason a failure deserves.
 *
 * **Three unrelated failures used to share one message.** A wrong `DISCORD_CLIENT_SECRET`, a
 * `SESSION_SECRET` too short to build a key, and Discord being down all read as *"Discord wouldn't
 * complete the sign-in"* — to the user and, because nothing was logged, to whoever had to fix it.
 * That cost three deploys on 2026-09-12 before someone remembered which value had been pasted where.
 *
 * The distinction that matters is **ours or theirs**: a 401 from the token exchange is Discord
 * saying our own credentials are wrong, which no amount of retrying fixes, while a 400 is usually a
 * code that was already used or has expired — genuinely worth trying again.
 * @param {unknown} error
 * @returns {"server_misconfigured"|"discord_unavailable"|"exchange_failed"}
 */
export function reasonFor(error) {
  if (error instanceof SessionConfigError) return "server_misconfigured";

  if (error instanceof DiscordApiError) {
    if (error.step === "token_exchange" && error.status === 401) return "server_misconfigured";
    if (error.status === 429 || error.status >= 500) return "discord_unavailable";
    return "exchange_failed";
  }

  // `fetch` rejects with a TypeError when the request never completes at all — DNS, TLS, a dropped
  // connection. Nothing about the deployment is wrong in that case.
  if (error instanceof TypeError) return "discord_unavailable";

  return "exchange_failed";
}

/**
 * Where Discord sends the user back. Exchanges the code server-side, stores a session, and
 * redirects to the dashboard.
 *
 * Failures redirect to `/dashboard?error=…` rather than rendering an error here: this endpoint
 * has no HTML of its own, and a bare JSON error at a URL the user reached by clicking "Sign in"
 * is a dead end.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const fail = (reason) => {
    res.writeHead(302, { Location: `/dashboard?error=${reason}`, "Cache-Control": "no-store" });
    res.end();
  };

  // The user pressed Cancel on Discord's consent screen. Not an error worth a message.
  if (url.searchParams.get("error")) return fail("cancelled");
  if (!code) return fail("no_code");
  if (!verifyState(req, state)) return fail("bad_state");

  try {
    const token = await exchangeCode({ code, redirect: redirectUri(req) });
    const user = await fetchUser(token.access_token);

    setSession(res, {
      id: user.id,
      // `global_name` is the display name; `username` is the handle. Preferring the display
      // name matches what Discord itself shows everywhere now.
      username: user.global_name || user.username,
      avatar: user.avatar ?? null,
      accessToken: token.access_token,
    });

    res.writeHead(302, { Location: "/dashboard", "Cache-Control": "no-store" });
    res.end();
  } catch (error) {
    const reason = reasonFor(error);

    // **Never the error itself**, whose message or cause can carry the authorization code or the
    // access token. `DiscordApiError` and `SessionConfigError` are built to hold neither — a step,
    // a status, and a fixed sentence — so the two lines that actually diagnose this are safe to
    // write down. Anything else is logged as its reason alone.
    if (error instanceof DiscordApiError) {
      console.error(`Sign-in failed at ${error.step} with HTTP ${error.status} (${reason})`);
    } else if (error instanceof SessionConfigError) {
      console.error(`Sign-in failed: ${error.message}`);
    } else {
      console.error(`Sign-in failed with an unexpected error (${reason})`);
    }

    fail(reason);
  }
}
