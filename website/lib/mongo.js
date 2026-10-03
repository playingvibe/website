import { MongoClient } from "mongodb";

/**
 * The raw driver, not Mongoose, and deliberately so.
 *
 * The website cannot import the bot's models — its Vercel deploy root is `website/`, so nothing
 * under `src/` is in the bundle. That leaves duplicating the schemas here or reading the two
 * fields this actually needs with an explicit projection. A duplicated schema would be a second
 * definition of the same documents that nothing enforces agreement between; a projection is
 * honest about being a reader. **The models under `src/database/models/` own the shape** — every
 * field name below is quoted from one of them.
 *
 * Writes are narrow and deliberate: the two settings a signed-in user can change about
 * themselves (`rankCardAccent`) or about a server they administer (an instance's overrides).
 * Nothing here writes listening statistics, favourites, or the shared guild config — those are
 * the bot's to maintain, and a second writer would be a second set of rules about them.
 *
 * The connection is cached on `globalThis` because Vercel reuses a warm function instance across
 * invocations, and reconnecting per request would open a new pool each time — the fastest way
 * there is to exhaust a hosted database's connection cap.
 */
const globalForMongo = globalThis;

/**
 * @returns {Promise<import("mongodb").Db>}
 */
export async function db() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set.");

  if (!globalForMongo._vibeMongo) {
    const client = new MongoClient(uri, {
      // **One, not five.** A serverless instance handles one request at a time, so every
      // connection past the first is held open for nothing — multiplied by however many instances
      // Vercel happens to have warm, against an M0 cluster whose 500-connection budget is already
      // shared with four bot processes at `maxPoolSize: 20` each. Nothing watches that budget, and
      // exhausting it fails the bots, not just the dashboard.
      maxPoolSize: 1,
      // Fail fast rather than letting a request hang for the driver's 30-second default — a
      // dashboard that errors is better than one that spins.
      serverSelectionTimeoutMS: 5_000,
    });
    // Assigned as the promise, not awaited first: two concurrent cold requests would otherwise
    // both see no cache and both connect.
    //
    // **The cache is cleared if that promise rejects.** A rejected promise left in place is
    // returned to every later request for the life of the warm instance, so one unlucky connect —
    // a DNS blip, a database failover, a cold start racing the 5 s selection timeout — turns into a
    // dashboard that is broken until Vercel happens to recycle the instance, with nothing to retry
    // it. Only this promise is cleared: a newer one may already have replaced it.
    const connecting = client.connect().catch((error) => {
      if (globalForMongo._vibeMongo === connecting) globalForMongo._vibeMongo = null;
      throw error;
    });
    globalForMongo._vibeMongo = connecting;
  }

  return (await globalForMongo._vibeMongo).db();
}

/**
 * Closes the cached connection.
 *
 * Nothing in production calls this — a serverless instance is torn down with its sockets, and
 * closing per request is the exact thing the cache exists to avoid. It exists because a test
 * process holding an open pool never exits, and "the suite hangs" is a worse way to learn that
 * than a named function.
 * @returns {Promise<void>}
 */
export async function closeDb() {
  const pending = globalForMongo._vibeMongo;
  if (!pending) return;

  globalForMongo._vibeMongo = null;
  await (await pending).close();
}

/**
 * @param {string} userId
 * @returns {Promise<object|null>} The stats fields only — no favourites, which are large and
 *          which nothing on the profile page shows yet.
 */
export async function findUserStats(userId) {
  const users = (await db()).collection("users");
  return users.findOne(
    { _id: userId },
    {
      projection: {
        totalListeningTime: 1,
        sessionCount: 1,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: 1,
        listeningGuildIds: 1,
        // The vote-streak summary, for the third badge track. Only the two fields the streak is
        // decided from — the totals are nobody's business on a profile page.
        "voting.streakWeeks": 1,
        "voting.lastWeek": 1,
      },
    }
  );
}

