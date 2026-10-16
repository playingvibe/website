import { renderSignedOut } from "./shared.js";
import { el } from "./controls.js";
import { playlistArt } from "../lib/generated/playlistArt.js";

/**
 * The playlist editor: every playlist of the signed-in person, each with its songs in order, and what can be done
 * to them: create, rename, delete, move a song up, down or to the top, take a song out. **Never add**: that needs
 * a search, which this site has none of, so the page says to use `/playlist add`.
 *
 * **Nothing here knows a rule.** The bot applies the names, the cap and the subscription, and answers every change
 * with the whole list as it is now, which is what the page redraws from. So a song added in Discord a moment ago is
 * in the next answer, and a reorder is the bot's, computed on the list as it stands: the page names a song by an
 * opaque `ref`, and asks to move it relative to where it is, never to a position it counted.
 *
 * **Every change saves at once**, where a server's settings stage on a save bar. Each action here is one whole
 * operation on a list Discord may be changing at the same moment, so there is nothing to stage against. What that
 * model owes the person is on the page: the controls are locked while a change is being saved, and what happened
 * (or why it did not) is said in a toast at the bottom of the screen, beside whatever they were doing.
 *
 * **Three states of the subscription**, as everywhere on the site: with it, everything; without it while it is for
 * sale, the same controls greyed and the reason said; without it and nothing for sale, no trace of what cannot be
 * had. A person who still has playlists keeps the page in every state, to take songs out and delete.
 *
 * Built with `createElement` and `textContent` throughout: a playlist's name and its songs' titles are other
 * people's text and are never parsed as markup.
 */

/** How long a message stays on screen. A refusal has to be read, so it stays longer. */
const TOAST_MS = 4000;
const TOAST_ERROR_MS = 8000;

/** A value for a quoted attribute selector, whatever characters the bot put in it. */
const quoted = (value) => `"${CSS.escape(String(value))}"`;

