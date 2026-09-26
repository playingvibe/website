import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ["node_modules/**", "website/lib/generated/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-console": "off",
      eqeqeq: "warn",
      "prefer-const": "warn",
    },
  },
  {
    // The page scripts run in a browser; `api/` and `lib/` are Node functions and keep the Node
    // globals above.
    files: ["website/*.js", "website/dash/**/*.js", "website/nowplaying/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
]);
