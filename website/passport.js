/**
 * Renders one listening passport.
 *
 * **The token comes from the path, not a query string.** `/u/<token>` is rewritten to the page by
 * `vercel.json`, so the address somebody shares reads as a page rather than as an API call with a secret
 * stapled to it, and a link pasted into a chat client does not get its query mangled by a URL shortener or a
 * tracking stripper.
 *
 * **One view at a time.** The passport is the profile: the stats, the badges, the recent plays and a row per
 * playlist. Opening a playlist replaces all of that with the playlist alone, under a bigger title and a back
 * button, so a long list is read on its own rather than inside a long page. Which one is open is in the URL
 * hash (`#playlist=liked`, `#playlist=2`), so a link opens it and the browser's Back button closes it.
 *
 * This is an external module rather than an inline script so the page needs no CSP hash for it.
 */

const token = location.pathname.split("/").filter(Boolean).pop() ?? "";
const root = document.getElementById("passport");
const status = document.getElementById("status");

/** How many recent plays show before "Show more". The API sends up to a dozen; a long run is not the profile. */
const RECENT_SHOWN = 6;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);

const fail = (message) => {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<p class="dash-error">${escapeHtml(message)}</p>`;
};

const round = (value, digits = 1) => Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });

/** "3 days ago", down to "just now": an exact timestamp on a public page is a log, not a profile, and nobody needs
 *  to know what somebody played at 3:42am. */
const when = (iso) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

const songs = (count) => `${count} song${count === 1 ? "" : "s"}`;

/** A playlist's default picture: its letter on the gradient the API gave it (the same one Discord draws). */
const coverTile = (cover) =>
  cover
    ? `<span class="passport-cover" aria-hidden="true" style="background: linear-gradient(135deg, ${escapeHtml(cover.from)}, ${escapeHtml(cover.to)})">${escapeHtml(cover.initial)}</span>`
    : "";

const trackRow = (track, trailing, extra = "") => `
  <li${extra}>
    <span class="passport-title">${escapeHtml(track.title)}</span>
    ${track.author ? `<span class="passport-sub">${escapeHtml(track.author)}</span>` : ""}
    <span class="passport-meta">${trailing}</span>
  </li>`;

/**
 * The playlists a passport shows, in the order every other surface uses: Liked Songs first (when there is
 * anything in it), then the shared ones. `key` is what the hash holds.
 */
function playlistsOf(data) {
  const { favorites } = data;
  const list = [];
  if (favorites.items.length) {
    list.push({
      key: "liked",
      name: "Liked Songs",
      cover: favorites.cover,
      total: favorites.total,
      tracks: favorites.items,
      // A favourite has no "when", and the source it came from is never shown.
      note: () => "",
    });
  }
  (data.playlists ?? []).forEach((playlist, index) =>
    list.push({
      key: String(index),
      name: playlist.name,
      cover: playlist.cover,
      total: playlist.trackCount,
      tracks: playlist.tracks,
      note: (track) => (track.unavailable ? "unavailable" : ""),
    })
  );
  return list;
}

const head = (owner, level) => `
  <section class="passport-head">
    ${owner.avatarUrl ? `<img class="passport-avatar" src="${escapeHtml(owner.avatarUrl)}" alt="" width="96" height="96" />` : ""}
    <div>
      <h1>${escapeHtml(owner.displayName)}</h1>
      <p class="lede">Level ${level.level} · listening on <strong>Vibe</strong></p>
    </div>
  </section>`;

function overviewHtml(data, playlists) {
  const { owner, stats, level, badges, listening, historyOff } = data;
  const recent = listening.recent;
  const shown = recent.slice(0, RECENT_SHOWN);

  return `
    ${head(owner, level)}

    <section>
      <div class="stat-grid">
        <div class="stat"><div class="stat-value">${round(stats.listeningHours)}</div><div class="stat-label">hours listened</div></div>
        <div class="stat"><div class="stat-value">${stats.tracksPlayed.toLocaleString()}</div><div class="stat-label">tracks played</div></div>
        <div class="stat">
          <div class="stat-value">${stats.currentStreak}</div>
          <div class="stat-label">day streak</div>
          <div class="stat-note">best ${stats.longestStreak}</div>
        </div>
        <div class="stat"><div class="stat-value">${stats.servers}</div><div class="stat-label">servers</div></div>
      </div>
    </section>

    ${
      badges.length
        ? `<section class="badge-section">
             <h2>Badges</h2>
             <div class="badge-row">
               ${badges.map((badge) => `<span class="badge" style="--badge: ${escapeHtml(badge.color)}">${escapeHtml(badge.name)}</span>`).join("")}
             </div>
           </section>`
        : ""
    }

    <section class="badge-section">
      <h2>Recently played</h2>
      ${
        historyOff
          ? '<p class="badge-empty">Listening history is switched off for this account.</p>'
          : recent.length
            ? `<ol class="passport-list" id="recent-list">${shown.map((track) => trackRow(track, escapeHtml(when(track.playedAt)))).join("")}</ol>
               ${
                 recent.length > shown.length
                   ? `<button type="button" class="btn btn-ghost btn-small passport-more" id="recent-more">Show ${recent.length - shown.length} more</button>`
                   : ""
               }`
            : '<p class="badge-empty">Nothing played in the last 90 days.</p>'
      }
    </section>

    ${
      playlists.length
        ? `<section class="badge-section">
             <h2>Playlists</h2>
             ${playlists
               .map(
                 (playlist) => `
               <button type="button" class="passport-playlist-open" data-playlist="${playlist.key}">
                 ${coverTile(playlist.cover)}
                 <span class="passport-title">${escapeHtml(playlist.name)}</span>
                 <span class="passport-meta">${songs(playlist.total)}</span>
                 <span class="passport-chevron" aria-hidden="true">›</span>
               </button>`
               )
               .join("")}
           </section>`
        : ""
    }

    <p class="stat-note">
      Recently played covers the last 90 days. Want a page like this?
      <a href="/">Add Vibe to your server.</a>
    </p>`;
}

function playlistHtml(data, playlist) {
  return `
    ${head(data.owner, data.level)}

    <section class="passport-detail">
      <button type="button" class="passport-back" id="back">
        <span aria-hidden="true">‹</span> Back
      </button>
      <div class="passport-detail-head">
        ${coverTile(playlist.cover)}
        <div>
          <h2 class="passport-detail-title" id="playlist-title" tabindex="-1">${escapeHtml(playlist.name)}</h2>
          <p class="passport-meta-line">${songs(playlist.total)}</p>
        </div>
      </div>
      ${
        playlist.tracks.length
          ? `<ol class="passport-list">${playlist.tracks.map((track) => trackRow(track, escapeHtml(playlist.note(track)))).join("")}</ol>`
          : '<p class="badge-empty">Nothing in this playlist yet.</p>'
      }
      ${playlist.total > playlist.tracks.length ? `<p class="stat-note">Showing the first ${playlist.tracks.length} of ${playlist.total}.</p>` : ""}
    </section>`;
}

/** The playlist the hash names, or `null` for the overview (including a hash for one that is not there). */
function openPlaylist(playlists) {
  const match = /^#playlist=([\w-]+)$/.exec(location.hash);
  return match ? (playlists.find((playlist) => playlist.key === match[1]) ?? null) : null;
}

function mount(data) {
  const playlists = playlistsOf(data);
  /** Where the overview was scrolled to when a playlist opened, so Back puts the reader where they were. */
  let scrollBack = 0;
  /** The button that opened the playlist, to give focus back to it. */
  let openedFrom = null;

  const draw = () => {
    const playlist = openPlaylist(playlists);
    root.setAttribute("aria-busy", "false");

    if (playlist) {
      root.innerHTML = playlistHtml(data, playlist);
      root.querySelector("#back").addEventListener("click", () => {
        // Back closes the playlist the way the browser's Back does when it was opened from here; a link that opened
        // straight onto a playlist has nothing to go back to, so it clears the hash instead.
        if (history.state?.passportOpened) {
          history.back();
        } else {
          history.replaceState(null, "", location.pathname + location.search);
          draw();
        }
      });
      window.scrollTo(0, 0);
      root.querySelector("#playlist-title").focus({ preventScroll: true });
      return;
    }

    root.innerHTML = overviewHtml(data, playlists);
    root.querySelector("#recent-more")?.addEventListener("click", (event) => {
      const list = root.querySelector("#recent-list");
      list.insertAdjacentHTML("beforeend", data.listening.recent.slice(RECENT_SHOWN).map((track) => trackRow(track, escapeHtml(when(track.playedAt)))).join(""));
      event.currentTarget.remove();
    });
    for (const button of root.querySelectorAll("[data-playlist]")) {
      button.addEventListener("click", () => {
        scrollBack = window.scrollY;
        openedFrom = button.dataset.playlist;
        history.pushState({ passportOpened: true }, "", `#playlist=${button.dataset.playlist}`);
        draw();
      });
    }
    // Back from a playlist: the reader's place, and focus on the row they opened.
    if (openedFrom !== null) {
      window.scrollTo(0, scrollBack);
      root.querySelector(`[data-playlist="${CSS.escape(openedFrom)}"]`)?.focus({ preventScroll: true });
      openedFrom = null;
    }
  };

  // The browser's Back and Forward, and a hash typed into the address bar. `pushState` raises neither, so opening
  // a playlist draws by hand.
  window.addEventListener("hashchange", draw);
  draw();
}

(async () => {
  if (!/^[0-9a-f]{32}$/.test(token)) return fail("No passport here.");

  try {
    const response = await fetch(`/api/passport?token=${encodeURIComponent(token)}`);
    if (response.status === 404) return fail("No passport here. The link may have been turned off.");
    if (!response.ok) return fail("Passports are unavailable right now. Try again in a moment.");
    mount(await response.json());
  } catch {
    fail("Passports are unavailable right now. Try again in a moment.");
  } finally {
    status.remove?.();
  }
})();
