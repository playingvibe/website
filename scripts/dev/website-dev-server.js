/**
 * Serves `website/` locally so the dashboard can be worked on without Vercel, Discord or Mongo.
 *
 * The real `api/` functions need a client secret, a session secret and a database; none of that
 * belongs in a loop where the thing being changed is layout and copy. So the API is **stubbed**
 * here, from fixtures chosen to be the states that are easy to get wrong: a brand-new account
 * with zero of everything, and one far enough along to have badges and a part-filled level bar.
 *
 * This proves the page's rendering, not its auth — `tests/websiteAuth.test.js` covers the parts
 * that actually matter for security, and `vercel dev` is the way to exercise the real endpoints.
 *
 * Usage: node scripts/dev/website-dev-server.js [--port 4321] [--state full|new|signed-out|free|unsold]
 * Switch state live with ?state=new on any page; it is remembered for the session.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CARD_BACKGROUND_STYLES,
  DEFAULT_BACKGROUND_COLOR,
  normaliseCardColor,
} from "../../website/lib/generated/cardBackgrounds.js";
// The API's own palette, so the stub cannot offer a colour the real endpoint refuses. A Node
// script in this repository can import from `website/` freely; only the deployed bundle cannot.
import { PALETTE } from "../../website/api/appearance.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "website");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg("port", 4321));
let state = arg("state", "full");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

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
    SETTINGS.set(guildId, { djRoles: [], voiceChannels: [], commandsChannels: [], logChannelId: null, announcements: true, tips: true, autoplay: false, autoplayRoomTaste: true, overlayToken: null });
  }
  return SETTINGS.get(guildId);
};
const describeSettings = (guild) => {
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
      overlay: { on: Boolean(shared.overlayToken), url: shared.overlayToken ? "http://localhost:" + PORT + "/np/" + shared.overlayToken : null },
    },
    options: { roles: ROLES, textChannels: TEXT, voiceChannels: VOICE },
    instances: guild.instances.map((i) => ({ clientId: i.clientId, name: i.name, overrides: OVERRIDES.get(i.clientId + ":" + guild.id) ?? {} })),
  };
};
const refuse = (res, message) => json(res, 400, { error: message });
const allIn = (ids, options) => Array.isArray(ids) && ids.every((id) => options.some((o) => o.id === id));

/** Mutated by PATCH so the toggle can be exercised for real, not just rendered. */
const OVERRIDES = new Map();
let rankBackground = null;
let rankBackgroundColor = null;
let rankFade = null;
let activityAccent = null;
let activityBackground = null;
let rankAccent = null;

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.searchParams.has("state")) state = url.searchParams.get("state");

  // A passport is the one page here with no session at all — it is served to whoever holds the
  // link — so its stub ignores `state` except for the two shapes that are easy to get wrong: a
  // passport whose owner has switched their history off, and one with nothing on the record yet.
  if (url.pathname === "/api/passport") {
    if (state === "new") return json(res, 200, { ...PASSPORT, listening: { recent: [], plays: 0 }, favorites: { total: 0, items: [] } });
    if (state === "signed-out") return json(res, 404, { error: "No passport here." });
    return json(res, 200, state === "free" ? { ...PASSPORT, historyOff: true } : PASSPORT);
  }
  if (url.pathname === "/api/passport-avatar") {
    res.writeHead(302, { Location: "https://cdn.discordapp.com/embed/avatars/2.png" });
    return res.end();
  }

  if (url.pathname === "/api/me") {
    return json(res, 200, { user: state === "signed-out" ? null : USER });
  }
  if (url.pathname === "/api/profile") {
    if (state === "signed-out") return json(res, 401, { error: "Not signed in." });
    return json(res, 200, state === "new" ? NEW : FULL);
  }
  if (url.pathname === "/api/appearance") {
    if (state === "signed-out") return json(res, 401, { error: "Not signed in." });
    // Premium has three states and the stub covers each: `full` is entitled, `free` is not
    // entitled while premium is for sale (greyed out), and `unsold` is not entitled with nothing
    // for sale (hidden entirely) — which is production until a SKU exists.
    const entitled = state !== "free" && state !== "unsold";
    if (req.method === "PUT") {
      // Refused with the real endpoint's status whenever the user is not entitled. Without this
      // the un-entitled path could only be exercised against a live database, which is exactly
      // the path most likely to be wrong and least likely to get clicked.
      if (!entitled) return json(res, 402, { error: "Premium feature." });

      const patch = await body(req);

      // **Validated, with the real endpoint's messages and status codes.** A stub that accepted
      // any body would show the four 400s only against a live database, and a page that sends
      // something the API refuses would look fine here and fail in
      // production. These are the same four checks `website/api/appearance.js` makes, driven by
      // the same imported palette and the same generated background list.
      const bad = (message) => json(res, 400, { error: message });

      if ("accent" in patch && patch.accent !== null && !PALETTE.some((e) => e.value === patch.accent)) {
        return bad("Not an available colour.");
      }
      for (const key of ["background", "activityBackground"]) {
        if (key in patch && patch[key] !== null && !CARD_BACKGROUND_STYLES.some((e) => e.key === patch[key])) {
          return bad("Not an available background.");
        }
      }
      for (const key of ["backgroundColor", "activityAccent"]) {
        if (key in patch && normaliseCardColor(patch[key] ?? null) === undefined) return bad("Not a colour.");
      }
      if ("fade" in patch && patch.fade !== null && typeof patch.fade !== "boolean") {
        return bad("Fade must be true, false, or null.");
      }
      if (!Object.keys(patch).length) return bad("Send at least one setting to change.");

      // Only the keys sent, matching the real handler — a stub that writes both would hide the
      // bug where changing one setting clears the other.
      if ("accent" in patch) rankAccent = patch.accent ?? null;
      if ("background" in patch) rankBackground = patch.background ?? null;
      if ("backgroundColor" in patch) rankBackgroundColor = normaliseCardColor(patch.backgroundColor ?? null);
      if ("fade" in patch) rankFade = patch.fade ?? null;
      if ("activityAccent" in patch) activityAccent = normaliseCardColor(patch.activityAccent ?? null);
      if ("activityBackground" in patch) activityBackground = patch.activityBackground ?? null;
      return json(res, 200, patch);
    }
    return json(res, 200, {
      accent: rankAccent,
      background: rankBackground,
      backgroundColor: rankBackgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      fade: rankFade,
      activityAccent,
      activityBackground,
      palette: PALETTE,
      backgrounds: CARD_BACKGROUND_STYLES,
      entitled,
      forSale: state === "free",
    });
  }
  if (url.pathname === "/api/guilds") {
    if (state === "signed-out") return json(res, 401, { error: "Not signed in." });
    return json(res, 200, {
      guilds: GUILDS.map((guild) => ({
        ...guild,
        instances: guild.instances.map((i) => ({
          ...i,
          overrides: OVERRIDES.get(`${i.clientId}:${guild.id}`) ?? {},
        })),
      })),
    });
  }
  if (url.pathname === "/api/guild") {
    if (state === "signed-out") return json(res, 401, { error: "Not signed in." });
    const guildId = url.searchParams.get("id");
    const guild = GUILDS.find((g) => g.id === guildId);
    if (!guild) return json(res, 403, { error: "You don't manage that server." });

    if (req.method === "PATCH") {
      const clientId = url.searchParams.get("clientId");
      const patch = await body(req);
      const key = `${clientId}:${guildId}`;
      const next = { ...(OVERRIDES.get(key) ?? {}) };
      for (const [field, value] of Object.entries(patch)) {
        if (value === null) delete next[field];
        else next[field] = value;
      }
      OVERRIDES.set(key, next);
    }

    return json(res, 200, {
      id: guild.id,
      name: guild.name,
      shared: {
        djRoles: [],
        logChannelId: null,
        voiceChannels: [],
        commandsChannelId: null,
        announcements: true,
      },
      instances: guild.instances.map((i) => ({
        ...i,
        overrides: OVERRIDES.get(`${i.clientId}:${guild.id}`) ?? {},
      })),
    });
  }
  if (url.pathname === "/api/guild-settings") {
    if (state === "signed-out") return json(res, 401, { error: "Not signed in." });
    const guild = GUILDS.find((g) => g.id === url.searchParams.get("id"));
    if (!guild) return json(res, 403, { error: "You don't manage that server." });
    if (!guild.instances.length) return json(res, 404, { error: "That server's settings can't be reached: Vibe may not be in it." });

    if (req.method === "POST") {
      const { change, instance } = await body(req);
      const shared = settingsFor(guild.id);
      let summary = null;

      if (change) {
        const { field, value } = change;
        const lists = { djRoles: ROLES, voiceChannels: VOICE, commandsChannels: TEXT };
        if (field in lists) {
          if (!allIn(value, lists[field])) return refuse(res, "One of those isn't in this server (or isn't the right kind).");
          shared[field] = value;
          summary = "Updated " + field;
        } else if (field === "logChannelId") {
          if (value !== null && !TEXT.some((c) => c.id === value)) return refuse(res, "One of those isn't in this server (or isn't the right kind).");
          shared.logChannelId = value;
          summary = value ? "Audit log set" : "Audit log disabled";
        } else if (["announcements", "tips", "autoplay", "autoplayRoomTaste"].includes(field)) {
          if (typeof value !== "boolean") return refuse(res, field + " must be on or off.");
          shared[field] = value;
          summary = field + (value ? " on" : " off");
        } else if (field === "overlay") {
          if (value === "on" && !shared.overlayToken) shared.overlayToken = "0123456789abcdef0123456789abcdef";
          else if (value === "new" && shared.overlayToken) shared.overlayToken = "fedcba9876543210fedcba9876543210";
          else if (value === "off") shared.overlayToken = null;
          summary = "Now-playing overlay " + value;
        } else return refuse(res, "Unknown setting: " + field + ".");
      } else if (instance) {
        const key = instance.clientId + ":" + guild.id;
        if (!guild.instances.some((i) => i.clientId === instance.clientId)) return refuse(res, "That bot isn't in this server.");
        const next = { ...(OVERRIDES.get(key) ?? {}) };
        if (instance.reset) {
          OVERRIDES.delete(key);
          summary = "Reset to the server's settings";
        } else {
          if (instance.value === null) delete next[instance.field];
          else if (["voiceChannels", "commandsChannels"].includes(instance.field)) {
            if (!allIn(instance.value, instance.field === "voiceChannels" ? VOICE : TEXT)) return refuse(res, "One of those isn't in this server (or isn't the right kind).");
            next[instance.field] = instance.value;
          } else next[instance.field] = Boolean(instance.value);
          OVERRIDES.set(key, next);
          summary = instance.field + " changed";
        }
      }
      return json(res, 200, { summary, ...describeSettings(guild) });
    }
    return json(res, 200, describeSettings(guild));
  }
  if (url.pathname === "/api/auth/logout") {
    state = "signed-out";
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/api/auth/login") {
    // No Discord round-trip locally; land straight in the signed-in state.
    state = "full";
    res.writeHead(302, { Location: "/dashboard" });
    return res.end();
  }

  // The `/u/:token` rewrite from vercel.json. The page reads the token off the path itself, so
  // without this the link shape cannot be exercised locally at all.
  // The `/np/:token` rewrite likewise: the overlay reads its link off the path.
  if (url.pathname.startsWith("/np/")) {
    const body = await readFile(path.join(ROOT, "np.html"));
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    return res.end(body);
  }

  // The /servers/:id rewrite: the page reads the server id off the path itself.
  if (url.pathname.startsWith("/servers/")) {
    const body = await readFile(path.join(ROOT, "server.html"));
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    return res.end(body);
  }

  if (url.pathname.startsWith("/u/")) {
    const body = await readFile(path.join(ROOT, "passport.html"));
    res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-store" });
    return res.end(body);
  }

  // cleanUrls, matching vercel.json — /dashboard has to resolve to dashboard.html here too.
  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!path.extname(file)) file += ".html";

  // Resolved and then checked to be inside ROOT, so a ../ in the path can't read the repo.
  const target = path.resolve(ROOT, `.${file}`);
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`website dev server on http://localhost:${PORT} (state: ${state})`);
  console.log(
    "states: full (default), new, signed-out, free (not entitled, for sale), unsold (not entitled, nothing for sale)"
  );
});
