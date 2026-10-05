import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const REAL_SECRET = "a-test-secret-that-is-long-enough-32";
const previousSecret = process.env.SESSION_SECRET;

before(() => {
  process.env.SESSION_SECRET = REAL_SECRET;
});
after(() => {
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

const {
  setSession,
  getSession,
  clearSession,
  issueState,
  verifyState,
  parseCookies,
  SESSION_TTL_SECONDS,
} = await import("../website/lib/session.js");
const { avatarUrl, guildIconUrl, SCOPES } = await import("../website/lib/discord.js");

/** Only the two methods the session helpers touch. */
function fakeRes() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

/** @param {string[]} setCookie - Whatever a `fakeRes` collected, as a request would send back. */
function fakeReq(setCookie) {
  const cookies = [setCookie]
    .flat()
    .filter(Boolean)
    .map((line) => line.split(";")[0])
    .join("; ");
  return { headers: { cookie: cookies } };
}

// --- session sealing ---------------------------------------------------------------

test("a session survives a round-trip through the cookie", () => {
  const res = fakeRes();
  setSession(res, { id: "123", username: "Demo listener", avatar: "abc", accessToken: "tok" });

  const session = getSession(fakeReq(res.headers["Set-Cookie"]));

  assert.equal(session.id, "123");
  assert.equal(session.username, "Demo listener");
  assert.equal(session.accessToken, "tok");
  assert.ok(session.exp > Math.floor(Date.now() / 1000));
});

test("the session cookie is HttpOnly, Secure and SameSite=Lax", () => {
  const res = fakeRes();
  setSession(res, { id: "123", username: "A", avatar: null, accessToken: "tok" });

  const [cookie] = [res.headers["Set-Cookie"]].flat();
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  // Lax, not Strict — Strict would withhold the cookie on the redirect back from Discord.
  assert.match(cookie, /SameSite=Lax/);
});

test("the access token is not readable from the cookie value", () => {
  const res = fakeRes();
  setSession(res, { id: "123", username: "A", avatar: null, accessToken: "super-secret-token" });

  const raw = [res.headers["Set-Cookie"]].flat().join(";");
  // Encrypted, not merely signed: the point of the whole scheme is that this string is opaque.
  assert.ok(!raw.includes("super-secret-token"));
});

test("a tampered cookie is rejected rather than partially trusted", () => {
  const res = fakeRes();
  setSession(res, { id: "123", username: "A", avatar: null, accessToken: "tok" });

  const [cookie] = [res.headers["Set-Cookie"]].flat();
  const value = decodeURIComponent(cookie.split("=")[1].split(";")[0]);
  const [iv, tag, body] = value.split(".");
  // Flip a byte of the ciphertext. GCM authenticates it, so this must fail closed.
  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 0xff;
  const forged = `${iv}.${tag}.${flipped.toString("base64url")}`;

  assert.equal(getSession({ headers: { cookie: `vibe_session=${forged}` } }), null);
});

test("a session sealed with a different secret does not decrypt", () => {
  const res = fakeRes();
  setSession(res, { id: "123", username: "A", avatar: null, accessToken: "tok" });
  const req = fakeReq(res.headers["Set-Cookie"]);

  process.env.SESSION_SECRET = "a-completely-different-secret-32chars";
  try {
    assert.equal(getSession(req), null);
  } finally {
    process.env.SESSION_SECRET = REAL_SECRET;
  }
});

test("an expired session is rejected even though the browser still sent the cookie", () => {
  const res = fakeRes();
  setSession(res, { id: "123", username: "A", avatar: null, accessToken: "tok" });
  const req = fakeReq(res.headers["Set-Cookie"]);
  assert.ok(getSession(req), "valid to begin with");

  // Wound forward past the TTL. The cookie is still cryptographically intact and a browser
  // that ignored Max-Age would still send it — which is the whole reason expiry is re-checked
  // here rather than being left to the client.
  const realNow = Date.now;
  Date.now = () => realNow() + (SESSION_TTL_SECONDS + 60) * 1000;
  try {
    assert.equal(getSession(req), null);
  } finally {
    Date.now = realNow;
  }
});

test("garbage and absent cookies both read as no session", () => {
  assert.equal(getSession({ headers: {} }), null);
  assert.equal(getSession({ headers: { cookie: "vibe_session=" } }), null);
  assert.equal(getSession({ headers: { cookie: "vibe_session=a.b.c" } }), null);
  assert.equal(getSession({ headers: { cookie: "other=1" } }), null);
});

test("signing out clears both the session and the oauth state cookie", () => {
  const res = fakeRes();
  clearSession(res);

  const cookies = [res.headers["Set-Cookie"]].flat();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every((c) => c.includes("Max-Age=0")));
  assert.ok(cookies.some((c) => c.startsWith("vibe_session=")));
  assert.ok(cookies.some((c) => c.startsWith("vibe_oauth_state=")));
});

test("creating a session consumes the oauth state, so a callback cannot be replayed", () => {
  const res = fakeRes();
  setSession(res, { id: "1", username: "A", avatar: null, accessToken: "t" });

  const cookies = [res.headers["Set-Cookie"]].flat();
  const state = cookies.find((c) => c.startsWith("vibe_oauth_state="));
  assert.ok(state.includes("Max-Age=0"));
});

// --- CSRF state ---------------------------------------------------------------------

test("the issued state verifies, and anything else does not", () => {
  const res = fakeRes();
  const state = issueState(res);
  const req = fakeReq(res.headers["Set-Cookie"]);

  assert.equal(verifyState(req, state), true);
  assert.equal(verifyState(req, `${state}x`), false, "longer");
  assert.equal(verifyState(req, state.slice(0, -1)), false, "shorter");
  assert.equal(verifyState(req, ""), false, "empty");
  assert.equal(verifyState(req, null), false, "missing");
  assert.equal(verifyState({ headers: {} }, state), false, "no cookie at all");
});

test("parseCookies handles values containing = and surrounding whitespace", () => {
  const cookies = parseCookies({ headers: { cookie: "a=1; b=x.y=z ; c=%20spaced" } });
  assert.equal(cookies.a, "1");
  assert.equal(cookies.b, "x.y=z");
  assert.equal(cookies.c, " spaced");
});

// --- authorization and rendering helpers ---------------------------------------------

test("the login asks for identify and guilds, and nothing else", () => {
  // Any addition here changes the consent screen and the privacy policy, so it is worth a test
  // rather than a comment.
  assert.deepEqual(SCOPES, ["identify", "guilds"]);
});

test("avatarUrl falls back to the right default variant for an unset avatar", () => {
  assert.match(avatarUrl({ id: "1", avatar: "hash" }), /avatars\/1\/hash\.png/);
  // (id >> 22) % 6 — the post-discriminator default scheme.
  assert.equal(
    avatarUrl({ id: "815329807377498153", avatar: null }),
    `https://cdn.discordapp.com/embed/avatars/${Number((815329807377498153n >> 22n) % 6n)}.png`
  );
  assert.match(avatarUrl({}), /embed\/avatars\/0\.png/);
});

test("guildIconUrl returns null rather than a broken URL for an icon-less guild", () => {
  assert.equal(guildIconUrl({ id: "1", icon: null }), null);
  assert.match(guildIconUrl({ id: "1", icon: "abc" }), /icons\/1\/abc\.png/);
});

// --- why a sign-in failed -------------------------------------------------------------

const { reasonFor } = await import("../website/api/auth/callback.js");
const { DiscordApiError } = await import("../website/lib/discord.js");
const { SessionConfigError } = await import("../website/lib/session.js");
const { readFileSync } = await import("node:fs");

test("a 401 from the token exchange is our misconfiguration, not a transient failure", () => {
  // Discord answers 401 invalid_client when the client secret is wrong. Retrying never fixes it,
  // so it must not reach the user as "try again in a moment", which would send whoever runs the
  // site looking in the wrong place.
  assert.equal(reasonFor(new DiscordApiError("token_exchange", 401)), "server_misconfigured");
});

test("a 400 from the token exchange is worth retrying", () => {
  // invalid_grant: a code already used, or expired. Nothing is wrong with the deployment.
  assert.equal(reasonFor(new DiscordApiError("token_exchange", 400)), "exchange_failed");
});

test("Discord being down or rate-limiting is reported as Discord's problem", () => {
  assert.equal(reasonFor(new DiscordApiError("token_exchange", 503)), "discord_unavailable");
  assert.equal(reasonFor(new DiscordApiError("user_fetch", 500)), "discord_unavailable");
  assert.equal(reasonFor(new DiscordApiError("token_exchange", 429)), "discord_unavailable");
  // fetch() rejects with a TypeError when the request never completes at all.
  assert.equal(reasonFor(new TypeError("fetch failed")), "discord_unavailable");
});

test("an unusable session key is reported as misconfiguration, not as Discord refusing us", () => {
  // The failure that actually happened: SESSION_SECRET held the client secret and vice versa.
  // verifyState passes (it never touches the key), so this surfaces only here.
  assert.equal(reasonFor(new SessionConfigError("SESSION_SECRET too short")), "server_misconfigured");
});

test("anything unrecognised stays the generic failure", () => {
  assert.equal(reasonFor(new Error("boom")), "exchange_failed");
  assert.equal(reasonFor("not even an error"), "exchange_failed");
});

test("a too-short SESSION_SECRET throws the typed error, and never echoes the value", () => {
  process.env.SESSION_SECRET = "short-and-wrong";
  try {
    assert.throws(
      () => setSession(fakeRes(), { id: "1", username: "A", avatar: null, accessToken: "t" }),
      (error) => {
        assert.ok(error instanceof SessionConfigError);
        assert.ok(!error.message.includes("short-and-wrong"), "must not carry the value");
        return true;
      }
    );
  } finally {
    process.env.SESSION_SECRET = REAL_SECRET;
  }
});

test("every reason the callback can emit has copy on the dashboard", () => {
  // The two files are a redirect apart with no shared module, so a new reason silently renders as
  // no message at all. This is the only thing that would catch that.
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const callback = read("../website/api/auth/callback.js");
  const reasons = new Set([
    ...[...callback.matchAll(/fail\("([a-z_]+)"\)/g)].map((m) => m[1]),
    ...[...callback.matchAll(/return "([a-z_]+)";/g)].map((m) => m[1]),
  ]);

  // The sign-in copy lives in the shared module, since both dashboard pages can show it.
  const dashboard = read("../website/dash/shared.js");
  const block = dashboard.slice(dashboard.indexOf("const ERRORS = {"));
  const copy = new Set(
    [...block.slice(0, block.indexOf("};")).matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1])
  );

  assert.ok(reasons.size >= 6, `only found ${reasons.size} reasons`);
  const missing = [...reasons].filter((reason) => !copy.has(reason));
  assert.deepEqual(missing, [], `no dashboard copy for: ${missing.join(", ")}`);
});

