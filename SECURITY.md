# Security policy

## Reporting a vulnerability

**Please don't open a public issue or pull request for a security problem.**

Use GitHub's private reporting instead: on this repository, open the **Security** tab and choose
**Report a vulnerability**. It reaches the maintainers only. If that isn't available to you, message
a maintainer in the [support server](https://discord.gg/nMJJ8PAcD9) and ask for a private channel,
without describing the problem in public.

Please include what you found, where (a URL, a file and a line), how to reproduce it, and what you
think an attacker could do with it. Never include, or test with, other people's data or accounts.

You'll get an answer within a few days. We'll tell you when it's fixed and, if you want, credit you.

## What's in scope

- The code in this repository, and the site it produces at <https://playvibe.gg>: the pages, the
  serverless functions under `website/api/`, the session handling, the Discord sign-in, and what the
  site reads and writes in the database.

## What isn't

- Discord itself, Vercel, MongoDB, or any other service the project uses: report those to their
  owners.
- Findings that need a stolen device or a browser you already control, denial-of-service by volume,
  and missing headers with no demonstrated impact. (The site sends a Content-Security-Policy; it is in
  `website/vercel.json`. A way around it is in scope.)
- The bot's own code and hosting, which aren't in this repository. If you found something there,
  the private route above still reaches us.

## What this repository holds

No secrets. The site's credentials (Discord client secret, session key, database URI) are set on
the host and never committed. If you find one in this repository or its history, that is a
vulnerability: report it as above.
