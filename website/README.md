# Vibe — website

The landing page, the legal pages, and the signed-in dashboard. Deployed to Vercel with **this
directory as the project root**, which is the single fact that explains most of the structure
here: nothing under `../src` is in the bundle, so nothing here can import from it.

```
index.html  privacy.html  terms.html   static pages
dashboard.html + dashboard.js          the signed-in page, rendered in the browser
api/                                   Vercel serverless functions (Node)
lib/                                   shared function code — session, Discord, Mongo
lib/generated/                         written by ../scripts/sync-web-shared.js — do not edit
```

*Maintainers only:* deploy with `npm run deploy:web` **from the private repository's root**, not
from here (the public mirror has no deploy script; contributors never deploy). It refuses to run if
`website/` has uncommitted or untracked changes — `vercel deploy` uploads the directory, not the
commit — and if `lib/generated/` is out of date (run `npm run sync:web` and commit first). Then it
deploys to production and re-points the `playvibe.gg` alias: Vercel gives every deployment its own
URL and rejects `*.vercel.app` as a project domain, so without the alias step the site silently
keeps serving the previous build.

## Environment variables

Set these on the Vercel project (Settings → Environment Variables), not in a file — `.env*` is
gitignored here and Vercel does not read one from the repo anyway.

| Variable | What it is |
|---|---|
| `DISCORD_CLIENT_ID` | The **flagship** application's client ID. Only Vibe needs a login. |
| `DISCORD_CLIENT_SECRET` | Same application, OAuth2 → Client Secret. Server-side only. |
| `SESSION_SECRET` | Any random string of 32+ characters. Rotating it signs everyone out. |
| `MONGO_URI` | The same cluster the bots use. Needs **read plus write on two fields** — see "Database access" below. |
| `GUILD_API_SECRET` | Optional; without it the per-server settings page (`/servers/<id>`) answers "not available yet". The same random value as the flagship's `GUILD_API_SECRET` (`openssl rand -hex 32`): the website calls the bot's `/internal/guild-settings` with it, so the site needs **no bot token**. |
| `BOT_API_ORIGIN` | Optional. Where that call goes; defaults to `https://api.playvibe.gg`. |
| `SITE_ORIGIN` | Optional. Pins the OAuth redirect origin; without it the origin is derived from the request, which is what makes preview deployments work. |

In the Developer Portal, add the redirect URI under **OAuth2 → Redirects**:
`https://playvibe.gg/api/auth/callback` (plus your preview origin if you want logins to
work there). Discord matches redirect URIs exactly, so the trailing path must match character for
character.

## Auth model

`identify` and `guilds`, nothing else. The login redirect issues a CSRF `state` in a short-lived
cookie; the callback exchanges the code **server-side** so the client secret never reaches a
browser, then stores an AES-256-GCM-encrypted, `HttpOnly` session cookie holding the user's id,
display name, avatar hash and Discord access token.

There is deliberately **no session collection**. The trade and its consequences are argued in
`lib/session.js` — the short version is that instant revocation is not worth a database
round-trip per request here, and a session that is stored nowhere is a session that `/privacy`
has nothing to delete.

## Database access

The site is not read-only. Everything it writes is a setting the signed-in person is changing
about themselves, or about a server they administer:

- **Six appearance fields on their own user document** — `rankCardAccent`, `rankCardBackground`,
  `rankCardBackgroundColor`, `rankCardFade`, `activityAccent` and `activityBackground`. The first
  four are the card `/rank` draws; the last two are the player `/watch` opens. **This is the only
  write path for any of them** — no slash command writes an appearance setting — so the check
  behind it, in `lib/entitlements.js`, is the only place that decides who may write. That module
  is the one thing in this repository that differs from production: the copy here is open
  (everything allowed), so the whole interface can be tested without a subscription, and the
  production site runs a different implementation of the same functions.
- `guildInstances.overrides.*` — per-bot settings for a server **they administer**, re-checked
  against Discord on every request rather than trusted from the session. Which three fields, and
  why that is narrower than the bot's own list, is in `lib/overrides.js`.

Nothing else. Listening statistics, the listening history, favourites, playlists, passports and
the shared guild config are the bot's to maintain, and a second writer would mean a second set of
rules about them. The site *reads* several of those — the profile page, and the public passport —
but writes none.

## Why the site holds no bot token

Configuring "which voice channels this bot may join" needs the server's channel list, and there is
no OAuth scope that grants it — only a **bot token** can read `/guilds/{id}/channels`. Putting bot
tokens on a static-site host to render a dropdown is a bad trade: it is the most powerful
credential in the project, and there would have to be one per instance.

So the per-server page (`/servers/<id>`) asks **the bot**: `api/guild-settings.js` calls the bot's
`/internal/guild-settings` endpoint with the shared `GUILD_API_SECRET`, and the bot answers with the
server's settings and the roles and channels to offer, and applies a change with its own
validation. The site checks who is asking (a session, and administrator rights re-read from
Discord) before it forwards anything.

## Known gaps

- **No Content-Security-Policy header yet.** The site has never had one; adding it is a separate,
  testable change rather than something to slip in alongside auth.
- Saved tracks and playlists are not shown. They are the large field on the user document and
  nothing on the page needed them yet.
