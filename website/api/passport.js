import {
  findPassportByToken,
  findPassportFavorites,
  findPassportListening,
  findPassportPlaylists,
} from "../lib/mongo.js";
import { isEntitled } from "../lib/entitlements.js";
import { getLevel } from "../lib/generated/level.js";
import { currentListeningStreak } from "../lib/generated/listeningStreak.js";
import { getEarnedBadgeTiers } from "../lib/generated/badges.js";
import { cleanTrackTitle } from "../lib/generated/track.js";
import { LIKED_COVER, playlistCover } from "../lib/generated/playlistCover.js";

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * A public listening passport, read by its share token.
 *
 * **It shows recent plays and favourites, never a "top tracks" or "top artists" ranking.** Track
 * identity is not reliable enough to rank: the same song arrives as an official upload, a lyric
 * video, a `- Topic` channel and a remix, and `author` is a channel name on YouTube where it is an
 * artist name on Spotify. An aggregate built on that publishes duplicates and uploader names as
 * somebody's taste — on a page they shared. A chronological list and a list they curated
 * themselves both claim only what the data actually supports.
 *
 * **The only endpoint on this site that answers without a session**, which is the whole design:
 * the owner turned it on and handed out the link, and a viewer needs no Discord account to open
 * it. Everything that follows from that:
 *
 * - **404 for every failure**, whether the token is malformed, unknown, or belongs to somebody
 *   whose entitlement has lapsed. A distinct "this passport is private" would confirm which
 *   tokens exist, and an "expired subscription" message would publish somebody's billing state to
 *   a stranger.
 * - **No user id in the response.** The page shows what a person listens to; it is not a lookup
 *   from a link back to a Discord account.
 * - **Entitlement is checked on read, not only on write.** A passport is a live page: when a
 *   subscription lapses the page has to stop, and a token issued while entitled cannot be allowed
 *   to outlive the entitlement that justified it.
 *
 * Cached briefly at the edge rather than `no-store` — this is public, immutable-ish data and a
 * link that gets shared is the one request pattern here that arrives in bursts. **Briefly** is the
 * operative word, and the header below says why: a withdrawal that the edge ignores for five
 * minutes is the paywall and the privacy control both leaking in the one place nobody is looking.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
/**
 * An error is never cached. The header above is set before anything is known, so a 503 from a database blip would
 * otherwise be kept by browsers for a minute, and a link that was not yet live would stay "not here" after it was.
 */
