/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/listeningStreak.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

/**
 * The listening streak as it stands now. No imports: `scripts/sync-web-shared.js` copies this file
 * verbatim into `website/lib/generated/`, so the bot, the Activity and the website judge a streak the
 * same way.
 *
 * The stored `currentStreak` changes only when someone listens, so a streak that ended weeks ago would
 * still read as it was. The read decides, as `currentVoteStreak()` does for votes: a streak is alive
 * while its last day is today or yesterday (UTC), and a gap of one whole date is forgiven if the last
 * listen was recent (`STREAK_GRACE_MS`), the same rule `flushListeningTime()` applies when it writes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A streak survives a gap of one whole UTC date if the last listen was within this long ago. The bot
 * has no timezone for anyone, and a UTC day ends mid-evening in the Americas: someone who listens
 * every day, at 3 pm one day and 7 pm the next, would otherwise land two UTC dates apart and lose it.
 * 36 hours covers the widest swing of a normal daily habit; a new streak day still needs a new UTC date.
 */
export const STREAK_GRACE_MS = 36 * 60 * 60 * 1000;

/**
 * @param {?{currentStreak?: number, lastActiveDate?: ?string, lastActiveAt?: ?(Date|string|number)}} stats
 * @param {Date|number} [now]
 * @returns {number} The stored streak while it is alive, otherwise 0.
 */
export function currentListeningStreak(stats, now = Date.now()) {
  const streak = stats?.currentStreak ?? 0;
  const lastDate = stats?.lastActiveDate;
  if (!streak || !lastDate) return 0;

  const nowMs = now instanceof Date ? now.getTime() : now;
  const lastDay = Date.parse(`${lastDate}T00:00:00Z`);
  if (Number.isNaN(lastDay)) return 0;

  const daysAgo = Math.floor(nowMs / DAY_MS) - Math.floor(lastDay / DAY_MS);
  if (daysAgo <= 1) return streak;
  if (daysAgo > 2) return 0;

  // Two dates ago: alive only if the last listen was recent. No record of it (a user not seen since
  // it was added) gets no forgiveness, as when writing.
  const lastAt = stats?.lastActiveAt ? new Date(stats.lastActiveAt).getTime() : NaN;
  return Number.isNaN(lastAt) || nowMs - lastAt >= STREAK_GRACE_MS ? 0 : streak;
}
