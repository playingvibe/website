/**
 * The controls the server settings page is built from. They know nothing of the page's draft: each is handed
 * `onPick(key, value, options)` and calls it when the person changes it, so the page decides what a pick means.
 * Built with `createElement` and `textContent` throughout: role and channel names are other people's text and are
 * never parsed as markup.
 */

/** @param {string} tag @param {object} [props] @param {...(Node|string)} children @returns {HTMLElement} */
export function el(tag, props = {}, ...children) {
  const { ariaLabel, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  // An attribute rather than the `ariaLabel` property, which older Firefox does not reflect.
  if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
  node.append(...children);
  return node;
}

const names = (options) => new Map(options.map((option) => [option.id, option.name]));

/** A titled setting with its hint and control. */
export const row = (title, hint, control, wide = false) =>
  el(
    "div",
    { className: `setting${wide ? " setting-wide" : ""}` },
    el("div", { className: "setting-text" }, el("h3", { textContent: title }), hint ? el("p", { className: "setting-hint", textContent: hint }) : ""),
    el("div", { className: "setting-control" }, control)
  );

/**
 * The four controls, bound to the callback they report picks to.
 * @param {(key: string, value: any, options?: {redraw?: boolean}) => void} onPick
 */
export function createControls(onPick) {
  /** A list of ids as removable chips, and a menu to add another. */
  function picker({ key, label, selected, options, kind }) {
    const known = names(options);
    const wrap = el("div", { className: "picker" });
    const chips = el("ul", { className: "chips", ariaLabel: label });

    for (const id of selected) {
      const remove = el("button", { type: "button", className: "chip-remove", ariaLabel: `Remove ${known.get(id) ?? "unknown"}` }, "×");
      remove.dataset.key = `${key}:remove:${id}`;
      remove.addEventListener("click", () => onPick(key, selected.filter((entry) => entry !== id)));
      // A deleted role or channel still counts until removed, and says so rather than showing an id.
      chips.append(el("li", { className: "chip" }, `${kind}${known.get(id) ?? "deleted"}`, remove));
    }
    if (!selected.length) chips.append(el("li", { className: "chip chip-empty" }, "None picked"));

    const menu = el("select", { ariaLabel: `Add to ${label}`, className: "picker-add" });
    menu.dataset.key = `${key}:add`;
    menu.append(el("option", { value: "", textContent: "Add…" }));
    for (const option of options.filter((entry) => !selected.includes(entry.id))) {
      menu.append(el("option", { value: option.id, textContent: `${kind}${option.name}` }));
    }
    menu.addEventListener("change", () => menu.value && onPick(key, [...selected, menu.value]));

    wrap.append(chips, menu);
    return wrap;
  }

  /** One channel or none. */
  function singlePicker({ key, label, current, options }) {
    const menu = el("select", { ariaLabel: label, className: "picker-add" });
    menu.dataset.key = key;
    menu.append(el("option", { value: "", textContent: "Off" }));
    for (const option of options) {
      const item = el("option", { value: option.id, textContent: `#${option.name}` });
      item.selected = option.id === current;
      menu.append(item);
    }
    // A channel that was deleted: shown, so it can be replaced or switched off.
    if (current && !options.some((option) => option.id === current)) {
      const gone = el("option", { value: current, textContent: "A deleted channel" });
      gone.selected = true;
      menu.append(gone);
    }
    menu.addEventListener("change", () => onPick(key, menu.value || null));
    return menu;
  }

  function toggle({ key, label, current, disabled = false }) {
    const button = el("button", { type: "button", className: `switch${current ? " is-on" : ""}`, disabled }, current ? "On" : "Off");
    button.dataset.key = key;
    button.setAttribute("role", "switch");
    button.setAttribute("aria-checked", String(current));
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => onPick(key, !current));
    return button;
  }

  /** Free-form hex, like the personal Activity accent on the profile page. `current === null` means unset. */
  function colorPicker({ key, label, current, disabled = false }) {
    const wrap = el("div", { className: "activity-colour" });
    const input = el("input", {
      type: "color",
      className: "backdrop-colour-input",
      value: current ?? "#e05570",
      disabled,
      ariaLabel: label,
    });
    input.dataset.key = key;
    // Staged without a redraw, so the picker stays open and follows the pointer, like the personal one.
    input.addEventListener("input", () => {
      onPick(key, input.value.toLowerCase(), { redraw: false });
      reset.disabled = disabled;
    });

    const reset = el("button", {
      type: "button",
      className: "btn btn-ghost",
      textContent: "Clear",
      disabled: disabled || current === null,
    });
    reset.dataset.key = `${key}:clear`;
    reset.addEventListener("click", () => onPick(key, null));

    wrap.append(input, reset);
    return wrap;
  }

  return { picker, singlePicker, toggle, colorPicker };
}
