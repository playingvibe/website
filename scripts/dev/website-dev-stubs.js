/**
 * The API the website dev server fakes: fixtures chosen to be the states that are easy to get wrong, and one
 * handler per route. `website-dev-server.js` serves files and looks a path up in `STUBS`; everything that
 * pretends to be `website/api/` is here.
 *
 * Each handler gets `{req, res, url, state, setState, port}`: `state` is the page state in force
 * (`full`, `new`, `signed-out`, `free`, `unsold`).
 */
import {
  CARD_BACKGROUND_STYLES,
  normaliseCardColor,
} from "../../website/lib/generated/cardBackgrounds.js";
// The API's own palette and validation, so the stub cannot offer or accept what the real endpoint refuses. A Node
// script in this repository can import from `website/` freely; only the deployed bundle cannot.
import { PALETTE, validateChanges } from "../../website/api/appearance.js";
import { LIKED_COVER, playlistCover } from "../../website/lib/generated/playlistCover.js";
import { playlistArt } from "../../website/lib/generated/playlistArt.js";
import { createHash } from "node:crypto";
import { EQ_MAX_PRESETS, normaliseGains, normalisePresetName } from "../../website/lib/generated/equalizer.js";

const USER = {
  id: "100000000000000001",
  username: "Demo listener",
  avatar: "https://cdn.discordapp.com/embed/avatars/2.png",
};

/** ~63 hours: past the Silver Listener threshold, mid-way through a level. */
const FULL = {
  hasData: true,
  premium: true,
  stats: {
    totalListeningTime: 63.4 * 60 * 60 * 1000,
    listeningHours: 63.4,
    sessionCount: 812,
    currentStreak: 11,
    longestStreak: 24,
    lastActiveDate: "2026-09-03",
    guildCount: 4,
  },
  level: { level: 14, progress: 0.42, hoursIntoLevel: 5.1, hoursForNextLevel: 75.6 },
  badges: [
    { name: "Silver Listener", color: "#C9CDD4" },
    { name: "Gold Collector", color: "#F5C542" },
  ],
};

/** Signed in, never played anything — every counter zero and no badges. */
const NEW = {
  hasData: false,
  stats: {
    totalListeningTime: 0,
    listeningHours: 0,
    sessionCount: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    guildCount: 0,
  },
  level: { level: 1, progress: 0, hoursIntoLevel: 0, hoursForNextLevel: 0.5 },
  badges: [],
};

/** Two servers with bots and one without, so the "add Vibe" branch is reachable too. */
const GUILDS = [
  {
    id: "1001936665499156582",
    name: "Vibe Support",
    icon: null,
    premium: true,
    instances: [
      { clientId: "815329807377498153", name: "Vibe" },
      { clientId: "1533281867523031070", name: "Vibe 2" },
      { clientId: "1001935021436850207", name: "Vibe 3" },
    ],
  },
  { id: "1002343869440069642", name: "Late Night Listening", icon: null, instances: [
    { clientId: "815329807377498153", name: "Vibe" },
  ] },
  { id: "1003000000000000000", name: "A server with no Vibe", icon: null, instances: [] },
];

/**
 * The bot's side of /api/guild-settings, faked in memory: a few roles and channels, and the same rules the
 * real endpoint enforces (an id must be one of the server's own, of the right kind). Mutated by POST so
 * every control on /servers/<id> can be exercised for real.
 */
