/**
 * Shared scoping helpers for bd subcommands.
 *
 * `resolveBoardRoots` / `formatScopeMessage` / `printEmptyDefaultBoardHint`
 * are used by every bd subcommand that needs the "configured roots by
 * default, --all to see everything" contract: `bd ready`, `bd list`,
 * `bd info`. See km-beads.bd-list-bead-scoping.
 *
 * Extracted from `bd.ts` so the shared scoping behaviour lives in one
 * place instead of being duplicated across every list-shaped subcommand.
 */

import { createTerm } from "@silvery/ag-react"
import { Bead } from "@km/beads"
import type { Repo } from "@km/storage"

const term = createTerm(process)

/**
 * Resolve the board-membership root list for a query command.
 *
 * Returns `undefined` when the user passed `--all` (opt-out), so the
 * caller skips the bead-membership filter entirely. Otherwise returns
 * the configured `beads.roots`, optionally overridden by a non-path
 * positional arg (`bd ready @km`, `bd list @km`).
 *
 * Used by `bd ready`, `bd list`, and `bd info` so they share one
 * scoping contract: configured roots by default, `--all` to see
 * everything (including vault-wide checkbox noise from fixtures and
 * archived notes). See km-beads.bd-list-bead-scoping.
 */
export function resolveBoardRoots(repo: Repo, opts: { all?: boolean }, cliRootOverride?: string): string[] | undefined {
  if (opts.all) return undefined
  return Bead.roots(repo, cliRootOverride)
}

/** Format scope context for display messages (e.g., " in path") */
export function formatScopeMessage(scopePath?: string): string {
  return scopePath ? ` in ${scopePath}` : ""
}

/**
 * Print a helpful empty-result hint for bd subcommands that scope to the
 * default beads root[0]. When `beads.roots[0]` doesn't actually exist in
 * the vault (or is empty), commands silently return 0 — this nudges the
 * user toward `--all`, an explicit board override, or a config tweak.
 *
 * `subcommand` is the bare bd subcommand the user just ran ("ready",
 * "info", "list"). `boardRoots` is the resolved roots that produced the
 * empty result.
 */
export function printEmptyDefaultBoardHint(subcommand: string, boardRoots: readonly string[] | undefined): void {
  const root0 = boardRoots && boardRoots.length > 0 ? boardRoots[0] : ""
  const rootDisplay = root0 ? `"${root0}"` : "empty"
  console.log()
  console.log(term.dim(`No issues in default board (beads.roots[0] = ${rootDisplay}).`))
  console.log(term.dim("Try:"))
  console.log(term.dim(`  km bd ${subcommand} @km          # all beads in @km/ root`))
  console.log(term.dim(`  km bd ${subcommand} --all        # all beads everywhere`))
  console.log(term.dim(`  km bd config get beads.roots     # see configured roots`))
  console.log(term.dim(`  km bd config set beads.roots '["@km"]'  # configure default`))
}
