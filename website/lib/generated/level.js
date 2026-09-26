/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/level.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

/**
 * Levels for `/rank`, derived on read from `totalListeningTime`. There is no stored `level` or
 * `xp` field, so the curve can be retuned without a migration.
 *
 * `hours = COEFFICIENT * (level - 1) ^ EXPONENT`: level 2 inside the first hour, then slower.
 * Against the badge tiers: 10h ≈ level 6, 50h ≈ 13, 200h ≈ 26, 500h ≈ 41.
 */

const MS_PER_HOUR = 60 * 60 * 1000;
const COEFFICIENT = 0.5;
const EXPONENT = 1.85;

export const MAX_LEVEL = 100;

/** Cumulative hours to reach `level`; 0 for level 1. */
export function hoursForLevel(level) {
  if (level <= 1) return 0;
  return COEFFICIENT * (level - 1) ** EXPONENT;
}

/**
 * `hoursThisLevel` is the span of the current level and `hoursForNextLevel` the cumulative total;
 * both are returned so call sites never derive one from the other. At MAX_LEVEL, `progress` is 1
 * and `hoursForNextLevel` is null.
 */
export function getLevel(totalListeningTime) {
  const hours = Math.max(0, totalListeningTime ?? 0) / MS_PER_HOUR;

  // The epsilon is load-bearing: the pow round-trip turns an exact threshold into 3.9999… and
  // floors it a level low. 1e-9 is far below any real listening delta, so it never promotes early.
  const raw = Math.floor((hours / COEFFICIENT) ** (1 / EXPONENT) + 1e-9) + 1;
  const level = Math.min(MAX_LEVEL, Math.max(1, raw));

  if (level >= MAX_LEVEL) {
    return {
      level: MAX_LEVEL,
      progress: 1,
      hoursIntoLevel: 0,
      hoursThisLevel: 0,
      hoursForNextLevel: null,
    };
  }

  const floorHours = hoursForLevel(level);
  const nextHours = hoursForLevel(level + 1);
  const span = nextHours - floorHours;

  return {
    level,
    progress: span > 0 ? Math.min(1, (hours - floorHours) / span) : 0,
    hoursIntoLevel: hours - floorHours,
    hoursThisLevel: span,
    hoursForNextLevel: nextHours,
  };
}

/**
 * "1.4h / 2h to level 4". The unit follows the span, so both numbers share it: minutes while a
 * level is under an hour, hours after. `null` at MAX_LEVEL.
 */
export function formatLevelProgress({ level, hoursIntoLevel, hoursThisLevel, hoursForNextLevel }) {
  if (hoursForNextLevel === null) return null;

  if (hoursThisLevel < 1) {
    const minutes = (hours) => `${Math.round(hours * 60)}m`;
    return `${minutes(hoursIntoLevel)} / ${minutes(hoursThisLevel)} to level ${level + 1}`;
  }

  // "2h", not "2.0h".
  const round = (hours) => `${Number(hours.toFixed(1))}h`;
  return `${round(hoursIntoLevel)} / ${round(hoursThisLevel)} to level ${level + 1}`;
}
