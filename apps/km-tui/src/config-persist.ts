/**
 * Config Persistence -- thin re-export from @km/commands
 *
 * All config types, defaults, and I/O now live in @km/commands/src/config.ts.
 * This file re-exports for backwards compatibility with existing imports.
 *
 * @deprecated Import directly from "@km/commands" instead.
 */

export type { KmConfig, ExpandedLocation } from "@km/commands"
export {
  DEFAULT_LOCATIONS,
  loadConfig,
  saveConfig,
  expandLocationTemplate,
  isDateTemplate,
  isPositionalTemplate,
} from "@km/commands"
