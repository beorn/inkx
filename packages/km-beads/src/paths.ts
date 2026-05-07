/**
 * Pure path helpers for resolving beads roots and well-known
 * subdirectories within them. Centralizes the precedence rule:
 *
 *   CLI override > config.beads.roots > default ["@km"]
 *
 * Used by callers that need to walk or write into the beads vault layout.
 * Kept pure (no I/O, no fs touches) so it composes with both sync and
 * async flows.
 */

import { join } from "node:path"
import type { BeadsConfig } from "@km/storage"

/**
 * Resolve the ordered list of beads root directories (paths relative to
 * the repo root). A CLI override, when present, wins outright and
 * returns a single-element list — the user has named one root and that
 * is the only place we should look.
 */
export function resolveBeadsRoots(config: BeadsConfig, cliOverride?: string): string[] {
  if (cliOverride) return [cliOverride]
  return config.roots ?? ["@km"]
}

/**
 * Resolve the canonical `@memory` directory. Memories live next to the
 * source-board(s) because they share provenance, but the `@memory` sigil
 * keeps them logically separate from prefix-tagged source content.
 *
 * When the primary root is itself a sigil-prefixed source board (e.g.
 * `"@km"`, the post-migration default), `@memory` lives as a *sibling* of
 * the root — `<repoRoot>/@memory` — because nesting `@km/@memory` would
 * fold memories into the bd-prefixed namespace. Otherwise (a non-sigil
 * root like `"beads"` or `"imports/km-2026-04-28"`), `@memory` lives
 * inside that root as before.
 */
export function resolveMemDir(repoRoot: string, config: BeadsConfig, cliOverride?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- resolveBeadsRoots always returns ≥1 element (CLI override or config.roots ?? ["@km"])
  const primary = resolveBeadsRoots(config, cliOverride)[0]!
  if (primary.startsWith("@")) return join(repoRoot, "@memory")
  return join(repoRoot, primary, "@memory")
}

/**
 * Resolve the per-source board directory (`@<sourcePrefix>`).
 *
 * When the primary root is itself the matching sigil-prefixed board
 * (`"@km"` for prefix `"km"`), the root IS the source board — return the
 * primary directly. Otherwise (non-sigil root, or different prefix in
 * multi-source vaults), the source board sits inside the primary as
 * `<primary>/@<sourcePrefix>`.
 *
 * The leading `@` is part of the directory name — it is the sigil that
 * becomes `node.name` when the vault is loaded.
 */
export function resolveSourceBoardDir(
  repoRoot: string,
  sourcePrefix: string,
  config: BeadsConfig,
  cliOverride?: string,
): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- resolveBeadsRoots always returns ≥1 element (CLI override or config.roots ?? ["@km"])
  const primary = resolveBeadsRoots(config, cliOverride)[0]!
  if (primary === `@${sourcePrefix}`) return join(repoRoot, primary)
  return join(repoRoot, primary, `@${sourcePrefix}`)
}
