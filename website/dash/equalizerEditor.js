import { el } from "./controls.js";
import {
  EQ_BANDS,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_GAIN_STEP,
  EQ_MAX_PRESETS,
  EQ_NAME_MAX,
  EQ_TEMPLATES,
  bandLabel,
} from "../lib/generated/equalizer.js";

/**
 * The server's sound curves: pick a saved one or start a new one, move 15 sliders, name it, save it.
 *
 * **Not staged on the page's save bar.** A curve is a document, not a switch: it has a name and 15 numbers that only
 * mean something together, and the bot saves or deletes it as one change. So the editor has its own Save and Delete,
 * and `apply()` sends the change straight away.
 *
 * **Nothing moved is lost on the page.** Each curve keeps what was done to it while another is looked at (`drafts`),
 * and a curve with unsaved sliders says so on its tab. Only leaving the page drops it, and the note beside Save says
 * "Not saved yet." until then.
 *
 * **Focus survives a redraw.** The editor is rebuilt whenever its state changes, which would leave a keyboard on
 * nothing; every action names what should hold focus afterwards (`focusNext`).
 *
 * **Nothing here knows a rule.** The numbers' range and the cap come from the shared `equalizer.js` (so the sliders
 * cannot offer what the bot refuses), and the bot checks them again. Names are other people's text: they go in with
 * `textContent`, never as markup.
 */

const NEW = "new";
const SVG = "http://www.w3.org/2000/svg";

const flat = () => EQ_BANDS.map(() => 0);
const sameGains = (a, b) => a.length === b.length && a.every((gain, at) => Math.abs(gain - b[at]) < 1e-9);
const show = (gain) => (gain > 0 ? "+" : "") + gain.toFixed(2);
/** What a screen reader says for a slider: the figure, and which way it goes. */
const spoken = (gain) => `${show(gain)}, ${gain > 0 ? "boost" : gain < 0 ? "cut" : "flat"}`;

/** The curve as a line, left to right across the 15 bands, with the untouched level drawn faintly. */
function drawGraph(gains) {
  const width = 150;
  const height = 40;
  const y = (gain) => 2 + ((EQ_GAIN_MAX - gain) / (EQ_GAIN_MAX - EQ_GAIN_MIN)) * (height - 4);
  // Each point under the middle of its slider: 15 equal columns, so a half column in from either edge.
  const x = (at) => ((at + 0.5) / gains.length) * width;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "eq-graph");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "The curve across the 15 bands, low to high");
  svg.setAttribute("preserveAspectRatio", "none");

  const zero = document.createElementNS(SVG, "line");
  zero.setAttribute("x1", "0");
  zero.setAttribute("x2", String(width));
  zero.setAttribute("y1", String(y(0)));
  zero.setAttribute("y2", String(y(0)));
  zero.setAttribute("class", "eq-graph-zero");

  const line = document.createElementNS(SVG, "polyline");
  line.setAttribute("points", gains.map((gain, at) => `${x(at).toFixed(1)},${y(gain).toFixed(1)}`).join(" "));
  line.setAttribute("class", "eq-graph-line");
  svg.append(zero, line);
  return svg;
}

/**
 * @param {{
 *   apply: (value: object) => Promise<?{presets: Array<{id: string, name: string, gains: number[]}>}>,
 * }} deps `apply` sends one `equalizerPresets` change and answers with the server's curves after it, or `null` when
 *   the bot refused (it has already said why).
 */
