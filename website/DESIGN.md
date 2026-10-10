# Vibe website: design notes

The working document of the site's redesign. It records what the site looked like before, what is
wrong with it, what every page has to carry, and the rules the new design has to keep. Later
sections (direction, tokens, components, the CSS layout) are added as each one is decided.

Status: **every page is on the new system; `styles.css` is deleted. QA (phase 6) is next.**

## 1. Baseline

Measured on the local dev server (`npm run dev:web`), 6 October 2026.

### Pages and states captured

Full-page screenshots at 375, 768, 1280 and 1920 px wide, kept out of the repository in
`.revamp/baseline/` (ignored by git and by the deploy).

| File prefix | Route | State |
|---|---|---|
| `home` | `/` | |
| `commands` | `/commands` | |
| `privacy`, `terms` | `/privacy`, `/terms` | |
| `dashboard` | `/dashboard` | signed in, an account with history |
| `dashboard-new` | `/dashboard` | signed in, a brand-new account |
| `dashboard-signed-out` | `/dashboard` | signed out |
| `servers` | `/servers` | signed in |
| `server` | `/servers/<id>` | signed in, administrator |
| `passport` | `/u/<token>` | public |

### Lighthouse, home page, mobile preset

| | Score |
|---|---|
| Performance | 100 |
| Accessibility | 96 |
| Best practices | 100 |
| SEO | 100 |

| Metric | Value |
|---|---|
| First contentful paint | 1.1 s |
| Largest contentful paint | 1.5 s |
| Total blocking time | 0 ms |
| Cumulative layout shift | 0 |
| Page weight | 110 KiB |

The dev server sends no compression and no cache headers, so the absolute times are pessimistic
next to production; the scores are the comparison that matters. What Lighthouse flagged:

- **Contrast**: "Add" on the Vibe 2 row is `#4577b8` on the ground, 4.29:1 at 14 px. Below AA.
- **CSS**: the one stylesheet is 59.5 KB unminified and render-blocking; about 49 KB of it is unused
  on the home page, because the dashboard's rules ship to every visitor. The budget for the home
  page is 40 KB.

### Measured defects

- `/servers/<id>` scrolls sideways on a phone: the document is 604 px wide in a 375 px viewport.
  The section tabs do not wrap or scroll inside their own row.
- `/commands` prints `**boost**` with the asterisks: the generator escapes the text and converts
  backticks, but not bold.
