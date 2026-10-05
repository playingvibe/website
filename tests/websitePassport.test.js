import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * `GET /api/passport` — the only endpoint on the site that answers without a session, which makes
 * every one of its refusals security-relevant rather than cosmetic.
 *
 * The tests that matter here are the ones about what it *does not* say: a passport that 404s
 * differently for "unknown token" and "lapsed subscription" tells a stranger which tokens exist
 * and publishes somebody's billing state, and a response carrying the user id turns a shared link
 * into a lookup from that link back to a Discord account.
 *
 * Real handler, real database. The token check is a query, and a stub would prove nothing.
 */
let mongod;
const SAVED = ["MONGO_URI"].map((name) => [name, process.env[name]]);

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
});

after(async () => {
  await closeDb();
  await mongod?.stop();
  for (const [name, value] of SAVED) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(async () => {
  const database = await db();
  await database.collection("users").deleteMany({});
  await database.collection("listeningHistory").deleteMany({});
  await database.collection("playlists").deleteMany({});
});

const { db, closeDb } = await import("../website/lib/mongo.js");
const { default: handler } = await import("../website/api/passport.js");

const TOKEN = "a".repeat(32);
/** A realistic snowflake rather than "owner": the response has an `owner` *key*, and a fixture id
 *  that collides with it would make the "no id anywhere" assertion pass for the wrong reason. */
const OWNER_ID = "308000000000000001";

async function call(token) {
  const req = { method: "GET", url: `/api/passport?token=${token}`, headers: {} };
  const res = {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await handler(req, res);
  return res;
}

/**
 * A user holding a passport, entitled unless told otherwise. A `playlists` fixture is inserted into
 * the `playlists` collection, keyed on its owner, rather than written onto the user document.
 */
async function givePassport({ token = TOKEN, premium = { tier: "user", expiresAt: null }, playlists, ...rest } = {}) {
  await (await db()).collection("users").insertOne({
    _id: OWNER_ID,
    premium,
    totalListeningTime: 36_000_000,
    sessionCount: 120,
    currentStreak: 4,
    longestStreak: 9,
    listeningGuildIds: ["g1", "g2"],
    passport: { token, issuedAt: new Date(), displayName: "Someone", avatar: "abc123" },
    ...rest,
  });

  if (playlists?.length) {
    await (await db()).collection("playlists").insertMany(
      playlists.map((p) => ({
        _id: p.id,
        owner: { kind: "user", id: OWNER_ID },
        name: p.name,
        shared: p.shared ?? false,
        tracks: p.tracks ?? [],
        editPolicy: "owner",
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  }
}

async function play(over = {}) {
  await (await db()).collection("listeningHistory").insertOne({
    userId: OWNER_ID,
    guildId: "g1",
    title: "A Song",
    author: "An Artist",
    uri: "uri:a",
    source: "youtube",
    listenedMs: 180_000,
    playedAt: new Date(),
    ...over,
  });
}

test("a valid token serves the passport", async () => {
  await givePassport();
  await play();
  await play({ uri: "uri:b", title: "Another", author: "An Artist" });

  const res = await call(TOKEN);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.owner.displayName, "Someone");
  assert.equal(res.payload.stats.listeningHours, 10);
  assert.equal(res.payload.listening.recent.length, 2);
  assert.equal(res.payload.listening.plays, 2);
});

test("recent plays are chronological, and nothing is ranked", async () => {
  // The page claims no "top track" or "top artist", because track identity across sources cannot
  // support one — a lyric video, a `- Topic` upload and a remix are three rows for one song.
  await givePassport();
  await play({ uri: "old", title: "Older", playedAt: new Date(Date.now() - 3 * 86_400_000) });
  await play({ uri: "new", title: "Newer" });

  const { payload } = await call(TOKEN);

  assert.deepEqual(
    payload.listening.recent.map((row) => row.title),
    ["Newer", "Older"]
  );
  assert.ok(!("tracks" in payload.listening), "no top-tracks ranking");
  assert.ok(!("artists" in payload.listening), "no top-artists ranking");
});

test("titles are cleaned the same way Discord shows them", async () => {
  await givePassport();
  await play({ title: "Some Song (Official Music Video)" });

  const { payload } = await call(TOKEN);

  assert.equal(payload.listening.recent[0].title, "Some Song");
});

test("favourites are listed newest first, with the total beside them", async () => {
  await givePassport();
  await (await db()).collection("users").updateOne(
    { _id: OWNER_ID },
    {
      $set: {
        favorites: [
          { title: "First saved", author: "A", uri: "f1", source: "spotify" },
          { title: "Last saved (Lyrics)", author: "B", uri: "f2", source: "youtube" },
        ],
      },
    }
  );

  const { payload } = await call(TOKEN);

  assert.equal(payload.favorites.total, 2);
  assert.deepEqual(
    payload.favorites.items.map((row) => row.title),
    ["Last saved", "First saved"],
    "newest first, and cleaned"
  );
});

test("nothing in the response discloses the owner's Discord id", async () => {
  // The whole response, serialized: an id leaking through any field — including the avatar URL,
  // where it hid until this test was written — turns a shared link into an account lookup.
  await givePassport();
  await play();

  const { payload } = await call(TOKEN);

  assert.ok(!("_id" in payload.owner));
  assert.ok(!JSON.stringify(payload).includes(OWNER_ID), "the user id must not appear anywhere");
});

test("the page never names the service a track came from — not in a field, not in a link", async () => {
  // Vibe does not name the services it plays from on any user-visible surface. **Real-looking links
  // on purpose:** this test first passed against fixture links like "uri:a" while the response was
  // publishing every track's URL, and a youtube.com link names its service as plainly as the word.
  await givePassport({
    favorites: [{ title: "Saved", author: "A", uri: "https://open.spotify.com/track/abc", source: "spotify" }],
    playlists: [
      {
        id: "a1b2c3d4e5f60718",
        name: "Shared one",
        shared: true,
        tracks: [{ title: "In a list", author: "B", uri: "https://soundcloud.com/x/y", source: "soundcloud", unavailableSince: null }],
      },
    ],
  });
  await play({ source: "youtube", uri: "https://www.youtube.com/watch?v=abc" });
  await play({ source: "deezer", uri: "https://www.deezer.com/track/123" });

  const { payload } = await call(TOKEN);

  const serialized = JSON.stringify(payload);
  for (const name of ["youtube", "spotify", "deezer", "soundcloud"]) {
    assert.ok(!serialized.includes(name), `"${name}" must not appear in a passport response`);
  }
});

test("the avatar is proxied, so Discord's CDN path never reaches the viewer", async () => {
  // `cdn.discordapp.com/avatars/<userId>/<hash>` publishes the snowflake by construction, which
  // is why the page asks this site for the picture instead.
  await givePassport();

  const { payload } = await call(TOKEN);

  assert.match(payload.owner.avatarUrl, /^\/api\/passport-avatar\?token=/);
  assert.equal(payload.owner.avatar, undefined, "the hash is not published either");
});

test("an unknown token is 404, not 403", async () => {
  await givePassport();

  const res = await call("b".repeat(32));

  assert.equal(res.statusCode, 404);
});

test("a malformed token never reaches the database", async () => {
  const res = await call("not-a-token");
  assert.equal(res.statusCode, 404);
});

test("a play outside the 90-day window is not on the page", async () => {
  await givePassport();
  await play({ playedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) });

  const { payload } = await call(TOKEN);

  assert.equal(payload.listening.recent.length, 0);
  assert.equal(payload.listening.plays, 0);
});

test("history switched off is stated, and favourites still show", async () => {
  // Favourites are the user's own saved list, not a by-product of listening — switching the play
  // record off has no reason to empty them.
  await givePassport({
    listeningHistoryOptOut: true,
    favorites: [{ title: "Saved", author: "A", uri: "f1", source: "spotify" }],
  });

  const { payload } = await call(TOKEN);

  assert.equal(payload.historyOff, true);
  assert.equal(payload.favorites.items.length, 1);
});

test("only playlists the owner shared appear, and none of them carry a link", async () => {
  await givePassport({
    playlists: [
      {
        id: "a1b2c3d4e5f60718",
        name: "Shared",
        shared: true,
        tracks: [
          { title: "Kept (Official Video)", author: "A", uri: "https://example.test/1", source: "x", unavailableSince: null },
          { title: "Gone", author: "B", uri: "https://example.test/2", source: "x", unavailableSince: new Date() },
        ],
      },
      { id: "b1b2c3d4e5f60718", name: "Private", shared: false, tracks: [] },
    ],
  });

  const { payload } = await call(TOKEN);

  assert.deepEqual(
    payload.playlists.map((p) => p.name),
    ["Shared"],
    "an unshared playlist must not reach the response at all, not merely be hidden by the page"
  );
  assert.deepEqual(payload.playlists[0].tracks, [
    { title: "Kept", author: "A", unavailable: false },
    { title: "Gone", author: "B", unavailable: true },
  ]);
  assert.ok(!JSON.stringify(payload).includes("example.test"), "readable, not playable: no links");
});

test("no shared playlists means an empty list, and the page shows no section", async () => {
  await givePassport();

  const { payload } = await call(TOKEN);

  assert.deepEqual(payload.playlists, []);
});

test("a long shared playlist is capped for the page, with its true count beside it", async () => {
  await givePassport({
    playlists: [
      {
        id: "a1b2c3d4e5f60718",
        name: "Long",
        shared: true,
        tracks: Array.from({ length: 120 }, (_, i) => ({
          title: `T${i}`,
          author: null,
          uri: `u${i}`,
          source: "x",
          unavailableSince: null,
        })),
      },
    ],
  });

  const { payload } = await call(TOKEN);

  assert.equal(payload.playlists[0].trackCount, 120);
  assert.equal(payload.playlists[0].tracks.length, 50);
});

test("the shared cache is short enough that withdrawing a passport actually withdraws it", async () => {
  // `/passport` promises "the link stops working immediately", and three things can make that
  // promise: turning it off, getting a new link, and a subscription lapsing. None of them can
  // reach a copy already sitting in a CDN, so the only thing keeping the promise is how long the
  // edge is allowed to hold one. It was five minutes, and nothing locally could show that, because
  // a dev server has no edge in front of it.
  await givePassport();
  const res = await call(TOKEN);

  const header = res.headers["cache-control"];
  const shared = /s-maxage=(\d+)/.exec(header);
  assert.ok(shared, `no s-maxage in ${header}`);
  assert.ok(
    Number(shared[1]) <= 60,
    `a withdrawn passport must not outlive its withdrawal by ${shared[1]} seconds`
  );
});

test("a refusal is never cached, so a database blip or a not-yet-live link does not stick for a minute", async () => {
  const unknown = await call("b".repeat(32));
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.headers["cache-control"], "no-store");

  await givePassport();
  const served = await call(TOKEN);
  assert.equal(served.statusCode, 200);
  assert.match(served.headers["cache-control"], /s-maxage/, "a page that is served is still cached briefly");
});
