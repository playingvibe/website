/**
 * GENERATED FILE — do not edit.
 *
 * Written by scripts/sync-web-shared.js from src/domain/constants/InstanceTheme.js, which is the source of truth.
 * Edit that file and run `npm run sync:web`.
 */

const NAMES = {
  "800075471290236968": "Vibe Dev",
  "815329807377498153": "Vibe",
  "1533281867523031070": "Vibe 2",
  "1001935021436850207": "Vibe 3",
  "820636341788344321": "Vibe Beta"
};

/** Mirror of `resolveInstanceName()`. An unknown id must never become "Vibe". */
export function resolveInstanceName(clientId, stored = "") {
  return NAMES[clientId] ?? (stored || "Unknown bot");
}
