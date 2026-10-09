/**
 * The staged-edit rules of the appearance page, with no DOM in them so they can be tested.
 *
 * Seven settings live on one document and are saved by one request. `saved` is what the server holds and
 * `current` is what is on screen: the difference between them is the entire definition of "unsaved". The keys
 * are the ones `PUT /api/appearance` takes.
 *
 * **Only the fields that actually differ are sent.** The endpoint writes exactly the keys it receives, so a body
 * carrying all seven every time would mean changing a colour silently rewrote the background to whatever this
 * page last happened to know.
 */

/** Settings that mean something only while a card background style is chosen: on the plain card they change nothing. */
const NEEDS_BACKGROUND = new Set(["backgroundColor", "fade"]);

/** `null` until the fade switch is touched, so the card follows whichever style is picked. */
const KEYS = ["accent", "background", "backgroundColor", "fade", "activityAccent", "activityBackground", "preferServerTheme"];

/**
 * @param {object} data - `GET /api/appearance`.
 * @returns {{saved: Record<string, any>, current: Record<string, any>}}
 */
export function createDraft(data) {
  const saved = {
    accent: data.accent,
    background: data.background ?? null,
    // `null` follows the card's colour: the bot tints a background with the accent unless a colour was chosen.
    backgroundColor: data.backgroundColor ?? null,
    fade: data.fade ?? null,
    activityAccent: data.activityAccent ?? null,
    activityBackground: data.activityBackground ?? null,
    // Whether a server's own guild-tier theme wins over the personal accent, in every server that has one.
    // Meaningless without a personal accent set, but stored independently of it: turning this on and then
    // clearing the accent should not silently turn it off again.
    preferServerTheme: data.preferServerTheme === true,
  };
  return { saved, current: { ...saved } };
}

/** The keys whose on-screen value is a change, in the order they are sent. */
function changedKeys({ saved, current }) {
  return KEYS.filter((key) => {
    // Only counts while a style is actually chosen: letting an invisible setting mark the form dirty would
    // mean a bar that cannot be explained.
    // A clear (`null`) always counts: "use the bot's colour" has to reach the database even with no style on,
    // or the old tint comes back the next time a style is chosen.
    if (NEEDS_BACKGROUND.has(key) && current.background === null && current[key] !== null) return false;
    return current[key] !== saved[key];
  });
}

/** Whether anything on screen differs from the server. */
export function isDirty(draft) {
  return changedKeys(draft).length > 0;
}

/** The request body: just the settings that changed. */
export function bodyFor(draft) {
  return Object.fromEntries(changedKeys(draft).map((key) => [key, draft.current[key]]));
}

/**
 * Records a saved body as what the server holds.
 *
 * **Assigned from `body`, not from the current state.** The body is built conditionally — the colour and the fade
 * are only sent while a background style is chosen — so recording a field that was never sent would make the next
 * edit think it matched the server, leave it out, and the value would silently never reach the database.
 */
export function markSaved(draft, body) {
  for (const key of KEYS) if (key in body) draft.saved[key] = body[key];
}

/** Puts every setting back to what the server holds. */
export function revert(draft) {
  Object.assign(draft.current, draft.saved);
}
