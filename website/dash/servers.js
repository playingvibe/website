import { template, note, renderSignedOut } from "./shared.js";

/**
 * The user's manageable servers, each with the Vibe bots in it and a link to configure it. The
 * settings themselves live on their own page (`/servers/<id>`, `server.js`): one row here per
 * server keeps this list short however many servers and bots there are.
 * @param {HTMLElement} host
 * @returns {Promise<void>}
 */
export async function renderServers(host) {
  let data;
  try {
    const response = await fetch("/api/guilds");
    // A dead Discord token (Vibe removed under Authorized Apps) leaves the site cookie valid for days: the
    // endpoint answers 401 so the page can say sign in, as the profile and settings pages do.
    if (response.status === 401) return renderSignedOut();
    if (!response.ok) throw new Error(String(response.status));
    data = await response.json();
  } catch {
    host.replaceChildren(note("Your servers are unavailable right now."));
    return;
  }

  if (!data.guilds.length) {
    host.replaceChildren(note("You don't manage any servers Discord will tell us about."));
    return;
  }

  host.replaceChildren(...data.guilds.map(serverCard));
}

/**
 * @param {object} guild
 * @returns {DocumentFragment}
 */
function serverCard(guild) {
  const view = template("tpl-server");

  const icon = view.querySelector(".server-icon");
  if (guild.icon) {
    icon.src = guild.icon;
  } else {
    // No icon is common; a broken image is worse than an initial.
    icon.replaceWith(
      Object.assign(document.createElement("span"), {
        className: "server-icon server-initial",
        textContent: guild.name.slice(0, 1).toUpperCase(),
      })
    );
  }
  view.querySelector(".server-name").textContent = guild.name;
  view.querySelector(".server-count").textContent = guild.instances.length
    ? guild.instances.map((instance) => instance.name).join(", ")
    : "no Vibe yet";

  // The whole action of the card: open the settings, or add the bot first.
  const action = view.querySelector(".server-action");
  if (guild.instances.length) {
    action.href = `/servers/${encodeURIComponent(guild.id)}`;
    action.textContent = "Configure";
    action.setAttribute("aria-label", `Configure ${guild.name}`);
  } else {
    action.href = "/#add";
    action.textContent = "Add Vibe";
    action.setAttribute("aria-label", `Add Vibe to ${guild.name}`);
  }
  return view;
}
