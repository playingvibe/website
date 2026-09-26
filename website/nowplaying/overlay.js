/**
 * The pure parts of the now-playing overlay, apart from the DOM so they can be tested in Node.
 * The page (`np.js`) asks every Vibe's API host what it is playing for one link and shows whichever
 * answers; nothing here touches the network or the document.
 */

/** Every Vibe's API host. Only those that are running answer; the rest fail and are ignored. */
export const API_HOSTS = [
  "https://api.playvibe.gg",
  "https://api-2.playvibe.gg",
  "https://api-3.playvibe.gg",
  "https://api-beta.playvibe.gg",
];

/** The link's secret: 32 lowercase hex characters, as `/config` mints it. */
export const isToken = (value) => typeof value === "string" && /^[0-9a-f]{32}$/.test(value);

/** An accent is set as a CSS variable, so only a plain hex colour is ever accepted from the network. */
export const safeAccent = (value, fallback = "#e05570") =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

/**
 * The answer to show out of every host's: one that is playing, preferring one that is not paused
 * (two Vibes in one server can both have a queue). `null` when nothing is.
 * @param {Array<{host: string, body: ?object}>} results
 * @returns {?{host: string, body: object}}
 */
export function pickPlaying(results) {
  const playing = results.filter((r) => r.body?.playing === true);
  return playing.find((r) => !r.body.paused) ?? playing[0] ?? null;
}

/**
 * Where the track is now: the last sample, carried forward by the time since it was taken while it
 * plays, and never past the end. A live stream has no end.
 */
export function livePosition(body, now) {
  const carried = body.paused ? 0 : Math.max(0, now - body.sampledAt);
  const position = (body.positionMs ?? 0) + carried;
  return body.lengthMs ? Math.min(position, body.lengthMs) : position;
}

/** 0 to 1, or `null` where there is no length to measure against (a stream). */
export function progressOf(body, now) {
  return body.lengthMs ? Math.min(1, livePosition(body, now) / body.lengthMs) : null;
}

/** Art goes through the answering host's own proxy, which serves known art hosts only. */
export const artworkSrc = (host, url) => (url ? `${host}/thumbnail?url=${encodeURIComponent(url)}` : null);