/**
 * @param {string} userId
 * @returns {Promise<{favorites: object[], favoritePlaylists: object[]}>}
 */
export async function findUserLibrary(userId) {
  const users = (await db()).collection("users");
  const doc = await users.findOne(
    { _id: userId },
    { projection: { favorites: 1, favoritePlaylists: 1 } }
  );
  return {
    favorites: doc?.favorites ?? [],
    favoritePlaylists: doc?.favoritePlaylists ?? [],
  };
}

/**
 * Both rank-card settings in one read.
 *
 * One `findOne` rather than two: they are always wanted together, they live on the same document,
 * and the page cannot render half of a picker.
 * @param {string} userId
 * @returns {Promise<{accent: ?string, background: ?string}>}
 */
export async function findRankCardStyle(userId) {
  const users = (await db()).collection("users");
  const doc = await users.findOne(
    { _id: userId },
    {
      projection: {
        rankCardAccent: 1,
        rankCardBackground: 1,
        rankCardBackgroundColor: 1,
        rankCardFade: 1,
        activityAccent: 1,
        activityBackground: 1,
        preferServerTheme: 1,
      },
    }
  );
  return {
    accent: doc?.rankCardAccent ?? null,
    background: doc?.rankCardBackground ?? null,
    backgroundColor: doc?.rankCardBackgroundColor ?? null,
    fade: doc?.rankCardFade ?? null,
    activityAccent: doc?.activityAccent ?? null,
    activityBackground: doc?.activityBackground ?? null,
    preferServerTheme: doc?.preferServerTheme === true,
  };
}

/**
 * Writes whichever of the two rank-card settings the caller actually sent.
 *
 * **Partial by design.** The page has two independent controls, and a request that set both every
 * time would mean changing your colour silently reset your background to whatever the page last
 * happened to know. Only keys present in `changes` are written.
 *
 * Field names and shapes are owned by `src/database/models/User.model.js`: `rankCardAccent` is
 * `#rrggbb` lowercased or `null`; `rankCardBackground` is a key from `CardBackgrounds.js` or
 * `null`. Both are validated by the caller before they get here.
 * @param {string} userId
 * @param {{accent?: ?string, background?: ?string, backgroundColor?: ?string, fade?: ?boolean, activityAccent?: ?string, activityBackground?: ?string, preferServerTheme?: boolean}} changes
 * @returns {Promise<void>}
 */
export async function saveRankCardStyle(userId, changes) {
  const set = {};
  if ("accent" in changes) set.rankCardAccent = changes.accent;
  if ("background" in changes) set.rankCardBackground = changes.background;
  if ("backgroundColor" in changes) set.rankCardBackgroundColor = changes.backgroundColor;
  if ("fade" in changes) set.rankCardFade = changes.fade;
  if ("activityAccent" in changes) set.activityAccent = changes.activityAccent;
  if ("activityBackground" in changes) set.activityBackground = changes.activityBackground;
  if ("preferServerTheme" in changes) set.preferServerTheme = changes.preferServerTheme;
  if (!Object.keys(set).length) return;

  const users = (await db()).collection("users");
  await users.updateOne({ _id: userId }, { $set: set }, { upsert: true });
}

/**
 * Which Vibe instances are currently in a guild, and what each one overrides.
 *
 * The presence rows are written by the bots themselves on `guildCreate`/`guildDelete` plus a
 * boot reconcile — see `src/database/models/GuildInstance.model.js`. OAuth can tell the website
 * which servers the *user* is in; only the bots can say which of them they are in.
 * @param {string[]} guildIds
 * @returns {Promise<Map<string, object[]>>} guildId -> instance rows.
 */
export async function findInstancesByGuild(guildIds) {
  if (!guildIds.length) return new Map();

  const rows = await (await db())
    .collection("guildInstances")
    .find({ guildId: { $in: guildIds }, present: true })
    .toArray();

  const byGuild = new Map();
  for (const row of rows) {
    if (!byGuild.has(row.guildId)) byGuild.set(row.guildId, []);
    byGuild.get(row.guildId).push(row);
  }
  return byGuild;
}

