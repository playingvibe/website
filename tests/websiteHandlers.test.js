import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * The signed-in website handlers that no other test reached: who is signed in (`me`), the servers someone may
 * manage (`guilds`), their own stats (`profile`), and the start of the login. Real handlers, real session
 * cookie, real database; only Discord's API is faked, because nothing here may call it.
 */

const SECRET = "a-test-secret-that-is-long-enough-32";
const SAVED = ["MONGO_URI", "SESSION_SECRET", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"].map((name) => [name, process.env[name]]);
let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.SESSION_SECRET = SECRET;
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
  await database.collection("guildInstances").deleteMany({});
});

const { db, closeDb } = await import("../website/lib/mongo.js");
const { setSession } = await import("../website/lib/session.js");
const { default: me } = await import("../website/api/me.js");
const { default: guilds } = await import("../website/api/guilds.js");
const { default: profile } = await import("../website/api/profile.js");
const { default: login } = await import("../website/api/auth/login.js");

const USER_ID = "308000000000000001";
const MANAGE_GUILD = String(1n << 5n);
const ADMINISTRATOR = String(1n << 3n);

/** A cookie for a signed-in user, as the browser would send it back. */
function cookieFor(session = { id: USER_ID, username: "Sam", avatar: null, accessToken: "discord-token" }) {
  const sealed = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  setSession(sealed, session);
  return [sealed.headers["Set-Cookie"]].flat().map((line) => line.split(";")[0]).join("; ");
}

async function call(handler, { method = "GET", signedIn = true, url = "/api/x" } = {}) {
  const req = { method, url, headers: signedIn ? { cookie: cookieFor() } : {} };
  const res = {
    statusCode: 200,
    payload: undefined,
    headers: {},
    ended: false,
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
    writeHead(code, headers) {
      this.statusCode = code;
      Object.assign(this.headers, Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])));
      return this;
    },
    end() {
      this.ended = true;
    },
  };
  await handler(req, res);
  return res;
}

/** Discord's `/users/@me/guilds` answers `answer`; anything else is a failure of the test. */
function discordGuildsAre(t, answer) {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /\/users\/@me\/guilds$/);
    return typeof answer === "function" ? answer() : Response.json(answer);
  });
}

// --- me ---

test("me says who is signed in, and never the access token", async () => {
  const res = await call(me);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.user.id, USER_ID);
  assert.equal(res.payload.user.username, "Sam");
  assert.ok(!JSON.stringify(res.payload).includes("discord-token"));
  assert.equal(res.headers["cache-control"], "no-store");
});

test("me answers 200 with no user for a visitor who is signed out, and 405 to anything but GET", async () => {
  assert.deepEqual((await call(me, { signedIn: false })).payload, { user: null });
  assert.equal((await call(me, { method: "POST" })).statusCode, 405);
});

// --- guilds ---

test("guilds lists only the servers the user may manage, those with a Vibe first, each with its bots", async (t) => {
  await (await db()).collection("guildInstances").insertMany([
    { guildId: "g-managed", clientId: "815329807377498153", name: "", present: true },
    { guildId: "g-managed", clientId: "1533281867523031070", name: "Vibe 2", present: true },
    { guildId: "g-managed", clientId: "1001935021436850207", name: "Vibe 3", present: false },
    { guildId: "g-other", clientId: "815329807377498153", name: "Vibe", present: true },
  ]);
  discordGuildsAre(t, [
    { id: "g-plain", name: "Alpha", icon: null, permissions: MANAGE_GUILD },
    { id: "g-managed", name: "Zulu", icon: null, permissions: ADMINISTRATOR },
    { id: "g-member", name: "Member only", icon: null, permissions: "0" },
    { id: "g-other", name: "Not managed", icon: null, permissions: "1024" },
  ]);

  const res = await call(guilds);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.payload.guilds.map((g) => g.id),
    ["g-managed", "g-plain"],
    "a server the user only belongs to is not listed, and a Vibe puts a server first"
  );
  const managed = res.payload.guilds[0];
  assert.deepEqual(managed.instances.map((i) => i.name), ["Vibe", "Vibe 2"], "present bots only, named from the client id, sorted");
  assert.deepEqual(res.payload.guilds[1].instances, []);
});

test("guilds is a 401 with no session, a 405 to a POST, and never calls Discord for either", async (t) => {
  discordGuildsAre(t, () => assert.fail("Discord was called"));

  assert.equal((await call(guilds, { signedIn: false })).statusCode, 401);
  assert.equal((await call(guilds, { method: "POST" })).statusCode, 405);
});

test("a Discord outage on the server list is a 503 that keeps the page, a refused token is a 401", async (t) => {
  discordGuildsAre(t, () => new Response("{}", { status: 503 }));
  assert.equal((await call(guilds)).statusCode, 503);

  t.mock.restoreAll();
  discordGuildsAre(t, () => new Response("{}", { status: 401 }));
  assert.equal((await call(guilds)).statusCode, 401);
});

// --- profile ---

test("profile is the signed-in user's own stats, computed here", async () => {
  await (await db()).collection("users").insertOne({
    _id: USER_ID,
    totalListeningTime: 36_000_000,
    sessionCount: 120,
    longestStreak: 9,
    listeningGuildIds: ["g1", "g2"],
    firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
  });

  const res = await call(profile);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.hasData, true);
  assert.equal(res.payload.stats.listeningHours, 10);
  assert.equal(res.payload.stats.sessionCount, 120);
  assert.equal(res.payload.stats.guildCount, 2);
  assert.ok(res.payload.level.level >= 1);
  assert.ok(Array.isArray(res.payload.badges));
});

test("a signed-in user who has never played anything gets zeros, not an error", async () => {
  const res = await call(profile);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.hasData, false);
  assert.equal(res.payload.stats.listeningHours, 0);
  assert.deepEqual(res.payload.badges, []);
});

test("profile is 401 signed out and 405 to a POST", async () => {
  assert.equal((await call(profile, { signedIn: false })).statusCode, 401);
  assert.equal((await call(profile, { method: "POST" })).statusCode, 405);
});

// --- login ---

test("login redirects to Discord with a fresh state in a cookie, and is a 500 where it is not configured", async () => {
  delete process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_CLIENT_SECRET;
  assert.equal((await call(login)).statusCode, 500);

  process.env.DISCORD_CLIENT_ID = "123456789012345678";
  process.env.DISCORD_CLIENT_SECRET = "shh";
  const res = await call(login, { signedIn: false, url: "/api/auth/login" });

  assert.equal(res.statusCode, 302);
  assert.match(res.headers.location, /^https:\/\/discord\.com\/oauth2\/authorize\?/);
  assert.match(res.headers.location, /client_id=123456789012345678/);
  assert.match(res.headers.location, /state=/);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.ok(res.ended);
});
