/**
 * KM Configuration System
 *
 * Uses cosmiconfig for standard config discovery. Searches for config in:
 * - .km/config.yaml (primary)
 * - .kmrc, .kmrc.yaml, .kmrc.json
 * - km.config.js, km.config.ts
 *
 * Also reads .beads/config.yaml for beads-specific settings.
 */

import { cosmiconfigSync } from "cosmiconfig";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";

export interface BeadsConfig {
  /** Default board for queries (e.g., "@issues") */
  board?: string;
  /** Directory where new issues are created (e.g., "issues/") */
  parent?: string;
  /** Issue ID prefix (e.g., "km" for km-xxxx) */
  prefix?: string;
}

export interface TuiConfig {
  /** Enable file watching for live sync (default: true). Disable on large vaults for faster startup. */
  watch?: boolean;
  /** Use worker thread for file watching (default: true). Prevents UI blocking on large vaults. */
  watchWorker?: boolean;
}

export interface KmConfig {
  beads?: BeadsConfig;
  tui?: TuiConfig;
}

/** Original beads config format from .beads/config.yaml */
export interface OriginalBeadsConfig {
  "issue-prefix"?: string;
  "no-db"?: boolean;
  "no-daemon"?: boolean;
  "sync-branch"?: string;
  actor?: string;
}

const explorer = cosmiconfigSync("km", {
  searchPlaces: [
    ".km/config.yaml",
    ".km/config.yml",
    ".km/config.json",
    ".kmrc",
    ".kmrc.yaml",
    ".kmrc.yml",
    ".kmrc.json",
    "km.config.js",
    "km.config.ts",
  ],
});

let cachedResult: { config: KmConfig; filepath: string } | null = null;
let cachedBeadsConfig: { config: OriginalBeadsConfig; filepath: string } | null = null;

/**
 * Find and load .beads/config.yaml
 */
function loadOriginalBeadsConfig(searchFrom?: string): OriginalBeadsConfig | null {
  if (cachedBeadsConfig) return cachedBeadsConfig.config;

  let dir = searchFrom || process.cwd();

  while (dir !== "/") {
    const beadsConfigPath = join(dir, ".beads", "config.yaml");
    if (existsSync(beadsConfigPath)) {
      try {
        const content = readFileSync(beadsConfigPath, "utf-8");
        const config = parseYaml(content) as OriginalBeadsConfig;
        cachedBeadsConfig = { config: config || {}, filepath: beadsConfigPath };
        return cachedBeadsConfig.config;
      } catch {
        // Invalid YAML, skip
      }
    }
    dir = dirname(dir);
  }

  return null;
}

/**
 * Get path to .beads/config.yaml if found
 */
export function getOriginalBeadsConfigPath(): string | undefined {
  return cachedBeadsConfig?.filepath;
}

/**
 * Get the original beads config (for migration info)
 */
export function getOriginalBeadsConfig(searchFrom?: string): OriginalBeadsConfig | null {
  return loadOriginalBeadsConfig(searchFrom);
}

/**
 * Load km configuration, searching from the given directory.
 * Results are cached for performance.
 */
export function loadConfig(searchFrom?: string): KmConfig {
  if (cachedResult) return cachedResult.config;

  const result = explorer.search(searchFrom);
  if (result && !result.isEmpty) {
    cachedResult = { config: result.config as KmConfig, filepath: result.filepath };
    return cachedResult.config;
  }

  return {};
}

/**
 * Get the path to the loaded config file, if any.
 */
export function getConfigPath(): string | undefined {
  return cachedResult?.filepath;
}

/**
 * Clear the config cache (useful for testing or after config changes).
 */
export function clearConfigCache(): void {
  cachedResult = null;
}

/**
 * Get beads-specific configuration with defaults applied.
 */
export function getBeadsConfig(searchFrom?: string): Required<BeadsConfig> {
  const config = loadConfig(searchFrom);
  return {
    board: config.beads?.board ?? "issue",
    parent: config.beads?.parent ?? "issue/",
    prefix: config.beads?.prefix ?? "km",
  };
}

/**
 * Get TUI-specific configuration with defaults applied.
 */
export function getTuiConfig(searchFrom?: string): Required<TuiConfig> {
  const config = loadConfig(searchFrom);
  return {
    watch: config.tui?.watch ?? true,
    watchWorker: config.tui?.watchWorker ?? true,
  };
}
