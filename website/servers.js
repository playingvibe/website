/**
 * The servers page: the servers you manage and the Vibe bots in each, with each bot's settings.
 * Split from the profile page (`dashboard.js`) so neither has to load the other's weight, and so
 * a settings-heavy page (and, later, playlist editing) does not grow inside the stats page.
 *
 * Rendered in the browser from `/api/me` and `/api/guilds`, like the profile: one static shell on
 * the CDN, nothing user-supplied through `innerHTML`.
 */

import { dash, template, showStatus, renderSignedOut } from "./dash/shared.js";
import { renderServers } from "./dash/servers.js";

async function main() {
  let user;
  try {
    ({ user } = await (await fetch("/api/me")).json());
  } catch {
    showStatus("Couldn't reach Vibe. Check your connection and reload.");
    return;
  }

  if (!user) {
    renderSignedOut();
    return;
  }

  const view = template("tpl-servers");

  view.querySelector(".signout").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/dashboard");
  });

  // Painted first and filled in after, so the page is never blank while the server list loads.
  dash.replaceChildren(view);
  dash.setAttribute("aria-busy", "false");
  await renderServers(dash.querySelector(".servers"));
}

main();
