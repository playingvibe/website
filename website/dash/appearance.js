import { DEFAULT_BACKGROUND_COLOR, resolveCardFade } from "../lib/generated/cardBackgrounds.js";
import { formatHours, renderSignedOut, note } from "./shared.js";
import { dirty, clean } from "./saveBar.js";

/**
 * The appearance settings. Loaded after the profile has painted rather than alongside it — the
 * stats are what someone came for, and neither of these should be able to delay them.
 *
 * **Three states, and the group starts hidden in the markup.**
 *
 * | | not for sale | for sale |
 * |---|---|---|
 * | **not entitled** | hidden entirely | shown greyed out, with the "premium feature" notes |
 * | **entitled** | working | working |
 *
 * Hidden until the answer arrives rather than hidden once it does, so a page that is not going to
 * offer the settings never flashes them first — and a failed lookup leaves them hidden, because a
 * greyed-out control advertising something nobody can buy is worse than no control. The server
 * refuses the write in every non-entitled state; this only decides what is drawn.
 * @param {HTMLElement} host
 * @param {NodeListOf<HTMLElement>} [group] - Every element of the Appearance group.
 * @returns {Promise<void>}
 */
export async function renderCardStyle({
  host,
  backdropHost,
  colourHost,
  activityHost,
  activityBgHost,
  playerHost,
  preview,
  group = [],
}) {
  let data;
  try {
    data = await (await fetch("/api/appearance")).json();
  } catch {
    return;
  }
  if (!data?.palette) return;

  const show = Boolean(data.entitled || data.forSale);
  for (const element of group) element.hidden = !show;
  if (!show) return;

  let current = data.accent;
  let currentBackground = data.background ?? null;
  let currentBackgroundColor = data.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  // `null` until the switch is touched, so the card follows whichever style is picked.
  let currentFade = data.fade ?? null;

  /**
   * A live preview of the card.
   *
   * **An approximation, and the page says so.** The real card is drawn by the bot with node-canvas
   * — the browser cannot run that, and rendering previews server-side would mean an endpoint, a
   * cache and an auth story for something people glance at for two seconds. What this has to get
   * right is the decision being made here: how the chosen colour and background look together, and
   * whether the accent still reads against them. Layout fidelity beyond that is not the point.
   *
   * It reuses the very same `.backdrop-*` background classes as the tiles, so a preview can never
   * disagree with the swatch it sits above.
   */
  const paintPreview = () => {
    if (!preview?.host) return;

    const card = document.createElement("div");
    card.className = currentBackground
      ? `preview-card backdrop-${currentBackground}`
      : "preview-card";
    card.style.setProperty("--bg", currentBackgroundColor);
    // Through the same resolver the bot uses, so an untouched switch previews the style's default
    // rather than this page's guess at it.
    if (currentBackground) {
      card.classList.add(
        resolveCardFade(currentBackground, currentFade) ? "backdrop-fade" : "backdrop-even"
      );
    }
    // The accent glow is drawn by the bot *only* on the plain card, because over a background it
    // becomes a second tinted light in the same corner. The preview has to follow that rule or it
    // would show a card nobody can actually get.
    card.classList.toggle("preview-glow", !currentBackground);
    card.style.setProperty("--card-accent", current || "var(--accent)");

    const avatar = document.createElement("img");
    avatar.className = "preview-avatar";
    avatar.src = preview.user.avatar;
    avatar.alt = "";

    const body = document.createElement("div");
    body.className = "preview-body";

    const name = document.createElement("p");
    name.className = "preview-name";
    name.textContent = preview.user.username;

    const lvl = document.createElement("p");
    lvl.className = "preview-level";
    lvl.textContent = `LEVEL ${preview.level.level}`;

    const track = document.createElement("div");
    track.className = "preview-track";
    const fill = document.createElement("div");
    fill.className = "preview-fill";
    fill.style.width = `${Math.round((preview.level.progress ?? 0) * 100)}%`;
    track.append(fill);

    const stats = document.createElement("div");
    stats.className = "preview-stats";
    for (const [value, label] of [
      [formatHours(preview.stats.listeningHours), "listening time"],
      [String(preview.stats.currentStreak ?? 0), "day streak"],
      [String(preview.stats.sessionCount ?? 0), "tracks"],
    ]) {
      const cell = document.createElement("div");
      const v = document.createElement("span");
      v.className = "preview-stat-value";
      v.textContent = value;
      const l = document.createElement("span");
      l.className = "preview-stat-label";
      l.textContent = label;
      cell.append(v, l);
      stats.append(cell);
    }

    body.append(name, lvl, track, stats);
    card.append(avatar, body);
    preview.host.replaceChildren(card);
  };

  /**
   * Updates the swatches' selected state in place. Replaced by `paint()`; a no-op until then.
   *
   * Exists for the same reason `paintActivity()`'s own `refresh()` does, and the rank-card half
   * simply never got it: repainting from inside a control's own handler destroys the element the
   * user just activated, and focus falls to `<body>`. A keyboard user trying three colours tabbed
   * from the top of the page three times.
   */
  let refreshSwatches = () => {};

  const paint = () => {
    const swatches = data.palette.map((entry) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.style.setProperty("--swatch", entry.value);
      swatch.title = entry.name;
      // A toggle button, not an ARIA radio: these sit in a group that also holds a reset button,
      // and nothing here implements the arrow-key movement `role="radio"` promises. `aria-pressed`
      // describes what this actually is.
      swatch.setAttribute("aria-pressed", String(current === entry.value));
      swatch.setAttribute("aria-label", entry.name);
      swatch.disabled = !data.entitled;
      swatch.addEventListener("click", () => choose(entry.value));
      return swatch;
    });

    const reset = resetButton();

    refreshSwatches = () => {
      for (const [i, swatch] of swatches.entries()) {
        swatch.setAttribute("aria-pressed", String(current === data.palette[i].value));
      }
      reset.disabled = !data.entitled || current === null;
    };

    host.replaceChildren(...swatches, reset);

    if (!data.entitled) host.append(note("Rank-card colours are a premium feature."));
    refreshSwatches();
    paintPreview();
  };

  const resetButton = () => {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "swatch-reset";
    reset.textContent = "Use the bot's colour";
    reset.disabled = !data.entitled || current === null;
    reset.addEventListener("click", () => choose(null));
    return reset;
  };

  // What the server currently holds. `current` / `currentBackground` are what is on screen; the
  // difference between the two pairs is the entire definition of "unsaved".
  let savedAccent = data.accent;
  let savedBackground = data.background ?? null;
  let savedBackgroundColor = data.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  let savedFade = data.fade ?? null;
  let currentActivity = data.activityAccent ?? null;
  let savedActivity = data.activityAccent ?? null;
  let currentActivityBg = data.activityBackground ?? null;
  let savedActivityBg = data.activityBackground ?? null;
  // Whether a server's own guild-tier theme wins over this personal accent, in every server that
  // has one. Meaningless without a personal accent set, but stored independently of it — turning
  // this on and then clearing the accent should not silently turn it off again.
  let currentPreferServerTheme = data.preferServerTheme === true;
  let savedPreferServerTheme = data.preferServerTheme === true;

  /**
   * A live mock of the player `/watch` opens, retinted by the colour and background chosen below.
   *
   * The landing page's hand-built `.player` is the thing reused: it is drawn from the same tokens
   * as the Activity, and `player.css` derives every surface from one accent through `color-mix()`,
   * so a static mock is faithful in a way the rank card's canvas preview cannot be. The backdrop
   * is the same `.backdrop-*` class the tiles use. Roughly the real thing, and the caveat beside it
   * says so: the real player has artwork, a queue and a transport nobody can predict from here.
   */
  const paintPlayerPreview = () => {
    if (!playerHost) return;

    const svg = (tag, attrs = {}) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };
    const text = (tag, className, content) => {
      const el = document.createElement(tag);
      el.className = className;
      el.textContent = content;
      return el;
    };

    const mock = document.createElement("div");
    mock.className = currentActivityBg
      ? `player-preview backdrop-${currentActivityBg} backdrop-even`
      : "player-preview";
    // Both, as the tiles do: `--accent` tints the controls, `--bg` the backdrop.
    const accent = currentActivity ?? DEFAULT_BACKGROUND_COLOR;
    mock.style.setProperty("--accent", accent);
    mock.style.setProperty("--bg", accent);
    mock.setAttribute("role", "img");
    mock.setAttribute("aria-label", "Preview of your player colours");

    const div = (className, ...children) => {
      const el = document.createElement("div");
      el.className = className;
      el.append(...children);
      return el;
    };
    const icon = (d, className = "ctl") => {
      const el = svg("svg", { class: className, viewBox: "0 0 24 24", "aria-hidden": "true" });
      el.append(svg("path", { d }));
      return el;
    };
    const art = (className) => {
      const el = div(className);
      const mark = svg("svg", { viewBox: "0 0 1254 1254", "aria-hidden": "true" });
      mark.append(svg("path", { d: "M 877 349 L 858 344 L 835 344 L 817 348 L 792 361 L 773 379 L 765 390 L 754 410 L 666 623 L 653 646 L 646 653 L 641 655 L 632 653 L 624 643 L 620 634 L 550 415 L 538 390 L 527 377 L 518 370 L 506 364 L 490 360 L 464 360 L 449 363 L 424 373 L 406 385 L 392 399 L 380 419 L 376 434 L 376 452 L 379 465 L 409 537 L 436 608 L 536 884 L 548 909 L 563 930 L 575 940 L 589 947 L 608 950 L 626 948 L 650 938 L 669 925 L 690 904 L 705 885 L 731 843 L 753 799 L 910 457 L 917 439 L 920 424 L 920 404 L 916 388 L 905 369 L 892 357 Z" }));
      el.append(mark);
      return el;
    };
    const seek = document.createElement("div");
    seek.className = "seek";
    seek.append(document.createElement("span"));

    const play = div("play", icon("M8 5v14l11-7z", ""));
    const controls = div(
      "controls",
      icon("M6 6h2v12H6zm3.5 6 8.5 6V6z"),
      play,
      icon("M16 6h2v12h-2zM6 18l8.5-6L6 6z")
    );

    // The desktop window: the main area and the queue rail above, the transport bar below. On a
    // narrow container the rail, the mini track and the volume drop away (see `.player-preview`
    // in styles.css), leaving the vertical player the phone layout is.
    const queue = div(
      "pp-queue",
      text("p", "pp-queue-title", "Up next · 3"),
      ...["Next in your queue", "Another song", "One more"].map((title, i) =>
        div(
          "pp-row",
          div("pp-thumb"),
          text("span", "pp-row-title", title),
          text("span", "pp-row-time", ["3:45", "4:12", "2:58"][i])
        )
      )
    );

    const stage = div(
      "pp-stage",
      div(
        "pp-main",
        art("art"),
        text("p", "player-eyebrow", "Now playing"),
        text("p", "track", "Whatever you queued"),
        text("p", "artist", "Playing in your voice channel")
      ),
      queue
    );

    const transport = div(
      "pp-transport",
      controls,
      div("pp-timeline", text("span", "pp-time", "1:47"), seek, text("span", "pp-time", "4:18"))
    );
    const bar = div(
      "pp-bar",
      div("pp-mini", art("pp-mini-art"), div("pp-mini-text", text("p", "track", "Whatever you queued"), text("p", "artist", "Your voice channel"))),
      transport,
      div("pp-volume", icon("M4 9v6h4l5 4V5L8 9H4z"), div("pp-volume-track", document.createElement("span")))
    );

    mock.append(stage, bar);
    playerHost.replaceChildren(mock);
  };

  /**
   * Stages both rank-card fields as **one** pending change.
   *
   * One id, not two, because they share an endpoint and a document: changing a colour and a
   * background is one edit to one card, and saving it should be one request rather than two.
   *
   * **Only the fields that actually differ are sent.** The endpoint writes exactly the keys it
   * receives, so a body carrying both every time would mean changing a colour silently rewrote the
   * background to whatever this page last happened to know.
   *
   * **A 402 gets its own message.** "Try again" is wrong for a refusal that can never succeed, and
   * the disabled state on the controls is only cosmetic — anyone can re-enable a button in
   * devtools, so this is the path a determined click actually takes. The server refuses before it
   * parses or writes anything; this only explains the refusal honestly.
   */
  const stage = () => {
    paintPlayerPreview();
    const changed =
      current !== savedAccent ||
      currentBackground !== savedBackground ||
      // Only counts while a style is actually chosen: the colour is meaningless on the plain card,
      // and letting it mark the form dirty would mean a bar that cannot be explained.
      (currentBackground !== null && currentBackgroundColor !== savedBackgroundColor) ||
      (currentBackground !== null && currentFade !== savedFade) ||
      currentActivity !== savedActivity ||
      currentActivityBg !== savedActivityBg ||
      currentPreferServerTheme !== savedPreferServerTheme;

    if (!changed) {
      clean("rank-card");
      return;
    }

    dirty("rank-card", {
      revert: () => {
        current = savedAccent;
        currentBackground = savedBackground;
        currentBackgroundColor = savedBackgroundColor;
        currentFade = savedFade;
        currentActivity = savedActivity;
        currentActivityBg = savedActivityBg;
        currentPreferServerTheme = savedPreferServerTheme;
        paint();
        paintActivity();
        paintActivityBg();
        paintBackdrops();
        paintPlayerPreview();
      },
      save: async () => {
        const body = {};
        if (current !== savedAccent) body.accent = current;
        if (currentBackground !== savedBackground) body.background = currentBackground;
        if (currentBackground !== null && currentBackgroundColor !== savedBackgroundColor) {
          body.backgroundColor = currentBackgroundColor;
        }
        if (currentBackground !== null && currentFade !== savedFade) body.fade = currentFade;
        if (currentActivity !== savedActivity) body.activityAccent = currentActivity;
        if (currentActivityBg !== savedActivityBg) body.activityBackground = currentActivityBg;
        if (currentPreferServerTheme !== savedPreferServerTheme) body.preferServerTheme = currentPreferServerTheme;

        const response = await fetch("/api/appearance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => null);

        // **One note, not a pile of them.** Appending a paragraph per failed save would leave
        // three identical sentences stacked under the section, and none would go away — not even
        // after a save succeeded, which would make a working page look broken.
        host.querySelector(".section-note--save")?.remove();

        if (!response?.ok) {
          // **A 401 means the session went, not that the save failed.** Telling someone to try
          // again is advice that can never work: every retry is another 401, and the only remedy
          // is signing in — which is what the signed-out view offers.
          if (response?.status === 401) {
            renderSignedOut();
            return false;
          }
          const message = note(
            response?.status === 402
              ? "That's a premium feature. Your card is unchanged."
              : "That couldn't be saved. Try again."
          );
          message.classList.add("section-note--save");
          host.append(message);
          return false;
        }

        // **Assigned from `body`, not from the current state.** The body is built conditionally —
        // the colour and the fade are only sent while a background style is chosen — but this
        // assigned all six unconditionally, so clearing the background recorded the colour as
        // saved although it was never sent. The next edit then thought it matched the server and
        // left it out, and the value silently never reached the database.
        if ("accent" in body) savedAccent = body.accent;
        if ("background" in body) savedBackground = body.background;
        if ("backgroundColor" in body) savedBackgroundColor = body.backgroundColor;
        if ("fade" in body) savedFade = body.fade;
        if ("activityAccent" in body) savedActivity = body.activityAccent;
        if ("activityBackground" in body) savedActivityBg = body.activityBackground;
        if ("preferServerTheme" in body) savedPreferServerTheme = body.preferServerTheme;
        return true;
      },
    });
  };

  const choose = (accent) => {
    current = accent;
    // In place: a full repaint here would delete the swatch that was just clicked.
    refreshSwatches();
    paintPreview();
    stage();
  };

  const chooseBackground = (key) => {
    currentBackground = key;
    refreshBackdrops();
    // Rebuilt rather than refreshed, because whether it exists at all depends on a style being
    // selected. Safe from here: the click was on a tile, never on the colour control itself.
    paintColour();
    paintPreview();
    stage();
  };

  /**
   * The style tiles, plus a "None" that is a real choice rather than a cancel — it is what
   * everybody starts with, and clearing back to it has to be as easy as picking one.
   *
   * **Previewed in CSS rather than with a rendered image.** The card is drawn by the bot with
   * node-canvas, which the browser cannot run, and rendering previews server-side would mean an
   * endpoint and a cache for something the viewer only glances at. A gradient plus the mark as a
   * tiled SVG gets the *shape and the colour* across, which is the decision being made here. It is
   * an approximation, and deliberately so.
   */
  /** Updates the tiles' selected state, tint and fade in place. Replaced by `paintBackdrops()`. */
  let refreshBackdrops = () => {};

  const paintBackdrops = () => {
    if (!backdropHost) return;
    if (!data.backgrounds?.length) {
      backdropHost.replaceChildren(note("Backgrounds are unavailable right now."));
      return;
    }

    const none = document.createElement("button");
    none.type = "button";
    none.className = "backdrop backdrop-none";
    none.title = "No background";
    none.setAttribute("aria-label", "No background");
    none.disabled = !data.entitled;
    none.addEventListener("click", () => chooseBackground(null));

    const tiles = data.backgrounds.map((entry) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = `backdrop backdrop-${entry.key}`;
      tile.title = entry.description ?? entry.name;
      tile.setAttribute("aria-label", entry.name);
      tile.disabled = !data.entitled;
      tile.addEventListener("click", () => chooseBackground(entry.key));
      return tile;
    });

    refreshBackdrops = () => {
      none.setAttribute("aria-pressed", String(currentBackground === null));
      for (const [i, tile] of tiles.entries()) {
        const entry = data.backgrounds[i];
        const faded = resolveCardFade(entry.key, currentFade);
        tile.setAttribute("aria-pressed", String(currentBackground === entry.key));
        tile.classList.toggle("backdrop-fade", faded);
        tile.classList.toggle("backdrop-even", !faded);
        tile.style.setProperty("--bg", currentBackgroundColor);
      }
    };

    backdropHost.replaceChildren(none, ...tiles);

    if (!data.entitled) backdropHost.append(note("Rank-card backgrounds are a premium feature."));
    refreshBackdrops();
    paintColour();
    paintPreview();
  };

  /**
   * The colour control.
   *
   * **Only shown once a style is chosen.** A colour input above a plain card sets something that
   * changes nothing, which is a worse experience than not offering it — and it is why the dirty
   * check ignores the colour while `currentBackground` is null.
   *
   * A native `<input type="color">` rather than a wheel of our own: it is the one control every
   * platform already has a good version of, it is keyboard accessible for free, and the veil in
   * the renderer means no value it can produce makes an unreadable card.
   */
  const paintColour = () => {
    if (!colourHost) return;

    if (!currentBackground || !data.entitled) {
      colourHost.replaceChildren();
      return;
    }

    const label = document.createElement("label");
    label.className = "backdrop-colour-label";
    label.textContent = "Colour";

    const input = document.createElement("input");
    input.type = "color";
    input.className = "backdrop-colour-input";
    input.value = currentBackgroundColor;
    // `input`, not `change`: dragging through a colour wheel should update the tiles live rather
    // than only when the native picker is dismissed.
    input.addEventListener("input", () => {
      currentBackgroundColor = input.value.toLowerCase();
      // Already in place — it was this control that taught the file the lesson (see the note on
      // `paintActivity()`), and `refreshBackdrops()` is now the one way tiles are updated.
      refreshBackdrops();
      paintPreview();
      stage();
    });

    label.append(input);

    // The switch. A checkbox rather than a third pair of tiles: it is a yes/no about the card, and
    // it reads from the same resolver as the renderer, so an untouched one shows the style's own
    // default rather than an arbitrary unchecked box.
    const fadeLabel = document.createElement("label");
    fadeLabel.className = "backdrop-fade-label";

    const fadeInput = document.createElement("input");
    fadeInput.type = "checkbox";
    fadeInput.className = "backdrop-fade-input";
    fadeInput.checked = resolveCardFade(currentBackground, currentFade);
    fadeInput.addEventListener("change", () => {
      // Stored explicitly from here on. Once someone has an opinion, it should survive them trying
      // the other style rather than silently reverting to that style's default.
      currentFade = fadeInput.checked;
      // **Retints the tiles; never calls `paintBackdrops()`.** That path ran `paintColour()`, which
      // replaces this checkbox's own container — the control destroyed itself on every toggle and
      // focus fell to `<body>`.
      refreshBackdrops();
      paintPreview();
      stage();
    });

    const fadeText = document.createElement("span");
    fadeText.textContent = "Fade out to the right";

    fadeLabel.append(fadeInput, fadeText);
    colourHost.replaceChildren(label, fadeLabel);
  };

  /** Retints the player's backdrop tiles in place. Never rebuilds — see paintActivity(). */
  const tintActivityTiles = () => {
    if (!activityBgHost) return;
    for (const tile of activityBgHost.querySelectorAll(".backdrop:not(.backdrop-none)")) {
      tile.style.setProperty("--bg", currentActivity ?? DEFAULT_BACKGROUND_COLOR);
    }
  };

  /**
   * The Activity's colour: the same eight suggestions the rank card offers, plus a free picker.
   *
   * **Built once, then only updated.** Re-rendering the whole control from inside the colour
   * input's own `input` handler would call `replaceChildren` and destroy the very `<input>` being
   * dragged, so the picker would do nothing at all. Anything that repaints has to leave the
   * element the user is currently interacting with alone.
   *
   * The suggestions matter as much as the picker: a bare colour well gives no starting point, and
   * most people want *a nice colour*, not to mix one. The palette is the same eight the card uses,
   * so a person who has picked a colour once recognises it here.
   */
  //
  // One control rather than several, because one variable drives the whole player: `player.css`
  // derives its surfaces, its ambient glow and its scrollbar from `--vibe-accent` through
  // `color-mix()`. Separate controls would offer choices that are not independent. "Use the bot's
  // colour" clears it rather than picking a default, since each bot has its own palette and there
  // is no single value that means "unset".
  const paintActivity = () => {
    if (!activityHost) return;

    const swatches = data.palette.map((entry) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.style.setProperty("--swatch", entry.value);
      swatch.title = entry.name;
      swatch.setAttribute("aria-label", entry.name);
      swatch.disabled = !data.entitled;
      swatch.addEventListener("click", () => {
        currentActivity = entry.value;
        free.value = entry.value;
        refresh();
        tintActivityTiles();
        stage();
      });
      return swatch;
    });

    const label = document.createElement("label");
    label.className = "backdrop-colour-label";
    label.textContent = "Custom";

    const free = document.createElement("input");
    free.type = "color";
    free.className = "backdrop-colour-input";
    free.value = currentActivity ?? DEFAULT_BACKGROUND_COLOR;
    free.disabled = !data.entitled;
    // No repaint from in here — see the note above. Only the states that are not this element.
    free.addEventListener("input", () => {
      currentActivity = free.value.toLowerCase();
      refresh();
      tintActivityTiles();
      stage();
    });
    label.append(free);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "swatch-reset";
    reset.textContent = "Use the bot's colour";
    reset.disabled = !data.entitled || currentActivity === null;
    reset.addEventListener("click", () => {
      currentActivity = null;
      refresh();
      tintActivityTiles();
      stage();
    });

    /** Updates selection state in place. Never rebuilds, never touches the open picker. */
    const refresh = () => {
      for (const [i, swatch] of swatches.entries()) {
        swatch.setAttribute("aria-pressed", String(currentActivity === data.palette[i].value));
      }
      reset.disabled = !data.entitled || currentActivity === null;
    };

    const row = document.createElement("div");
    row.className = "swatches";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Player colour");
    row.append(...swatches, label, reset);

    // Only meaningful alongside a server that has its own guild-tier theme, but stored
    // independently — see the note by `currentPreferServerTheme` above.
    const preferLabel = document.createElement("label");
    preferLabel.className = "prefer-server-theme";
    const preferCheckbox = document.createElement("input");
    preferCheckbox.type = "checkbox";
    preferCheckbox.checked = currentPreferServerTheme;
    preferCheckbox.disabled = !data.entitled;
    preferCheckbox.addEventListener("change", () => {
      currentPreferServerTheme = preferCheckbox.checked;
      stage();
    });
    preferLabel.append(
      preferCheckbox,
      document.createTextNode(" Prefer a server's own theme there, over this one")
    );

    activityHost.replaceChildren(row, preferLabel);
    if (!data.entitled) activityHost.append(note("Player colours are a premium feature."));
    refresh();
  };

  /**
   * The player's backdrop: the same two styles as the card, plus "None".
   *
   * Reuses the card's tiles verbatim — same classes, same preview — because they are the same two
   * styles. A second set of art for the same words would be the surest way to make someone think
   * they mean different things.
   */
  const paintActivityBg = () => {
    if (!activityBgHost) return;
    if (!data.backgrounds?.length) return;

    const tiles = [];

    const none = document.createElement("button");
    none.type = "button";
    none.className = "backdrop backdrop-none";
    none.title = "No background";
    none.setAttribute("aria-label", "No background");
    none.disabled = !data.entitled;
    none.addEventListener("click", () => {
      currentActivityBg = null;
      refresh();
      stage();
    });
    tiles.push(none);

    for (const entry of data.backgrounds) {
      const tile = document.createElement("button");
      tile.type = "button";
      // Always `backdrop-even`: the card's fade is a property of a still picture, and a live
      // surface that fades out to one side just looks unevenly lit.
      tile.className = `backdrop backdrop-${entry.key} backdrop-even`;
      tile.style.setProperty("--bg", currentActivity ?? DEFAULT_BACKGROUND_COLOR);
      tile.title = entry.description ?? entry.name;
      tile.setAttribute("aria-label", entry.name);
      tile.disabled = !data.entitled;
      tile.addEventListener("click", () => {
        currentActivityBg = entry.key;
        refresh();
        stage();
      });
      tiles.push(tile);
    }

    const refresh = () => {
      none.setAttribute("aria-pressed", String(currentActivityBg === null));
      for (const [i, entry] of data.backgrounds.entries()) {
        tiles[i + 1].setAttribute("aria-pressed", String(currentActivityBg === entry.key));
      }
    };

    activityBgHost.replaceChildren(...tiles);
    refresh();
  };

  paint();
  paintBackdrops();
  paintActivity();
  paintActivityBg();
  paintPlayerPreview();
}
