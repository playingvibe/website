import test from "node:test";
import assert from "node:assert/strict";
import { shapePassport } from "../website/api/passport.js";

/**
 * What the public passport page is told, without a database: the handler's reads are inputs here, so the
 * shaping (and what it leaves out) is tested on its own. The handler's refusals and header are in
 * `websitePassport.test.js`, against a real MongoDB.
 */

const OWNER_ID = "308000000000000001";
const TOKEN = "a".repeat(32);

const reads = {
  listening: { recent: [{ title: "Song", author: "Artist", playedAt: "2026-10-01T00:00:00Z", uri: "https://x" }], plays: 3 },
  favorites: { favorites: [{ title: "Fav", author: null, source: "youtube" }], total: 1 },
  playlists: [{ name: "Mix", trackCount: 1, tracks: [{ title: "T", author: "A", unavailable: 0, uri: "https://x" }] }],
};

const user = {
  _id: OWNER_ID,
  totalListeningTime: 2 * 60 * 60 * 1000,
  sessionCount: 4,
  longestStreak: 5,
  listeningGuildIds: ["g1", "g2"],
  firstSeenAt: new Date("2026-01-01T00:00:00Z"),
  passport: { token: TOKEN, displayName: "Sam", avatar: "hash" },
};

test("the owner's name, proxied avatar and stats are published, and nothing that identifies the account", () => {
  const shaped = shapePassport(user, reads);

  assert.equal(shaped.owner.displayName, "Sam");
  assert.equal(shaped.owner.avatarUrl, `/api/passport-avatar?token=${TOKEN}`);
  assert.equal(shaped.stats.listeningHours, 2);
  assert.equal(shaped.stats.tracksPlayed, 4);
  assert.equal(shaped.stats.longestStreak, 5);
  assert.equal(shaped.stats.servers, 2);
  assert.ok(!JSON.stringify(shaped).includes(OWNER_ID), "the user id is nowhere in the response");
  assert.ok(!JSON.stringify(shaped).includes("hash"), "nor is the avatar hash");
});

test("a track carries a title and an author, never a source or a link", () => {
  const shaped = shapePassport(user, reads);

  assert.deepEqual(Object.keys(shaped.listening.recent[0]).sort(), ["author", "playedAt", "title"]);
  assert.deepEqual(Object.keys(shaped.favorites.items[0]).sort(), ["author", "title"]);
  assert.equal(shaped.favorites.items[0].author, null);
  assert.deepEqual(shaped.playlists[0].tracks[0], { title: "T", author: "A", unavailable: false });
  assert.ok(!JSON.stringify(shaped).includes("youtube"));
  assert.ok(!JSON.stringify(shaped).includes("https://x"));
});

test("a passport with nothing set falls back to the defaults, and says when history is off", () => {
  const shaped = shapePassport(
    { _id: OWNER_ID, listeningHistoryOptOut: true },
    { listening: { recent: [], plays: 0, unavailable: true }, favorites: { favorites: [], total: 0 }, playlists: [] }
  );

  assert.equal(shaped.owner.displayName, "A Vibe listener");
  assert.equal(shaped.owner.avatarUrl, null);
  assert.equal(shaped.owner.since, null);
  assert.equal(shaped.stats.listeningHours, 0);
  assert.equal(shaped.stats.servers, 0);
  assert.equal(shaped.historyOff, true);
  assert.deepEqual(shaped.listening, { plays: 0, recent: [], unavailable: true });
  assert.deepEqual(shaped.playlists, []);
});

test("`unavailable` is only present when the listening read failed", () => {
  assert.ok(!("unavailable" in shapePassport(user, reads).listening));
});

test("each shared playlist carries its default cover: a letter and two colours, and nothing about its owner", () => {
  const shaped = shapePassport(user, reads);

  assert.deepEqual(Object.keys(shaped.playlists[0].cover).sort(), ["from", "initial", "to"]);
  assert.equal(shaped.playlists[0].cover.initial, "M");
  assert.match(shaped.playlists[0].cover.from, /^#[0-9a-f]{6}$/);
});

test("Liked Songs has its own fixed cover, the same one every other surface draws", () => {
  assert.deepEqual(shapePassport(user, reads).favorites.cover, { initial: "♥", from: "#4b2fd0", to: "#7a52e6" });
});
