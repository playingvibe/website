/**
 * The streamer's now-playing overlay: `playvibe.gg/np/<token>`, for an OBS browser source.
 *
 * It polls every Vibe's API host for what that link's server is playing and shows whichever Vibe
 * answers, in that Vibe's own colour. With nothing playing it shows nothing at all (a transparent
 * page), which is what an overlay should do. Everything from the network goes in through
 * `textContent` or a validated CSS value, never `innerHTML`.
 *
 * Options in the query string: `?art=0` hides the artwork; `?api=<origin>` asks one host only (for
 * trying it locally; the page's CSP refuses any other host in production).
 */

import { API_HOSTS, isToken, safeAccent, pickPlaying, progressOf, artworkSrc } from "./nowplaying/overlay.js";

const POLL_MS = 2000;
const TIMEOUT_MS = 4000;
/** Polls with nothing playing before the card fades away, so a gap between tracks does not flicker. */
const IDLE_POLLS = 2;

const token = window.location.pathname.split("/")[2];
const params = new URLSearchParams(window.location.search);
const hosts = params.get("api") ? [params.get("api")] : API_HOSTS;

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

if (isToken(token)) {
  poll();
  setInterval(poll, POLL_MS);
  requestAnimationFrame(tick);
}
