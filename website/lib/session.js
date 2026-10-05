import crypto from "node:crypto";

const COOKIE_NAME = "vibe_session";
const STATE_COOKIE = "vibe_oauth_state";

/**
 * A week, which is also exactly how long Discord's access tokens last. Matching them means
 * the session never outlives the token it carries, so the guild endpoints can't fail with a
 * 401 against a session the site still considers valid.
 */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** OAuth round-trips take seconds; anything longer is a stale tab, not a live login. */
const STATE_TTL_SECONDS = 10 * 60;

/**
 * Thrown when `SESSION_SECRET` is missing or too short.
 *
 * Typed, because the callback has to tell "this deployment is misconfigured" apart from "Discord
 * refused us": both arrive at the same `catch`, and must not reach the user as the same sentence.
 * Carries the fact, never the value.
 */
export class SessionConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionConfigError";
  }
}

/**
 * Sessions are a single encrypted cookie. No session collection, no server-side store.
 *
 * The alternative — a `sessions` collection in the same cluster — buys instant revocation and
 * costs a database round-trip on every request plus a third collection to explain in the privacy
 * policy. Revocation is not worth that here: there is no admin surface that would ever use it,
 * and a user who wants out can sign out or wait a week. `/privacy`'s delete is unaffected either
 * way, because nothing about the session is stored on our side at all.
 *
 * **Encrypted rather than merely signed**, because the payload carries the user's Discord access
 * token — needed later to list the guilds they administer without asking for a privileged intent
 * on the bot. A signed-but-readable cookie would hand that token to any script that got at
 * `document.cookie`; encryption plus `HttpOnly` means neither the page nor an XSS payload can
 * read it. AES-256-GCM, so tampering fails authentication rather than decrypting to garbage.
 */
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new SessionConfigError("SESSION_SECRET must be set to at least 32 characters.");
  }
  // Hashed to exactly 32 bytes so the secret can be any human-typed string rather than
  // having to be exactly key-length.
  return crypto.createHash("sha256").update(secret).digest();
}

/** The full 128-bit GCM tag, which is what both ends require. */
const TAG_BYTES = 16;

/**
 * @param {object} payload
 * @returns {string} `iv.tag.ciphertext`, all base64url.
 */
function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/**
 * @param {string} token
 * @returns {object|null} `null` for anything that fails to authenticate, which is the same
 *          answer as "no session" — a caller should never have to tell tampering from absence.
 */
function unseal(token) {
  try {
    const [iv, tag, body] = String(token)
      .split(".")
      .map((part) => Buffer.from(part, "base64url"));
    if (!iv || !tag || !body) return null;
    // Node accepts a shorter tag than it issued unless told the length, and a 4-byte one is checked at
    // 32 bits: forging a cookie would stop being impossible and become a search.
    if (tag.length !== TAG_BYTES) return null;

    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Record<string, string>}
 */
export function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};

  return Object.fromEntries(
    header
      .split(";")
      .map((pair) => {
        const index = pair.indexOf("=");
        if (index < 0) return null;
        const name = pair.slice(0, index).trim();
        const raw = pair.slice(index + 1).trim();
        // **Decoded per pair, inside a try.** `decodeURIComponent` throws `URIError` on a lone `%`
        // or a bad escape — and this runs on *every* request to *every* endpoint, before any
        // handler. One malformed cookie from any source on the domain would otherwise turn the whole
        // site into a 500 for that browser. The raw value is the right fallback: a cookie we cannot decode is a
        // cookie we do not understand, and the session decrypt below will reject it on its own.
        try {
          return [name, decodeURIComponent(raw)];
        } catch {
          return [name, raw];
        }
      })
      .filter(Boolean)
  );
}

/**
 * @param {string} name
 * @param {string} value
 * @param {number} maxAge - Seconds. Zero clears the cookie.
 * @returns {string}
 */
function cookie(name, value, maxAge) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    // Lax, not Strict: the OAuth callback is a cross-site navigation back from Discord, and
    // Strict would withhold the state cookie on exactly that request.
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {object} session
 * @returns {void}
 */
export function setSession(res, session) {
  const payload = { ...session, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  res.setHeader("Set-Cookie", [
    cookie(COOKIE_NAME, seal(payload), SESSION_TTL_SECONDS),
    // The state is single-use — expired here so a replayed callback can't reuse it.
    cookie(STATE_COOKIE, "", 0),
  ]);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {{id: string, username: string, avatar: ?string, accessToken: string}|null}
 */
export function getSession(req) {
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return null;

  const session = unseal(raw);
  // Checked here as well as by the cookie's Max-Age: the browser enforces expiry, and a
  // browser is not something to take authorization decisions from.
  if (!session || typeof session.exp !== "number" || session.exp * 1000 < Date.now()) return null;

  return session;
}

/**
 * @param {import("node:http").ServerResponse} res
 * @returns {void}
 */
export function clearSession(res) {
  res.setHeader("Set-Cookie", [cookie(COOKIE_NAME, "", 0), cookie(STATE_COOKIE, "", 0)]);
}

/**
 * Issues the CSRF state for an authorization redirect.
 *
 * The state is stored in its own short-lived cookie and compared on the way back, which is what
 * stops an attacker completing a login flow into the victim's browser with their own code.
 * @param {import("node:http").ServerResponse} res
 * @returns {string}
 */
export function issueState(res) {
  const state = crypto.randomBytes(16).toString("base64url");
  res.setHeader("Set-Cookie", cookie(STATE_COOKIE, state, STATE_TTL_SECONDS));
  return state;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {string} state - The value Discord echoed back.
 * @returns {boolean}
 */
export function verifyState(req, state) {
  const expected = parseCookies(req)[STATE_COOKIE];
  if (!expected || !state) return false;

  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(state));
  // Constant-time, and length-guarded because timingSafeEqual throws on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
