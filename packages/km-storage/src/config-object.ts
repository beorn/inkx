/**
 * Config - Configuration Domain Object
 *
 * Provides access to vault configuration.
 * Created via loadConfigObject() factory function.
 */

import createDebug from "debug"
import {
  loadConfig as loadRawConfig,
  getConfigPath,
  clearConfigCache,
  getBeadsConfig as getRawBeadsConfig,
  getTuiConfig as getRawTuiConfig,
  type KmConfig,
  type BeadsConfig,
  type TuiConfig,
} from "./config.ts"

const debug = createDebug("km:storage:config")

/**
 * Config interface - vault configuration.
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

  /** Reload configuration from disk */
  reload(): void
}

/**
 * Create a Config domain object for a vault.
 *
 * @example
 * const config = loadConfigObject("/path/to/vault");
 * console.log(config.beads.prefix);  // "km"
 * config.reload();  // Reload from disk
 *
 * @param searchFrom - Directory to search from (default: cwd)
 * @returns Config object
 */
export function loadConfigObject(searchFrom?: string): Config {
  debug("loadConfigObject", { searchFrom })

  // Initial load
  let raw = loadRawConfig(searchFrom)
  let path = getConfigPath()
  let beads = getRawBeadsConfig(searchFrom)
  let tui = getRawTuiConfig(searchFrom)

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

    reload() {
      debug("reloading config")
      clearConfigCache()
      raw = loadRawConfig(searchFrom)
      path = getConfigPath()
      beads = getRawBeadsConfig(searchFrom)
      tui = getRawTuiConfig(searchFrom)
    },
  }

  return config
}