/** @param {HTMLElement} host @param {{status: HTMLElement, intro?: HTMLElement}} parts @returns {Promise<void>} */
export async function renderPlaylists(host, { status, intro }) {
  /** The bot's last answer. */
  let data = null;
  /** Which playlists are open, kept across a redraw. */
  const open = new Set();
  /** What to focus after the next redraw, so keyboard focus stays on the control that was used. */
  let refocus = null;
  let busy = false;
  let lastError = null;
  let fade = null;

  const say = (text, isError = false) => {
    clearTimeout(fade);
    status.textContent = text;
    status.classList.toggle("is-error", isError);
    status.classList.remove("is-spent");
    if (isError) lastError = text;
    // The text stays in the live region; only the toast fades. "Saving…" waits for its answer.
    if (text && text !== "Saving…") fade = setTimeout(() => status.classList.add("is-spent"), isError ? TOAST_ERROR_MS : TOAST_MS);
  };

  async function request(options = {}) {
    const response = await fetch("/api/playlists", {
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

  /**
   * One change. The answer is the whole list, so there is nothing to patch up by hand.
   * `done` is what to say afterwards: a sentence, or a function of the new list (where a song landed).
   */
  async function apply(op, { done, focus } = {}) {
    if (busy) return false;
    busy = true;
    // Locked while it saves: a second press would otherwise be dropped without a word. `inert` takes focus
    // away, so it is put back when the change is refused and nothing is redrawn.
    const active = document.activeElement;
    host.inert = true;
    host.setAttribute("aria-busy", "true");
    say("Saving…");
    const body = await request({ method: "POST", body: JSON.stringify({ op }) });
    busy = false;
    host.inert = false;
    host.setAttribute("aria-busy", "false");
    if (!body) {
      if (active instanceof HTMLElement && active.isConnected) active.focus();
      return false;
    }

    data = body;
    refocus = focus ?? [];
    say(typeof done === "function" ? done(body) : (done ?? "Saved."));
    draw();
    return true;
  }

  // --- drawing ------------------------------------------------------------------------

  const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  /** Nothing is for sale and the person has no subscription: the page shows only what they can still do. */
  const unsold = () => !data.entitled && data.forSale === false;

  /** "Moved Nights to 3 of 6.", read from the bot's answer, so it says where the song is and not where it was sent. */
  const movedTo = (playlistId, ref, title) => (next) => {
    const tracks = next.playlists.find((entry) => entry.id === playlistId)?.tracks ?? [];
    const at = tracks.findIndex((track) => track.ref === ref);
    return at < 0 ? `Moved ${title}.` : `Moved ${title} to ${at + 1} of ${tracks.length}.`;
  };

  function cover(playlist) {
    const art = playlistArt(playlist.name, { size: 48, pattern: playlist.cover?.pattern, hue: playlist.cover?.hue });
    return el("img", {
      className: "pl-cover",
      alt: "",
      width: 48,
      height: 48,
      src: `data:image/svg+xml,${encodeURIComponent(art)}`,
    });
  }

  function createForm() {
    const input = el("input", { type: "text", className: "input pl-field", maxLength: data.limits.maxNameLength, required: true, placeholder: "New playlist" });
    input.setAttribute("aria-label", "Name for a new playlist");
    const submit = el("button", { type: "submit", className: "btn btn-primary btn-small" }, "Create");

    const full = data.playlists.length >= data.limits.maxPlaylists;
    const form = el("form", { className: "pl-create" }, input, submit);
    if (!data.entitled || full) {
      input.disabled = true;
      submit.disabled = true;
      // Without a subscription the note under the form already says why.
      if (data.entitled) form.append(el("p", { className: "pl-note", textContent: `You have the most you can (${data.limits.maxPlaylists}).` }));
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name) apply({ kind: "create", name }, { done: `Created ${name}.`, focus: [] });
    });
    input.dataset.focus = "create";
    return form;
  }

  function renameForm(playlist) {
    const input = el("input", { type: "text", className: "input pl-field", value: playlist.name, maxLength: data.limits.maxNameLength, required: true });
    input.setAttribute("aria-label", `New name for ${playlist.name}`);
    const save = el("button", { type: "submit", className: "btn btn-ghost btn-small" }, "Rename");
    const form = el("form", { className: "pl-rename" }, input, save);
    if (!data.entitled) {
      input.disabled = true;
      save.disabled = true;
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (name && name !== playlist.name) {
        apply({ kind: "rename", id: playlist.id, name }, { done: `Renamed to ${name}.`, focus: [`[data-open=${quoted(playlist.id)}]`] });
      }
    });
    return form;
  }

  function deleteControl(playlist) {
    const wrap = el("span", { className: "pl-delete" });
    const ask = el("button", { type: "button", className: "btn btn-danger-quiet btn-small" }, "Delete…");
    const sentence = `${playlist.name} and its ${count(playlist.trackCount, "song")} go, and this can't be undone.`;
    const confirm = el("span", { className: "pl-confirm", hidden: true });
    // A group named by its question, so a screen reader arriving on "Cancel" hears what is being asked.
    confirm.setAttribute("role", "group");
    confirm.setAttribute("aria-label", `Delete ${playlist.name}? ${sentence}`);
    const yes = el("button", { type: "button", className: "btn btn-danger btn-small" }, "Yes, delete it");
    const no = el("button", { type: "button", className: "btn btn-ghost btn-small" }, "Cancel");
    confirm.append(el("span", { textContent: sentence }), yes, no);
    ask.addEventListener("click", () => {
      ask.hidden = true;
      confirm.hidden = false;
      no.focus();
    });
    no.addEventListener("click", () => {
      confirm.hidden = true;
      ask.hidden = false;
      ask.focus();
    });
    yes.addEventListener("click", () => apply({ kind: "delete", id: playlist.id }, { done: `Deleted ${playlist.name}.`, focus: [] }));
    wrap.append(ask, confirm);
    return wrap;
  }

  /** The grip beside a draggable song: decoration, since the buttons are the way for a keyboard. */
  function grip() {
    const node = el("span", { className: "pl-grip", textContent: data.entitled ? "⠿" : "" });
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function songRow(playlist, track, index) {
    const last = index === playlist.tracks.length - 1;
    const title = track.title ?? "the song";
    const songKey = (ref, direction) => `[data-song=${quoted(`${playlist.id}:${ref}:${direction}`)}]`;
    const removeKey = (ref) => `[data-remove=${quoted(`${playlist.id}:${ref}`)}]`;

    const move = (direction, label, glyph, disabled) => {
      const button = el("button", { type: "button", className: "pl-move", ariaLabel: `${label}: ${track.title ?? "this song"}`, disabled: disabled || !data.entitled }, glyph);
      button.dataset.song = `${playlist.id}:${track.ref}:${direction}`;
      if (!data.entitled) button.title = "Reordering needs a subscription.";
      button.addEventListener("click", () =>
        apply(
          { kind: "move", id: playlist.id, ref: track.ref, direction },
          // Focus follows the song: the same button on its new row, or the one that is still enabled at an edge.
          { done: movedTo(playlist.id, track.ref, title), focus: [songKey(track.ref, direction), songKey(track.ref, "down"), songKey(track.ref, "up")] }
        )
      );
      return button;
    };

    const remove = el("button", { type: "button", className: "pl-remove", ariaLabel: `Remove ${track.title ?? "this song"} from ${playlist.name}` }, "Remove");
    remove.dataset.remove = `${playlist.id}:${track.ref}`;
    // Focus stays in the list: the song that takes this one's place, else the one before it, else the playlist.
    const neighbours = [playlist.tracks[index + 1], playlist.tracks[index - 1]].filter(Boolean).map((other) => removeKey(other.ref));
    remove.addEventListener("click", () =>
      apply({ kind: "remove", id: playlist.id, ref: track.ref }, { done: `Removed ${title}.`, focus: [...neighbours, `[data-open=${quoted(playlist.id)}]`] })
    );

    const author = el("span", { className: "pl-author" }, ...(track.author ? [el("span", { className: "pl-author-name", textContent: track.author })] : []));
    if (track.unavailable) author.append(el("span", { className: "pl-flag", textContent: "unavailable" }));

    const row = el(
      "li",
      // Draggable only for somebody who may reorder; the buttons beside it do the same for a keyboard or a finger.
      { className: "pl-song", draggable: data.entitled },
      grip(),
      el("span", { className: "pl-num", textContent: String(index + 1) }),
      el("span", { className: "pl-song-text" }, el("span", { className: "pl-title", textContent: track.title ?? "Unknown track" }), author),
      // Where reordering cannot be had at all, its buttons are not shown greyed: they are not shown.
      el("span", { className: "pl-actions" }, ...(unsold() ? [] : [move("top", "Move to the top", "⤒", index === 0), move("up", "Move up", "↑", index === 0), move("down", "Move down", "↓", last)]), remove)
    );
    row.dataset.ref = track.ref;
    return row;
  }

  /**
   * Drag and drop for one playlist's songs, in addition to the buttons. A drop is **relative to the song it lands next
   * to** ("before this one", "after that one"), never to an index the page counted, so the bot puts it there on the
   * list as it is now: a song added from Discord meanwhile is not lost. It saves at once, like every other change on
   * the page, and the page redraws from the answer.
   */
  function wireDrag(list, playlist) {
    if (!data.entitled) return;
    let dragged = null;
    const clear = () => {
      for (const node of list.querySelectorAll(".is-dragging, .drop-before, .drop-after")) node.classList.remove("is-dragging", "drop-before", "drop-after");
    };
    const rowOf = (event) => event.target.closest?.(".pl-song");
    const rowFor = (ref) => [...list.children].find((node) => node.dataset.ref === ref) ?? null;
    const below = (event, row) => {
      const box = row.getBoundingClientRect();
      return event.clientY > box.top + box.height / 2;
    };

    list.addEventListener("dragstart", (event) => {
      const row = rowOf(event);
      if (!row || busy) return event.preventDefault();
      dragged = row.dataset.ref;
      event.dataTransfer.effectAllowed = "move";
      // Some browsers start no drag without data.
      event.dataTransfer.setData("text/plain", dragged);
      row.classList.add("is-dragging");
    });
    list.addEventListener("dragover", (event) => {
      const row = rowOf(event);
      if (!dragged || !row || row.dataset.ref === dragged) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      for (const node of list.querySelectorAll(".drop-before, .drop-after")) node.classList.remove("drop-before", "drop-after");
      row.classList.add(below(event, row) ? "drop-after" : "drop-before");
    });
    list.addEventListener("drop", (event) => {
      event.preventDefault();
      const row = rowOf(event);
      const ref = dragged;
      const after = row ? below(event, row) : false;
      const moved = ref ? rowFor(ref) : null;
      dragged = null;
      clear();
      if (!row || !ref || row.dataset.ref === ref) return;
      // Dropped where it already is: there is nothing to save.
      const neighbour = after ? row.nextElementSibling : row.previousElementSibling;
      if (neighbour === moved) return;
      const title = moved?.querySelector(".pl-title")?.textContent ?? "the song";
      const songKey = (direction) => `[data-song=${quoted(`${playlist.id}:${ref}:${direction}`)}]`;
      apply(
        { kind: "move", id: playlist.id, ref, direction: after ? "after" : "before", target: row.dataset.ref },
        { done: movedTo(playlist.id, ref, title), focus: [songKey("down"), songKey("up")] }
      );
    });
    list.addEventListener("dragend", () => {
      dragged = null;
      clear();
    });
  }

  function playlistCard(playlist) {
    const details = el("details", { className: "pl" });
    details.open = open.has(playlist.id);
    details.addEventListener("toggle", () => (details.open ? open.add(playlist.id) : open.delete(playlist.id)));

    const summary = el(
      "summary",
      { className: "pl-head" },
      cover(playlist),
      el("span", { className: "pl-name", textContent: playlist.name }),
      el("span", { className: "pl-count", textContent: count(playlist.trackCount, "song") })
    );
    summary.dataset.open = playlist.id;

    // Renaming cannot be had when nothing is for sale, so its form is not drawn; deleting always can.
    const body = el("div", { className: "pl-body" }, el("div", { className: "pl-tools" }, ...(unsold() ? [] : [renameForm(playlist)]), deleteControl(playlist)));
    if (!playlist.tracks.length) {
      body.append(el("p", { className: "pl-note", textContent: unsold() ? "No songs in it." : "No songs yet. Add some with /playlist add in Discord." }));
    } else {
      const songs = el("ol", { className: "pl-songs" }, ...playlist.tracks.map((track, index) => songRow(playlist, track, index)));
      wireDrag(songs, playlist);
      body.append(songs);
    }
    details.append(summary, body);
    return details;
  }

  /** What the page says above the list when the person has no subscription, by whether one can be had. */
  function lapsedNote() {
    if (data.entitled) return [];
    if (unsold()) return data.playlists.length ? [el("p", { className: "pl-note", textContent: "You can take songs out of these and delete them." })] : [];
    return [el("p", { className: "pl-note", textContent: "Creating, renaming and reordering need a subscription. You can still take songs out and delete playlists." })];
  }

  function emptyNote() {
    const text = data.entitled
      ? "No playlists yet. Create one above, or with /playlist in Discord."
      : unsold()
        ? "You have no playlists."
        : "No playlists yet. Making one needs a subscription.";
    return el("p", { className: "section-note", textContent: text });
  }

  function draw() {
    // The line under the tabs promises renaming and reordering; where neither can be had it says what can be done.
    if (intro && unsold()) intro.textContent = "Take songs out of your playlists, or delete them.";
    host.replaceChildren(
      // No form to grey out where a playlist cannot be made at all.
      ...(unsold() ? [] : [createForm()]),
      ...lapsedNote(),
      data.playlists.length ? el("div", { className: "pl-list" }, ...data.playlists.map(playlistCard)) : emptyNote()
    );
    if (refocus?.length !== undefined) {
      // The control that was used, or the nearest thing that is still there and usable after a song moved or
      // went: the box for a new playlist, else the first playlist, so focus is never left on nothing.
      for (const selector of [...refocus, "[data-focus=create]", "[data-open]"]) {
        const target = host.querySelector(selector);
        if (target && !target.disabled) {
          target.focus();
          break;
        }
      }
      refocus = null;
    }
  }

  data = await request();
  if (!data) {
    // Said once, in the page: the reason the bot gave if it gave one.
    host.replaceChildren(el("p", { className: "section-note", textContent: lastError ?? "Your playlists are unavailable right now." }));
    say("");
    return;
  }
  // The first one open, so the page shows what it is for.
  if (data.playlists[0]) open.add(data.playlists[0].id);
  draw();
}