/**
 * @param {string} guildId
 * @returns {Promise<?object>} The shared guild config, or `null` if the server has never had one
 *          created — which simply means nobody has run a command there yet.
 */
export async function findGuildConfig(guildId) {
  return (await db()).collection("guilds").findOne({ _id: guildId });
}

/**
 * Writes one instance's overrides for one guild.
 *
 * Mirrors `GuildInstanceRepository.setOverrides()`, including the two conventions that are easy
 * to get wrong: a `null` value **clears** the override so the shared setting applies again, and
 * an empty array on either list means "override to unrestricted". `undefined` and `null` have to
 * stay distinguishable here for the same reason they do in the model.
 * @param {string} clientId
 * @param {string} guildId
 * @param {object} patch - Already validated by the caller.
 * @returns {Promise<void>}
 */
export async function saveGuildOverrides(clientId, guildId, patch) {
  const set = {};
  const unset = {};

  for (const [field, value] of Object.entries(patch)) {
    if (value === null) unset[`overrides.${field}`] = "";
    else set[`overrides.${field}`] = value;
  }

  // Mirrors `setOverridesFor()`: a decision about the list supersedes the legacy single id, which
  // would otherwise return as the fallback once the list override is cleared.
  if ("overrides.commandsChannels" in set || "overrides.commandsChannels" in unset) {
    unset["overrides.commandsChannelId"] = "";
  }

  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (!Object.keys(update).length) return;

  // Not an upsert: a row only exists because a bot wrote it, and creating one from here would
  // invent a presence record for an instance that is not actually in the guild.
  await (await db())
    .collection("guildInstances")
    .updateOne({ _id: `${clientId}:${guildId}` }, update);
}

/**
 * A public listening passport, by its share token.
 *
 * **The token is the entire authorisation**, so this is written to give nothing away when it does
 * not match: one query, no distinction anywhere above it between "no such token" and "that user
 * has no passport". The caller 404s either way, which is what stops the page confirming that a
 * given user exists to somebody guessing.
 *
 * Only the fields the page renders are projected — never `favorites`, never `premium`, never the
 * user id. **The id is deliberately absent from the response**: a passport is a page about
 * somebody's listening, not a directory entry that maps a link back to a Discord account.
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function findPassportByToken(token) {
  if (!/^[0-9a-f]{32}$/.test(token ?? "")) return null;

  const users = (await db()).collection("users");
  return users.findOne(
    { "passport.token": token },
    {
      projection: {
        _id: 1,
        passport: 1,
        totalListeningTime: 1,
        sessionCount: 1,
        currentStreak: 1,
        longestStreak: 1,
        listeningGuildIds: 1,
        firstSeenAt: 1,
        listeningHistoryOptOut: 1,
        "voting.streakWeeks": 1,
        "voting.lastWeek": 1,
      },
    }
  );
}

/**
 * What that passport's owner has been listening to: their most recent plays, inside the retention
 * window, newest first.
 *
 * **Recent plays rather than a "top tracks" ranking, and that is a correctness decision, not a
 * design preference.** A title is not a track identity here: the same song arrives as an official
 * upload, a lyric video, a `- Topic` channel and a remix, and `author` is a *channel* name on
 * YouTube where it is an artist name on Spotify. Any ranking built on that is a mix of duplicates
 * and uploader names presented as somebody's taste. A chronological list makes no such claim — it
 * says only "this played, then this" — which is exactly as much as the data supports.
 *
 * **The window is applied here too**, not just in the bot's repository. Two readers of one
 * collection is two places that have to agree about what "kept for 90 days" means, and the one a
 * stranger can see is the worse place to get it wrong. The number is quoted from
 * `src/database/models/ListeningHistory.model.js`.
 * @param {string} userId
 * @param {{limit?: number}} [options]
 * @returns {Promise<{recent: object[], plays: number}>}
 */
