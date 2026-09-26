import { findPassportByToken, findPremiumActive } from "../lib/mongo.js";

/**
 * A passport owner's avatar, proxied.
 *
 * **This exists so the page can show a face without publishing a Discord user id.** Discord's CDN
 * URL for an avatar contains the account id by construction
 * (`/avatars/<userId>/<hash>.png`), so linking it directly would hand every viewer the owner's
 * snowflake — which is enough to look them up through any bot or API, and is a materially bigger
 * disclosure than the name and picture they meant to publish. Fetching it here keeps the id on the
 * server: the page requests an avatar *by passport token*, and the token is already what it holds.
 *
 * **The only input is the token.** The upstream URL is assembled from fields read out of the
 * database, never from anything in the request, so there is no way to point this at another host —
 * a proxy that takes a URL is an open redirect and an SSRF in one.
 *
 * Entitlement is re-checked for the same reason the page itself checks it: a lapsed subscriber's
 * passport is gone, and that has to include the picture on it.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  const token = new URL(req.url, "http://localhost").searchParams.get("token") ?? "";

  let user;
  try {
    user = await findPassportByToken(token);
  } catch {
    res.status(503).end();
    return;
  }

  if (!user?.passport?.avatar) {
    res.status(404).end();
    return;
  }

  if (!(await findPremiumActive(user._id).catch(() => false))) {
    res.status(404).end();
    return;
  }

  // `.png` rather than `.webp`, and a fixed size: the hash decides the image, so there is nothing
  // for a caller to vary and nothing to validate.
  const upstream = `https://cdn.discordapp.com/avatars/${user._id}/${user.passport.avatar}.png?size=128`;

  let response;
  try {
    response = await fetch(upstream);
  } catch {
    res.status(502).end();
    return;
  }

  if (!response.ok) {
    // An avatar that 404s upstream means the user changed it since they issued their link; the
    // page renders without one rather than showing a broken image.
    res.status(404).end();
    return;
  }

  // An avatar hash is immutable — a new picture is a new hash — so this is safe to cache hard.
  // The token in the URL is not a secret from the person already holding it, and the response
  // varies only by that token.
  res.setHeader("Content-Type", response.headers.get("content-type") ?? "image/png");
  // **A day at the edge is right here and wrong next door.** The avatar is keyed on Discord's own
  // hash, so its *content* never changes — but the token in front of it can be revoked, and a
  // 24-hour `s-maxage` would keep answering for a passport that was turned off. The compromise:
  // the picture is cheap to re-fetch and the gate is one indexed read, so the edge holds it for a
  // minute while the viewer's own browser keeps it for an hour. See `passport.js` for the same
  // reasoning at more length.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=60, stale-while-revalidate=60");
  res.status(200).send(Buffer.from(await response.arrayBuffer()));
}
