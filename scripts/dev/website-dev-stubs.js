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
  DEFAULT_BACKGROUND_COLOR,
  normaliseCardColor,
} from "../../website/lib/generated/cardBackgrounds.js";
// The API's own palette and validation, so the stub cannot offer or accept what the real endpoint refuses. A Node
// script in this repository can import from `website/` freely; only the deployed bundle cannot.
import { PALETTE, validateChanges } from "../../website/api/appearance.js";

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
    SETTINGS.set(guildId, { djRoles: [], voiceChannels: [], commandsChannels: [], logChannelId: null, announcements: true, tips: true, autoplay: false, autoplayRoomTaste: true, shareVoiceChannels: true, overlayToken: null, activityAccent: null });
  }
  return SETTINGS.get(guildId);
};
/** The `?bot=` alias `nowplaying/overlay.js` reads, matching the real `inviteClientIds`. */
const ALIAS_BY_CLIENT_ID = { "815329807377498153": "vibe", "1533281867523031070": "vibe2", "1001935021436850207": "vibe3" };
const describeSettings = (guild, { state, port }) => {
  const shared = settingsFor(guild.id);
  return {
    guild: { id: guild.id, name: guild.name },
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
    },
    // Same three states as /api/appearance's stub, and the same reason: `free` exercises the
    // greyed-out "premium feature" path, `unsold` exercises the section being hidden entirely.
    premium: {
      activityTheme: { entitled: state !== "free" && state !== "unsold", forSale: state !== "unsold" },
    },
    options: { roles: ROLES, textChannels: TEXT, voiceChannels: VOICE },
    instances: guild.instances.map((i) => ({
      clientId: i.clientId,
      name: i.name,
      overrides: OVERRIDES.get(i.clientId + ":" + guild.id) ?? {},
      alias: ALIAS_BY_CLIENT_ID[i.clientId] ?? null,
    })),
  };
};
const refuse = (res, message) => json(res, 400, { error: message });
const allIn = (ids, options) => Array.isArray(ids) && ids.every((id) => options.some((o) => o.id === id));

/** Mutated by PATCH so the toggle can be exercised for real, not just rendered. */
const OVERRIDES = new Map();
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
    backgroundColor: appearance.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
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
  return { refusal: "Unknown setting: " + field + "." };
}

/** One bot's override, or its reset. */
function applyInstanceChange(guild, instance) {
  const key = instance.clientId + ":" + guild.id;
  if (!guild.instances.some((i) => i.clientId === instance.clientId)) return { refusal: "That bot isn't in this server." };
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
  else if (instance) outcome = applyInstanceChange(guild, instance);

  if (outcome.refusal) return refuse(res, outcome.refusal);
  if (outcome.response) return json(res, 400, outcome.response);
  return json(res, 200, { summary: outcome.summary ?? null, ...describeSettings(guild, { state, port }) });
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
  "/api/auth/logout": logout,
  "/api/auth/login": login,
};
