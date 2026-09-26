import test from "node:test";
import assert from "node:assert/strict";
import { canManageGuild } from "../website/lib/discord.js";
import { isSnowflake } from "../website/api/guild.js";
import { pickOverrides, OVERRIDABLE } from "../website/lib/overrides.js";
import { normaliseCardColor } from "../website/lib/generated/cardBackgrounds.js";

/**
 * The website's first tests — **it had none at all until 2026-09-21**, which the 2026-09-07 audit
 * filed as a MEDIUM against a surface that is publicly reachable and holds the only write path
 * for every appearance setting.
 *
 * These are the three the audit named as the cheapest with the most value, plus one. All four are
 * pure functions: no database, no browser, no Discord. That is the point — the reason the website
 * had no tests is that testing it *looked* like it needed all three, and the rules most likely to
 * be wrong need none of them.
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

// --- isSnowflake -------------------------------------------------------------------------------

test("a snowflake is 17 to 20 digits, as a string", () => {
  assert.equal(isSnowflake("815329807377498153"), true);
  assert.equal(isSnowflake("12345678901234567"), true);
  assert.equal(isSnowflake("12345678901234567890"), true);
});

test("anything else is not, including a number that looks like one", () => {
  // A number is the interesting rejection: an id past 2^53 cannot survive JSON as one, so
  // accepting the type at all would mean accepting a corrupted id.
  for (const value of [815329807377498153, "1234567890123456", "123456789012345678901", "", null,
    undefined, "81532980737749815a", " 815329807377498153 ", {}, ["815329807377498153"]]) {
    assert.equal(isSnowflake(value), false, JSON.stringify(value) ?? String(value));
  }
});

// --- pickOverrides: absent and empty are different, and the difference is load-bearing ----------

test("only the fields actually set come back", () => {
  assert.deepEqual(pickOverrides({ announcements: false, somethingElse: 1 }), { announcements: false });
  assert.deepEqual(pickOverrides({}), {});
  assert.deepEqual(pickOverrides(), {});
});

test("an empty list is a real override and survives; an absent key does not become one", () => {
  // `[]` means "unrestricted for this instance" and `undefined` means "inherit the server's
  // setting". Collapsing the two would turn an inherited restriction into no restriction.
  assert.deepEqual(pickOverrides({ voiceChannels: [] }), { voiceChannels: [] });
  assert.deepEqual(pickOverrides({ voiceChannels: undefined }), {});
});

test("the overridable list is narrower than the bot's, deliberately", () => {
  // The bot also allows autoplay and taste seeding; the dashboard offers neither, and an API that
  // accepts fields no UI sends is a surface nobody has looked at. If this ever needs widening it
  // should be because a control shipped.
  assert.deepEqual([...OVERRIDABLE], ["announcements", "voiceChannels", "commandsChannels"]);
  assert.deepEqual(pickOverrides({ autoplay: true }), {});
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