const ROLES = [{ id: "111111111111111111", name: "DJ" }, { id: "111111111111111112", name: "Moderator" }, { id: "111111111111111113", name: "Regulars" }];
const TEXT = [{ id: "333333333333333331", name: "commands" }, { id: "333333333333333332", name: "music-chat" }, { id: "333333333333333333", name: "audit-log" }];
const VOICE = [{ id: "444444444444444441", name: "Lounge" }, { id: "444444444444444442", name: "Stage" }];
const SETTINGS = new Map();
const settingsFor = (guildId) => {
  if (!SETTINGS.has(guildId)) {
    SETTINGS.set(guildId, { djRoles: [], voiceChannels: [], commandsChannels: [], logChannelId: null, announcements: true, tips: true, autoplay: false, autoplayRoomTaste: true, shareVoiceChannels: true, overlayToken: null, activityAccent: null, activityBackground: null, equalizerPresets: [{ id: "a1b2c3d4", name: "Late night", gains: [-0.1, -0.1, -0.05, 0, 0, 0, 0, 0, 0, -0.05, -0.05, -0.1, -0.15, -0.2, -0.2] }] });
  }
  return SETTINGS.get(guildId);
};
/** The `?bot=` alias `nowplaying/overlay.js` reads, matching the real `inviteClientIds`. */
const ALIAS_BY_CLIENT_ID = { "815329807377498153": "vibe", "1533281867523031070": "vibe2", "1001935021436850207": "vibe3" };
const describeSettings = (guild, { state, port }) => {
  const shared = settingsFor(guild.id);
  return {
    // The badge beside the name follows the page state, like every other premium answer here.
    guild: { id: guild.id, name: guild.name, premium: guild.premium === true && state !== "free" && state !== "unsold" },
    shared: {
      djRoles: shared.djRoles,
      voiceChannels: shared.voiceChannels,
      commandsChannels: shared.commandsChannels,
      logChannelId: shared.logChannelId,
      announcements: shared.announcements,
      tips: shared.tips,
      autoplay: shared.autoplay,
      autoplayRoomTaste: shared.autoplayRoomTaste,
      shareVoiceChannels: shared.shareVoiceChannels,
      overlay: { on: Boolean(shared.overlayToken), url: shared.overlayToken ? "http://localhost:" + port + "/np/" + shared.overlayToken : null },
      activityAccent: shared.activityAccent,
      activityBackground: shared.activityBackground,
      // Nothing for sale means no curve can exist, as in production until a SKU does.
      equalizerPresets: state === "unsold" ? [] : shared.equalizerPresets,
    },
    // Same three states as /api/appearance's stub, and the same reason: `free` exercises the
    // greyed-out "premium feature" path, `unsold` exercises the section being hidden entirely.
    premium: {
      activityTheme: { entitled: state !== "free" && state !== "unsold", forSale: state !== "unsold" },
      pinned247: { entitled: state !== "free" && state !== "unsold", forSale: state !== "unsold" },
      customEq: { entitled: state !== "free" && state !== "unsold", forSale: state !== "unsold" },
    },
    options: { roles: ROLES, textChannels: TEXT, voiceChannels: VOICE },
    instances: guild.instances.map((i) => ({
      clientId: i.clientId,
      name: i.name,
      overrides: OVERRIDES.get(i.clientId + ":" + guild.id) ?? {},
      pinnedVoiceChannelId: PINS.get(i.clientId + ":" + guild.id) ?? null,
      alias: ALIAS_BY_CLIENT_ID[i.clientId] ?? null,
    })),
  };
};
const refuse = (res, message) => json(res, 400, { error: message });
const allIn = (ids, options) => Array.isArray(ids) && ids.every((id) => options.some((o) => o.id === id));

/** Mutated by PATCH so the toggle can be exercised for real, not just rendered. */
const OVERRIDES = new Map();
/** The channel each bot is pinned to, by `clientId:guildId`. */
const PINS = new Map();
const appearance = {
  accent: null,
  background: null,
  backgroundColor: null,
  fade: null,
  activityAccent: null,
  activityBackground: null,
  preferServerTheme: false,
};

const body = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
};

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

