import test from "node:test";
import assert from "node:assert/strict";
import { validateChanges, PALETTE } from "../website/api/appearance.js";

/** The appearance settings a request body may set, checked without a request. The route's own behaviour is in `websiteAppearance.test.js`. */

test("only the keys that were sent are in the changes, and null is a value that clears", () => {
  assert.deepEqual(validateChanges({ accent: null }), { changes: { accent: null } });
  assert.deepEqual(validateChanges({ fade: false, preferServerTheme: true }), {
    changes: { fade: false, preferServerTheme: true },
  });
  assert.deepEqual(validateChanges({}), { changes: {} });
});

test("a body that is not an object sets nothing", () => {
  for (const body of [null, undefined, "accent", 4]) assert.deepEqual(validateChanges(body), { changes: {} });
});

test("keys that are not settings are ignored, including the ones every object has", () => {
  assert.deepEqual(validateChanges({ constructor: 1, __proto__: { accent: PALETTE[0].value }, nope: 1 }), { changes: {} });
});

test("the palette accent is kept and anything else is refused", () => {
  assert.deepEqual(validateChanges({ accent: PALETTE[2].value }).changes, { accent: PALETTE[2].value });
  assert.equal(validateChanges({ accent: "#000000" }).error, "Not an available colour.");
});

test("colours are normalised and a non-colour is refused, for both the card and the Activity", () => {
  assert.deepEqual(validateChanges({ backgroundColor: "#F0A", activityAccent: "#FF00AA" }).changes, {
    backgroundColor: "#ff00aa",
    activityAccent: "#ff00aa",
  });
  assert.equal(validateChanges({ activityAccent: "red" }).error, "Not a colour.");
  assert.equal(validateChanges({ backgroundColor: 7 }).error, "Not a colour.");
});

test("a background must be an offered style, or null", () => {
  assert.equal(validateChanges({ background: "nope" }).error, "Not an available background.");
  assert.equal(validateChanges({ activityBackground: "nope" }).error, "Not an available background.");
  assert.deepEqual(validateChanges({ background: null, activityBackground: null }).changes, {
    background: null,
    activityBackground: null,
  });
});

test("booleans are not coerced", () => {
  assert.equal(validateChanges({ preferServerTheme: "true" }).error, "preferServerTheme must be true or false.");
  assert.equal(validateChanges({ fade: "true" }).error, "Fade must be true, false, or null.");
  assert.deepEqual(validateChanges({ fade: null }).changes, { fade: null });
});

test("with several bad values, the first in the settings' order is the one named", () => {
  assert.equal(validateChanges({ fade: "x", accent: "#000000" }).error, "Not an available colour.");
});
