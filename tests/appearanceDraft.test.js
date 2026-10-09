import test from "node:test";
import assert from "node:assert/strict";
import { bodyFor, createDraft, isDirty, markSaved, revert } from "../website/dash/appearanceDraft.js";

/** The appearance page's staged-edit rules: what is unsaved, what a save sends, what a save records. No DOM. */

const server = (extra = {}) => ({ accent: "#e05570", ...extra });

test("a fresh draft is clean and sends nothing", () => {
  const draft = createDraft(server());
  assert.equal(isDirty(draft), false);
  assert.deepEqual(bodyFor(draft), {});
  assert.equal(draft.current.backgroundColor, draft.saved.backgroundColor);
});

test("only the setting that changed is sent", () => {
  const draft = createDraft(server());
  draft.current.accent = "#4fd39c";
  assert.equal(isDirty(draft), true);
  assert.deepEqual(bodyFor(draft), { accent: "#4fd39c" });
});

test("the card colour and fade are ignored while there is no background style, and counted once there is", () => {
  const draft = createDraft(server());
  draft.current.backgroundColor = "#123456";
  draft.current.fade = true;
  assert.equal(isDirty(draft), false, "invisible on the plain card");
  assert.deepEqual(bodyFor(draft), {});

  draft.current.background = "grid";
  assert.deepEqual(bodyFor(draft), { background: "grid", backgroundColor: "#123456", fade: true });
});

test("a background colour never chosen is null, which follows the card's colour", () => {
  assert.equal(createDraft(server()).current.backgroundColor, null);
  assert.equal(createDraft(server({ backgroundColor: "#123456" })).current.backgroundColor, "#123456");
});

test("clearing a saved background colour is sent even with no style on, so the old tint cannot come back", () => {
  const draft = createDraft(server({ backgroundColor: "#123456" }));
  draft.current.accent = null;
  draft.current.backgroundColor = null;
  assert.equal(isDirty(draft), true);
  assert.deepEqual(bodyFor(draft), { accent: null, backgroundColor: null });
});

test("the Activity settings count with or without a card background", () => {
  const draft = createDraft(server());
  draft.current.activityAccent = "#ff00aa";
  draft.current.activityBackground = "aurora";
  draft.current.preferServerTheme = true;
  assert.deepEqual(bodyFor(draft), { activityAccent: "#ff00aa", activityBackground: "aurora", preferServerTheme: true });
});

test("a save records only what was sent, so a field that was held back is still owed", () => {
  const draft = createDraft(server());
  draft.current.backgroundColor = "#123456";
  draft.current.accent = "#4fd39c";
  const body = bodyFor(draft); // no background: the colour is not sent
  markSaved(draft, body);

  assert.equal(draft.saved.accent, "#4fd39c");
  assert.notEqual(draft.saved.backgroundColor, "#123456", "never sent, so never recorded as saved");

  draft.current.background = "marks";
  assert.equal(bodyFor(draft).backgroundColor, "#123456", "and goes out with the style that gives it meaning");
});

test("reverting puts every setting back to what the server holds", () => {
  const draft = createDraft(server({ background: "bars", fade: false }));
  draft.current.accent = "#000000";
  draft.current.background = null;
  draft.current.fade = true;
  revert(draft);
  assert.deepEqual(draft.current, draft.saved);
  assert.equal(isDirty(draft), false);
});

test("null is a value that clears, and is a change from a set one", () => {
  const draft = createDraft(server({ activityAccent: "#ff00aa" }));
  draft.current.activityAccent = null;
  assert.deepEqual(bodyFor(draft), { activityAccent: null });
});
