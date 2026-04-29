/**
 * Pure path helpers for resolving beads roots and well-known
 * subdirectories within them. Centralizes the precedence rule:
 *
 *   CLI override > config.beads.roots > default ["beads"]
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
  return config.roots ?? ["beads"]
}

/**
 * Resolve the canonical `@memory` directory inside the primary beads
 * root (the first entry of `resolveBeadsRoots`). Memories live next to
 * the source-board boards because they share provenance, but the
 * `@memory` sigil keeps them logically separate from prefix-tagged
 * source content.
 */
export function resolveMemDir(repoRoot: string, config: BeadsConfig, cliOverride?: string): string {
  const primary = resolveBeadsRoots(config, cliOverride)[0]!
  return join(repoRoot, primary, "@memory")
}

/**
 * Resolve the per-source board directory (`@<sourcePrefix>`) inside the
 * primary beads root. The leading `@` is part of the directory name —
 * it is the sigil that becomes `node.name` when the vault is loaded.
 */
export function resolveSourceBoardDir(
  repoRoot: string,
  sourcePrefix: string,
  config: BeadsConfig,
  cliOverride?: string,
): string {
  const primary = resolveBeadsRoots(config, cliOverride)[0]!
  return join(repoRoot, primary, `@${sourcePrefix}`)
}
