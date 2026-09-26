import { getSession } from "../lib/session.js";
import { findUserStats } from "../lib/mongo.js";
import { hasPremium } from "../lib/entitlements.js";
import { getLevel } from "../lib/generated/level.js";
import { getEarnedBadgeTiers } from "../lib/generated/badges.js";

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The signed-in user's own listening stats — the web version of `/rank`.
 *
 * Read-only, and scoped to `session.id` with no user parameter anywhere: there is no way to ask
 * this endpoint for somebody else's profile, because there is nothing to ask with.
 *
 * Level and badges are computed here rather than in the browser so the thresholds stay a
 * server-side fact; they come from `lib/generated/`, which `scripts/sync-web-shared.js` writes
 * from the bot's own `src/shared/format/` — so `/rank` in Discord and this page can't disagree.
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

  let doc;
  try {
    doc = await findUserStats(session.id);
  } catch {
    res.status(503).json({ error: "Stats are unavailable right now." });
    return;
  }

  // No document is the normal state for someone who has signed in before ever playing anything,
  // not an error — the bot only writes a user document once there is something to record.
  const stats = {
    totalListeningTime: doc?.totalListeningTime ?? 0,
    sessionCount: doc?.sessionCount ?? 0,
    currentStreak: doc?.currentStreak ?? 0,
    longestStreak: doc?.longestStreak ?? 0,
    lastActiveDate: doc?.lastActiveDate ?? null,
    guildCount: doc?.listeningGuildIds?.length ?? 0,
  };

  const level = getLevel(stats.totalListeningTime);

  // **Read from the mirror, and never fatal.** A subscriber losing their crown because the premium
  // lookup blipped would be a worse bug than not showing it at all, and the page is entirely
  // usable without it — so a failure here degrades to "not premium" rather than failing the
  // request that carries someone's whole profile.
  const premium = await hasPremium(session.id);

  res.status(200).json({
    hasData: Boolean(doc),
    stats: { ...stats, listeningHours: stats.totalListeningTime / MS_PER_HOUR },
    level,
    badges: getEarnedBadgeTiers({ ...stats, voting: doc?.voting ?? null }),
    premium,
  });
}
