/** Enough for a settings patch and nowhere near enough to be worth sending as an attack. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Reads and parses a JSON request body.
 *
 * Vercel's Node runtime usually parses `req.body` for you, but only when the `Content-Type` says
 * JSON and only on some runtimes — so this handles both, rather than depending on a convenience
 * that varies by where the function happens to run.
 *
 * Returns `null` for anything unparseable instead of throwing. A malformed body is a client
 * mistake, and every caller here already has to handle "the field I wanted isn't there".
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<?object>}
 */
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return parse(req.body);

  const chunks = [];
  let size = 0;

  try {
    for await (const chunk of req) {
      size += chunk.length;
      // Stop reading rather than buffering an unbounded body into a function's memory.
      if (size > MAX_BODY_BYTES) return null;
      chunks.push(chunk);
    }
  } catch {
    return null;
  }

  return parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * @param {string} raw
 * @returns {?object}
 */
function parse(raw) {
  try {
    const value = JSON.parse(raw);
    // Arrays and primitives are never a valid body here, and letting one through would mean
    // every caller has to re-check before destructuring.
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
