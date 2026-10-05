import { clearSession } from "../../lib/session.js";

/**
 * Signs out by clearing the cookie. Nothing is stored server-side, so there is nothing else to
 * revoke — the Discord access token goes with the cookie it was sealed in.
 *
 * POST only, which stops an image tag or a link from signing someone out. It does not stop another
 * site submitting a form, so a request the browser marks as coming from elsewhere (`Sec-Fetch-Site`
 * other than `same-origin`) is refused too; a client that sends no such header (a script, `curl`) is
 * not a browser being steered by a page, and passes. Signing someone out is a mild attack either way.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  const site = req.headers?.["sec-fetch-site"];
  if (site && site !== "same-origin") {
    res.status(403).json({ error: "Sign out from the site itself." });
    return;
  }

  clearSession(res);
  res.status(200).json({ ok: true });
}
