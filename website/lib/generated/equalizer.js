/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/shared/format/equalizer.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

/**
 * The server's own equaliser curves: what a curve is, what it may hold, and the ready-made ones the editor starts from.
 * Lavalink's `equalizer` filter has 15 bands, each a gain from -0.25 (the band muted) to 1.0, 0 being untouched.
 *
 * **One place for the numbers**, read by the bot (to check a request and to apply a curve) and by the website's editor
 * (its sliders and its templates), so the page cannot offer what the bot refuses. Imports nothing: it is copied
 * verbatim into `website/lib/generated/` by `scripts/sync-web-shared.js`.
 */

/** The 15 bands' centre frequencies in Hz, in band order (Lavalink's own, 25 Hz to 16 kHz). */
export const EQ_BANDS = Object.freeze([25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000]);

/**
 * A saved curve may lift a band by up to +0.5 and cut it by the most Lavalink allows. Above that, a loud track
 * clips, which is why Bass Boost stays under 0.5 as well; the filters add up when they are combined, so the sum is
 * held to `EQ_COMBINED_MAX` at the player.
 */
export const EQ_GAIN_MIN = -0.25;
export const EQ_GAIN_MAX = 0.5;
export const EQ_GAIN_STEP = 0.05;
export const EQ_COMBINED_MAX = 0.6;

/** A server keeps this many saved curves, and a name is at most this long. */
export const EQ_MAX_PRESETS = 5;
export const EQ_NAME_MAX = 24;

/**
 * Ready-made curves for the editor to start from. They are starting points to tweak and save under a name of the
 * server's own, not filters anyone can apply: only a saved curve can be. Every number is inside the allowed range
 * (`tests/equalizer.test.js` checks it).
 */
export const EQ_TEMPLATES = Object.freeze([
  { id: "flat", name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", name: "Bass+", gains: [0.3, 0.3, 0.25, 0.2, 0.1, 0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "treble", name: "Treble+", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.3] },
  { id: "vocal", name: "Vocal", gains: [-0.1, -0.1, -0.05, 0, 0, 0.05, 0.1, 0.15, 0.2, 0.2, 0.15, 0.1, 0, -0.05, -0.1] },
  { id: "rock", name: "Rock", gains: [0.25, 0.2, 0.15, 0.05, 0, -0.05, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.2, 0.2, 0.2] },
  { id: "pop", name: "Pop", gains: [-0.05, 0, 0.05, 0.1, 0.15, 0.15, 0.1, 0.05, 0, -0.05, -0.05, 0, 0.05, 0.1, 0.1] },
  { id: "electronic", name: "Electronic", gains: [0.3, 0.25, 0.2, 0.1, 0, -0.05, -0.05, 0, 0.1, 0.15, 0.15, 0.2, 0.25, 0.25, 0.2] },
  { id: "acoustic", name: "Acoustic", gains: [0.1, 0.1, 0.1, 0.05, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.15, 0.15, 0.15, 0.1] },
  { id: "late-night", name: "Late night", gains: [-0.1, -0.1, -0.05, 0, 0, 0, 0, 0, 0, -0.05, -0.05, -0.1, -0.15, -0.2, -0.2] },
]);

/**
 * The 15 gains of a request, checked: exactly 15 numbers, each inside the allowed range, rounded to two places (the
 * slider's step is 0.05, so nothing real is lost). `null` for anything else, so the caller refuses it whole rather than
 * clamping a value somebody did not choose.
 * @param {unknown} gains
 * @returns {?number[]}
 */
export function normaliseGains(gains) {
  if (!Array.isArray(gains) || gains.length !== EQ_BANDS.length) return null;
  const rounded = gains.map((gain) => (typeof gain === "number" && Number.isFinite(gain) ? Math.round(gain * 100) / 100 : NaN));
  if (rounded.some((gain) => Number.isNaN(gain) || gain < EQ_GAIN_MIN || gain > EQ_GAIN_MAX)) return null;
  return rounded;
}

/**
 * A curve's name as stored: spaces tidied and cut to the length, or `null` when nothing is left.
 * @param {unknown} name
 * @returns {?string}
 */
export function normalisePresetName(name) {
  if (typeof name !== "string") return null;
  // Control characters out, so a name cannot break a menu or a log line.
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, EQ_NAME_MAX).trim();
  return clean || null;
}

/** The band names for a label, "63 Hz" or "1.6 kHz". @param {number} hz @returns {string} */
export function bandLabel(hz) {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}
