import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * `website/api/guild-settings.js`: that it decides who is asking and nothing else. Discord's guild
 * list and the bot are both faked at `fetch`, so these are about what the function forwards, to whom,
 * and what it refuses to.
 */

const SECRET = "a-test-secret-that-is-long-enough-32";
const previous = { session: process.env.SESSION_SECRET, guildApi: process.env.GUILD_API_SECRET, origin: process.env.BOT_API_ORIGIN };
const realFetch = globalThis.fetch;

before(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.GUILD_API_SECRET = "bot-shared-secret";
  process.env.BOT_API_ORIGIN = "https://bot.example";
});
after(() => {
  globalThis.fetch = realFetch;
  for (const [key, name] of [["session", "SESSION_SECRET"], ["guildApi", "GUILD_API_SECRET"], ["origin", "BOT_API_ORIGIN"]]) {
    if (previous[key] === undefined) delete process.env[name];
    else process.env[name] = previous[key];
  }
});

const { setSession } = await import("../website/lib/session.js");
const { default: handler } = await import("../website/api/guild-settings.js");

const GUILD = "100000000000000001";
const OTHER = "100000000000000002";
const ADMIN = "8"; // the Administrator bit, as Discord sends a permission bitfield: a string
const NOTHING = "0";

let calls;
let discordGuilds;
let botAnswer;

beforeEach(() => {
  calls = [];
  discordGuilds = [{ id: GUILD, name: "Mine", owner: false, permissions: ADMIN }];
  botAnswer = { status: 200, body: { guild: { id: GUILD, name: "Mine" }, shared: {}, options: {}, instances: [] } };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("discord.com")) {
      return new Response(JSON.stringify(discordGuilds), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(botAnswer.body), { status: botAnswer.status, headers: { "content-type": "application/json" } });
  };
});

function cookieFor(user = { id: "555555555555555555", username: "someone", avatar: null, accessToken: "user-token" }) {
  const headers = {};
  setSession({ setHeader: (name, value) => (headers[name] = value) }, user);
  return [headers["Set-Cookie"]].flat().map((line) => line.split(";")[0]).join("; ");
}

function request({ method = "GET", guild = GUILD, body, signedIn = true, contentType = "application/json" } = {}) {
  const headers = { ...(signedIn ? { cookie: cookieFor() } : {}), ...(body ? { "content-type": contentType } : {}) };
  const req = { method, url: `/api/guild-settings?id=${guild}`, headers, body };
  const res = {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
    },
  };
  return { req, res };
}

const run = async (options) => {
  const { req, res } = request(options);
  await handler(req, res);
  return res;
};
const botCalls = () => calls.filter((c) => c.url.startsWith("https://bot.example"));

test("signed out is a 401 and reaches nobody", async () => {
  const res = await run({ signedIn: false });
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("a server the user does not manage is one 403, and the bot is never asked", async () => {
  discordGuilds = [{ id: GUILD, name: "Not mine", owner: false, permissions: NOTHING }];
  assert.equal((await run()).statusCode, 403);

  discordGuilds = [];
  assert.equal((await run({ guild: OTHER })).statusCode, 403, "the same answer for a server they are not in");
  assert.equal(botCalls().length, 0);
});

test("a malformed guild id never reaches Discord or the bot", async () => {
  const res = await run({ guild: "not-an-id" });
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("with no shared secret the page says settings are not available yet, rather than failing oddly", async () => {
  const kept = process.env.GUILD_API_SECRET;
  delete process.env.GUILD_API_SECRET;
  try {
    const res = await run();
    assert.equal(res.statusCode, 503);
    assert.equal(calls.length, 0);
  } finally {
    process.env.GUILD_API_SECRET = kept;
  }
});

test("GET asks the bot with the secret and passes its answer through, uncached", async () => {
  const res = await run();

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(res.payload.guild, { id: GUILD, name: "Mine" });
  const [call] = botCalls();
  assert.equal(call.url, `https://bot.example/internal/guild-settings?guild=${GUILD}`);
  assert.equal(call.init.headers.authorization, "Bearer bot-shared-secret");
});

test("POST forwards the change with the user id from the session, never from the request", async () => {
  const res = await run({
    method: "POST",
    body: { change: { field: "tips", value: false }, userId: "666666666666666666", guildId: OTHER },
  });

  assert.equal(res.statusCode, 200);
  const sent = JSON.parse(botCalls()[0].init.body);
  assert.equal(sent.userId, "555555555555555555", "who is asking comes from the sign-in");
  assert.equal(sent.guildId, GUILD, "the server is the one that was checked, not the one in the body");
  assert.deepEqual(sent.change, { field: "tips", value: false });
});

test("POST needs JSON and a change", async () => {
  assert.equal((await run({ method: "POST", body: { change: { field: "tips", value: false } }, contentType: "text/plain" })).statusCode, 415);
  assert.equal((await run({ method: "POST", body: {} })).statusCode, 400);
  assert.equal(botCalls().length, 0);
});

test("the bot's own refusal is shown as it is said, and its failures are a plain retry message", async () => {
  botAnswer = { status: 400, body: { error: "unknown_id", message: "One of those isn't in this server (or isn't the right kind)." } };
  const refused = await run({ method: "POST", body: { change: { field: "djRoles", value: ["1"] } } });
  assert.equal(refused.statusCode, 400);
  assert.match(refused.payload.error, /isn't in this server/);

  botAnswer = { status: 500, body: { error: "failed" } };
  assert.equal((await run()).statusCode, 502);

  botAnswer = { status: 404, body: { error: "not_here" } };
  assert.equal((await run()).statusCode, 404);
});

test("the bot being unreachable is a 502, not a hang or a crash", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("discord.com")) return new Response(JSON.stringify(discordGuilds), { status: 200 });
    throw new Error("connect ECONNREFUSED");
  };
  const res = await run();
  assert.equal(res.statusCode, 502);
});

test("other methods are refused", async () => {
  assert.equal((await run({ method: "DELETE" })).statusCode, 405);
});