/** One listening passport, in the state most of them will be in: a few weeks of real listening. */
const PASSPORT = {
  owner: {
    displayName: "Demo listener",
    avatarUrl: "/api/passport-avatar?token=" + "a".repeat(32),
    since: "2026-06-02T10:00:00.000Z",
  },
  stats: {
    listeningHours: 63.4,
    tracksPlayed: 418,
    currentStreak: 6,
    longestStreak: 21,
    servers: 3,
  },
  level: { level: 14, progress: 0.42, hoursIntoLevel: 4.1, hoursThisLevel: 9.7, hoursForNextLevel: 72 },
  badges: [
    { name: "Silver Listener", color: "#C9CDD4" },
    { name: "Gold Collector", color: "#F5C542" },
  ],
  historyOff: false,
  listening: {
    plays: 214,
    recent: [
      { title: "Midnight City", author: "M83", uri: "1", playedAt: new Date(Date.now() - 9 * 60_000).toISOString() },
      { title: "Redbone", author: "Childish Gambino", uri: "2", playedAt: new Date(Date.now() - 4 * 3_600_000).toISOString() },
      { title: "A very long track title that has to wrap on a narrow screen without breaking the layout", author: "Someone With A Long Name", uri: "3", playedAt: new Date(Date.now() - 26 * 3_600_000).toISOString() },
      { title: "Instrumental with no artist", author: null, uri: "4", playedAt: new Date(Date.now() - 6 * 86_400_000).toISOString() },
      // Past the page's six, so "Show more" is reachable.
      ...Array.from({ length: 6 }, (_, i) => ({
        title: `Older play ${i + 1}`,
        author: "Various",
        uri: String(10 + i),
        playedAt: new Date(Date.now() - (8 + i) * 86_400_000).toISOString(),
      })),
    ],
  },
  playlists: [
    {
      name: "Late night drive",
      trackCount: 3,
      tracks: [
        { title: "Midnight City", author: "M83", unavailable: false },
        { title: "An unofficial remix of something", author: null, unavailable: true },
        { title: "Nights", author: "Frank Ocean", unavailable: false },
      ],
    },
    {
      name: "Focus",
      trackCount: 120,
      tracks: Array.from({ length: 50 }, (_, i) => ({ title: `Track ${i + 1}`, author: "Various", unavailable: false })),
    },
  ],
  favorites: {
    total: 37,
    items: [
      { title: "Nights", author: "Frank Ocean", uri: "5" },
      { title: "Tadow", author: "Masego", uri: "6" },
      { title: "Some remix nobody can identify from its title alone", author: null, uri: "7" },
    ],
  },
};
// What `api/passport.js` adds to each playlist.
PASSPORT.playlists = PASSPORT.playlists.map((playlist) => ({ ...playlist, cover: { ...playlistCover(playlist.name), art: playlistArt(playlist.name) } }));
// And Liked Songs' own, which the route always sends (`favorites.cover`).
PASSPORT.favorites.cover = LIKED_COVER;

/** Signed-out is the same refusal on every route that needs a session. */
const needsSession = (handler) => (ctx) =>
  ctx.state === "signed-out" ? json(ctx.res, 401, { error: "Not signed in." }) : handler(ctx);

/**
 * A passport is the one page here with no session at all — it is served to whoever holds the link — so its stub
 * ignores `state` except for the shapes that are easy to get wrong: a passport whose owner has switched their
 * history off, and one with nothing on the record yet.
 */
function passport({ res, state }) {
  if (state === "new") return json(res, 200, { ...PASSPORT, listening: { recent: [], plays: 0 }, favorites: { total: 0, items: [] } });
  if (state === "signed-out") return json(res, 404, { error: "No passport here." });
  return json(res, 200, state === "free" ? { ...PASSPORT, historyOff: true } : PASSPORT);
}

function passportAvatar({ res }) {
  res.writeHead(302, { Location: "https://cdn.discordapp.com/embed/avatars/2.png" });
  return res.end();
}

function me({ res, state }) {
  return json(res, 200, { user: state === "signed-out" ? null : USER });
}

function profile({ res, state }) {
  return json(res, 200, state === "new" ? NEW : FULL);
}

/**
 * Premium has three states and the stub covers each: `full` is entitled, `free` is not entitled while premium is
 * for sale (greyed out), and `unsold` is not entitled with nothing for sale (hidden entirely) — which is
 * production until a SKU exists.
 */
async function appearanceRoute({ req, res, state }) {
  const entitled = state !== "free" && state !== "unsold";
  if (req.method === "PUT") {
    // Refused with the real endpoint's status whenever the user is not entitled. Without this the un-entitled path
    // could only be exercised against a live database, which is exactly the path most likely to be wrong and least
    // likely to get clicked.
    if (!entitled) return json(res, 402, { error: "Premium feature." });

    // The real validation, not a copy of it: a stub that accepted any body would show the 400s only against a live
    // database, and a hand-written copy drifts from the endpoint it imitates.
    const { changes, error } = validateChanges(await body(req));
    if (error) return refuse(res, error);
    if (!Object.keys(changes).length) return refuse(res, "Send at least one setting to change.");

    // Only the keys sent, matching the real handler — a stub that writes everything would hide the bug where
    // changing one setting clears the other.
    Object.assign(appearance, changes);
    return json(res, 200, changes);
  }
  return json(res, 200, {
    ...appearance,
    backgroundColor: appearance.backgroundColor ?? null,
    palette: PALETTE,
    backgrounds: CARD_BACKGROUND_STYLES,
    entitled,
    forSale: state === "free",
  });
}

