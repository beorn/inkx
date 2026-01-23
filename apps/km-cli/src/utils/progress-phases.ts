/**
 * Shared progress phase definitions for CLI commands
 *
 * These map phase keys from the storage layer to display labels.
 * All labels use consistent "Verb noun" style.
 */

/** Phases for syncFromFs operations (init, sync --fs) */
export const SYNC_PHASES = {
  scanning: "Scanning files",
  reconciling: "Reconciling changes",
  rules: "Evaluating rules",
} as const;

/** Phases for rebuildState operations (rebuild, sync without --fs) */
export const REBUILD_PHASES = {
  reading: "Reading events",
  applying: "Applying events",
  rules: "Evaluating rules",
} as const;

/** Phases for sync command with both events and filesystem */
export const FULL_SYNC_PHASES = {
  ...REBUILD_PHASES,
  scanning: "Scanning files",
  reconciling: "Reconciling changes",
} as const;
