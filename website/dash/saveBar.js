import { dash } from "./shared.js";

/**
 * The page's one save bar: every settings control that has unsaved edits registers here, and the bar
 * saves or reverts them together.
 */

/**
 * The pending-change registry behind the save bar.
 *
 * **Why the page does not save on click.** Writing immediately and rolling back if the request
 * fails is fine for a single toggle and wrong for a settings page: there is no way to change your
 * mind, no way to change two things as one act, and every stray click is a round trip. A staged edit with an explicit Save is what people expect from a
 * settings screen, and it is what Discord's own does.
 *
 * Each control registers `{ save, revert }` under a stable id. Re-registering the same id
 * replaces the entry, so clicking through four colours leaves one pending change, not four.
 * **A control that returns to its saved value must call `clean()` rather than register**, so
 * picking a colour and then picking the original back makes the bar go away — without that the
 * bar lies about there being something to save.
 *
 * @type {Map<string, {save: () => Promise<boolean>, revert: () => void}>}
 */
export const pending = new Map();

/** @type {?HTMLElement} */
let saveBar = null;

/**
 * @param {string} id
 * @param {{save: () => Promise<boolean>, revert: () => void}} entry
 * @returns {void}
 */
export function dirty(id, entry) {
  pending.set(id, entry);
  paintSaveBar();
}

/**
 * @param {string} id
 * @returns {void}
 */
export function clean(id) {
  pending.delete(id);
  paintSaveBar();
}

/**
 * Builds the bar once and shows or hides it from then on.
 *
 * `hidden` rather than removal: the bar is position-fixed and animating one in and out of the DOM
 * fights the transition, and a screen reader should be told the region exists before it fills.
 * @returns {void}
 */
function paintSaveBar() {
  if (!saveBar) {
    saveBar = document.createElement("div");
    saveBar.className = "save-bar";
    saveBar.setAttribute("role", "status");

    const text = document.createElement("span");
    text.className = "save-bar-text";

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "save-bar-reset";
    reset.textContent = "Reset";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "save-bar-save";
    save.textContent = "Save changes";

    reset.addEventListener("click", () => {
      // Copied before iterating: revert() calls clean(), which mutates the map being walked.
      for (const entry of [...pending.values()]) entry.revert();
      pending.clear();
      paintSaveBar();
    });

    save.addEventListener("click", async () => {
      save.disabled = true;
      reset.disabled = true;
      save.textContent = "Saving...";

      // **The page is frozen for the duration, not just these two buttons.**
      //
      // Each `save()` reads the current values, awaits its PUT, and only then copies them into the
      // saved-state variables. An edit landing inside that await was therefore written into the
      // saved state without ever being sent, and the entry was then dropped from `pending` — the
      // change was gone and the bar said it had saved. Silent data loss on the one surface whose
      // whole job is saving settings.
      //
      // `inert` rather than walking the controls and disabling them: it covers everything under
      // the panel, including controls painted later, takes them out of the focus and accessibility
      // trees while they cannot be used, and needs no record of which were already disabled (the
      // premium-gated ones are). The save bar lives on `document.body`, outside `dash`, so it stays
      // interactive throughout.
      if (dash) dash.inert = true;

      const entries = [...pending.entries()];
      // Sequential, not Promise.all: these hit two different endpoints and a settings page saving
      // four things at once is not worth the concurrency. Failures stay pending individually.
      let failed = 0;
      try {
        for (const [id, entry] of entries) {
          if (await entry.save()) pending.delete(id);
          else failed += 1;
        }
      } finally {
        // In a `finally` because a throw here would otherwise leave the whole panel inert — an
        // unusable page with no way back short of a reload.
        if (dash) dash.inert = false;
        save.disabled = false;
        reset.disabled = false;
        save.textContent = "Save changes";
        paintSaveBar();
      }

      if (failed) {
        text.textContent =
          failed === entries.length
            ? "Nothing could be saved. Try again."
            : `${failed} change${failed === 1 ? "" : "s"} couldn't be saved.`;
      }
    });

    saveBar.append(text, reset, save);
    document.body.append(saveBar);
  }

  const count = pending.size;
  saveBar.hidden = count === 0;
  if (count) {
    saveBar.querySelector(".save-bar-text").textContent =
      count === 1 ? "You have an unsaved change." : `You have ${count} unsaved changes.`;
  }
}

/**
 * Warns before leaving with edits outstanding.
 *
 * The bar is position-fixed at the bottom, so on a long page somebody can genuinely forget it is
 * there. The browser shows its own generic wording; the returned string is ignored by every
 * current browser but is still required for the event to count as cancelled.
 */
window.addEventListener("beforeunload", (event) => {
  if (!pending.size) return;
  event.preventDefault();
  event.returnValue = "";
});