function refuse(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

/**
 * What the public page is told about a passport: the user document and the three reads, turned into the response.
 * Pure, so what is published (and what is deliberately left out) can be tested without MongoDB.
 * @param {object} user - The owner's `users` document.
 * @param {{listening: {recent: object[], plays: number, unavailable?: boolean}, favorites: {favorites: object[], total: number}, playlists: object[]}} reads
 * @returns {object}
 */
export function shapePassport(user, { listening, favorites, playlists }) {
  // Titles are cleaned with the bot's own `cleanTrackTitle()`, generated into `lib/generated/` by
  // `sync-web-shared.js`. Every surface in Discord shows the cleaned title, and a public page that
  // showed the raw one would render the same track differently from the embed it was played from.
  //
  // **Neither `source` nor `uri` is in this response.** Vibe does not name the services it plays
  // from anywhere a user or a visitor can see, and a public page is the last place to start. The
  // link is the less obvious half: `https://www.youtube.com/watch?v=…` names its service as plainly
  // as the word would, so dropping `source` while publishing the link was not the fix it looked
  // like. Without links a viewer also cannot lift somebody's favourites into a list to play, which
  // is the same reason shared playlists are readable only. Both stay in the database, where
  // re-resolution and taste seeding need them.
  const asTrack = ({ title, author, playedAt }) => ({
    title: cleanTrackTitle(title),
    author: author ?? null,
    ...(playedAt ? { playedAt } : {}),
  });

  const totalListeningTime = user.totalListeningTime ?? 0;
  const level = getLevel(totalListeningTime);
  const badges = getEarnedBadgeTiers({
    totalListeningTime,
    sessionCount: user.sessionCount ?? 0,
    voting: user.voting ?? null,
    firstSeenAt: user.firstSeenAt ?? null,
  });

  return {
    owner: {
      displayName: user.passport?.displayName ?? "A Vibe listener",
      // **Proxied, not linked.** Discord's CDN path contains the account id, so linking the avatar
      // directly would publish the owner's snowflake to everyone holding the link — a bigger
      // disclosure than the name and picture they chose to share. `passport-avatar.js` fetches it
      // server-side, keyed on the same token. Neither the id nor the hash is in this response.
      avatarUrl: user.passport?.avatar
        ? `/api/passport-avatar?token=${encodeURIComponent(user.passport.token)}`
        : null,
      since: user.firstSeenAt ?? null,
    },
    stats: {
      listeningHours: totalListeningTime / MS_PER_HOUR,
      tracksPlayed: user.sessionCount ?? 0,
      currentStreak: currentListeningStreak(user),
      longestStreak: user.longestStreak ?? 0,
      servers: user.listeningGuildIds?.length ?? 0,
    },
    level,
    badges,
    // Someone can hold a passport and have turned their history off — the page then shows the
    // listening life it can prove (level, badges, streak, favourites) and says plainly that the
    // rest is off, rather than rendering an empty list that reads like a bug.
    historyOff: Boolean(user.listeningHistoryOptOut),
    listening: {
      plays: listening.plays,
      recent: listening.recent.map(asTrack),
      ...(listening.unavailable ? { unavailable: true } : {}),
    },
    favorites: { total: favorites.total, items: favorites.favorites.map(asTrack), cover: LIKED_COVER },
    // Only the playlists their owner marked shared, readable and never playable: no link on any
    // track, so this cannot be turned into a list to queue. Empty when none are shared, and the
    // page then shows no section at all rather than an empty one.
    playlists: playlists.map((playlist) => ({
      name: playlist.name,
      // The default picture, until a playlist has artwork: the same letter and gradient Discord draws.
      cover: playlistCover(playlist.name),
      trackCount: playlist.trackCount,
      tracks: playlist.tracks.map((track) => ({
        title: cleanTrackTitle(track.title),
        author: track.author ?? null,
        unavailable: Boolean(track.unavailable),
      })),
    })),
  };
}

export default async function handler(req, res) {
  // **The shared cache is short because revocation has to be fast, not because the data changes.**
  // `/passport` says "the link stops working immediately", and **Get a new link**, **Turn it off**
  // and a lapsed subscription all have to mean it. A long `s-maxage` would let the edge keep serving a
  // withdrawn page after the owner withdrew it, and that gap is invisible in testing because a local server
  // has no edge in front of it.
  //
  // 30 seconds with `stale-while-revalidate` keeps the burst protection that matters: a link being
  // shared arrives as many requests from many people at once, and each of *them* holds it for a
  // minute in their own browser regardless. What it gives up is edge caching across a lull, which
  // was never the case this header existed for.
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=30, stale-while-revalidate=30");

  const token = new URL(req.url, "http://localhost").searchParams.get("token") ?? "";

  let user;
  try {
    user = await findPassportByToken(token);
  } catch {
    refuse(res, 503, { error: "Passports are unavailable right now." });
    return;
  }

  if (!user) {
    refuse(res, 404, { error: "No passport here." });
    return;
  }

  // A lapse must close the page. Failing closed on an error too: a passport that stays up because
  // the entitlement lookup blipped is the paywall leaking in public, where it is least noticeable.
  const entitled = await isEntitled(user._id);
  if (!entitled) {
    refuse(res, 404, { error: "No passport here." });
    return;
  }


  // All three in one pass, but each on its own: one failing must not blank the others. With
  // Promise.all, a database user without read access to `listeningHistory` would take the
  // favourites and the shared playlists, which read `users` and are fine, down with it.
  const [listeningRead, favoritesRead, playlistsRead] = await Promise.allSettled([
    findPassportListening(user._id),
    findPassportFavorites(user._id),
    findPassportPlaylists(user._id),
  ]);
  for (const [name, result] of [["listening", listeningRead], ["favourites", favoritesRead], ["playlists", playlistsRead]]) {
    // Logged, because swallowing it silently is how a passport with real data rendered empty in production
    // with nothing anywhere saying why. Name and message only: never the token or the user.
    if (result.status === "rejected") {
      console.error(`passport: reading the ${name} failed: ${result.reason?.name}: ${result.reason?.message}`);
    }
  }
  // The page is still worth serving without any of them: level, badges and streak are read from the user
  // document that already loaded.
  const listening =
    listeningRead.status === "fulfilled" ? listeningRead.value : { recent: [], plays: 0, unavailable: true };
  const favorites = favoritesRead.status === "fulfilled" ? favoritesRead.value : { favorites: [], total: 0 };
  const playlists = playlistsRead.status === "fulfilled" ? playlistsRead.value : [];

  res.status(200).json(shapePassport(user, { listening, favorites, playlists }));
}
