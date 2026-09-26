import { clearSession } from "../../lib/session.js";

/**
 * Signs out by clearing the cookie. Nothing is stored server-side, so there is nothing else to
 * revoke — the Discord access token goes with the cookie it was sealed in.
 *
 * POST only. A GET logout is a one-pixel-image away from being triggered by any page on the
 * internet, and while signing someone out is a mild attack, it is a free one to prevent.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  clearSession(res);
  res.status(200).json({ ok: true });
}