function guilds({ res }) {
  return json(res, 200, {
    guilds: GUILDS.map((guild) => ({
      ...guild,
      instances: guild.instances.map((i) => ({ clientId: i.clientId, name: i.name })),
    })),
  });
}

const NOT_IN_SERVER = "One of those isn't in this server (or isn't the right kind).";

/** One server-wide change, applied to `shared`. Returns the summary, or `{refusal}`. */
function applyServerChange(shared, { field, value }, state) {
  const lists = { djRoles: ROLES, voiceChannels: VOICE, commandsChannels: TEXT };
  if (field in lists) {
    if (!allIn(value, lists[field])) return { refusal: NOT_IN_SERVER };
    shared[field] = value;
    return { summary: "Updated " + field };
  }
  if (field === "logChannelId") {
    if (value !== null && !TEXT.some((c) => c.id === value)) return { refusal: NOT_IN_SERVER };
    shared.logChannelId = value;
    return { summary: value ? "Audit log set" : "Audit log disabled" };
  }
  if (["announcements", "tips", "autoplay", "autoplayRoomTaste", "shareVoiceChannels"].includes(field)) {
    if (typeof value !== "boolean") return { refusal: field + " must be on or off." };
    shared[field] = value;
    return { summary: field + (value ? " on" : " off") };
  }
  if (field === "overlay") {
    if (value === "on" && !shared.overlayToken) shared.overlayToken = "0123456789abcdef0123456789abcdef";
    else if (value === "new" && shared.overlayToken) shared.overlayToken = "fedcba9876543210fedcba9876543210";
    else if (value === "off") shared.overlayToken = null;
    return { summary: "Now-playing overlay " + value };
  }
  if (field === "activityAccent") {
    // The bot's own guild-tier gate: refused with the real endpoint's shape whenever this server isn't entitled, so
    // that path is exercised here too, not only against a live bot.
    if (state === "free" || state === "unsold") {
      return { response: { error: "not_entitled", message: "That's a premium feature for this server." } };
    }
    if (value !== null && normaliseCardColor(value) === undefined) {
      return { response: { error: "invalid_value", message: "activityAccent must be a hex colour." } };
    }
    shared.activityAccent = value === null ? null : normaliseCardColor(value);
    return { summary: shared.activityAccent ? "Activity theme colour changed" : "Activity theme colour cleared" };
  }
  if (field === "activityBackground") {
    if (state === "free" || state === "unsold") {
      return { response: { error: "not_entitled", message: "That's a premium feature for this server." } };
    }
    if (value !== null && !CARD_BACKGROUND_STYLES.some((style) => style.key === value)) {
      return { response: { error: "invalid_value", message: "activityBackground must be one of the offered backgrounds." } };
    }
    shared.activityBackground = value;
    return { summary: value ? "Activity theme background changed" : "Activity theme background cleared" };
  }
  if (field === "equalizerPresets") return applyEqualizerChange(shared, value, state);
  return { refusal: "Unknown setting: " + field + "." };
}

/** A saved curve saved or deleted, with the bot's own rules: saving needs the subscription, deleting never does. */
function applyEqualizerChange(shared, value, state) {
  const invalid = (message) => ({ response: { error: "invalid_value", message } });
  if (!value || typeof value !== "object") return invalid("Say what to do with the curve.");
  if (value.op === "delete") {
    const before = shared.equalizerPresets.length;
    shared.equalizerPresets = shared.equalizerPresets.filter((preset) => preset.id !== value.id);
    return shared.equalizerPresets.length < before ? { summary: "Sound curve deleted" } : { response: { error: "unknown_id", message: "That curve is already gone." } };
  }
  if (value.op !== "save") return invalid("A curve is saved or deleted.");
  if (state === "free" || state === "unsold") return { response: { error: "not_entitled", message: "Saving sound curves is a premium feature for this server." } };
  const name = normalisePresetName(value.name);
  if (!name) return invalid("A curve needs a name.");
  const gains = normaliseGains(value.gains);
  if (!gains) return invalid("A curve is 15 bands, each between -0.25 and 0.5.");
  const taken = shared.equalizerPresets.some((preset) => preset.id !== value.id && preset.name.toLowerCase() === name.toLowerCase());
  if (taken) return invalid("There is already a curve with that name.");
  if (value.id) {
    const at = shared.equalizerPresets.findIndex((preset) => preset.id === value.id);
    if (at < 0) return { response: { error: "unknown_id", message: "That curve no longer exists." } };
    shared.equalizerPresets[at] = { id: value.id, name, gains };
    return { summary: "Sound curve " + name + " changed" };
  }
  if (shared.equalizerPresets.length >= EQ_MAX_PRESETS) return { response: { error: "limit_reached", message: "A server can keep " + EQ_MAX_PRESETS + " sound curves. Delete one first." } };
  shared.equalizerPresets.push({ id: Math.random().toString(16).slice(2, 10), name, gains });
  return { summary: "Sound curve " + name + " saved" };
}

