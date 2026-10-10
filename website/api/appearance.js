import { getSession } from "../lib/session.js";
import { findRankCardStyle, saveRankCardStyle } from "../lib/mongo.js";
import { isEntitled, isForSale } from "../lib/entitlements.js";
import {
  CARD_BACKGROUND_STYLES,
  isReadableCardAccent,
  normaliseCardColor,
} from "../lib/generated/cardBackgrounds.js";
import { readJson } from "../lib/http.js";

/**
 * The suggested colours, offered beside a free picker.
 *
 * The card is rendered on a near-black ground with white text over an accent glow, so a dark or
 * low-contrast accent produces a card that looks broken rather than customised. The suggestions are
 * the safe starting points; a free pick is accepted only when it passes `isReadableCardAccent()`,
 * the rule the renderer applies too.
 */
export const PALETTE = Object.freeze([
  { name: "Vibe", value: "#ff295e" },
  { name: "Ember", value: "#f0803c" },
  { name: "Gold", value: "#f5c542" },
  { name: "Mint", value: "#4fd39c" },
  { name: "Sky", value: "#5aa9f0" },
  { name: "Violet", value: "#9b6cf0" },
  { name: "Rose", value: "#f06ca8" },
  { name: "Slate", value: "#9aa4b2" },
]);

/**
 * Reads or sets the signed-in user's appearance settings.
 *
 * **One route for both surfaces:** the card `/rank` draws and the player `/watch` opens. A route
 * named after one of them that wrote the other's setting would make people build a second endpoint
 * rather than find the right one. One entitlement check, one write path.
 *
 * The entitlement is checked on the **write** only. Reading back a colour you already have must
 * keep working if an entitlement lapses, or the card would render one thing and the page would
 * claim another.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
const NOT_A_COLOUR = { error: "Not a colour." };
const NOT_A_BACKGROUND = { error: "Not an available background." };

/** A background style's key, or `null` to clear it. An allow-list: a key selects a drawing routine, not a file. */
function backgroundKey(value) {
  const key = value ?? null;
  if (key !== null && !CARD_BACKGROUND_STYLES.some((entry) => entry.key === key)) return NOT_A_BACKGROUND;
  return { value: key };
}

/** Free-form hex, normalised so `#F0A` and `#ff00aa` cannot be stored as two values meaning the same colour. */
function colourValue(value) {
  const colour = normaliseCardColor(value ?? null);
  return colour === undefined ? NOT_A_COLOUR : { value: colour };
}

/**
 * Each setting the page can send, and what makes its value acceptable. A validator returns `{value}` to keep it
 * or `{error}` to refuse the request, and the table's order is the order errors are found in.
 */
export const SETTINGS = {
  accent: (value) => {
    // Checked server-side: a request is not the page, and "the UI only sends valid values" is not a
    // validation strategy. A palette colour, or any colour that can be read on the card's ground.
    const accent = normaliseCardColor(value ?? null);
    if (accent === undefined) return NOT_A_COLOUR;
    if (!isReadableCardAccent(accent)) return { error: "That colour is too dark to read on the card." };
    return { value: accent };
  },
  background: backgroundKey,
  // Free-form hex is safe **only** because the renderer veils whatever is drawn before any text goes down.
  backgroundColor: colourValue,
  // Free-form hex, like the background colour and unlike `accent`. `player.css` mixes this into surfaces at 9%
  // and into the ambient glow at 2-9%, so no value it can hold makes anything unreadable — where the rank-card
  // accent is drawn as text and a bar and must carry contrast by itself.
  activityAccent: colourValue,
  // Same allow-list as the card's, because it is the same two styles — the Activity turns this into a CSS
  // class, so an unknown value would silently render nothing while the page claimed otherwise.
  activityBackground: backgroundKey,
  // Whether a server's own guild-tier Activity theme wins over this listener's personal accent, in every
  // server that has one. Off by default, and it needs no premium: it costs nothing to offer, and a lapsed
  // subscriber's accent outlives the subscription, so this is how they put a server's theme back in front of it.
  preferServerTheme: (value) =>
    typeof value === "boolean" ? { value } : { error: "preferServerTheme must be true or false." },
  // `null` is accepted and meaningful: it returns the card to the style's own default rather than pinning a
  // preference. A string "true" is refused rather than coerced, because coercion would silently store
  // something the page never sent.
  fade: (value) => {
    const fade = value ?? null;
    return fade === null || typeof fade === "boolean" ? { value: fade } : { error: "Fade must be true, false, or null." };
  },
};

/**
 * The settings a body sets, checked.
 *
 * **Only the keys that were actually sent.** The page has independent controls, and defaulting a missing one to
 * null would mean changing your colour silently cleared your background. `hasOwn` rather than a truthiness check,
 * because `null` is a real value here: it is how the settings are cleared.
 * @param {unknown} body
 * @returns {{changes: Record<string, string|boolean|null>, error?: string}} `error` is the first refusal,
 *          and `changes` is then to be ignored.
 */
export function validateChanges(body) {
  const changes = {};
  if (!body || typeof body !== "object") return { changes };
  for (const [key, validate] of Object.entries(SETTINGS)) {
    if (!Object.hasOwn(body, key)) continue;
    const { value, error } = validate(body[key]);
    if (error) return { changes, error };
    changes[key] = value;
  }
  return { changes };
}

/**
 * Whether a body only takes settings off (`null`) or sets `preferServerTheme`: the two things anyone may
 * do whether or not they are subscribed. Anything that sets a colour, a background or a pinned fade is
 * the paid feature.
 * @param {unknown} body
 * @returns {boolean}
 */
function isUndoOnly(body) {
  if (!body || typeof body !== "object") return false;
  const entries = Object.entries(body);
  return entries.length > 0 && entries.every(([key, value]) => key === "preferServerTheme" || value === null);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }

  if (req.method === "GET") {
    // Guarded like every sibling handler. `isEntitled()` swallows its own failures (it fails
    // closed, deliberately), but `findRankCardStyle` does not — and an unguarded rejection here
    // is a 500 with Vercel's own body, which tells the page nothing it can act on.
    let style;
    let entitled;
    try {
      [style, entitled] = await Promise.all([findRankCardStyle(session.id), isEntitled(session.id)]);
    } catch {
      res.status(503).json({ error: "Your appearance settings are unavailable right now." });
      return;
    }
    res.status(200).json({
      ...style,
      palette: PALETTE,
      backgrounds: CARD_BACKGROUND_STYLES,
      entitled,
      forSale: isForSale(),
    });
    return;
  }

  if (req.method !== "PUT") {
    res.status(405).json({ error: "Use GET or PUT." });
    return;
  }

  const entitled = await isEntitled(session.id);
  const body = await readJson(req);

  // Setting a colour or a background is the premium feature. Taking one off, and choosing a server's
  // theme over a personal one, are not: the bot keeps applying what a lapsed subscriber chose, so
  // they must be able to undo it without deleting all their data.
  if (!entitled && !isUndoOnly(body)) {
    res.status(402).json({ error: "Custom styling is a premium feature." });
    return;
  }

  const { changes, error } = validateChanges(body);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  if (!Object.keys(changes).length) {
    res.status(400).json({ error: "Send at least one setting to change." });
    return;
  }

  try {
    await saveRankCardStyle(session.id, changes);
  } catch {
    // **503 and nothing else changed.** The page keeps the edit in its pending state, so a retry
    // sends the same body rather than half of it.
    res.status(503).json({ error: "Your appearance settings are unavailable right now." });
    return;
  }
  res.status(200).json(changes);
}
