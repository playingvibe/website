/**
 * What every part of the dashboard uses: the mount point, templates, the status line, and the small
 * renderers for numbers.
 */

export const dash = document.getElementById("dash");

/** Discord sends these back on `/dashboard?error=…`; anything else is a bug, not a user event. */
const ERRORS = {
  cancelled: "Sign-in was cancelled.",
  bad_state: "That sign-in link expired. Try again.",
  no_code: "Discord didn't send a sign-in code. Try again.",
  exchange_failed: "Discord wouldn't complete the sign-in. Try again in a moment.",
  discord_unavailable: "Discord didn't respond. Try again in a moment.",
  // Says plainly that retrying is pointless. Every other message here invites another attempt,
  // which is the wrong advice when the deployment's own credentials are what is broken.
  server_misconfigured: "Sign-in is misconfigured on our side, so trying again won't help. Please report it in the support server.",
};

/**
 * @param {string} id
 * @returns {DocumentFragment}
 */
export function template(id) {
  return document.getElementById(id).content.cloneNode(true);
}

/**
 * @param {string} message
 * @returns {void}
 */
export function showStatus(message) {
  dash.replaceChildren(Object.assign(document.createElement("p"), {
    className: "dash-status",
    textContent: message,
  }));
  dash.setAttribute("aria-busy", "false");
}

/**
 * The "Premium" chip: the crown and the word, on the profile header and beside a server with a subscription.
 * @returns {HTMLElement}
 */
export function premiumChip() {
  const chip = document.createElement("span");
  chip.className = "premium-chip";

  const icon = document.createElement("img");
  // The same file the bot draws onto the card, written by scripts/assets/generate-badges.js so the two can
  // never be different crowns.
  icon.src = "/badges/badge_premium.png";
  // Sized in the markup as well as in CSS: without intrinsic dimensions nothing is reserved until the bytes
  // arrive and the page shifts. 17 matches `.premium-chip img` in the stylesheet.
  icon.width = 17;
  icon.height = 17;
  // Decorative: the word beside it already says it, and a duplicate would be read out twice.
  icon.alt = "";

  const label = document.createElement("span");
  label.textContent = "Premium";

  chip.append(icon, label);
  return chip;
}

/**
 * @param {string} text
 * @returns {HTMLElement}
 */
export function note(text) {
  const p = document.createElement("p");
  p.className = "section-note";
  p.textContent = text;
  return p;
}

/**
 * @param {number} hours
 * @returns {string} Whole minutes below an hour, one decimal below ten hours, whole hours above
 *          — a listening total reading "0.0h" on someone's first session is a bad first
 *          impression of a stat that is meant to feel like progress.
 */
export function formatHours(hours) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours).toLocaleString()} h`;
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} [note]
 * @returns {HTMLElement}
 */
export function stat(label, value, note) {
  const cell = document.createElement("div");
  cell.className = "stat";

  const v = document.createElement("span");
  v.className = "stat-value";
  v.textContent = value;

  const l = document.createElement("span");
  l.className = "stat-label";
  l.textContent = label;

  cell.append(v, l);
  if (note) {
    const n = document.createElement("span");
    n.className = "stat-note";
    n.textContent = note;
    cell.append(n);
  }
  return cell;
}

/**
 * @returns {void}
 */
export function renderSignedOut() {
  const view = template("tpl-signed-out");

  const error = new URLSearchParams(window.location.search).get("error");
  if (error) {
    const banner = document.createElement("p");
    banner.className = "dash-error";
    banner.textContent = ERRORS[error] ?? "Something went wrong signing in. Try again.";
    view.querySelector("h1").before(banner);
  }

  dash.replaceChildren(view);
  dash.setAttribute("aria-busy", "false");
}
