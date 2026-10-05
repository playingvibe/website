import test from "node:test";
import assert from "node:assert/strict";
import { canManageGuild } from "../website/lib/discord.js";
import { normaliseCardColor } from "../website/lib/generated/cardBackgrounds.js";

/**
 * Tests for the website's pure functions: the rules that decide who may change what, on a surface
 * that is publicly reachable and holds the only write path for every appearance setting. All of
 * them are pure: no database, no browser, no Discord. Testing the website can look as if it needs
 * all three, and the rules most likely to be wrong need none of them.
 *
 * `npm test` at the root runs `node --test` over `tests/`, so these run with everything else.
 */

// --- canManageGuild: the subtle, load-bearing one ---------------------------------------------

const ADMINISTRATOR = "8";
const MANAGE_GUILD = "32";
const SEND_MESSAGES = "2048";

test("the owner of a server can always manage it, whatever the bitfield says", () => {
  assert.equal(canManageGuild({ owner: true, permissions: "0" }), true);
});

test("an administrator counts, even without an explicit Manage Server bit", () => {
  // **This is the case worth having a test for.** discord.js treats Administrator as implying
  // everything, which is what the bot-side check relies on — but the `permissions` field on an
  // OAuth partial guild is documented as *excluding* implicit permissions, so an administrator
  // arrives here as plain `8`. Without the explicit check the dashboard refuses people the bot
  // itself accepts, for servers they fully administer.
  assert.equal(canManageGuild({ permissions: ADMINISTRATOR }), true);
  assert.equal(canManageGuild({ permissions: MANAGE_GUILD }), true);
});

test("an ordinary member cannot", () => {
  assert.equal(canManageGuild({ permissions: SEND_MESSAGES }), false);
  assert.equal(canManageGuild({ permissions: "0" }), false);
});

test("the bitfield is read as a BigInt, so the high permissions are not lost", () => {
  // The field exceeds Number.MAX_SAFE_INTEGER, and parsing it as a number silently drops the high
  // bits — where every newer permission lives. A permission set that is large and contains neither
  // bit must still be refused rather than rounding into one.
  const huge = (1n << 46n).toString(); // USE_SOUNDBOARD — well past 2^53
  assert.equal(canManageGuild({ permissions: huge }), false);
  assert.equal(canManageGuild({ permissions: (BigInt(huge) | 8n).toString() }), true);
});

test("a missing, malformed or absent guild is refused rather than throwing", () => {
  // `BigInt("")` throws, and this runs on every row of somebody's server list.
  for (const guild of [undefined, null, {}, { permissions: "" }, { permissions: "not a number" }]) {
    assert.equal(canManageGuild(guild), false, JSON.stringify(guild));
  }
});

// --- normaliseCardColor: the one the appearance endpoint trusts free-form input to ---------------

test("every way of writing one colour normalises to the same string", () => {
  // Stored rather than merely checked, so `#F0A` and `#ff00aa` cannot become two values meaning
  // the same colour — which would make a saved-state comparison say "changed" when nothing did.
  // The hash and the short form are both optional on the way in, deliberately: `f0a` is a thing
  // people type into a field, and refusing it would be pedantry rather than validation.
  for (const input of ["#F0A", "#f0a", "F0A", "f0a", "#ff00aa", "#FF00AA", "ff00aa", " #ff00aa "]) {
    assert.equal(normaliseCardColor(input), "#ff00aa", JSON.stringify(input));
  }
});

test("null clears it, and anything unparseable is undefined rather than null", () => {
  // The distinction is the whole contract: `null` is a value the endpoint writes, `undefined` is
  // the signal to answer 400. Conflating them would store "no colour" for a typo.
  assert.equal(normaliseCardColor(null), null);
  assert.equal(normaliseCardColor(undefined), null);
  for (const value of ["", "red", "#gggggg", "#12345", "#ff00aa00", {}, []]) {
    assert.equal(normaliseCardColor(value), undefined, JSON.stringify(value) ?? String(value));
  }
});

// --- Discord that does not answer -----------------------------------------------------------------

test("every call to Discord from the functions carries a timeout", async (t) => {
  const { fetchGuilds, fetchUser, exchangeCode } = await import("../website/lib/discord.js");
  const seen = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    seen.push(init?.signal instanceof AbortSignal);
    return new Response("[]", { status: 200 });
  });
  process.env.DISCORD_CLIENT_ID ??= "1";
  process.env.DISCORD_CLIENT_SECRET ??= "s";

  await fetchGuilds("token");
  await fetchUser("token");
  await exchangeCode({ code: "c", redirect: "https://example.test/cb" });

  assert.deepEqual(seen, [true, true, true]);
});

test("a timed-out Discord request reads as unavailable, not as a sign-in that expired or a wrong secret", async () => {
  const { describeGuildFetchFailure, isTimeout } = await import("../website/lib/discord.js");
  const { reasonFor } = await import("../website/api/auth/callback.js");
  const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");

  assert.equal(isTimeout(timeout), true);
  assert.equal(isTimeout(new Error("other")), false);
  assert.equal(describeGuildFetchFailure(timeout).status, 503);
  assert.equal(reasonFor(timeout), "discord_unavailable");
});
