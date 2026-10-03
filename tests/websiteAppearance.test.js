import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * `PUT /api/appearance` is the only write path for every appearance setting. These tests cover what
 * it accepts, what it refuses and what it stores: the real handler, with a real sealed session
 * cookie, against a real database.
 *
 * Who is allowed to write is decided by `website/lib/entitlements.js`, which is not what these are
 * about: every user here is given a premium row first, and the tests pass with either version of that
 * module.
 */
let mongod;
const SAVED = ["MONGO_URI", "SESSION_SECRET"].map((name) => [name, process.env[name]]);

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.SESSION_SECRET = "a-test-secret-that-is-long-enough-32";
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
  await (await db()).collection("users").deleteMany({});
});

const { db, closeDb } = await import("../website/lib/mongo.js");
const { setSession } = await import("../website/lib/session.js");
const { default: handler, PALETTE } = await import("../website/api/appearance.js");

/** A cookie header carrying a genuinely sealed session for `id`. */
function signedInAs(id) {
  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  setSession(res, { id, username: "tester", avatar: null, accessToken: "tok" });
  return [res.headers["Set-Cookie"]]
    .flat()
    .filter(Boolean)
    .map((line) => line.split(";")[0])
    .join("; ");
}

async function call(method, userId, body) {
  if (userId) await entitle(userId);
  const req = { method, headers: userId ? { cookie: signedInAs(userId) } : {}, body };
  const res = {
    statusCode: 200,
    payload: undefined,
    setHeader() {},
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

/** Gives the user an active premium row, without touching anything else already stored. */
async function entitle(id) {
  await (await db()).collection("users").updateOne(
    { _id: id },
    { $setOnInsert: { premium: { tier: "user", expiresAt: null } } },
    { upsert: true }
  );
}

const stored = async (id) => (await db()).collection("users").findOne({ _id: id });

test("without a session the endpoint answers 401 and writes nothing", async () => {
  const res = await call("PUT", null, { accent: PALETTE[0].value });

  assert.equal(res.statusCode, 401);
  assert.equal(await (await db()).collection("users").countDocuments(), 0);
});

test("only GET and PUT are accepted", async () => {
  assert.equal((await call("DELETE", "someone")).statusCode, 405);
});

test("GET offers the palette and the backgrounds, and reads back what is saved", async () => {
  await call("PUT", "someone", { accent: PALETTE[1].value, background: "bars" });

  const res = await call("GET", "someone");

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.palette, PALETTE);
  assert.ok(res.payload.backgrounds.some((entry) => entry.key === "bars"));
  assert.equal(res.payload.accent, PALETTE[1].value);
  assert.equal(res.payload.background, "bars");
});

test("a valid change is saved on the user, and only the keys that were sent", async () => {
  await call("PUT", "someone", { accent: PALETTE[2].value, background: "waves" });
  const res = await call("PUT", "someone", { accent: PALETTE[3].value });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { accent: PALETTE[3].value });
  const doc = await stored("someone");
  assert.equal(doc.rankCardAccent, PALETTE[3].value);
  assert.equal(doc.rankCardBackground, "waves", "a change to the accent must not clear the background");
});

test("null clears a setting rather than being refused", async () => {
  await call("PUT", "someone", { accent: PALETTE[0].value, background: "grid", fade: true });

  const res = await call("PUT", "someone", { accent: null, background: null, fade: null });

  assert.equal(res.statusCode, 200);
  const doc = await stored("someone");
  assert.equal(doc.rankCardAccent, null);
  assert.equal(doc.rankCardBackground, null);
  assert.equal(doc.rankCardFade, null);
});

test("the Activity's own accent and background are saved separately from the card's", async () => {
  const res = await call("PUT", "someone", { activityAccent: "#12ab9c", activityBackground: "aurora" });

  assert.equal(res.statusCode, 200);
  const doc = await stored("someone");
  assert.equal(doc.activityAccent, "#12ab9c");
  assert.equal(doc.activityBackground, "aurora");
  assert.equal(doc.rankCardAccent, undefined);
});

test("preferServerTheme is saved as its own boolean, and GET reads it back", async () => {
  const res = await call("PUT", "someone", { preferServerTheme: true });

  assert.equal(res.statusCode, 200);
  const doc = await stored("someone");
  assert.equal(doc.preferServerTheme, true);

  const got = await call("GET", "someone");
  assert.equal(got.payload.preferServerTheme, true);
});

test("a non-boolean preferServerTheme is refused and nothing is written", async () => {
  const res = await call("PUT", "someone", { preferServerTheme: "yes" });

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, "preferServerTheme must be true or false.");
  assert.equal((await stored("someone"))?.preferServerTheme, undefined);
});

test("a colour outside the palette, and an unknown background, are refused and nothing is written", async () => {
  const cases = [
    [{ accent: "#000000" }, "Not an available colour."],
    [{ accent: "red" }, "Not an available colour."],
    [{ background: "../secret" }, "Not an available background."],
    [{ activityBackground: "no-such-style" }, "Not an available background."],
    [{ backgroundColor: "not a colour" }, "Not a colour."],
    [{ activityAccent: "#12" }, "Not a colour."],
    [{ fade: "true" }, "Fade must be true, false, or null."],
    [{}, "Send at least one setting to change."],
  ];
  for (const [body, message] of cases) {
    const res = await call("PUT", "someone", body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(res.payload.error, message, JSON.stringify(body));
  }
  const doc = await stored("someone");
  for (const field of ["rankCardAccent", "rankCardBackground", "rankCardBackgroundColor", "rankCardFade", "activityAccent", "activityBackground"]) {
    assert.equal(doc[field], undefined, `a refused write must not store ${field}`);
  }
});

test("colours are stored normalised, so the same colour cannot be saved two ways", async () => {
  await call("PUT", "someone", { backgroundColor: "#F0A" });
  const short = (await stored("someone")).rankCardBackgroundColor;

  await call("PUT", "someone", { backgroundColor: "#ff00aa" });
  const long = (await stored("someone")).rankCardBackgroundColor;

  assert.equal(short, long);
});
