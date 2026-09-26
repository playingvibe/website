import { getSession } from "../lib/session.js";
import { findRankCardStyle, saveRankCardStyle, findPremiumActive } from "../lib/mongo.js";
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
 * **Renamed from `rank-card` when the Activity accent arrived.** It covers two surfaces now — the
 * card `/rank` draws and the player `/watch` opens — and a route called `rank-card` writing an
 * Activity setting is the kind of drift that makes people build a second endpoint rather than find
 * the right one. One entitlement check, one write path.
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
    // An allow-list rather than a shape check. The key selects a drawing routine rather than a
    // file now, so this is no longer a traversal question — but an unknown key would render the
    // plain card while the page claimed otherwise, which is its own kind of lie.
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

/**
 * Mirrors `userHasFeature()` in `src/domain/entitlements.js`, which the website cannot import —
 * its Vercel deploy root is `website/`, so nothing under `src/` is in the bundle.
 *
 * **Both halves have to agree, and this is the one that leaks if it does not.** The website is the
 * *only* write path for the accent: `UserRepository.setRankCardAccent()` has no caller in the bot,
 * and `RankCommand` only reads the value. So if this function is wrong, the paywall does not exist,
 * however correct `src/domain/entitlements.js` happens to be.
 *
 * `PREMIUM_OPEN` keeps exactly the meaning it has on the bot side, and **fails closed**:
 *
 * | Value | Meaning |
 * |---|---|
 * | exactly `"true"` | everything is free — a development convenience, never set in production |
 * | unset / anything else | consult the mirror the flagship writes |
 *
 * Until 2026-09-11 an unset variable meant open, so a Vercel project missing it gave every paid
 * setting away without anyone having decided to.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isEntitled(userId) {
  if (process.env.PREMIUM_OPEN === "true") return true;

  try {
    return await findPremiumActive(userId);
  } catch {
    // Fail closed, matching the bot. A database blip must not hand out a paid setting: you cannot
    // tell afterwards who was entitled and who merely caught an outage.
    return false;
  }
}

/**
 * Whether premium is on sale yet, which decides what somebody without it sees.
 *
 * | | not for sale | for sale |
 * |---|---|---|
 * | **not entitled** | the appearance settings are hidden entirely | shown greyed out, each with its "premium feature" note |
 * | **entitled** | they work | they work |
 *
 * **The signal is `PREMIUM_SKU_ID`** — the Discord SKU of the user-tier subscription — rather than a
 * separate boolean. Everything that needs to know "is it for sale" also needs that id (the bot's
 * premium button cannot be built without one), so the switch and the thing it announces cannot
 * disagree. A value that is not a snowflake reads as not for sale: a typo hides the settings
 * rather than advertising something nobody can buy.
 *
 * **Presentation only.** A write from somebody not entitled is refused whether or not anything is
 * for sale; hiding a control is not the gate.
 * @returns {boolean}
 */
export function isForSale() {
  return /^\d{17,20}$/.test(process.env.PREMIUM_SKU_ID ?? "");
}
