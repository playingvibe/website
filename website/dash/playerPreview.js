/**
 * A mock of the player `/watch` opens, retinted by a colour and a backdrop. Shared by the personal settings and the
 * server's premium settings, so the two always draw the same thing.
 *
 * The landing page's hand-built `.player` is the thing reused: it is drawn from the same tokens as the Activity, and
 * `player.css` derives every surface from one accent through `color-mix()`, so a static mock is faithful in a way the rank
 * card's canvas preview cannot be. The backdrop is the same `.backdrop-*` class the tiles use. Roughly the real thing: the
 * real player has artwork, a queue and a transport nobody can predict from here.
 * @param {{accent: string, background?: ?string, label: string}} options
 * @returns {HTMLElement}
 */
export function buildPlayerPreview({ accent, background = null, label }) {
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

  // The new player at a glance: the cover leads and its light spreads behind it, the words stand
  // beside it, and one strip along the bottom holds everything, with the seek bar as its top edge.
  // From a container width of 35rem the queue becomes a rail; below it the strip has two rows.
  const mock = document.createElement("div");
  mock.className = background ? `player-preview live-${background}` : "player-preview";
  // `--accent` tints the controls, `--bg` the backdrop's glow: both the colour given.
  mock.style.setProperty("--accent", accent);
  mock.style.setProperty("--bg", accent);
  mock.setAttribute("role", "img");
  mock.setAttribute("aria-label", label);

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
  const cover = (className) => {
    const el = div(className);
    const mark = svg("svg", { viewBox: "0 0 1254 1254", "aria-hidden": "true" });
    mark.append(svg("path", { d: "M 827 325 C 868.97 325 903 359.03 903 401 C 903 413.94 899.76 426.12 894.06 436.78 L 670.14 879.51 C 655.86 908.81 625.79 929 591 929 C 552.33 929 519.49 904.06 507.68 869.39 L 357.44 462.88 C 353.28 452.39 351 440.96 351 429 C 351 378.19 392.19 337 443 337 C 483.8 337 518.39 363.56 530.44 400.33 L 587.22 563.06 C 591.77 575.19 603.47 583.81 617.19 583.81 C 628.96 583.81 639.24 577.46 644.79 568 L 760.11 364.9 C 772.96 341.14 798.09 325 827 325 Z" }));
    el.append(mark);
    return el;
  };
  const fill = document.createElement("span");
  const seek = div("pp-seek", fill);

  // The strip's glyphs, drawn as the Activity draws them: shuffle and repeat as lines, the rest filled.
  const lineIcon = (stroke, filled) => {
    const el = svg("svg", { class: "ctl ctl-line", viewBox: "0 0 24 24", "aria-hidden": "true" });
    el.append(svg("path", { d: stroke }));
    if (filled) el.append(svg("path", { d: filled, class: "ctl-fill" }));
    return el;
  };
  const play = div("play", icon("M8 5v14l11-7z", ""));
  const controls = div(
    "controls",
    lineIcon("M3 6h3.5L16 18h4.5M17 15l3.5 3-3.5 3M3 18h3.5l2.5-3M13 9l3-3h4.5M17 3l3.5 3-3.5 3"),
    icon("M6 6h2v12H6zm3.5 6 8.5 6V6z"),
    play,
    icon("M16 6h2v12h-2zM6 18l8.5-6L6 6z"),
    lineIcon("M4 11a8 8 0 0 1 8-8h5M20 13a8 8 0 0 1-8 8H7", "M17 .5 21 3 17 5.5ZM10 18.5 6 21 10 23.5Z")
  );

  const rail = div(
    "pp-queue",
    text("p", "pp-queue-title", "Up next"),
    ...["Next in your queue", "Another song", "One more"].map((title) =>
      div("pp-row", div("pp-thumb"), div("pp-row-words", text("span", "pp-row-title", title), text("span", "pp-row-artist", "Someone")))
    )
  );

  const stage = div(
    "pp-stage",
    div(
      "pp-sleeve",
      cover("pp-cover"),
      div("pp-words", text("p", "track", "Whatever you queued"), text("p", "artist", "Playing in your voice channel"))
    ),
    rail
  );

  const strip = div(
    "pp-strip",
    seek,
    div("pp-timeline", text("span", "pp-time pp-elapsed", "1:47"), div("pp-seek-flow"), text("span", "pp-time pp-length", "4:18")),
    controls,
    div("pp-volume", icon("M4 9v6h4l5 4V5L8 9H4z"), div("pp-volume-track", document.createElement("span")))
  );

  mock.append(div("pp-light"), stage, strip);
  return mock;
}
