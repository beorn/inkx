/**
 * Bd Config Adapter
 *
 * Thin async helper around `@silvery/config`'s `loadConfig` for `km bd …`
 * subcommands. Returns a defaulted shape so call sites read identically:
 *
 *   const cfg = await loadKmBdConfig(resolved.repoRoot)
 *   cfg.beads.prefix         // string, default "km" — the vault sigil for cross-vault refs
 *   cfg.beads.roots          // string[], default ["@km"] — search/write roots
 *   cfg.beads.default_scope  // string, default "inbox" — landing zone for fresh `bd create`
 *   cfg.path                 // resolved config file path, or null
 *
 * Defaults are hard-coded here (and mirrored in `getBeadsConfig` in
 * `@km/storage`) so a fresh repo with no `.km/config.yaml` still has
 * working bd defaults — `km bd create 'foo'` lands at
 * `@km/inbox/<short-id>.md` without any setup.
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
    readonly prefix: string
    readonly roots: readonly string[]
    readonly default_scope: string
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
      prefix: config.get<string>("beads.prefix") ?? "km",
      roots: config.get<string[]>("beads.roots") ?? ["@km"],
      default_scope: config.get<string>("beads.default_scope") ?? "inbox",
    },
    tui: {
      watch: config.get<boolean>("tui.watch") ?? true,
      watchWorker: config.get<boolean>("tui.watchWorker") ?? true,
    },
  }
}
