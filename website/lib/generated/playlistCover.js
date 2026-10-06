/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/playlistCover.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

/**
 * The picture a playlist has before it has any artwork: its first letter on a gradient that its name picks.
 * Deterministic, so a playlist looks the same on every surface that draws one (the post in Discord, the
 * passport page, later the Activity), and two playlists with different names are told apart at a glance.
 *
 * Imports nothing: it is copied verbatim into `website/lib/generated/` (`scripts/sync-web-shared.js`).
 */

/** Both stops are dark enough for a white letter to stay readable (checked by `tests/playlistCover.test.js`). */
const MIN_CONTRAST = 4.6;
const SATURATION = 0.58;
const LIGHTNESS_FROM = 0.4;
const LIGHTNESS_TO = 0.28;

/** FNV-1a: small, stable, and spreads short names well. */
function hash(text) {
  let h = 0x811c9dc5;
  for (const char of text) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** @param {number} hue 0-360 @param {number} lightness 0-1 @returns {number[]} sRGB channels, 0-1 */
function rgb(hue, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * SATURATION;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] =
    hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return [r + m, g + m, b + m];
}

/** How readable white text is on a colour: WCAG's ratio, which needs the colour's relative luminance. */
function contrastWithWhite(channels) {
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/**
 * `#rrggbb` for a hue, darkened until a white letter reads on it: the same lightness is far brighter to the eye
 * in yellow and green than in blue, so one lightness for every hue cannot hold the contrast.
 */
function hsl(hue, lightness) {
  let level = lightness;
  while (level > 0.1 && contrastWithWhite(rgb(hue, level)) < MIN_CONTRAST) level -= 0.01;
  return `#${rgb(hue, level).map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * @param {string} name - The playlist's name.
 * @returns {{initial: string, from: string, to: string}} The letter to draw and the gradient's two stops,
 *          light corner first.
 */
export function playlistCover(name) {
  const text = String(name ?? "").trim();
  // The first letter or digit, so a name that opens with an emoji or a bracket still gets a letter.
  const first = Array.from(text).find((char) => /[\p{L}\p{N}]/u.test(char)) ?? "♪";
  // One character even where upper-casing makes two (ß).
  const initial = Array.from(first.toUpperCase())[0];

  const h = hash(text.toLowerCase());
  const hue = h % 360;
  const other = (hue + 40 + ((h >>> 9) % 50)) % 360;
  return { initial, from: hsl(hue, LIGHTNESS_FROM), to: hsl(other, LIGHTNESS_TO) };
}

/** Liked Songs is not named by its owner, so it has a cover of its own: a heart on violet, the same everywhere. */
export const LIKED_COVER = Object.freeze({ initial: "♥", from: "#4b2fd0", to: "#7a52e6" });

/** The gradient as CSS, for a page. */
export const coverGradient = ({ from, to }) => `linear-gradient(135deg, ${from}, ${to})`;
