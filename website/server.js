/**
 * One server's settings page, `/servers/<id>` (rewritten to this page in `vercel.json`, and by the
 * dev server). Rendered in the browser like the other dashboard pages: one static shell on the CDN,
 * the data from `/api/me` and `/api/guild-settings`, nothing user-supplied is ever parsed as markup.
 */

import { dash, template, showStatus, renderSignedOut, premiumChip } from "/dash/shared.js";
import { renderServerSettings } from "/dash/serverSettings.js";

async function main() {
  // `/servers/<id>`: the id is the last path segment. A snowflake or nothing; anything else is a bad link.
  const guildId = window.location.pathname.split("/").filter(Boolean)[1] ?? "";
  if (!/^\d{17,20}$/.test(guildId)) {
    showStatus("That server link isn't right. Pick a server from your list.");
    return;
  }

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

  const view = template("tpl-settings");
  view.querySelector(".signout").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/dashboard");
  });

  dash.replaceChildren(view);
  dash.setAttribute("aria-busy", "false");

  const body = dash.querySelector(".settings-body");
  const title = dash.querySelector(".settings-title");
  title.textContent = "Server settings";
  await renderServerSettings(body, {
    guildId,
    nav: dash.querySelector(".settings-nav"),
    status: dash.querySelector(".settings-status"),
    onName: (name, premium) => {
      title.textContent = name;
      if (premium) title.parentElement.append(premiumChip());
    },
  });
}

main();
