import { dash, template, formatHours, stat, premiumChip } from "./shared.js";
import { renderCardStyle } from "./appearance.js";

/**
 * The page shows one panel at a time: Overview (the stats), Rank card, Activity. The tab row is part of the
 * Appearance group, so it stays hidden, and the page stays the plain overview, until `renderCardStyle()` decides
 * the group is shown. A `#card` or `#activity` link opens that panel once it exists.
 * @param {DocumentFragment} view
 * @returns {{opened: () => void}}
 */
function setUpTabs(view) {
  const row = view.querySelector(".profile-tabs");
  const buttons = [...row.querySelectorAll("[data-tab]")];
  const panels = [...view.querySelectorAll("[data-panel]")];

  const show = (name) => {
    for (const panel of panels) panel.classList.toggle("is-off", !panel.dataset.panel.split(" ").includes(name));
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.tab === name));
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      // `replaceState`: switching panels is not navigation, so Back leaves the page rather than stepping through tabs.
      window.history.replaceState(null, "", button.dataset.tab === "overview" ? window.location.pathname : `#${button.dataset.tab}`);
      show(button.dataset.tab);
    });
  }

  show("overview");
  return {
    opened() {
      const wanted = window.location.hash.slice(1);
      if (!row.hidden && buttons.some((button) => button.dataset.tab === wanted)) show(wanted);
    },
  };
}

/**
 * @param {object} user
 * @param {object} profile
 * @returns {void}
 */
export function renderProfile(user, profile) {
  const view = template("tpl-profile");

  const avatar = view.querySelector(".avatar");
  avatar.src = user.avatar;
  avatar.alt = `${user.username}'s avatar`;
  const nameEl = view.querySelector(".profile-name");
  nameEl.textContent = user.username;

  // **The crown gets a label here where the card leaves it bare, and that is deliberate.** On the
  // rank card it sits among earned badges, so its meaning is carried by its neighbours; alone on a
  // web page it is a gold icon with no context and no hover affordance on touch. The word is what
  // makes it self-explanatory — and this page is also where somebody comes to *check* whether they
  // are subscribed, so it should answer that without being decoded.
  if (profile.premium) view.querySelector(".profile-name-row").append(premiumChip());

  const { level, stats, badges, hasData } = profile;

  view.querySelector(".level-badge").textContent = `Level ${level.level}`;
  view.querySelector(".level-next").textContent = level.hoursForNextLevel
    ? `${formatHours(Math.max(0, level.hoursForNextLevel - stats.listeningHours))} to level ${level.level + 1}`
    : "Max level";
  view.querySelector(".level-fill").style.width = `${Math.round(level.progress * 100)}%`;

  view.querySelector(".stat-grid").append(
    stat("Listening time", formatHours(stats.listeningHours)),
    stat("Tracks listened", stats.sessionCount.toLocaleString()),
    stat("Current streak", `${stats.currentStreak} ${stats.currentStreak === 1 ? "day" : "days"}`,
      stats.longestStreak ? `Best: ${stats.longestStreak}` : undefined),
    stat("Servers listened in", stats.guildCount.toLocaleString())
  );

  const badgeRow = view.querySelector(".badge-row");
  if (badges.length) {
    for (const badge of badges) {
      const pill = document.createElement("span");
      pill.className = "badge";
      pill.textContent = badge.name;
      // The tier colour is the only styling that comes from data; it is a hex literal from a
      // generated file, not anything a user can influence.
      pill.style.setProperty("--badge", badge.color);
      badgeRow.append(pill);
    }
  } else {
    const none = document.createElement("p");
    none.className = "badge-empty";
    none.textContent = hasData
      ? "No badges yet — the first one lands at 10 hours of listening."
      : "Play something with Vibe and your first badge is 10 hours away.";
    badgeRow.append(none);
  }

  if (!hasData) {
    const note = document.createElement("p");
    note.className = "dash-status";
    note.textContent =
      "Nothing recorded yet. Play a track with Vibe in any server and these numbers start moving.";
    view.querySelector(".stat-grid").before(note);
  }

  const tabs = setUpTabs(view);

  renderCardStyle({
    host: view.querySelector(".swatches"),
    backdropHost: view.querySelector(".backdrops"),
    colourHost: view.querySelector(".backdrop-colour"),
    playerHost: view.querySelector(".player-preview-host"),
    activityHost: view.querySelector(".activity-accent"),
    activityBgHost: view.querySelector(".activity-backdrops"),
    preview: { host: view.querySelector(".card-preview"), user, level, stats },
    group: view.querySelectorAll('[data-group="appearance"]'),
  }).then(() => tabs.opened());

  view.querySelector(".signout").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/dashboard");
  });

  dash.replaceChildren(view);
  dash.setAttribute("aria-busy", "false");
}