/** One bot's override, or its reset. */
function applyInstanceChange(guild, instance, state) {
  const key = instance.clientId + ":" + guild.id;
  if (!guild.instances.some((i) => i.clientId === instance.clientId)) return { refusal: "That bot isn't in this server." };
  // A bot's own channel, not an override: setting it needs the subscription, letting it go is free.
  if (instance.field === "pinnedVoiceChannelId") {
    if (instance.value === null) {
      PINS.delete(key);
      return { summary: "no longer stays in a voice channel" };
    }
    if (!VOICE.some((channel) => channel.id === instance.value)) return { refusal: "That isn't a voice channel of this server." };
    if (state === "free" || state === "unsold") return { refusal: "Staying connected through an empty channel needs this server's subscription." };
    PINS.set(key, instance.value);
    return { summary: "stays in a voice channel" };
  }
  const next = { ...(OVERRIDES.get(key) ?? {}) };
  if (instance.reset) {
    OVERRIDES.delete(key);
    return { summary: "Reset to the server's settings" };
  }
  if (instance.value === null) delete next[instance.field];
  else if (["voiceChannels", "commandsChannels"].includes(instance.field)) {
    if (!allIn(instance.value, instance.field === "voiceChannels" ? VOICE : TEXT)) return { refusal: NOT_IN_SERVER };
    next[instance.field] = instance.value;
  } else next[instance.field] = Boolean(instance.value);
  OVERRIDES.set(key, next);
  return { summary: instance.field + " changed" };
}

async function guildSettings({ req, res, url, state, port }) {
  const guild = GUILDS.find((g) => g.id === url.searchParams.get("id"));
  if (!guild) return json(res, 403, { error: "You don't manage that server." });
  if (!guild.instances.length) return json(res, 404, { error: "That server's settings can't be reached: Vibe may not be in it." });

  if (req.method !== "POST") return json(res, 200, describeSettings(guild, { state, port }));

  const { change, instance } = await body(req);
  let outcome = { summary: null };
  if (change) outcome = applyServerChange(settingsFor(guild.id), change, state);
  else if (instance) outcome = applyInstanceChange(guild, instance, state);

  if (outcome.refusal) return refuse(res, outcome.refusal);
  if (outcome.response) return json(res, 400, outcome.response);
  return json(res, 200, { summary: outcome.summary ?? null, ...describeSettings(guild, { state, port }) });
}

/**
 * The bot's side of /api/playlists: the real `PlaylistEditing` (so the names, the cap, the subscription and the refs
 * are the real rules) over an in-memory stand-in for the repository. Mutated by POST, so every control on
 * /playlists can be exercised. The page state decides the rest: `full` has a subscription and every other does
 * not; `unsold` has nothing for sale either; `new` has no playlists at all, so the empty state can be seen.
 */
const SONGS = (prefix, titles) =>
  titles.map(([title, author], index) => ({ title, author, uri: `stub:${prefix}:${index}`, source: "stub", unavailableSince: index === 4 ? new Date() : null }));
