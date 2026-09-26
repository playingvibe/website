/**
 * The per-instance settings the website is allowed to write, and how to read a stored set back.
 *
 * **Shared because it was defined twice, identically.** `guilds.js` and `guild.js` each carried
 * their own `pickOverrides()` and their own field list, which is the shape that lets a fourth
 * overridable setting reach one endpoint and not the other — and the symptom would be a value the
 * dashboard shows on one screen and forgets on the next.
 *
 * **Deliberately narrower than the bot's own `OVERRIDABLE`.** `src/database/repositories/
 * GuildInstanceRepository.js` also allows `autoplay` and `autoplayRoomTaste`; the dashboard does
 * not offer them, and an API that accepts fields no UI sends is an API whose surface nobody has
 * looked at. Widen this when the dashboard grows the controls, not before.
 */
export const OVERRIDABLE = Object.freeze(["announcements", "voiceChannels", "commandsChannels"]);

/**
 * @param {object} [overrides]
 * @returns {object} Only the keys actually set. An absent key means "inherits the shared value"
 *          and has to stay absent rather than becoming an explicit null — `null` is a real
 *          override, and `[]` on either list means unrestricted for that instance.
 */
export function pickOverrides(overrides = {}) {
  const out = {};
  for (const field of OVERRIDABLE) {
    if (field in overrides && overrides[field] !== undefined) out[field] = overrides[field];
  }
  return out;
}
