/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/domain/constants/CardBackgrounds.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

// @ts-check
/**
 * The rank card's background styles, drawn at render time and tinted by a colour the user picks.
 * Any colour is safe because `rankCard.js` veils the background before drawing text; the accent,
 * drawn as text, still has to come from a palette. Copied verbatim to the website (generator).
 *
 * @typedef {object} CardBackgroundStyle
 * @property {string} key - Stored on the user document; URL-safe, never part of a file path.
 * @property {string} name - Shown in the picker.
 * @property {string} description - One line, for the picker's tooltip.
 */

/** @type {ReadonlyArray<CardBackgroundStyle>} */
export const CARD_BACKGROUND_STYLES = Object.freeze([
  {
    key: "waves",
    name: "Waves",
    description: "A soft ramp with two waveform strokes low in the frame.",
  },
  {
    key: "marks",
    name: "Marks",
    description: "The Vibe mark, tiled and very quiet, over the same ramp.",
  },
  {
    key: "bars",
    name: "Bars",
    description: "An equaliser field along the bottom edge.",
  },
  {
    key: "grid",
    name: "Grid",
    description: "A faint ruled grid. The quiet one — it flatters any colour.",
  },
  {
    key: "aurora",
    name: "Aurora",
    description: "Two soft bands of light across the frame. No motif, just colour.",
  },
]);

/**
 * Whether the background fades to the right. `null`/`undefined` means never chosen, which follows
 * the style's default rather than a choice made for another style.
 * @param {?string} style
 * @param {?boolean} fade
 * @returns {boolean}
 */
export function resolveCardFade(style, fade) {
  if (fade === true || fade === false) return fade;
  return !EVEN_BY_DEFAULT.has(style);
}

/**
 * Repeating fields default to an even tint (fading one looks unfinished); single gestures fade.
 * `bars` also sits where the ramp is darkest, so fading would hide it.
 */
const EVEN_BY_DEFAULT = new Set(["marks", "bars", "grid"]);

/** The colour used when a style is chosen but no colour is. */
export const DEFAULT_BACKGROUND_COLOR = "#e05570";

/** @type {ReadonlySet<string>} */
const KEYS = new Set(CARD_BACKGROUND_STYLES.map((entry) => entry.key));

/**
 * Validation, not a lookup: `null` is valid and means the plain card.
 * @param {?string} key
 * @returns {boolean}
 */
export function isCardBackground(key) {
  return key === null || key === undefined || KEYS.has(key);
}

/**
 * Lowercase `#rrggbb` (short form expanded), or `null`. The website uses the generated copy, so
 * both agree on what a colour is.
 * @param {?string} input
 * @returns {string|null|undefined} `undefined` for anything that is not a colour at all.
 */
export function normaliseCardColor(input) {
  if (input === null || input === undefined) return null;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(input).trim());
  if (!match) return undefined;

  const hex = match[1].toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}