export async function findPassportListening(userId, { limit = 12 } = {}) {
  const HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - HISTORY_MAX_AGE_MS);

  const history = (await db()).collection("listeningHistory");
  const recentFilter = { userId, playedAt: { $gte: cutoff } };

  const [recent, plays] = await Promise.all([
    history
      .find(recentFilter, {
        // No `listenedMs`: how long somebody sat through a track is a behavioural detail the page
        // has no use for, and this response is public to whoever holds the link. No `source` or
        // `uri` either — Vibe never names the services it plays from on a user-visible surface,
        // and a link names its service as plainly as the word.
        projection: { _id: 0, title: 1, author: 1, playedAt: 1 },
      })
      .sort({ playedAt: -1 })
      .limit(limit)
      .toArray(),
    history.countDocuments(recentFilter),
  ]);

  return { recent, plays };
}

/**
 * The owner's saved tracks, for the passport's favourites section.
 *
 * **The one genuinely reliable statement of taste this data holds**: somebody chose each of these
 * deliberately, so nothing has to be inferred from play counts or matched across sources.
 * @param {string} userId
 * @param {{limit?: number}} [options]
 * @returns {Promise<{favorites: object[], total: number}>}
 */
export async function findPassportFavorites(userId, { limit = 12 } = {}) {
  const users = (await db()).collection("users");
  const doc = await users.findOne({ _id: userId }, { projection: { favorites: 1 } });
  const favorites = doc?.favorites ?? [];

  // Newest first, matching the recent-plays list beside it — `/liked` shows them oldest first, the
  // order they were liked in, so its numbering does not shift as songs are added.
  return {
    favorites: favorites
      .slice()
      .reverse()
      .slice(0, limit)
      .map(({ title, author }) => ({ title, author })),
    total: favorites.length,
  };
}

/**
 * The playlists a passport's owner chose to show on it.
 *
 * **Only `shared: true`, filtered on the server.** Visibility is per playlist and off by default
 * (nothing is shown unless the user chooses to), so an unshared playlist must never reach this response —
 * not even to be hidden by the page, where anyone reading the network tab would see it.
 *
 * **Readable, not playable.** So no `uri` leaves the database: a list of links
 * is a playable playlist with extra steps, which would let one subscriber equip a whole friend
 * group. And no `source`, for the rule every user-visible surface follows.
 *
 * Tracks are capped per playlist for the page's sake — a 200-track list is a wall, not a profile —
 * with the true count returned beside them.
 *
 * Reads the `playlists` collection, one document per playlist keyed on its owner, not an array on
 * the user. Nothing under `src/` reaches this file, so that shape is quoted here the same way `users`
 * already is, and the read is a straight `$match` + `$project`.
 * @param {string} userId
 * @param {{tracksPerPlaylist?: number}} [options]
 * @returns {Promise<Array<{name: string, trackCount: number, tracks: Array<{title: string,
 *          author: ?string, unavailable: boolean}>}>>}
 */
export async function findPassportPlaylists(userId, { tracksPerPlaylist = 50 } = {}) {
  const playlists = (await db()).collection("playlists");
  return playlists
    .aggregate([
      { $match: { "owner.kind": "user", "owner.id": userId, shared: true } },
      { $sort: { createdAt: 1 } },
      {
        $project: {
          _id: 0,
          name: 1,
          trackCount: { $size: { $ifNull: ["$tracks", []] } },
          tracks: {
            $map: {
              input: { $slice: [{ $ifNull: ["$tracks", []] }, tracksPerPlaylist] },
              as: "t",
              in: {
                title: "$$t.title",
                author: "$$t.author",
                unavailable: { $ne: [{ $ifNull: ["$$t.unavailableSince", null] }, null] },
              },
            },
          },
        },
      },
    ])
    .toArray();
}