- The stylesheet uses 14 different corner radii and 23 different font sizes, and `!important` nine
  times (seven of them on `/commands`, to beat the legal page's rules it borrows).

## 2. Critique

The site is not broken. It is careful, accessible and fast, and its copy is honest. What it lacks is
a point of view: it reads as a competent default, and the product it describes is better looking
than the page describing it.

### Hierarchy

- The hero promises "a music bot with a player" and then shows a small card with a logo where the
  artwork goes, a title that says "Whatever you queued" and no queue. The real player has artwork,
  a queue rail, a transport bar and people in it. The page's one argument is made with a
  placeholder.
- After the hero, every section has the same weight: a 34 px heading, a grey paragraph, a grid of
  boxes. Seven features are presented as equals, so the player (the reason to choose Vibe) sits
  beside "Everything else".
- The page ends on "Being worked on", a dashed box with one bullet. The last thing a visitor reads
  is what does not exist yet, and there is no closing invitation to add the bot.
- On the signed-in pages there are three competing heading styles (page title, small-caps group
  label, 20 px section title) with little difference in size between the last two and body text.

### Type

- One family, which is fine, but no scale: sizes were chosen per rule (10, 11, 12, 13, 14, 15, 16,
  17, 19, 20, 22, 24, 27, 30, 32, 34, 38, 40 px and two fluid ranges). Neighbouring steps differ by
  a pixel, so nothing reads as a deliberate level.
- Weight does all the work: 600 for every heading at every size. Large display type and 17 px card
  titles have the same colour, weight and tracking.
- Body copy in the feature cards is 15 px grey at 1.55; on a phone that is a long run of small,
  low-emphasis text. Legal pages set 16 px grey text for thousands of words.
- Uppercase tracked labels ("MUSIC FOR DISCORD", "NOW PLAYING", "SIGNED IN AS", "YOU",
  "APPEARANCE") are used as decoration above content that already has a heading.

### Spacing and layout

- No spacing scale. Section padding is 80 px, the hero 92/104, cards 24/22, gaps 20, 28, 40, 44, 46,
  52: each value was picked where it was needed.
- A single 1080 px column for everything. At 1920 px the page is a narrow strip with 420 px of empty
  ground either side, and nothing uses the width.
- The "asymmetric" feature grid is two wide cards, three narrow, then two narrow with a hole. The
  three-across row has cards of very different text length stretched to one height.
- `/commands` inherits the home page's `section { padding: 80px 0 }`, so each group of commands is
  separated by roughly 250 px of nothing; the page is 4,600 px tall for 38 short rows.
- In the dashboard, the background pickers reserve height and then sit indented and low, detached
  from the heading they belong to; the player's colour row wraps a checkbox onto the same line as
  the swatches.

### Colour

- The palette is right and worth keeping: a near-black ground, warm off-white ink, one rose accent.
  Text contrast was tuned with care.
- The accent is not used sparingly. It is the eyebrow, the button, every inline command, every
  link, the seek bar, the play button and a tint over the whole top of the page. When everything
  warm is the accent, the "Add" button is not special.
- Surfaces are nearly indistinguishable: cards are the ground plus 1.5% white with an 8% border.
  Depth is carried only by hairlines, so the page looks like a wireframe of boxes.

### Density

- The home page is 3,900 px tall on desktop and 6,500 px on a phone, almost all of it paragraphs.
  A visitor deciding in ten seconds meets about 600 words before the second call to action.
- The reverse on signed-in pages: single controls float in wide rows with a lot of air, so the
  dashboard feels long without holding much.

### Imagery

- There is none. `press/` holds real captures of the player, the queue, settings, a rank card and a
  profile, plus a recording of the player in use, and the home page uses none of them.
- The only picture on the site is the hero mock, and the dashboard reuses it as the appearance
  preview, which is the right use for it. As the hero it undersells the product.

### Motion

- Colour transitions on hover (0.15 s) and smooth scrolling, both switched off under reduced motion.
  Nothing moves to explain anything. The product's defining quality (it is live, and in sync) is
  described in words and never shown.

### Mobile

- The navigation wraps to two rows of five small links with no clear primary action; link targets
  are well under 44 px tall.
- The hero's player drops below the fold: the first screen on a phone is a headline, a paragraph and
  two buttons, with no product in sight.
- Instance rows restack into three left-aligned lines each, and "Add" loses its place as the action.
- Sideways scroll on the server settings page (above).

### Structure of the code

- One 2,129-line stylesheet holds the marketing page, the legal pages, the commands page, the
  dashboard, the server settings, the passport and the appearance previews, in the order they were
  written. Later sections override earlier ones (`.dash section` undoes `section`), and two inline
  SVG backgrounds account for about 9 KB that only the dashboard needs.
- The home page pays for all of it.

### What to keep

- The palette and the single family, as the base for the new tokens.
- The copy's honesty: what is free, the five permissions, "it can't read your messages".
- Everything already done for accessibility: the skip link, focus rings, `color-scheme: dark`,
  reduced motion, the reserved heights that prevent layout shift on the dashboard.
- The preview components in the dashboard, which share their classes with the pickers so the two
  cannot disagree.

## 3. Content inventory

What each page carries today. The redesign may reorder, merge and shorten; it may not drop a fact
without a decision.

### Home (`/`)

- Navigation: Commands, Features, Add to server, Support, Your profile.
- Hero: what Vibe is, `/watch`, the "Add Vibe to Discord" action, a secondary link to the features,
  and the free / five permissions / no message access note.
- Seven features: the player; DJ roles that also cover the player; boosting a queued song; the
  streamer overlay; listening stats, rank cards and the profile page; recovery when a track or an
  audio server fails; the rest of the commands.
- Add to server: two bots (Vibe and Vibe 2), each with its own invite, and the explanation of why
  there are two. Two more are commented out until they run.
- Seven questions and answers, written to match the support server's FAQ.
- "Being worked on": liked songs and playlists on the profile page.
- Footer: copyright, Terms, Privacy, Support server, Open source, and the disclaimer.
- Head: title, description, canonical, Open Graph and card tags, the share image, structured data
  (a free software application).

### Commands (`/commands`), generated

- Title, a one-line summary, a note that `/help` shows the same list in Discord.
- Jump links to five groups: Playing, Controls, Queue, Liked, Server.
- Per group: a short description, a paragraph of prose, and one row per command (38 in all), each
  with its own anchor.

### Privacy (`/privacy`) and Terms (`/terms`)

- Title, date of last update, a summary callout, then 13 and 12 numbered sections of prose and
  lists, a back link.

### Dashboard (`/dashboard`)

- Signed out: what signing in gives, the sign-in action, what is asked for.
- Signed in: avatar, name, premium chip, sign out; Profile / Servers tabs; level and progress; four
  statistics; badges.
- Appearance (shown only when entitled or on sale): a rank card preview, the card's colour, the
  card's background and its colour and fade; a player preview, the player's colour, a custom
  colour, "prefer a server's theme", the player's background.
- A link to the servers page; what is coming.
- The unsaved-changes bar (Reset, Save).

### Servers (`/servers`) and one server (`/servers/<id>`)

- The list: each server's icon, name, which bots are in it, and one action (open settings or add).
- One server: back link, name, sign out; section tabs (Access, Playback, Messages, Streaming,
  Premium, Each bot); a status line; settings rows with role and channel pickers, on/off switches,
  selects, the overlay link and its actions, the server's player colour; per-bot overrides behind a
  tab per bot.

### Passport (`/u/<token>`)

- Avatar, name, level; four statistics; badges; recently played; playlists that open in place; a
  line inviting the reader to add Vibe.

## 4. Rules the design has to keep

1. **Nothing from anywhere else.** The security policy allows scripts from this site only (plus
   three inline scripts identified by hash), fonts from this site only, and images from this site,
   Discord's CDN and `data:`. So: self-hosted and subset fonts, inline SVG for icons, no analytics,
   no handlers written into attributes. Changing an inline script means updating its hash in
   `vercel.json` in the same change.
2. **Generated regions stay generated.** The navigation, the footer, the mark, `/commands`, the
   sitemap and `lib/generated/` are written by the sync script. They change by changing the script
   and running it, and its check has to pass.
3. **No music service is named** in any public text: copy, alt text, meta tags, structured data,
   `llms.txt`, or text inside an image.
4. **WCAG 2.2 AA at least**: 4.5:1 for text, a visible focus indicator, everything reachable and
   operable by keyboard, reduced motion honoured, real landmarks and heading order, alt text, and
   44 px touch targets.
5. **No build step.** Static HTML, CSS and plain JavaScript.
6. **Behaviour is untouched.** Sign-in, the save bar, the appearance previews, the server settings
   and passport sharing work as they do now, and nothing under `api/` changes. The scripts find
   their elements by class and by `data-` attribute, so those names are part of the contract.
7. **Budgets**, on a throttled phone: 95 or better in all four Lighthouse categories, largest
   contentful paint under 2.0 s, layout shift under 0.02, no render-blocking request to another
   origin, and under 40 KB of CSS on the home page.
8. **The now-playing overlay (`np.*`) is out of scope.**

## 5. Directions

Three mockups of the hero, one feature section and the footer, in `.revamp/directions/` (open
`/.revamp/directions/a.html` on the dev server). All three use the real player: captures of it with
invented songs and generated covers, or a working copy built from its tokens. Outfit stays the only
family in each, because it is the player's own face; they differ in how it is set.

What was taken from the sites studied: a navigation of one quiet row with a single action; a short
headline with the product shown immediately under or beside it; one idea per screen, at a large
scale; captions instead of feature cards. What was left: centred heroes, logo walls, glow effects,
and scroll-driven animation that needs a library.

| | A. Stage | B. Live | C. Slash |
|---|---|---|---|
| Idea | The player is the page. Words above, the capture at full width. | The hero is a player that works: seek, skip, pick, boost. | Vibe told through its commands; the headline is `/watch`. |
| Type | 600 weight, very tight, up to 96 px | 300 against 600 in one headline | 600 display with a monospace second voice for commands |
| Layout | Left-aligned headline, full-bleed stage, a close-up beside three captions | Split hero; then the same state mirrored on two small screens | Split hero with a phone running off the fold; a command list that opens to its screen |
| Player | The wide capture; the phone capture on phones | Rebuilt in HTML and a small script | The phone capture, then captures per command |
| Motion | The stage rises once on load | The seek bar runs; everything else answers the reader | A caret blinks four times; captures fade when a command is opened |
| Accent | Rose `#e05570`, as today | Ember `#ff7a5c` on a warmer ground | Rose, kept for the open command; the main button is ink |
| Cost | Lowest: images and CSS | Highest: about 90 lines of script to keep honest with the real player | Middle: native `<details>`, four captures |

### Chosen: a mix

- **Colour** from A and C: the rose accent on the near-black ground.
- **Headline** from B: "Everyone hears it. Now everyone sees it.", light with one bold phrase, and
  B's "One room, one player" section with two screens that move together.
- **The queue section** from A ("One queue, and everyone can reach it"), with the queue rebuilt as
  its own object, only the songs and their boost buttons, so it does not read as a screenshot.
- **The commands** from C, rewritten as sentences: "Use /play and add songs to the queue by name or
  link." Each command is set as a chip, the way it looks while it is being typed.
- **Type**: Outfit only.

## 6. The system

Everything below is built and shown on one page, `.revamp/system.html`.

### Files

| File | Holds | Loaded by |
|---|---|---|
| `css/core.css` | fonts, tokens, base, layout, and what every area shares: skip link, nav, footer, button, link, command chip, badge, card | every page |
| `css/marketing.css` | hero, stage, facts, feature row, queue, command sentences, the two screens, questions | the home page |
| `css/legal.css` | long-form prose and the command reference | commands, privacy, terms |
| `css/app.css` | fields, select, checkbox, switch, tabs, chips, setting row, save bar, toast; then the page layouts and previews | dashboard, servers, one server, passport |

Two or three requests per page. The home page loads core and marketing: 21.9 KB unminified against a
budget of 40 KB (it was 59.5 KB). `styles.css` is gone; `css/appearance.css` was added for the profile
page only, because its background tiles carry about 9 KB of drawn artwork no other page needs.

Rules of the sheets: values come from tokens; a selector is a single class wherever possible, so
nothing needs `!important` to win. The two exceptions are deliberate and commented: `[hidden]`
(the attribute must beat any display a class sets) and the reduced-motion block.

### Colour

| Token | Value | Use |
|---|---|---|
| ground | `#0b0b0d` | the page |
| surface | `#131317` | an object on the page |
| surface-2 | `#1b1b20` | controls, and anything floating |
| ink | `#f5f2f3` | text |
| ink-2 | `#aba5a9` | supporting text |
| ink-3 | `#8d868b` | captions |
| accent | `#ff295e` | the one action on a screen, a command being typed, what is playing or selected |
| danger | `#ff8a8a` | errors |
| gold | `#f5c542` | premium only |

Contrast, computed for every pair (4.5:1 is the floor):

| Text | on ground | on surface | on surface-2 | on accent-soft |
|---|---|---|---|---|
| ink | 17.68 | 16.66 | 15.42 | 13.90 |
| ink-2 | 8.13 | 7.67 | 7.10 | 6.39 |
| ink-3 | 5.54 | 5.22 | 4.83 | not used (4.35) |
| accent | 5.34 | 5.03 | 4.66 | not used (4.20) |
| danger | 8.67 | 8.17 | 7.56 | 6.81 |
| gold | 12.12 | 11.43 | 10.58 | 9.53 |

The dark text on the accent is 5.31:1 (6.48 on hover). The edge of an input, a select and an off
switch is 3.4:1 against the ground, above the 3:1 asked of a control's boundary. Both supporting
inks were lightened a little from the old sheet so that captions also pass on surface-2.

### Type

Outfit, variable, self-hosted. A major-third scale from a 17 px body.

| Step | Size | Use |
|---|---|---|
| 5 | 40 to 88 px, fluid | the hero headline, weight 300 with one phrase at 600 |
| 4 | 32 to 56 px, fluid | section titles, same treatment |
| 3 | 28 to 36 px, fluid | the command sentences, weight 300 |
| 2 | 24 px | page titles inside the product, 600 |
| 1 | 20 px | sub-headings, 500 |
| 0 | 17 px | body |
| -1 | 15 px | supporting text, labels, navigation |
| -2 | 13 px | captions, times |

Display type is tracked at -0.04em with a line height near 1; headings balance their lines. Body
text is held under 62 characters a line. Commands use the system monospace, which costs no request.

### Space, radii, elevation, motion

- **Space**: 4, 8, 12, 16, 24, 32, 48, 64, 96 px; 72 to 144 px between sections; gutters 20 to 48 px.
- **Radii**: 8 px for controls and thumbnails, 12 px for surfaces, 20 px for the stage, full for
  buttons and pills. No others.
- **Elevation**: a hairline ring for what sits on the page; a ring and shadow for what floats (save
  bar, toast); an accent-tinted glow under the stage and nothing else.
- **Motion**: 120 ms for hover and press, 200 ms for things that open or arrive, 600 ms for the stage
  rising once on load. One easing, out only. Under reduced motion every duration collapses and
  smooth scrolling is off.
- **Breakpoints**: 40rem (the phone layout ends) and 56rem (two columns begin). Type, gutters and
  section spacing are fluid between them.

### Components

Shared: skip link, nav (brand, links, one action; the extra links leave below 40rem so the row never
wraps), footer, button (primary, quiet, small; hover, press, focus, disabled), link, command chip,
badge, card.

Home: hero, stage, facts, feature row, queue, command sentences, two screens with a scrubber,
questions as native `<details>`.

Signed-in: field with label, hint and error; select; checkbox; switch (the existing
`role="switch"` button, now drawn as a track with its word beside it); tabs of both kinds, scrolling
inside their own row on a phone; chips with a full-size remove target; setting row; save bar; toast.

Class names the dashboard's scripts create are kept as they are, so the scripts do not change.

### Checked against the Web Interface Guidelines

Applied: `touch-action: manipulation` and an intentional tap highlight on interactive elements;
`scroll-margin-top` on anchors; safe-area insets on the page gutters; an explicit background and
colour on selects; scroll padding so the save bar cannot cover a focused control. Already met: focus
rings by `:focus-visible`, reduced motion, tabular figures for times, balanced headings, labelled
controls, image dimensions. Not followed, on purpose: Title Case for headings and buttons (the
site's voice is sentence case).

## 7. The home page

Built in `index.html` on `css/core.css` and `css/marketing.css`, with `home.js` for the one
interactive piece.

### Order

1. **Hero**: "Everyone hears it. Now everyone sees it.", one sentence that names `/watch`, the
   action, and the real player at the width of the page (the phone capture on phones), then three
   facts: free, five permissions, cannot read messages.
2. **One queue, and everyone can reach it** (`#features`): the queue as its own object beside three
   short points: seeking, boosting, DJ roles.
3. **Four commands cover most nights**: `/play`, `/watch`, `/rank`, `/config`, each as a sentence
   with the command set as it looks while typed.
4. **One room, one player**: two screens that follow one scrubber.
5. **And it keeps going**: recovery from failures, statistics that follow the person, the streamer
   overlay. Three plain columns.
6. **Questions people ask** (`#faq`): the same seven questions and answers, as native `<details>`.
7. **Add Vibe to your server** (`#add`): the action again, and one line offering Vibe 2 for a
   second queue.

### What changed in the content

- The seven feature cards became sections 2 to 5. Nothing was dropped except "Everything else",
  which the link to `/commands` replaces.
- The two equal bot rows became one action for Vibe (in the nav, the hero and the closing section)
  and a sentence for Vibe 2. When more bots run, they are added to that sentence.
- "Being worked on" left the home page; the dashboard still says what is coming to it.
- The nav lost "Features" and "Add to server" (the page is short enough to scroll, and the action is
  a button) and gained that button.

### Pictures

The home page's pictures of the player are captures of the Activity's own demo mode, with invented
song and artist names and generated covers, so no real recording is shown. All of them come from one
script, so redoing them after the Activity changes is a recipe, not a job.

| File | Size on disk | Weight | Used for |
|---|---|---|---|
| `press/player-wide.webp` | 1920x1080 | about 30 KB | the hero picture from 40rem up |
| `press/player-wide-1100.webp` | 1100x619 | about 15 KB | the same, for narrower screens (`srcset`) |
| `press/player-phone.webp` | 780x1600 | about 29 KB | the hero picture under 40rem |
| `press/art-1.webp` to `art-7.webp` | 360x360 | under 2 KB each | covers in the queue picture and the two screens |
| `press/og-home.jpg` | 1200x630 | about 50 KB | the share image |

**Recipe, when the Activity has been redesigned or its demo changed:**

1. Build the Activity: `npm --prefix activity run build`. The script captures `activity/dist`.
2. Run `node scripts/assets/capture-website-player.js --og`. It serves the built demo with each of
   the fixture's song titles swapped for an invented one (the list is `INVENTED` in the script),
   dumps the page and stops if a real title is still on screen, then photographs the wide window
   (1280x720) and the phone (a 390 px frame inside a 500 px window, because headless Chrome will not
   open a narrower one) at 2x. Each picture is encoded as WebP at the highest quality that fits its
   weight budget, so the pictures keep their size and only the quality moves. `--out <dir>` writes
   elsewhere first, which is how to compare before replacing.
3. Look at the three pictures and the share image. The playing song is `Slow Tide`, 1:12 of 3:33,
   with a queue of six and the third song boosted once of two. If the fixture changes, change what the
   page says about it.
4. Update what imitates the player in HTML: the queue picture in `index.html` (`.queue`, drawn by
   `css/marketing.css` to match the Activity's queue rows) and the two screens. Update the hero's
   `alt` and the queue's `aria-label` to say what the new pictures show, and the `width` and `height`
   attributes if a size moved (layout shift has to stay at or under 0.02).
5. Lighthouse on the home page; the budgets are in section 4.

Why the script does what it does, so it is not undone by accident:

- **Titles are swapped in the served JavaScript, not on the page.** A screenshot cannot run script,
  and a swap after load would miss text that is drawn once. The DOM dump afterwards is the proof.
- **Thumbnails are loaded eagerly and decoded synchronously** (also swapped in the served bundle):
  a screenshot never scrolls, and a lazy or async cover is otherwise left empty some of the time.
- **The covers are drawn in the script** (a palette per number, never an album's artwork). The same
  function draws the tiles, so the page's tiles and the player's covers are one set.
- **Page time is fixed** by the virtual-time budget (`--budget`, 5000 ms by default), so the song's
  position is the same on every run.

**The previews in the signed-in pages** are not pictures: they are HTML and CSS built to imitate the
Activity, so they have to be kept in step by hand when the Activity changes.

- *The player preview on the profile* (`paintPlayerPreview` in `dash/appearance.js`, styles in
  `css/appearance.css`) follows the new layout: the cover leads and its light spreads behind it, the
  words stand beside it, one strip holds the controls with the seek bar as its top edge. Narrow it is
  the phone's shape (the cover across, a strip of two rows); from 35rem of its own width the queue
  becomes a rail. It is retinted by the chosen colour, or the bot's own, through `--accent` and
  `--bg` set inline.
- *The Activity's backdrop tiles* (`css/app.css`, classes `backdrop-live` and `live-<key>`, used by
  the profile and by a server's Premium section) draw what the Activity draws behind its content
  (`.vibe-backdrop--*` in `activity/src/styles/views.css`) at its opacities, with the colour as the
  glow along the top and a progress line and play button in it. The artwork is copied into
  `website/backdrops/` from `activity/src/backdrops/`; copy it again if it changes. `--live-boost`
  multiplies every opacity: 1 in the preview (the Activity's own strength), 2 on a 96 px tile so the
  quietest can be told apart.
- *The rank card's tiles* keep their own artwork (`backdrop-<key>` in `css/appearance.css`) and are
  not the Activity's.

### Measured, on the local dev server, mobile preset

| | Before | After |
|---|---|---|
| Performance | 100 | 100 |
| Accessibility | 96 | 100 |
| Best practices | 100 | 100 |
| SEO | 100 | 100 |
| Largest contentful paint | 1.5 s | 1.7 s |
| Layout shift | 0 | 0 |
| CSS on the page | 59.5 KB | 21.9 KB |
| Page weight | 110 KiB | 115 KiB |

The largest paint is now the capture instead of a line of text, which is the 0.2 s; it stays under
the 2.0 s budget without compression, which production adds.

## 8. Commands, privacy, terms

Moved onto `css/core.css` and `css/legal.css` (3.6 KB; the page loads 15 KB of CSS in all). The text
of the privacy policy and the terms is untouched; only the markup around it changed (`prose`,
`prose-meta`, `callout`).

- One reading column of 46rem and under 62 characters a line; headings are linkable (anchors keep
  their scroll margin); the summary under the title is a quiet panel, not a bordered quote.
- **Commands**: each command is the typed-command chip, in a fixed first column so every description
  starts on the same line; the group links are 44 px pills; rows stack on a phone. The page is
  still generated from `HelpCommand`'s tabs; the generator now also turns `**bold**` into
  `<strong>`, which printed as asterisks before.
- The three pages share the new nav (one action, the extra links leave below 40rem) and the footer
  written by the generator, which leaves out the page you are on. Their share image is the home page's.

Lighthouse (local, mobile): commands, privacy and terms each 100 / 100 / 100 / 100, LCP 1.2 to
1.5 s, CLS 0. No sideways scroll at 375, 768, 1280 or 1920.

## 9. The signed-in pages

Dashboard, servers, one server and the passport, on `css/core.css` + `css/app.css`; the dashboard also
loads `css/appearance.css`. No script changed behaviour: every class a script creates or queries was
kept, and the templates changed only in their markup around them.

- **Profile**: a quiet "Signed in as" line instead of an uppercase label; the level as a thin bar; the
  four statistics as plain columns under a rule (two across on a phone) instead of a boxed grid; badges.
- **Appearance** (only for those entitled): the colour swatches are 44 px targets holding a smaller disc,
  and the chosen one is now ringed. It was not before: the old rule looked for `aria-checked` while the
  script sets `aria-pressed`. The "no background" tile says "None". The previews and tiles share their
  classes, as before.
- **Servers**: one row per server, the action a 44 px button.
- **One server**: the section tabs scroll inside their own row, which ends the sideways scroll at
  375 px (the document was 604 px wide). Switches are real track-and-thumb switches that still say On
  or Off. A row whose control needs room stacks (the old rule gave its text a 260 px *height* there;
  the same trap is guarded again).
- **Passport**: one column, plain statistics, the track list as a single object, playlists as native
  `<details>`.
- **Signed out**: one sentence, one action, one line of reassurance.
- A full-screen floor on the content area keeps the footer below the fold before and after the
  content loads; without it the footer moved and the layout shift was 0.23. It is 0 now.

Exercised on the dev stubs, in the browser pane: a colour pick raises the save bar with its text; Reset
hides it and puts the colour back; a colour and a background saved together persist and clear the bar;
a switch on the server page raises the bar. No console errors.

Lighthouse (local, mobile, signed-in stub state): dashboard 99 / 100 / 79 / 66, servers 100 / 100 / 100 /
63, one server 100 / 99 / 100 / 66, passport 100 / 100 / 79 / 66. Layout shift 0 on all four. The SEO
score is the `noindex` on these pages, on purpose (they are one person's own pages). Best practices 79
is a cookie set by Discord's image host for the stub's avatar; the real avatar comes from the same host.
LCP is 1.5 to 1.7 s except the dashboard at 2.1 s: its heading waits for two data requests and the module
chain; preloading the modules did not move it, so that was left out.

## 10. QA

Run locally on 6 October 2026 against the dev server and its stubs. axe-core was installed in a scratch
folder outside the repository and injected through the DevTools protocol of a headless Chrome (not
through the browser pane's script tool, which cannot carry a 500 KB script); nothing was sent to any
service.

| Check | Result |
|---|---|
| axe (wcag2a, 2aa, 21aa, 22aa, best-practice), 10 page states at 1280, 375 and 320 px | 0 violations after two fixes |
| Horizontal scroll at 320 px (phone emulation) | none after a tighter nav; it overflowed by 15 px before |
| Requests to anything but this site, the Discord CDN or `data:` | none |
| Console errors | none |
| Reduced motion (emulated), every page | no animation running |
| Keyboard: Tab through home, commands, server settings and dashboard | every stop has a visible ring; scrub, FAQ (Enter and Space) and a switch (Space) work |
| Forced colours (Windows high contrast, emulated) | edges, selection and fills drawn with system colours (rules added) |
| Zoom to 200% | covered by the 320 and 375 px layouts (200% of 1280 is a 640 px viewport) |
| Lighthouse, mobile, public pages | 100 / 100 / 100 / 100 on home, commands, privacy, terms; LCP 1.4 to 1.7 s; CLS 0 |
| Lighthouse, signed-in pages | see section 9; SEO is low there because they are `noindex` |

Fixed in QA: the bot panel on the server page was an `article` with `role="tabpanel"` (not an allowed
role: now a `div`); the nav overflowed at 320 px; the command chips' tap area was 26 px (now 44 px
without changing the chip); the colour input on a server's Premium section was only styled on the
profile page (its rules moved to `app.css`); forced-colour rules added.

Not done: a pass with a real screen reader (NVDA, VoiceOver); a real browser at 320 px wide with a
desktop scrollbar (it overflows by 8 px there; phones have overlay scrollbars); a real sign-in.
