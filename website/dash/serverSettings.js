import { renderSignedOut } from "./shared.js";
import { dirty, clean } from "./saveBar.js";
import { botKey, serverKey, effectiveValue, isChange, payloadFor, pick } from "./settingsDraft.js";
import { createControls, el, row } from "./controls.js";

/**
 * One server's settings, every one of them: what `/config` in Discord offers, in the same four topics
 * (Access, Playback, Messages, Streaming), plus each bot's own overrides.
 *
 * **Edits are staged, like the personalisation page.** Nothing is sent when a control is touched: it
 * joins the page's save bar ("You have unsaved changes", Reset, Save), and Save sends the changes one
 * at a time. Which settings differ, and what to send for each, is `settingsDraft.js`; a failed change
 * stays pending while the rest are saved.
 *
 * **Nothing here knows a rule.** The bot validates the ids, applies the caps and writes with the code
 * `/config` uses, and answers each change with the whole state, which is what the page redraws from.
 *
 * Built with `createElement` and `textContent` throughout: role and channel names are other people's
 * text and are never parsed as markup.
 */

const SECTIONS = [
  { id: "access", title: "Access", intro: "Who can control Vibe here, and where it works." },
  { id: "playback", title: "Playback", intro: "What Vibe does when the queue runs out." },
  { id: "messages", title: "Messages", intro: "What Vibe says in chat." },
  { id: "streaming", title: "Streaming", intro: "For streamers who want what is playing on screen." },
  { id: "premium", title: "Premium", intro: "Guild-tier customisation for a server with its own subscription." },
  { id: "bots", title: "Each bot", intro: "Give one Vibe its own settings. Anything left alone follows the server." },
];

/** The tile each bot wears in `/invite` and on its tab, by application id (see `website/instances/`). Public ids. */
const MARKS = {
  "815329807377498153": "vibe",
  "1533281867523031070": "vibe2",
  "1001935021436850207": "vibe3",
  "820636341788344321": "vibe-beta",
};

/**
 * @param {HTMLElement} host Where the sections go.
 * @param {{guildId: string, nav: HTMLElement, status: HTMLElement, onName?: (name: string) => void}} parts
 * @returns {Promise<void>}
 */
