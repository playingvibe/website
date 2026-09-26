import { dash, template, formatHours, stat } from "./shared.js";
import { renderCardStyle } from "./appearance.js";

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
  if (profile.premium) {
    const chip = document.createElement("span");
    chip.className = "premium-chip";

    const icon = document.createElement("img");
    // The same file the bot draws onto the card, written here by scripts/assets/generate-badges.js so
    // the two can never be different crowns.
    icon.src = "/badges/badge_premium.png";
    // **Sized in the markup as well as in CSS.** Without intrinsic dimensions the browser reserves
    // nothing for it until the bytes arrive, and the chip — which sits in the page header — grew
    // and pushed the whole profile down a moment after paint.
    // 17 to match `.premium-chip img` in the stylesheet — a mismatch here would reserve the wrong
    // box and shift by the difference, which is the bug in miniature.
    icon.width = 17;
    icon.height = 17;
    // Decorative: the adjacent word already says it, and a duplicate would be read out twice.
    icon.alt = "";

    const label = document.createElement("span");
    label.textContent = "Premium";

    chip.append(icon, label);
    view.querySelector(".profile-name-row").append(chip);
  }

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

  renderCardStyle({
    host: view.querySelector(".swatches"),
    backdropHost: view.querySelector(".backdrops"),
    colourHost: view.querySelector(".backdrop-colour"),
    playerHost: view.querySelector(".player-preview-host"),
    activityHost: view.querySelector(".activity-accent"),
    activityBgHost: view.querySelector(".activity-backdrops"),
    preview: { host: view.querySelector(".card-preview"), user, level, stats },
    group: view.querySelectorAll('[data-group="appearance"]'),
  });

  view.querySelector(".signout").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/dashboard");
  });

  dash.replaceChildren(view);
  dash.setAttribute("aria-busy", "false");
}
