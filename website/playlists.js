/**
 * The playlists page: your own playlists, to rename, reorder and take songs out of.
 * Its own page, beside the profile and the servers (`dashboard.js`, `servers.js`), so the stats page does not grow
 * a playlist editor inside it.
 *
 * Rendered in the browser from `/api/me` and `/api/playlists`, like the others: one static shell on the CDN,
 * nothing user-supplied through `innerHTML`.
 */

import { dash, template, showStatus, renderSignedOut } from "./dash/shared.js";
import { renderPlaylists } from "./dash/playlists.js";

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

  const view = template("tpl-playlists");
  view.querySelector(".signout").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/dashboard");
  });

  // Painted first and filled in after, so the page is never blank while the playlists load.
  dash.replaceChildren(view);
  dash.setAttribute("aria-busy", "false");
  await renderPlaylists(dash.querySelector(".playlists"), { status: dash.querySelector(".playlists-status"), intro: dash.querySelector(".group-note") });
}

main();
