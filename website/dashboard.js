/**
 * The dashboard is rendered in the browser from two JSON endpoints rather than server-rendered.
 *
 * The rest of the site is static HTML on a CDN, and this page is the only per-user thing on it.
 * Rendering it server-side would make one page uncacheable and pull a whole templating story in
 * for it; two fetches against `/api/me` and `/api/profile` keep the deployment shape unchanged.
 *
 * Everything user-supplied goes in through `textContent`, never `innerHTML` — the only value
 * here that a user controls is their own Discord display name, but "only their own" is exactly
 * the reasoning that makes a stored-XSS hole feel safe while it is being written.
 */

import { showStatus, renderSignedOut } from "./dash/shared.js";
import { renderProfile } from "./dash/profile.js";

/**
 * @returns {Promise<void>}
 */
async function main() {
  // **Both calls in one `try`, and in parallel.** The profile fetch used to sit outside the
  // try/catch: a network failure between the two — a tab that woke up on a dead connection, a
  // dropped Wi-Fi — threw an unhandled rejection and left the page on "Loading…" for ever, with
  // `aria-busy="true"` and no way back but a manual reload. Running them together also removes a
  // round trip from the critical path, since neither depends on the other: `/api/me` decrypts a
  // cookie and `/api/profile` reads the database, and the second refuses on its own if there is
  // no session.
  let identity;
  let response;
  try {
    [identity, response] = await Promise.all([fetch("/api/me"), fetch("/api/profile")]);
  } catch {
    showStatus("Couldn't reach Vibe. Check your connection and reload.");
    return;
  }

  let user;
  try {
    ({ user } = await identity.json());
  } catch {
    showStatus("Couldn't reach Vibe. Check your connection and reload.");
    return;
  }

  if (!user) {
    renderSignedOut();
    return;
  }

  if (!response.ok) {
    // A 401 here means the cookie expired between the two calls — rare, and the honest fix is
    // to show the signed-out view rather than an error about it.
    if (response.status === 401) return renderSignedOut();
    showStatus("Your stats are unavailable right now. Try again in a moment.");
    return;
  }

  let profile;
  try {
    profile = await response.json();
  } catch {
    showStatus("Your stats are unavailable right now. Try again in a moment.");
    return;
  }

  renderProfile(user, profile);
}

main();
