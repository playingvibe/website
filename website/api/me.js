import { getSession } from "../lib/session.js";
import { avatarUrl } from "../lib/discord.js";

/**
 * Who is signed in. The page calls this on load to decide between the signed-out and signed-in
 * views, rather than the server rendering two variants — the site is static HTML on a CDN, and
 * a per-user render would make it uncacheable for one line of difference.
 *
 * Returns 200 with `{ user: null }` rather than 401 for a signed-out visitor: not being signed
 * in is a normal state of this endpoint, not a failure of it.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
export default function handler(req, res) {
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
    res.status(200).json({ user: null });
    return;
  }

  // The access token stays in the cookie and is never part of a response body — the browser
  // has no use for it, and everything that needs it runs on this side.
  res.status(200).json({
    user: {
      id: session.id,
      username: session.username,
      avatar: avatarUrl({ id: session.id, avatar: session.avatar }),
    },
  });
}
