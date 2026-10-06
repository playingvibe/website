import test from "node:test";
import assert from "node:assert/strict";
import { SETTINGS } from "../website/api/appearance.js";
import { APPEARANCE_DOCUMENT_FIELDS } from "../website/lib/mongo.js";
import { createDraft } from "../website/dash/appearanceDraft.js";

/**
 * The appearance settings are named in three places that cannot import each other's code: the route's validators,
 * the stored fields, and the page's draft. They have to name the same seven, and this is what says so.
 */

const keys = (object) => Object.keys(object).sort();

test("the route validates, the document stores and the page edits the same settings", () => {
  const draft = keys(createDraft({}).saved);

  assert.deepEqual(keys(SETTINGS), keys(APPEARANCE_DOCUMENT_FIELDS), "the validators and the stored fields");
  assert.deepEqual(draft, keys(APPEARANCE_DOCUMENT_FIELDS), "the page's draft and the stored fields");
});

test("every stored field is a distinct field of the users document", () => {
  const fields = Object.values(APPEARANCE_DOCUMENT_FIELDS);
  assert.equal(new Set(fields).size, fields.length);
});
