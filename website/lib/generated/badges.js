/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/domain/badges.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

export const FOUNDER_CUTOFF = new Date("2027-01-01T00:00:00.000Z");

export const FOUNDER_BADGE = {
  "name": "Founder",
  "color": "#E05570"
};

export const LISTENING_TIME_BADGES = [
  {
    "hours": 1000,
    "name": "Ruby Listener",
    "color": "#FF6B9D"
  },
  {
    "hours": 500,
    "name": "Diamond Listener",
    "color": "#7FD8EE"
  },
  {
    "hours": 200,
    "name": "Gold Listener",
    "color": "#F5C542"
  },
  {
    "hours": 50,
    "name": "Silver Listener",
    "color": "#C9CDD4"
  },
  {
    "hours": 10,
    "name": "Bronze Listener",
    "color": "#CD8A4E"
  }
];

export const TRACKS_LISTENED_BADGES = [
  {
    "count": 2500,
    "name": "Ruby Collector",
    "color": "#FF6B9D"
  },
  {
    "count": 1000,
    "name": "Diamond Collector",
    "color": "#7FD8EE"
  },
  {
    "count": 500,
    "name": "Gold Collector",
    "color": "#F5C542"
  },
  {
    "count": 250,
    "name": "Silver Collector",
    "color": "#C9CDD4"
  },
  {
    "count": 100,
    "name": "Bronze Collector",
    "color": "#CD8A4E"
  }
];

export const VOTE_STREAK_BADGES = [
  {
    "weeks": 26,
    "name": "Ruby Supporter",
    "color": "#FF6B9D"
  },
  {
    "weeks": 16,
    "name": "Diamond Supporter",
    "color": "#7FD8EE"
  },
  {
    "weeks": 8,
    "name": "Gold Supporter",
    "color": "#F5C542"
  },
  {
    "weeks": 4,
    "name": "Silver Supporter",
    "color": "#C9CDD4"
  },
  {
    "weeks": 2,
    "name": "Bronze Supporter",
    "color": "#CD8A4E"
  }
];

const DAY_MS = 24 * 60 * 60 * 1000;
const weekIndex = (ms) => Math.floor((Math.floor(ms / DAY_MS) + 3) / 7);

/**
 * Mirror of `getEarnedBadgeTiers()` — highest earned tier per track, not cumulative.
 * @param {{totalListeningTime: number, sessionCount: number, voting?: object, firstSeenAt?: Date|string|number|null}} stats
 * @returns {Array<{name: string, color: string}>}
 */
export function getEarnedBadgeTiers({ totalListeningTime, sessionCount, voting, firstSeenAt }, now = Date.now()) {
  const hours = (totalListeningTime ?? 0) / (60 * 60 * 1000);
  const tiers = [];
  if (firstSeenAt && new Date(firstSeenAt) < FOUNDER_CUTOFF) tiers.push(FOUNDER_BADGE);
  const timeTier = LISTENING_TIME_BADGES.find((tier) => hours >= tier.hours);
  if (timeTier) tiers.push(timeTier);
  const tracksTier = TRACKS_LISTENED_BADGES.find((tier) => (sessionCount ?? 0) >= tier.count);
  if (tracksTier) tiers.push(tracksTier);
  const lapsed = voting?.lastWeek == null || weekIndex(now) - voting.lastWeek > 1;
  const weeks = lapsed ? 0 : (voting.streakWeeks ?? 0);
  const voteTier = VOTE_STREAK_BADGES.find((tier) => weeks >= tier.weeks);
  if (voteTier) tiers.push(voteTier);
  return tiers;
}
