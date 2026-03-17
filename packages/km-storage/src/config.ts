/**
 * KM Configuration System
 *
 * Uses cosmiconfig for standard config discovery. Searches for config in:
 * - .km/config.yaml (primary)
 * - .kmrc, .kmrc.yaml, .kmrc.json
 * - km.config.js, km.config.ts
 *
 * Also reads .beads/config.yaml for beads-specific settings.
 *
 * External callers should prefer loadConfigObject() from config-object.ts
 * which returns a Config domain object with an explicit reload() method.
 */

import { cosmiconfigSync } from "cosmiconfig"
import { existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { parse as parseYaml } from "yaml"

export interface BeadsConfig {
  /** Default board for queries (e.g., "@issues") */
  board?: string
  /** Directory where new issues are created (e.g., "issues/") */
  parent?: string
  /** Issue ID prefix (e.g., "km" for km-xxxx) */
  prefix?: string
}

export interface TuiConfig {
  /** Enable file watching for live sync (default: true). Disable on large repos for faster startup. */
  watch?: boolean
  /** Use worker thread for file watching (default: true). Prevents UI blocking on large repos. */
  watchWorker?: boolean
}

export interface FolderIndexConfig {
  /** Naming convention for index files: "same-name" | "index" | "dot-md" (default: "index") */
  naming?: "same-name" | "index" | "dot-md"
  /** What to materialize in index files: "none" | "metadata" | "full" (default: "metadata") */
  materialization?: "none" | "metadata" | "full"
}

export interface KmConfig {
  beads?: BeadsConfig
  tui?: TuiConfig
  folderIndex?: FolderIndexConfig
}

/** Original beads config format from .beads/config.yaml */
export interface OriginalBeadsConfig {
  "issue-prefix"?: string
  "no-db"?: boolean
  "no-daemon"?: boolean
  "sync-branch"?: string
  actor?: string
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
})

// NOTE: Process-wide caches removed (they were buggy - ignored searchFrom).
// Use loadConfigObject() per Repo, or loadConfig() which uses cosmiconfig's cache.

/**
 * Find and load .beads/config.yaml
 * Returns both config and path for caller to track.
 */
function loadOriginalBeadsConfigWithPath(
  searchFrom?: string,
): { config: OriginalBeadsConfig; filepath: string } | null {
  let dir = searchFrom || process.cwd()

  while (dir !== "/") {
    const beadsConfigPath = join(dir, ".beads", "config.yaml")
    if (existsSync(beadsConfigPath)) {
      try {
        const content = readFileSync(beadsConfigPath, "utf-8")
        const config = parseYaml(content) as OriginalBeadsConfig
        return { config: config || {}, filepath: beadsConfigPath }
      } catch (err) {
        throw new Error(`invalid YAML in ${beadsConfigPath}: ${String(err)}`)
      }
    }
    dir = dirname(dir)
  }

  return null
}

/**
 * Get the original beads config (for migration info)
 */
export function getOriginalBeadsConfig(searchFrom?: string): OriginalBeadsConfig | null {
  return loadOriginalBeadsConfigWithPath(searchFrom)?.config ?? null
}

/**
 * Load km configuration, searching from the given directory.
 * Uses cosmiconfig's internal cache for performance.
 */
export function loadConfig(searchFrom?: string): KmConfig {
  const result = explorer.search(searchFrom)
  if (result && !result.isEmpty) {
    return result.config as KmConfig
  }
  return {}
}

/**
 * Load km configuration and return both config and filepath.
 */
export function loadConfigWithPath(searchFrom?: string): { config: KmConfig; filepath: string } | null {
  const result = explorer.search(searchFrom)
  if (result && !result.isEmpty) {
    return { config: result.config as KmConfig, filepath: result.filepath }
  }
  return null
}

/**
 * Clear the config cache (useful for testing or after config changes).
 */
export function clearConfigCache(): void {
  explorer.clearCaches()
}

/**
 * Get beads-specific configuration with defaults applied.
 * Internal: used by config-object.ts. External callers should use loadConfigObject().
 */
export function getBeadsConfig(searchFrom?: string): Required<BeadsConfig> {
  const config = loadConfig(searchFrom)
  return {
    board: config.beads?.board ?? "issue",
    parent: config.beads?.parent ?? "issue/",
    prefix: config.beads?.prefix ?? "km",
  }
}

const VALID_NAMING = new Set<FolderIndexConfig["naming"]>(["same-name", "index", "dot-md"])
const VALID_MATERIALIZATION = new Set<FolderIndexConfig["materialization"]>(["none", "metadata", "full"])

/**
 * Get folder-index configuration with defaults applied.
 * Invalid values are rejected with a warning and replaced by defaults.
 */
export function getFolderIndexConfig(searchFrom?: string): Required<FolderIndexConfig> {
  const config = loadConfig(searchFrom)
  const raw = config.folderIndex

  let naming: Required<FolderIndexConfig>["naming"] = "index"
  if (raw?.naming != null) {
    if (VALID_NAMING.has(raw.naming as FolderIndexConfig["naming"])) {
      naming = raw.naming
    } else {
      console.warn(
        `km config: invalid folderIndex.naming "${raw.naming}" — expected one of ${[...VALID_NAMING].join(", ")}. Using default "index".`,
      )
    }
  }

  let materialization: Required<FolderIndexConfig>["materialization"] = "metadata"
  if (raw?.materialization != null) {
    if (VALID_MATERIALIZATION.has(raw.materialization as FolderIndexConfig["materialization"])) {
      materialization = raw.materialization
    } else {
      console.warn(
        `km config: invalid folderIndex.materialization "${raw.materialization}" — expected one of ${[...VALID_MATERIALIZATION].join(", ")}. Using default "metadata".`,
      )
    }
  }

  return { naming, materialization }
}

/**
 * Get TUI-specific configuration with defaults applied.
 * Internal: used by config-object.ts. External callers should use loadConfigObject().
 */
export function getTuiConfig(searchFrom?: string): Required<TuiConfig> {
  const config = loadConfig(searchFrom)
  return {
    watch: config.tui?.watch ?? true,
    watchWorker: config.tui?.watchWorker ?? true,
  }
}