test("a cookie whose authentication tag has been cut short is rejected, not checked at 32 bits", () => {
  const res = fakeRes();
  setSession(res, { id: "123", username: "A", avatar: null, accessToken: "tok" });

  const [cookie] = [res.headers["Set-Cookie"]].flat();
  const value = decodeURIComponent(cookie.split("=")[1].split(";")[0]);
  const [iv, tag, body] = value.split(".");
  assert.equal(Buffer.from(tag, "base64url").length, 16);

  for (const length of [4, 8, 12, 15]) {
    const short = Buffer.from(tag, "base64url").subarray(0, length).toString("base64url");
    assert.equal(getSession({ headers: { cookie: `vibe_session=${iv}.${short}.${body}` } }), null, `${length}-byte tag`);
  }
  assert.ok(getSession({ headers: { cookie: `vibe_session=${value}` } }), "the real one still works");
});

test("sign-out refuses a request the browser says came from another site, and accepts the site's own", async () => {
  const { default: logout } = await import("../website/api/auth/logout.js");
  const run = (headers) => {
    const res = fakeRes();
    res.status = (code) => ((res.statusCode = code), res);
    res.json = (body) => ((res.body = body), res);
    logout({ method: "POST", headers }, res);
    return res;
  };

  assert.equal(run({ "sec-fetch-site": "cross-site" }).statusCode, 403);
  assert.equal(run({ "sec-fetch-site": "same-site" }).statusCode, 403);
  assert.equal(run({ "sec-fetch-site": "same-origin" }).statusCode, 200);
  assert.equal(run({}).statusCode, 200, "a client that sends no such header is not a browser steered by a page");
  assert.equal(run({ "sec-fetch-site": "cross-site" }).headers?.["Set-Cookie"], undefined, "and nothing was cleared");
});
