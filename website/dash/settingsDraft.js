/**
 * The staged-edit rules of the server settings page, with no DOM in them so they can be tested.
 *
 * **A draft is only what the person has touched.** `saved` is the last state the bot sent; `draft` is a
 * `Map` from a setting's key to the value they picked. What the page shows is the draft where there is
 * one and the saved value otherwise, so a setting nobody touched always follows the bot, and putting a
 * setting back to what is saved drops it from the draft (and from the save bar) rather than leaving an
 * entry that claims to be a change.
 *
 * Keys: `s:<field>` for a server-wide setting, `b:<clientId>:<field>` for one bot's override, where
 * `null` means "follows the server". `s:overlay` holds the action to take: `"on"`, `"off"` or `"new"`.
 */

export const serverKey = (field) => `s:${field}`;
export const botKey = (clientId, field) => `b:${clientId}:${field}`;

/** @returns {{scope: "server", field: string} | {scope: "bot", clientId: string, field: string}} */
export function parseKey(key) {
  const [scope, ...rest] = key.split(":");
  if (scope === "s") return { scope: "server", field: rest[0] };
  return { scope: "bot", clientId: rest[0], field: rest[1] };
}

/** Lists are sets: the order they were picked in is not a change. */
export function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((id) => b.includes(id));
  return a === b;
}

/** What the bot currently has for a key. */
export function savedValue(saved, key) {
  const parsed = parseKey(key);
  if (parsed.scope === "server") {
    if (parsed.field === "overlay") return saved.shared.overlay.on ? "on" : "off";
    return saved.shared[parsed.field];
  }
  const instance = saved.instances.find((entry) => entry.clientId === parsed.clientId);
  const overrides = instance?.overrides ?? {};
  return parsed.field in overrides ? overrides[parsed.field] : null;
}

/** What the page should show: the person's pick, else what is saved. */
export function effectiveValue(saved, draft, key) {
  return draft.has(key) ? draft.get(key) : savedValue(saved, key);
}

/**
 * Whether a picked value is a change. The overlay is an *action*, so it is one unless it asks for what
 * is already true (turning on an overlay that is on); `"new"` always is, while there is a link to replace.
 */
export function isChange(saved, key, value) {
  if (key === serverKey("overlay")) {
    if (value === "new") return saved.shared.overlay.on;
    return value !== savedValue(saved, key);
  }
  return !sameValue(savedValue(saved, key), value);
}

/** Sets a pick, or drops it when it is back to what is saved. Returns whether the key is now a change. */
export function pick(saved, draft, key, value) {
  if (isChange(saved, key, value)) {
    draft.set(key, value);
    return true;
  }
  draft.delete(key);
  return false;
}

/** The request body for one key: what `/api/guild-settings` accepts. */
export function payloadFor(key, value) {
  const parsed = parseKey(key);
  if (parsed.scope === "server") return { change: { field: parsed.field, value } };
  return { instance: { clientId: parsed.clientId, field: parsed.field, value } };
}

/**
 * Every key that is a change against `saved`, in the order they should be sent: server-wide settings
 * first, then each bot's. Anything that stopped being a change (the bot's state moved under the draft)
 * is dropped.
 */
export function pendingKeys(saved, draft) {
  return [...draft.keys()].filter((key) => isChange(saved, key, draft.get(key))).sort((a, b) => Number(a.startsWith("b:")) - Number(b.startsWith("b:")));
}
