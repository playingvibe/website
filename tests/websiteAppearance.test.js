import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * `PUT /api/appearance` is the only write path for every appearance setting, so its entitlement
 * check *is* the paywall — and until 2026-09-11 it was the one live gate with no test. These run
 * the real handler, with a real sealed session cookie, against a real database.
 */
let mongod;
const SAVED = ["MONGO_URI", "SESSION_SECRET", "PREMIUM_OPEN", "PREMIUM_SKU_ID"].map((name) => [
  name,
  process.env[name],
]);

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
  delete process.env.PREMIUM_OPEN;
  delete process.env.PREMIUM_SKU_ID;
});

const { db, closeDb } = await import("../website/lib/mongo.js");
const { setSession } = await import("../website/lib/session.js");
const { default: handler, isForSale } = await import("../website/api/appearance.js");

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
  const req = { method, headers: { cookie: signedInAs(userId) }, body };
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

const stored = async (id) => (await db()).collection("users").findOne({ _id: id });

test("with PREMIUM_OPEN unset, a user without premium is refused and nothing is written", async () => {
  const res = await call("PUT", "free-user", { accent: "#f0803c", activityAccent: "#123456" });

  assert.equal(res.statusCode, 402);
  assert.equal(await stored("free-user"), null, "a refused write must not upsert a document");
});

test("a user with an active premium row can save", async () => {
  await (await db()).collection("users").insertOne({
    _id: "paid-user",
    premium: { tier: "user", expiresAt: null },
  });

  const res = await call("PUT", "paid-user", { accent: "#f0803c" });

  assert.equal(res.statusCode, 200);
  assert.equal((await stored("paid-user")).rankCardAccent, "#f0803c");
});

test("an expired premium row is refused", async () => {
  await (await db()).collection("users").insertOne({
    _id: "lapsed-user",
    premium: { tier: "user", expiresAt: new Date(Date.now() - 60_000) },
  });

  const res = await call("PUT", "lapsed-user", { accent: "#f0803c" });

  assert.equal(res.statusCode, 402);
  assert.equal((await stored("lapsed-user")).rankCardAccent, undefined);
});

test('only PREMIUM_OPEN="true" opens the gate for somebody without premium', async () => {
  for (const value of ["false", "TRUE", "1", "yes"]) {
    process.env.PREMIUM_OPEN = value;
    const res = await call("PUT", "free-user", { accent: "#f0803c" });
    assert.equal(res.statusCode, 402, `PREMIUM_OPEN=${JSON.stringify(value)} must stay closed`);
  }

  process.env.PREMIUM_OPEN = "true";
  const res = await call("PUT", "free-user", { accent: "#f0803c" });
  assert.equal(res.statusCode, 200);
});

test("GET reports entitlement and whether anything is for sale", async () => {
  let res = await call("GET", "free-user");
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.entitled, false);
  assert.equal(res.payload.forSale, false, "no SKU configured means nothing is for sale");

  process.env.PREMIUM_SKU_ID = "1234567890123456789";
  res = await call("GET", "free-user");
  assert.equal(res.payload.forSale, true);
  assert.equal(res.payload.entitled, false, "being for sale does not make anyone entitled");
});

test("a PREMIUM_SKU_ID that is not a snowflake reads as not for sale", () => {
  for (const value of ["", "abc", "12345", "1234567890123456789x", " 1234567890123456789"]) {
    process.env.PREMIUM_SKU_ID = value;
    assert.equal(isForSale(), false, `PREMIUM_SKU_ID=${JSON.stringify(value)}`);
  }
  process.env.PREMIUM_SKU_ID = "1234567890123456789";
  assert.equal(isForSale(), true);
});
