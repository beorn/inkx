/**
 * Bd Config Adapter
 *
 * Thin async helper around `@silvery/config`'s `loadConfig` for `km bd …`
 * subcommands. Returns the same defaulted shape that `loadConfigObject`
 * exposed on the legacy `@km/storage` path, so call sites read identically:
 *
 *   const cfg = await loadKmBdConfig(resolved.repoRoot)
 *   cfg.beads.board     // string, default "issue"
 *   cfg.beads.parent    // string, default "issue/"
 *   cfg.beads.prefix    // string, default "km"
 *   cfg.path            // resolved config file path, or null
 *
 * Keeps km-cli on the canonical `@silvery/config` loader (multi-source,
 * scoped writes, signals) without forcing every call site to hand-roll the
 * default cascade. Internal callers in `@km/storage` (Repo factory, file
 * loader) still use a sync loader since they can't await.
 */

import { loadConfig } from "@silvery/config"

export interface BdConfigView {
  /** Raw silvery Config — pass through for advanced uses (set/save/signals). */
  readonly raw: Awaited<ReturnType<typeof loadConfig>>
  /** Resolved config file path (project takes precedence over global), or null. */
  readonly path: string | null
  readonly beads: {
    readonly board: string
    readonly parent: string
    readonly prefix: string
  }
  readonly tui: {
    readonly watch: boolean
    readonly watchWorker: boolean
  }
}

export async function loadKmBdConfig(repoRoot: string): Promise<BdConfigView> {
  const config = await loadConfig({ appName: "km", cwd: repoRoot, watch: false })
  return {
    raw: config,
    path: config.path,
    beads: {
      board: config.get<string>("beads.board") ?? "issue",
      parent: config.get<string>("beads.parent") ?? "issue/",
      prefix: config.get<string>("beads.prefix") ?? "km",
    },
    tui: {
      watch: config.get<boolean>("tui.watch") ?? true,
      watchWorker: config.get<boolean>("tui.watchWorker") ?? true,
    },
  }
}
