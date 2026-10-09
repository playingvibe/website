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

/**
 * The colour a style is tinted with when none was chosen: the flagship's brand colour. The rank card itself follows
 * the card's accent instead (the bot's own colour unless the user picked one), so a card from another bot is tinted
 * in that bot's colour; this is what a page without that knowledge, such as the website's preview, falls back to.
 */
export const DEFAULT_BACKGROUND_COLOR = "#e05570";

/** The rank card's own ground, which the accent is drawn on: the bar, the level, the glow. */
export const CARD_GROUND = "#0b0b0d";

/** The least contrast an accent may have against the ground: WCAG's ratio for graphics and large text. */
export const MIN_ACCENT_CONTRAST = 3;

/**
 * WCAG contrast of a `#rrggbb` colour against the card's ground.
 * @param {string} hex
 * @returns {number}
 */
export function cardAccentContrast(hex) {
  const luminance = (value) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(value.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return (luminance(hex) + 0.05) / (luminance(CARD_GROUND) + 0.05);
}

/**
 * Whether an accent can be read on the card. The accent is drawn as a progress bar and as the level text, so a dark
 * pick would leave a card that looks broken; the same rule is applied by the page, the route and the renderer.
 * @param {?string} hex Normalised `#rrggbb`, or `null` (the bot's own colour, always readable).
 * @returns {boolean}
 */
export function isReadableCardAccent(hex) {
  return hex === null || hex === undefined || cardAccentContrast(hex) >= MIN_ACCENT_CONTRAST;
}

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
