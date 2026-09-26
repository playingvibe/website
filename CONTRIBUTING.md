# Contributing

Thank you for helping. This repository is the website of [Vibe](https://playvibe.gg); the bot is a
separate, private project.

## Ways to help

- **Report a bug** with the bug template: what you did, what you saw, what you expected, and the
  browser. A screenshot of the page helps more than a paragraph.
- **Suggest something** with the feature template. Say what problem it solves before what it looks
  like.
- **Send a pull request.** For anything bigger than a typo, open an issue first so nobody builds
  something the maintainers can't take. Small fixes (copy, accessibility, layout, a wrong link) can
  go straight to a pull request.

Security problems do not go in an issue: see [SECURITY.md](SECURITY.md).

## Set up

```bash
npm ci
npm run dev        # http://localhost:4321, no secrets needed (see README)
```

## Before you open a pull request

- `npm run lint` passes with no warnings.
- `npm run test:offline` passes, and `npm test` too if you can run an in-memory MongoDB. If you
  couldn't, say so in the pull request.
- You checked the page in the dev server, on a narrow (phone) width and on a wide one, and in light
  and dark if the page has both.
- One change per pull request, with a description of what changed and why.

CI runs the same checks on every pull request, with no access to any secret.

## Style

- Plain HTML, CSS and ES modules. No build step and no new dependency without a good reason: the site
  is deployed as it stands.
- Match the code around your change: naming, comment density, formatting.
- A comment records a reason the code cannot show (an ordering, a quirk, a trade-off). It does not
  restate the code.
- Commit messages use a short conventional prefix (`fix(web): ...`, `feat(web): ...`, `docs: ...`).

## Please don't edit generated files

`website/lib/generated/*` and `website/commands.html` are generated from the bot's code, which is not
here. Describe the change you want in the pull request and a maintainer will make it at the source.

## What you can rely on when you contribute

- **Your work stays yours, under the repository's licence.** By opening a pull request you confirm
  that you wrote the change (or have the right to submit it), and you license it under the
  repository's [MIT licence](LICENSE).
- **Don't include anything you don't have the right to.** No copied images, fonts or text from
  elsewhere, and no third-party logos or trademarks. If a change includes AI-generated text or art,
  say so in the pull request.
- **The Vibe name and logo aren't covered by the MIT licence** (see the README). A pull request is
  not a licence to use them elsewhere.
- **Reviews.** A maintainer reviews every pull request. Changes are re-applied to the maintainers'
  private repository, which is the source of truth, and the next publish carries them back here (see
  the README, "How changes flow").

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
