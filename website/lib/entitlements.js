/**
 * Who may use the premium features, and whether premium is on sale yet. **Every premium decision on
 * the website goes through this module and nothing else reads premium data.**
 *
 * **This is the open version.** In this repository nothing is gated: every account is entitled and
 * premium is for sale, so the whole interface (the appearance settings, the passport, the crown) can
 * be developed and tested without a subscription. The production site runs a different
 * implementation of the same three functions, which is not part of this repository.
 *
 * Keep the names and the shapes of the results: the API handlers rely on them.
 */

/**
 * Whether this user has premium, for showing what premium gives: the crown, a live passport and its
 * avatar.
 * @param {string} _userId
 * @returns {Promise<boolean>}
 */
export async function hasPremium(_userId) {
  return true;
}

/**
 * Whether this user may change the premium appearance settings.
 * @param {string} _userId
 * @returns {Promise<boolean>}
 */
export async function isEntitled(_userId) {
  return true;
}

/**
 * Whether premium is on sale yet, which decides what somebody without it sees. Here it is, so the
 * settings show as working rather than hidden.
 * @returns {boolean}
 */
export function isForSale() {
  return true;
}

/**
 * Which of these servers hold a guild-tier subscription, for the badge on the servers list. Here
 * every one does, like every other check in this open version.
 * @param {string[]} guildIds
 * @returns {Promise<Set<string>>}
 */
export async function guildsWithPremium(guildIds) {
  return new Set(guildIds);
}
