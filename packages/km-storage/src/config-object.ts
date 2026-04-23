/**
 * Config - Configuration Domain Object
 *
 * Provides access to repo configuration.
 * Created via loadConfigObject() factory function.
 */

import { createLogger } from "loggily"
import {
  loadConfigWithPath,
  clearConfigCache,
  getBeadsConfig as getRawBeadsConfig,
  getTuiConfig as getRawTuiConfig,
  getCollapseParseConfig as getRawInactiveGlobs,
  type KmConfig,
  type BeadsConfig,
  type TuiConfig,
} from "./config.ts"

const log = createLogger("km:storage:config")

/**
 * Config interface - repo configuration.
 * Plain object, no Disposable needed (stateless).
 */
export interface Config {
  /** Path to the config file, if found */
  readonly path: string | undefined

  /** Raw config object */
  readonly raw: KmConfig

  /** Beads configuration with defaults applied */
  readonly beads: Required<BeadsConfig>

  /** TUI configuration with defaults applied */
  readonly tui: Required<TuiConfig>

  /**
   * Inactive file glob patterns (user-facing `inactive:` key). Empty array
   * when the config key is absent — every file is fully parsed.
   *
   * Files matching these globs are stored as opaque stubs and do NOT
   * contribute tasks, dates, sigils, or inline props to aggregation views.
   */
  readonly inactive: readonly string[]

  /** Reload configuration from disk */
  reload(): void
}

/**
 * Create a Config domain object for a repo.
 *
 * @example
 * const config = loadConfigObject("/path/to/repo");
 * console.log(config.beads.prefix);  // "km"
 * config.reload();  // Reload from disk
 *
 * @param searchFrom - Directory to search from (default: cwd)
 * @returns Config object
 */
export function loadConfigObject(searchFrom?: string): Config {
  log.debug?.(`loadConfigObject searchFrom=${searchFrom}`)

  // Initial load - use loadConfigWithPath to get both config and path
  let result = loadConfigWithPath(searchFrom)
  let raw = result?.config ?? {}
  let path = result?.filepath
  let beads = getRawBeadsConfig(searchFrom)
  let tui = getRawTuiConfig(searchFrom)
  let inactive: readonly string[] = getRawInactiveGlobs(searchFrom).patterns

  const config: Config = {
    get path() {
      return path
    },

    get raw() {
      return raw
    },

    get beads() {
      return beads
    },

    get tui() {
      return tui
    },

    get inactive() {
      return inactive
    },

    reload() {
      log.debug?.("reloading config")
      clearConfigCache()
      result = loadConfigWithPath(searchFrom)
      raw = result?.config ?? {}
      path = result?.filepath
      beads = getRawBeadsConfig(searchFrom)
      tui = getRawTuiConfig(searchFrom)
      inactive = getRawInactiveGlobs(searchFrom).patterns
    },
  }

  return config
}