const PLAYLISTS = [
  { id: "a1b2c3d4e5f60001", name: "Late night drive", shared: true, cover: { pattern: "vinyl", hue: 242 }, tracks: SONGS("a", [["Nights", "Frank Ocean"], ["Tadow", "Masego"], ["Midnight City", "M83"], ["Blue Monday", "New Order"], ["A song that went missing", null], ["Africa", "TOTO"]]) },
  { id: "a1b2c3d4e5f60002", name: "Gym", shared: false, cover: null, tracks: SONGS("b", [["Stronger", "Kanye West"], ["Till I Collapse", "Eminem"], ["Lose Yourself", "Eminem"]]) },
  { id: "a1b2c3d4e5f60003", name: "Empty for now", shared: false, cover: null, tracks: [] },
];
const normalisedName = (name) => String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
const sameName = (a, b) => a.localeCompare(b, "en", { sensitivity: "accent" }) === 0;
const memoryRepository = {
  list: async () => PLAYLISTS.map((p) => ({ id: p.id, name: p.name })),
  listFull: async () => PLAYLISTS.map((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t })) })),
  get: async (_owner, id) => PLAYLISTS.find((p) => p.id === id) ?? null,
  create: async (_owner, rawName, { cap }) => {
    const name = normalisedName(rawName);
    if (!name) return { ok: false, error: "NAME_INVALID" };
    if (PLAYLISTS.some((p) => sameName(p.name, name))) return { ok: false, error: "NAME_TAKEN" };
    if (PLAYLISTS.length >= cap) return { ok: false, error: "LIMIT_REACHED" };
    PLAYLISTS.push({ id: [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join(""), name, shared: false, cover: null, tracks: [] });
    return { ok: true };
  },
  rename: async (_owner, id, rawName) => {
    const name = normalisedName(rawName);
    const target = PLAYLISTS.find((p) => p.id === id);
    if (!name) return { ok: false, error: "NAME_INVALID" };
    if (!target) return { ok: false, error: "NOT_FOUND" };
    if (PLAYLISTS.some((p) => p !== target && sameName(p.name, name))) return { ok: false, error: "NAME_TAKEN" };
    target.name = name;
    return { ok: true };
  },
  delete: async (_owner, id) => {
    const index = PLAYLISTS.findIndex((p) => p.id === id);
    if (index < 0) return false;
    PLAYLISTS.splice(index, 1);
    return true;
  },
  removeTrackByUri: async (_owner, id, uri) => {
    const target = PLAYLISTS.find((p) => p.id === id);
    const index = target?.tracks.findIndex((t) => t.uri === uri) ?? -1;
    if (index < 0) return { ok: false, error: "NOT_IN_PLAYLIST" };
    target.tracks.splice(index, 1);
    return { ok: true };
  },
  moveTrack: async (_owner, id, uri, direction, { target } = {}) => {
    const tracks = PLAYLISTS.find((p) => p.id === id)?.tracks;
    const at = tracks?.findIndex((t) => t.uri === uri) ?? -1;
    if (at < 0) return { ok: false, error: "NOT_IN_PLAYLIST" };
    if (direction === "before" || direction === "after") {
      if (!target || target === uri) return { ok: false, error: "BAD_DIRECTION" };
      if (!tracks.some((t) => t.uri === target)) return { ok: false, error: "NOT_IN_PLAYLIST" };
      const [moved] = tracks.splice(at, 1);
      const next = tracks.findIndex((t) => t.uri === target);
      tracks.splice(direction === "before" ? next : next + 1, 0, moved);
      return { ok: true };
    }
    const to = direction === "top" ? 0 : direction === "up" ? Math.max(0, at - 1) : Math.min(tracks.length - 1, at + 1);
    tracks.splice(to, 0, ...tracks.splice(at, 1));
    return { ok: true };
  },
};

/**
 * The editor's rules for the fake list above, in the shape the bot answers with. **Written here rather than imported
 * from the bot**: this file is published with the website, where the bot's code does not exist. It is a stand-in to
 * click through, not the rules: those are `PlaylistEditing` in the bot and its tests, and the caps below are quoted
 * from it.
 */