export function createEqualizerEditor({ apply }) {
  /** A saved curve's id, `NEW` for one not saved yet, or `null` for none picked. */
  let selected = null;
  /** What is on the sliders and in the name box. */
  let draft = { name: "", gains: flat() };
  /** What was left on each curve's sliders when another was picked, by id (and `NEW`), for the life of the page. */
  const drafts = new Map();
  let asking = false;
  let busy = false;
  let host = null;
  let model = { presets: [], entitled: false };
  /** Re-evaluates the Save button, its note and the tab's mark after a slider or the name moves. */
  let refreshSave = null;
  /** A selector inside the editor for what takes focus after the next redraw, or `null` to leave focus alone. */
  let focusNext = null;

  const savedOf = (id) => model.presets.find((preset) => preset.id === id) ?? null;
  const fresh = (id) => {
    const preset = savedOf(id);
    return preset ? { name: preset.name, gains: [...preset.gains] } : { name: "", gains: flat() };
  };
  /** Whether what is held for a curve differs from what the server has. */
  const differs = (id, held) => {
    const preset = savedOf(id);
    if (!preset) return held.name.trim().length > 0 || !sameGains(held.gains, flat());
    return preset.name !== held.name.trim() || !sameGains(preset.gains, held.gains);
  };
  const unsaved = (id) => (id === selected ? differs(id, draft) : drafts.has(id) && differs(id, drafts.get(id)));
  const curveKey = (id) => `[data-curve="${CSS.escape(String(id))}"]`;

  function choose(id) {
    // What was on the sliders stays with its curve.
    if (selected !== null) drafts.set(selected, draft);
    selected = id;
    asking = false;
    draft = drafts.get(id) ?? fresh(id);
    focusNext = id === NEW ? ".eq-name" : curveKey(id);
    redraw();
  }

  const changed = () => {
    const preset = savedOf(selected);
    return !preset || preset.name !== draft.name.trim() || !sameGains(preset.gains, draft.gains);
  };

  async function run(value, then, focusAfter) {
    busy = true;
    focusNext = null;
    redraw();
    const result = await apply(value);
    busy = false;
    if (result) {
      model = { ...model, presets: result.presets };
      then(result.presets);
    }
    focusNext = result ? focusAfter() : ".eq-name";
    redraw();
  }

  const save = () =>
    run(
      { op: "save", id: selected === NEW ? undefined : selected, name: draft.name, gains: draft.gains },
      (presets) => {
        // A new curve's id is the bot's to make: it is found by its name, which is unique in a server.
        const lower = draft.name.trim().toLocaleLowerCase("en");
        const made = presets.find((preset) => preset.name.toLocaleLowerCase("en") === lower);
        drafts.delete(selected);
        selected = made?.id ?? null;
        if (selected !== null) drafts.delete(selected);
        draft = fresh(selected);
      },
      () => (selected === null ? ".eq-new" : curveKey(selected))
    );

  const remove = () =>
    run(
      { op: "delete", id: selected },
      () => {
        drafts.delete(selected);
        selected = null;
        asking = false;
        draft = { name: "", gains: flat() };
      },
      () => (model.presets.length ? ".eq-curve" : ".eq-new")
    );

  /** The saved curves as the same row of tabs the bots have one section over, and the action that starts another. */
  function curves() {
    const full = model.presets.length >= EQ_MAX_PRESETS;
    const tabs = el("div", { className: "bot-tabs eq-curves" });
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Saved curves");
    for (const preset of model.presets) {
      const dirty = unsaved(preset.id);
      const button = el("button", { type: "button", className: `bot-tab eq-curve${dirty ? " is-unsaved" : ""}`, textContent: preset.name });
      button.dataset.curve = preset.id;
      button.setAttribute("aria-pressed", String(preset.id === selected));
      if (dirty) button.setAttribute("aria-label", `${preset.name}, not saved`);
      button.disabled = busy;
      button.addEventListener("click", () => choose(preset.id));
      tabs.append(button);
    }
    if (selected === NEW) {
      // The one being made sits in the row like the others, so the row always shows what the sliders belong to.
      const making = el("button", { type: "button", className: "bot-tab eq-curve is-unsaved", textContent: draft.name.trim() || "New curve" });
      making.dataset.curve = NEW;
      making.setAttribute("aria-pressed", "true");
      making.setAttribute("aria-label", `${draft.name.trim() || "New curve"}, not saved`);
      making.disabled = busy;
      tabs.append(making);
    }

    // An action, not one of the choices: it starts a curve, it is not a curve.
    const add = el("button", { type: "button", className: "btn btn-ghost btn-small eq-new", textContent: "New curve" });
    add.disabled = busy || full || !model.entitled || selected === NEW;
    add.addEventListener("click", () => choose(NEW));

    const top = el("div", { className: "eq-top" }, ...(tabs.children.length ? [tabs] : []), add);
    // Said in the page: a tooltip on a disabled button cannot be reached.
    if (full) top.append(el("span", { className: "eq-note", textContent: `A server keeps ${EQ_MAX_PRESETS} curves. Delete one to make room.` }));
    return top;
  }

  function sliders() {
    const bands = el("div", { className: "eq-bands" });
    const graphHost = el("div", { className: "eq-graph-host" });
    const drawLine = () => graphHost.replaceChildren(drawGraph(draft.gains));

    EQ_BANDS.forEach((hz, at) => {
      const input = el("input", { type: "range", className: "eq-slider", min: String(EQ_GAIN_MIN), max: String(EQ_GAIN_MAX), step: String(EQ_GAIN_STEP) });
      input.value = String(draft.gains[at]);
      input.disabled = busy || !model.entitled;
      // Vertical by `writing-mode` in the stylesheet; `orient` is the older spelling some browsers still read.
      input.setAttribute("orient", "vertical");
      input.setAttribute("aria-label", bandLabel(hz));
      input.setAttribute("aria-valuetext", spoken(draft.gains[at]));
      const readout = el("span", { className: "eq-gain", textContent: show(draft.gains[at]) });
      // Redrawn in place while dragging: replacing the slider would drop the drag.
      input.addEventListener("input", () => {
        const gain = Math.round(Number(input.value) * 100) / 100;
        draft.gains[at] = gain;
        readout.textContent = show(gain);
        input.setAttribute("aria-valuetext", spoken(gain));
        drawLine();
        refreshSave?.();
      });
      bands.append(el("label", { className: "eq-band" }, readout, input, el("span", { className: "eq-hz", textContent: bandLabel(hz).replace(" ", " ") })));
    });
    drawLine();

    // One scroller for the sliders and the curve drawn from them, so on a narrow screen they move together.
    const scroll = el("div", { className: "eq-scroll" }, bands, graphHost);
    const atEnd = () => scroll.classList.toggle("is-end", scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 2);
    scroll.addEventListener("scroll", atEnd, { passive: true });
    queueMicrotask(atEnd);
    return scroll;
  }

  function editor() {
    const panel = el("div", { className: "eq-editor" });
    const name = el("input", { type: "text", className: "input eq-name", maxLength: EQ_NAME_MAX, placeholder: "Name this curve", value: draft.name });
    name.setAttribute("aria-label", "Curve name");
    name.disabled = busy || !model.entitled;

    const start = el("select", { className: "input eq-start" });
    start.setAttribute("aria-label", "Start from");
    start.append(el("option", { value: "", textContent: "Start from…" }), ...EQ_TEMPLATES.map((template) => el("option", { value: template.id, textContent: template.name })));
    start.disabled = busy || !model.entitled;
    start.addEventListener("change", () => {
      const template = EQ_TEMPLATES.find((entry) => entry.id === start.value);
      if (!template) return;
      draft.gains = [...template.gains];
      focusNext = ".eq-start";
      redraw();
    });

    const scroll = sliders();

    const saveButton = el("button", { type: "button", className: "btn btn-primary btn-small eq-save", textContent: "Save curve" });
    const note = el("span", { className: "eq-note" });
    refreshSave = () => {
      const named = draft.name.trim().length > 0;
      const dirty = changed();
      saveButton.disabled = busy || !model.entitled || !named || !dirty;
      note.textContent = !model.entitled ? "Saving needs this server's subscription." : dirty ? "Not saved yet." : "";
      // The tab of the curve on screen follows the sliders without a redraw (which would drop a drag).
      const tab = host?.querySelector(curveKey(selected));
      if (tab && selected !== NEW) {
        tab.classList.toggle("is-unsaved", dirty);
        if (dirty) tab.setAttribute("aria-label", `${tab.textContent}, not saved`);
        else tab.removeAttribute("aria-label");
      }
    };
    name.addEventListener("input", () => {
      draft.name = name.value;
      refreshSave();
    });
    name.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !saveButton.disabled) save();
    });
    saveButton.addEventListener("click", save);

    const actions = el("div", { className: "eq-actions" }, saveButton);
    if (selected !== NEW) {
      if (asking) {
        const label = savedOf(selected)?.name ?? "this curve";
        const sentence = `${label} goes for everyone in this server, and this can't be undone.`;
        const confirm = el("span", { className: "eq-confirm" });
        // A group named by its question, so a screen reader arriving on "Cancel" hears what is being asked.
        confirm.setAttribute("role", "group");
        confirm.setAttribute("aria-label", `Delete ${label}? ${sentence}`);
        const yes = el("button", { type: "button", className: "btn btn-danger btn-small", textContent: "Yes, delete it" });
        const no = el("button", { type: "button", className: "btn btn-ghost btn-small eq-cancel", textContent: "Cancel" });
        yes.disabled = busy;
        yes.addEventListener("click", remove);
        no.addEventListener("click", () => {
          asking = false;
          focusNext = ".eq-ask";
          redraw();
        });
        confirm.append(el("span", { textContent: sentence }), yes, no);
        actions.append(confirm);
      } else {
        const ask = el("button", { type: "button", className: "btn btn-danger-quiet btn-small eq-ask", textContent: "Delete…" });
        ask.disabled = busy;
        ask.addEventListener("click", () => {
          asking = true;
          focusNext = ".eq-cancel";
          redraw();
        });
        actions.append(ask);
      }
    }
    actions.append(note);

    panel.append(el("div", { className: "eq-head" }, name, start), scroll, actions);
    return panel;
  }

  function redraw() {
    if (!host) return;
    host.replaceChildren(...build());
    refreshSave?.();
    if (focusNext) {
      const target = host.querySelector(focusNext);
      if (target && !target.disabled) target.focus();
      focusNext = null;
    }
  }

  function build() {
    const parts = [curves()];
    if (selected !== null && (selected === NEW || savedOf(selected))) parts.push(editor());
    else {
      refreshSave = null;
      parts.push(
        el("p", {
          className: "setting-hint",
          textContent: model.presets.length
            ? "Pick a curve to change it, or start a new one."
            : model.entitled
              ? "No curves yet. Start one from a template or from flat."
              : "No curves yet.",
        })
      );
    }
    return parts;
  }

  /**
   * The editor for the server's curves as they are now. Called on every redraw of the page: what is being edited
   * stays, unless the curve it was editing is gone.
   * @param {Array<{id: string, name: string, gains: number[]}>} presets
   * @param {{entitled: boolean}} options
   */
  function render(presets, { entitled }) {
    model = { presets, entitled };
    for (const id of [...drafts.keys()]) if (id !== NEW && !savedOf(id)) drafts.delete(id);
    if (selected !== null && selected !== NEW && !savedOf(selected)) {
      selected = null;
      draft = { name: "", gains: flat() };
    }
    if (selected === NEW && !entitled) selected = null;
    host = el("div", { className: "eq" });
    host.append(...build());
    refreshSave?.();
    return host;
  }

  return { render };
}
