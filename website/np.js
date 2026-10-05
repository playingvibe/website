/**
 * The streamer's now-playing overlay: `playvibe.gg/np/<token>`, for an OBS browser source.
 *
 * It polls every Vibe's API host for what that link's server is playing and shows whichever Vibe
 * answers, in that Vibe's own colour. With nothing playing it shows nothing at all (a transparent
 * page), which is what an overlay should do. Everything from the network goes in through
 * `textContent` or a validated CSS value, never `innerHTML`.
 *
 * Options in the query string: `?art=0` hides the artwork; `?bot=<alias>` pins the overlay to one
 * Vibe (`1`/`vibe`, `2`/`vibe2`, `3`/`vibe3`, `beta`) instead of showing whichever is playing, for a
 * server running more than one; `?api=<origin>` asks one of the four known hosts only, for trying
 * it locally (any other value is ignored — the page's CSP would refuse it in production anyway).
 */

import { API_HOSTS, isToken, safeAccent, pickPlaying, hostForBot, progressOf, artworkSrc } from "./nowplaying/overlay.js";

const POLL_MS = 2000;
const TIMEOUT_MS = 4000;
/** Polls with nothing playing before the card fades away, so a gap between tracks does not flicker. */
const IDLE_POLLS = 2;

const token = window.location.pathname.split("/")[2];
const params = new URLSearchParams(window.location.search);
const apiParam = params.get("api");
const pinnedHost = hostForBot(params.get("bot"));
const hosts = apiParam && API_HOSTS.includes(apiParam) ? [apiParam] : pinnedHost ? [pinnedHost] : API_HOSTS;

const card = document.getElementById("np");
const art = document.getElementById("np-art");
const title = document.getElementById("np-title");
const artist = document.getElementById("np-artist");
const fill = document.getElementById("np-fill");
const bar = document.getElementById("np-bar");

if (params.get("art") === "0") card.classList.add("no-art");

let current = null;
let idle = 0;

async function ask(host) {
  try {
    const res = await fetch(`${host}/np/${token}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { host, body: res.ok ? await res.json() : null };
  } catch {
    // A Vibe that is not running, or an offline network: that host simply is not playing.
    return { host, body: null };
  }
}

function show(picked) {
  const { host, body } = picked;
  current = body;
  idle = 0;

  card.style.setProperty("--accent", safeAccent(body.accent));
  title.textContent = body.title ?? "Unknown track";
  artist.textContent = body.artist ?? "";
  card.classList.toggle("paused", Boolean(body.paused));

  const src = artworkSrc(host, body.artworkUrl);
  if (src && art.dataset.src !== src) {
    art.dataset.src = src;
    art.src = src;
  }
  art.hidden = !src;

  bar.hidden = !body.lengthMs;
  card.classList.add("on");
}

async function poll() {
  const picked = pickPlaying(await Promise.all(hosts.map(ask)));
  if (picked) show(picked);
  else if (++idle >= IDLE_POLLS) {
    current = null;
    card.classList.remove("on");
  }
}

/** The bar moves between polls: the last sample carried forward, so it looks live, not stepped. */
function tick() {
  if (current) {
    const progress = progressOf(current, Date.now());
    if (progress !== null) fill.style.width = `${(progress * 100).toFixed(2)}%`;
  }
  requestAnimationFrame(tick);
}

/**
 * The next poll starts when the last one has finished, `POLL_MS` later. A fixed interval started a new round
 * every two seconds whatever the last one was doing, and with a host that hangs (each ask waits up to
 * `TIMEOUT_MS`) the rounds piled up on top of each other.
 */
async function loop() {
  try {
    await poll();
  } finally {
    setTimeout(loop, POLL_MS);
  }
}

if (isToken(token)) {
  loop();
  requestAnimationFrame(tick);
}