export async function renderServerSettings(host, { guildId, nav, status, onName }) {
  /** The bot's last answer. */
  let saved = null;
  /** What the person has picked and not saved. */
  const draft = new Map();
  /** Whose settings the "Each bot" section shows: the flagship's until another tab is chosen. */
  let activeBot = null;
  /** The `?bot=` alias the overlay link is shown for, or `null` for the link that follows every Vibe. Not saved. */
  let overlayBot = null;

  const say = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  };

  async function request(options = {}) {
    const response = await fetch(`/api/guild-settings?id=${encodeURIComponent(guildId)}`, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}) },
    }).catch(() => null);

    if (response?.status === 401) {
      renderSignedOut();
      return null;
    }
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body) {
      say(body?.error ?? "That didn't work. Try again in a moment.", true);
      return null;
    }
    return body;
  }

  // --- staging ------------------------------------------------------------------------

  const barId = (key) => `settings:${guildId}:${key}`;
  const value = (key) => effectiveValue(saved, draft, key);

  /**
   * Registers one staged change with the save bar. The bar's Save calls `save`, its Reset calls `revert`.
   * `redraw: false` is for a control that is being dragged: a redraw replaces its element, and a native
   * colour picker closes the moment the input under it is destroyed.
   */
  function stage(key, next, { redraw = true } = {}) {
    if (!pick(saved, draft, key, next)) {
      clean(barId(key));
      if (redraw) draw(key);
      return;
    }

    dirty(barId(key), {
      revert: () => {
        draft.delete(key);
        clean(barId(key));
        draw();
      },
      save: async () => {
        const wanted = draft.get(key);
        // The bot may have moved under the draft (another admin, `/config`): a pick that is no longer a change is done.
        if (!isChange(saved, key, wanted)) {
          draft.delete(key);
          draw();
          return true;
        }
        const result = await request({ method: "POST", body: JSON.stringify(payloadFor(key, wanted)) });
        if (!result) return false;
        saved = result;
        draft.delete(key);
        say(result.summary ? `${result.summary}.` : "Saved.");
        draw();
        return true;
      },
    });
    if (redraw) draw(key);
  }

  const { picker, singlePicker, toggle, colorPicker } = createControls(stage);

  // --- the sections -----------------------------------------------------------------------

  function server(section) {
    const { options } = saved;
    const rows = [];
    const v = (field) => value(serverKey(field));

    if (section === "access") {
      rows.push(
        row("DJ roles", "They bypass vote-to-skip and the playback guards. None means anyone.", picker({ key: serverKey("djRoles"), label: "DJ roles", selected: v("djRoles"), options: options.roles, kind: "@" }), true),
        row("Voice channels Vibe may join", "None means any voice channel.", picker({ key: serverKey("voiceChannels"), label: "voice channels", selected: v("voiceChannels"), options: options.voiceChannels, kind: "" }), true),
        row("Channels Vibe's commands work in", "None means every channel. /config itself always works.", picker({ key: serverKey("commandsChannels"), label: "commands channels", selected: v("commandsChannels"), options: options.textChannels, kind: "#" }), true),
        row("Sharing a voice channel between Vibes", "Two Vibes can still play different music in different rooms either way. This is only about whether they may share one room. Only one of them ever tracks your listening time there.", toggle({ key: serverKey("shareVoiceChannels"), label: "Vibes may share a voice channel", current: v("shareVoiceChannels") })),
        row("Audit log", "Who changed what, posted in one channel.", singlePicker({ key: serverKey("logChannelId"), label: "Audit log channel", current: v("logChannelId"), options: options.textChannels }))
      );
    }

    if (section === "playback") {
      rows.push(
        row("Autoplay", "Keep playing when the queue runs out. Off by default.", toggle({ key: serverKey("autoplay"), label: "Autoplay", current: v("autoplay") })),
        row("Follow listeners' taste", "When somebody in the voice channel has taste seeding, a couple of tracks per refill lean on what they listen to. Nobody is named.", toggle({ key: serverKey("autoplayRoomTaste"), label: "Autoplay follows listeners' taste", current: v("autoplayRoomTaste"), disabled: !v("autoplay") }))
      );
    }

    if (section === "messages") {
      rows.push(
        row('"Now playing" messages', "Announce each track in the channel.", toggle({ key: serverKey("announcements"), label: "Now playing messages", current: v("announcements") })),
        row("Tips", "A small hint under Vibe's messages, at most one every ten minutes. Off removes it everywhere in this server.", toggle({ key: serverKey("tips"), label: "Tips", current: v("tips") }))
      );
    }

    if (section === "streaming") rows.push(overlayRow());

    if (section === "premium") {
      const theme = saved.premium?.activityTheme;
      if (theme?.forSale) {
        const entitled = theme.entitled;
        rows.push(
          row(
            "Activity theme",
            entitled
              ? "The player's default colour for anyone here without a personal one of their own."
              : "This is a premium feature for this server.",
            colorPicker({ key: serverKey("activityAccent"), label: "Activity theme colour", current: v("activityAccent"), disabled: !entitled })
          )
        );
      }
    }

    return rows;
  }

  /** The overlay is an action, and a link only exists once it is saved, so the staged states say what will happen. */
  function overlayRow() {
    const key = serverKey("overlay");
    const overlay = saved.shared.overlay;
    const action = draft.get(key) ?? null;
    const control = el("div", { className: "overlay" });
    const button = (text, onclick, className = "btn btn-ghost") => {
      const node = el("button", { type: "button", className, textContent: text });
      node.dataset.key = `${key}:${text}`;
      node.addEventListener("click", onclick);
      return node;
    };
    const hint = (text) => el("p", { className: "setting-hint", textContent: text });
    const undo = () => button("Undo", () => stage(key, overlay.on ? "on" : "off"));

    if (!overlay.on) {
      if (action === "on") control.append(hint("The link appears once you save."), undo());
      else control.append(button("Turn on", () => stage(key, "on"), "btn btn-primary"));
    } else if (action === "off") {
      control.append(hint("The overlay will be turned off when you save. The link stops working."), undo());
    } else {
      // One link, as in `/config`: the default follows every Vibe, and a menu pins it to one. Choosing only
      // changes what is shown, so nothing is staged or saved.
      const choices = saved.instances.filter((instance) => instance.alias);
      const picked = choices.find((instance) => instance.alias === overlayBot) ?? null;
      const shownUrl = picked ? `${overlay.url}?bot=${picked.alias}` : overlay.url;
      const generalLink = el("input", { type: "text", readOnly: true, value: shownUrl, className: "overlay-link", ariaLabel: "Overlay link" });
      generalLink.addEventListener("focus", () => generalLink.select());
      control.append(generalLink);

      if (choices.length > 1) {
        control.append(
          hint(
            picked
              ? `This link only shows ${picked.name}, even while another Vibe is playing here.`
              : "Works for every Vibe in this server: it shows whichever is playing, and chooses by priority if several are (one that isn't paused first, then Vibe before the others)."
          )
        );
        const choose = (alias, text, clientId) => {
          // Toggle buttons, not tabs: tabs promise arrow-key movement and a panel, and this only rewrites the link.
          const tab = el("button", { type: "button", className: "bot-tab" });
          tab.dataset.key = `${key}:choose:${alias ?? "all"}`;
          tab.setAttribute("aria-pressed", String((picked?.alias ?? null) === alias));
          if (clientId && MARKS[clientId]) tab.append(el("img", { src: `/instances/${MARKS[clientId]}.png`, alt: "", width: 20, height: 20 }));
          tab.append(text);
          tab.addEventListener("click", () => {
            overlayBot = alias;
            draw(tab.dataset.key);
          });
          return tab;
        };
        control.append(
          el(
            "div",
            { className: "bot-tabs", role: "group", ariaLabel: "Which Vibe the link follows" },
            choose(null, "Every Vibe", null),
            ...choices.map((instance) => choose(instance.alias, instance.name, instance.clientId))
          )
        );
      } else {
        control.append(hint("Shows what Vibe is playing in this server."));
      }
      if (action === "new") {
        control.append(hint("A new link replaces this one when you save."), undo());
      } else {
        const copy = button("Copy link", async () => {
          try {
            await navigator.clipboard.writeText(shownUrl);
            say("Link copied.");
          } catch {
            generalLink.select();
            say("Press Ctrl+C to copy the link.");
          }
        });
        control.append(el("div", { className: "overlay-actions" }, copy, button("New link", () => stage(key, "new")), button("Turn off", () => stage(key, "off"))));
      }
    }
    return row(
      "Now-playing overlay",
      overlay.on
        ? "Add the link in OBS as a browser source. It shows only the track's title, artist and artwork. Anyone with the link can see it, so keep it private and replace it if it gets out."
        : "A link a streamer can put in OBS to show what is playing here. Off until you turn it on.",
      control,
      true
    );
  }

  function bots() {
    const { options, instances } = saved;
    if (!instances.length) return [el("p", { className: "section-note", textContent: "No Vibe bot has reported in from this server yet." })];

    // One bot at a time, chosen from a row of tabs with each bot's logo. The flagship comes first.
    if (!instances.some((instance) => instance.clientId === activeBot)) {
      activeBot = (instances.find((instance) => instance.name === "Vibe") ?? instances[0]).clientId;
    }

    const cardFor = (instance) => {
      const id = instance.clientId;
      const card = el("article", { className: "bot-card", id: "bot-panel", role: "tabpanel" }, el("h3", { className: "bot-name", textContent: instance.name }));
      const shared = (field) => value(serverKey(field));

      const listRow = (field, title, kind, choices) => {
        const key = botKey(id, field);
        const current = value(key);
        const control = el("div", { className: "bot-list" });
        const action = (text, onclick) => {
          const node = el("button", { type: "button", className: "btn btn-ghost", textContent: text });
          node.dataset.key = `${key}:${text}`;
          node.addEventListener("click", onclick);
          return node;
        };
        if (current !== null) {
          control.append(picker({ key, label: `${instance.name}: ${title}`, selected: current, options: choices, kind }), action("Follow the server", () => stage(key, null)));
        } else {
          control.append(el("span", { className: "follows", textContent: "Follows the server" }), action("Set for this bot", () => stage(key, [...shared(field)])));
        }
        return row(title, "", control, true);
      };

      /** Follow the server, on, or off. */
      const flagRow = (field, title) => {
        const key = botKey(id, field);
        const current = value(key);
        const menu = el("select", { ariaLabel: `${instance.name}: ${title}`, className: "picker-add" });
        menu.dataset.key = key;
        const choice = current === null ? "follow" : String(current);
        for (const [option, text] of [["follow", `Follow the server (${shared(field) ? "on" : "off"})`], ["true", "On for this bot"], ["false", "Off for this bot"]]) {
          const node = el("option", { value: option, textContent: text });
          node.selected = option === choice;
          menu.append(node);
        }
        menu.addEventListener("change", () => stage(key, menu.value === "follow" ? null : menu.value === "true"));
        return row(title, "", menu);
      };

      card.append(
        listRow("voiceChannels", "Voice channels it may join", "", options.voiceChannels),
        listRow("commandsChannels", "Channels its commands work in", "#", options.textChannels),
        flagRow("announcements", '"Now playing" messages'),
        flagRow("autoplay", "Autoplay"),
        flagRow("autoplayRoomTaste", "Follow listeners' taste")
      );

      // Staged like everything else: it clears every override this bot has, and Save sends each as "follow the server".
      const fields = ["voiceChannels", "commandsChannels", "announcements", "autoplay", "autoplayRoomTaste"];
      if (fields.some((field) => value(botKey(id, field)) !== null)) {
        card.append(
          el("button", {
            type: "button",
            className: "btn btn-ghost bot-reset",
            textContent: `Reset ${instance.name} to the server's settings`,
            onclick: () => fields.forEach((field) => stage(botKey(id, field), null)),
          })
        );
      }
      return card;
    };

    const tabs = el(
      "div",
      { className: "bot-tabs", role: "group", ariaLabel: "Bots in this server" },
      ...instances.map((instance) => {
        const selected = instance.clientId === activeBot;
        // Pressed buttons that show one bot's card below. Not `role="tab"`: that is a promise of arrow-key
        // movement between tabs, which a row of separate buttons does not keep.
        const tab = el("button", { type: "button", className: "bot-tab" });
        tab.dataset.key = `tab:${instance.clientId}`;
        tab.setAttribute("aria-pressed", String(selected));
        tab.setAttribute("aria-controls", "bot-panel");
        if (MARKS[instance.clientId]) {
          tab.append(el("img", { src: `/instances/${MARKS[instance.clientId]}.png`, alt: "", width: 20, height: 20 }));
        }
        tab.append(instance.name);
        tab.addEventListener("click", () => {
          activeBot = instance.clientId;
          draw(tab.dataset.key);
        });
        return tab;
      })
    );

    return [tabs, cardFor(instances.find((instance) => instance.clientId === activeBot))];
  }

  // Hidden entirely while nothing is for sale — same "not for sale = no trace of it" rule the
  // user tier's appearance settings already use, not just a greyed-out control nobody can buy.
  const visibleSections = () => SECTIONS.filter((s) => s.id !== "premium" || saved.premium?.activityTheme?.forSale);

  function draw(focusKey = null) {
    const activeKey = focusKey ?? document.activeElement?.dataset?.key ?? null;
    host.replaceChildren(
      ...visibleSections().map(({ id, title, intro }) => {
        const section = el("section", { id, className: "settings-section" }, el("h2", { textContent: title }), el("p", { className: "settings-intro", textContent: intro }));
        section.append(...(id === "bots" ? bots() : server(id)));
        return section;
      })
    );
    nav.replaceChildren(...visibleSections().map(({ id, title }) => el("a", { href: `#${id}`, textContent: title })));
    // A redraw would otherwise drop keyboard focus to the top of the page after every edit.
    if (activeKey) [...host.querySelectorAll("[data-key]")].find((node) => node.dataset.key === activeKey)?.focus({ preventScroll: true });
  }

  saved = await request();
  if (!saved) {
    host.replaceChildren(el("p", { className: "section-note", textContent: status.textContent || "These settings are unavailable right now." }));
    return;
  }
  say("");
  onName?.(saved.guild.name);
  draw();
}