const EDITOR_LIMITS = { maxPlaylists: 25, maxTracks: 200, maxNameLength: 50 };
const EDITOR_MESSAGES = {
  locked: "Creating, renaming and reordering playlists need a subscription. Removing songs and deleting playlists stay free.",
  name_invalid: "A playlist needs a name.",
  name_reserved: "That name is kept for Liked Songs.",
  name_taken: "There's already a playlist with that name.",
  limit: "You can have up to " + EDITOR_LIMITS.maxPlaylists + " playlists. Delete one first.",
  gone: "That playlist or song is already gone.",
  bad_request: "That isn't something the editor can do.",
};
/** A song's name on the page: a short hash of its link, as the bot sends it. */
const refOf = (uri) => createHash("sha256").update(String(uri)).digest("hex").slice(0, 16);
const uriOf = (id, ref) => PLAYLISTS.find((p) => p.id === id)?.tracks.find((t) => refOf(t.uri) === ref)?.uri ?? null;

function describeEditor(subscribed) {
  return {
    entitled: subscribed,
    limits: EDITOR_LIMITS,
    playlists: PLAYLISTS.map((p) => ({
      id: p.id,
      name: p.name,
      shared: p.shared === true,
      cover: subscribed && p.cover ? p.cover : null,
      trackCount: p.tracks.length,
      tracks: p.tracks.map((t) => ({ ref: refOf(t.uri), title: t.title, author: t.author ?? null, unavailable: Boolean(t.unavailableSince) })),
    })),
  };
}

/** One change. Taking things away is free; creating, renaming and reordering need the subscription. */
async function applyEditorOp(subscribed, op) {
  const refuse = (error) => ({ ok: false, error, message: EDITOR_MESSAGES[error] });
  const named = (result) => (result.ok ? { ok: true } : refuse({ NAME_TAKEN: "name_taken", LIMIT_REACHED: "limit", NOT_FOUND: "gone" }[result.error] ?? "name_invalid"));
  if (!op || typeof op !== "object") return refuse("bad_request");

  if (op.kind === "delete") return (await memoryRepository.delete(null, op.id)) ? { ok: true } : refuse("gone");
  if (op.kind === "remove") {
    const uri = uriOf(op.id, op.ref);
    return uri && (await memoryRepository.removeTrackByUri(null, op.id, uri)).ok ? { ok: true } : refuse("gone");
  }
  if (!["create", "rename", "move"].includes(op.kind)) return refuse("bad_request");
  if (!subscribed) return refuse("locked");

  if (op.kind === "move") {
    const uri = uriOf(op.id, op.ref);
    const beside = op.direction === "before" || op.direction === "after";
    const target = beside ? uriOf(op.id, op.target) : undefined;
    if (!uri || (beside && !target)) return refuse("gone");
    return (await memoryRepository.moveTrack(null, op.id, uri, op.direction, { target })).ok ? { ok: true } : refuse("gone");
  }
  if (typeof op.name !== "string") return refuse("bad_request");
  if (/^\s*liked(\s+songs)?\s*$/i.test(op.name)) return refuse("name_reserved");
  return named(op.kind === "create" ? await memoryRepository.create(null, op.name, { cap: EDITOR_LIMITS.maxPlaylists }) : await memoryRepository.rename(null, op.id, op.name));
}

async function playlistsRoute({ req, res, state }) {
  const subscribed = state === "full";
  // What the real `api/playlists.js` adds to the bot's answer, and the brand-new account's empty list.
  const answer = () => ({ ...describeEditor(subscribed), ...(state === "new" ? { playlists: [] } : {}), forSale: state !== "unsold" });
  if (req.method !== "POST") return json(res, 200, answer());

  const { op } = await body(req);
  const result = await applyEditorOp(subscribed, op);
  if (!result.ok) return json(res, 400, { error: result.message, code: result.error });
  return json(res, 200, answer());
}

function logout({ res, setState }) {
  setState("signed-out");
  return json(res, 200, { ok: true });
}

function login({ res, setState }) {
  // No Discord round-trip locally; land straight in the signed-in state.
  setState("full");
  res.writeHead(302, { Location: "/dashboard" });
  return res.end();
}

/** Route -> handler. A path not in here is a file for `serveStatic()`. */
export const STUBS = {
  "/api/passport": passport,
  "/api/passport-avatar": passportAvatar,
  "/api/me": me,
  "/api/profile": needsSession(profile),
  "/api/appearance": needsSession(appearanceRoute),
  "/api/guilds": needsSession(guilds),
  "/api/guild-settings": needsSession(guildSettings),
  "/api/playlists": needsSession(playlistsRoute),
  "/api/auth/logout": logout,
  "/api/auth/login": login,
};
