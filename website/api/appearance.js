import { getSession } from "../lib/session.js";
import { findRankCardStyle, saveRankCardStyle } from "../lib/mongo.js";
import { isEntitled, isForSale } from "../lib/entitlements.js";
import {
  CARD_BACKGROUND_STYLES,
  normaliseCardColor,
} from "../lib/generated/cardBackgrounds.js";
import { readJson } from "../lib/http.js";

/**
 * A short palette rather than a free colour picker.
 *
 * The card is rendered on a near-black ground with white text over an accent glow, so a dark or
 * low-contrast accent produces a card that looks broken rather than customised. Offering a wheel
 * would mean either shipping that outcome or writing a contrast validator nobody asked for; a
 * curated set is the smaller, better answer. Free hex can come later if people ask.
 */
export const PALETTE = Object.freeze([
  { name: "Vibe", value: "#e05570" },
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

  if (!(await isEntitled(session.id))) {
    res.status(402).json({ error: "Custom styling is a premium feature." });
    return;
  }

  const body = await readJson(req);

  // **Only the keys that were actually sent.** The page has two independent controls, and
  // defaulting a missing one to null would mean changing your colour silently cleared your
  // background. `in` rather than a truthiness check, because `null` is a real value here: it is
  // how both settings are cleared.
  const changes = {};

  if (body && "accent" in body) {
    const accent = body.accent ?? null;
    // Checked server-side. The page offers eight swatches; a request is not the page, and "the UI
    // only sends valid values" is not a validation strategy.
    if (accent !== null && !PALETTE.some((entry) => entry.value === accent)) {
      res.status(400).json({ error: "Not an available colour." });
      return;
    }
    changes.accent = accent;
  }

  if (body && "background" in body) {
    const background = body.background ?? null;
    // An allow-list rather than a shape check. The key selects a drawing routine, not a file, so
    // this is not a traversal question — but an unknown key would render the plain card while the
    // page claimed otherwise.
    if (background !== null && !CARD_BACKGROUND_STYLES.some((entry) => entry.key === background)) {
      res.status(400).json({ error: "Not an available background." });
      return;
    }
    changes.background = background;
  }

  if (body && "backgroundColor" in body) {
    // Free-form hex is safe **only** because the renderer veils whatever is drawn before any text
    // goes down. Normalised rather than merely checked, so `#F0A` and `#ff00aa` cannot be stored
    // as two different values meaning the same colour.
    const colour = normaliseCardColor(body.backgroundColor ?? null);
    if (colour === undefined) {
      res.status(400).json({ error: "Not a colour." });
      return;
    }
    changes.backgroundColor = colour;
  }

  if (body && "activityAccent" in body) {
    // Free-form hex, like the background colour and unlike `accent`. `player.css` mixes this into
    // surfaces at 9% and into the ambient glow at 2-9%, so no value it can hold makes anything
    // unreadable — where the rank-card accent is drawn as text and a bar and must carry contrast
    // by itself.
    const colour = normaliseCardColor(body.activityAccent ?? null);
    if (colour === undefined) {
      res.status(400).json({ error: "Not a colour." });
      return;
    }
    changes.activityAccent = colour;
  }

  if (body && "activityBackground" in body) {
    const style = body.activityBackground ?? null;
    // Same allow-list as the card's, because it is the same two styles — the Activity turns this
    // into a CSS class, so an unknown value would silently render nothing while the page claimed
    // otherwise.
    if (style !== null && !CARD_BACKGROUND_STYLES.some((entry) => entry.key === style)) {
      res.status(400).json({ error: "Not an available background." });
      return;
    }
    changes.activityBackground = style;
  }

  if (body && "preferServerTheme" in body) {
    // Whether a server's own guild-tier Activity theme wins over this listener's personal accent,
    // in every server that has one. Off by default: unlike the fields above, this needs no
    // premium check of its own — it costs nothing to offer and only ever matters alongside a
    // personal accent, which this route already gates.
    if (typeof body.preferServerTheme !== "boolean") {
      res.status(400).json({ error: "preferServerTheme must be true or false." });
      return;
    }
    changes.preferServerTheme = body.preferServerTheme;
  }

  if (body && "fade" in body) {
    const fade = body.fade ?? null;
    // `null` is accepted and meaningful: it returns the card to the style's own default rather
    // than pinning a preference. A string "true" is not a boolean and is refused rather than
    // coerced, because coercion here would silently store something the page never sent.
    if (fade !== null && typeof fade !== "boolean") {
      res.status(400).json({ error: "Fade must be true, false, or null." });
      return;
    }
    changes.fade = fade;
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
