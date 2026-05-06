/**
 * Bead — domain interface (type + namespace) for bd-tracked issues.
 *
 * Follows the km declaration-merged pattern (see `KNode` in `@km/core`,
 * `KTree` in `@km/tree`):
 *
 *   import { Bead } from "@km/beads"
 *   const bead: Bead = ...           // type
 *   const id = Bead.displayId(bead)  // namespace of pure functions
 *
 * The Bead namespace is the ONE entry point for every bd operation —
 * structural predicates (`isBead`, `roots`), construction (`from`,
 * `create`), identity (`displayId`, `path`, `alias`), lookup (`resolve`,
 * `get`), queries (`query`, `queryReady`, `children`), predicates (`isBlocked`),
 * mutations (`update`, `close`, `drop`), and dependencies (`addDependency`,
 * etc.). Repo is the FIRST arg of every Repo-bound function (km
 * convention; matches `KTree.nodes(tree, ...)`).
 *
 * Migration shape (km-bead-domain-interface): the legacy module-level
 * function names (`nodeToBead`, `displayId`, `createBeadNode`, …) and
 * type aliases (`Issue`, `IssueFilter`, `CreateIssueOptions`) have been
 * removed in the L4 cutover. The implementations live under non-legacy
 * names (`nodeToBead`, `formatBeadId`, `createBeadNode`, …) and are
 * imported here. External callers must use `Bead.*`.
 */

import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"
import type { Bead as BeadInterface, BeadCreateOptions, BeadFilter } from "./types.ts"
import {
  type BeadsQueryOptions,
  formatBeadId as fnDisplayId,
  getChildBeads as fnGetChildBeads,
  getIssue as fnGetIssue,
  isBead as fnIsBead,
  isBlocked as fnIsBlocked,
  nodeToBead as fnNodeToBead,
  queryIssues as fnQueryIssues,
  queryReady as fnQueryReady,
} from "./queries.ts"
import {
  closeBeadFields as fnCloseBeadFields,
  createBeadNode as fnCreateBeadNode,
  dropBeadFields as fnDropBeadFields,
  type UpdateBeadChanges,
  updateBeadFields as fnUpdateBeadFields,
} from "./mutations.ts"
import {
  addDependency as fnAddDependency,
  getDependencies as fnGetDependencies,
  mergeDepProps as fnMergeDepProps,
  removeDependency as fnRemoveDependency,
} from "./deps.ts"
import { resolveBeadsRoots as fnResolveBeadsRoots } from "./paths.ts"
import { resolveShortId } from "./short-ids.ts"

/**
 * Bead interface — declaration-merged with the `Bead` const below.
 * The canonical fields live in `./types.ts`; this re-declaration is what
 * makes `import { Bead } from "@km/beads"` provide BOTH the type and the
 * value under verbatimModuleSyntax.
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare, @typescript-eslint/no-empty-object-type -- declaration merging pattern
export interface Bead extends BeadInterface {}

/**
 * Bead — pure-function namespace. See file-header comment for the design.
 *
 * Every Repo-bound function takes Repo as its FIRST argument.
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare -- declaration merging pattern
export const Bead = {
  // ---------------------------------------------------------------------
  // Structural / config
  // ---------------------------------------------------------------------

  /** Bead-membership predicate. See `isBead` in queries.ts for details. */
  isBead(node: KNode, roots: string[], repo: Repo | undefined): boolean {
    return fnIsBead(node, roots, repo)
  },

  /** Resolve the configured beads root list from repo config. */
  roots(repo: Repo, override?: string): string[] {
    return fnResolveBeadsRoots(repo.config.beads, override)
  },

  // ---------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------

  /**
   * Convert a KNode into a `Bead`, or `null` when the node is not a
   * real bead.
   *
   * A node is a real bead iff it carries either `data.id` (canonical
   * path-form) or `data.short_id` (legacy bd-form). Sub-checkbox
   * descendants, raw `bd query` hits, and in-file paragraphs surfaced via
   * `bd children` lack both — they used to surface as `Bead` with
   * `shortId === undefined` (the load-bearing discriminator that callers
   * had to handle in `displayId`); now they're filtered at the namespace
   * boundary.
   *
   * Type-enforcing this nullability lets call sites stop carrying the
   * "is this really a bead?" check around. See km-bead-domain-interface.
   */
  from(node: KNode, opts?: BeadsQueryOptions): Bead | null {
    const bead = fnNodeToBead(node, opts)
    if (bead.shortId === undefined) return null
    return bead as Bead
  },

  // ---------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------

  /** Display id — the sigil-rooted path-form (e.g. `@km/scope/slug`). */
  displayId(bead: Bead): string {
    return fnDisplayId(bead)
  },

  /** Path-form id — same as displayId for real beads (path IS the id). */
  path(bead: Bead): string {
    return fnDisplayId(bead)
  },

  /**
   * Legacy bd-form aliases for a bead. Reserved for legacy-id consumers
   * (CLI fallback, external tools that still index by bd-form). Returns
   * an empty list for now — the full alias chain lives on
   * `node.data.aliases`, which the Bead value type doesn't carry.
   * Walk the node directly when full alias lookup is needed.
   */
  alias(_bead: Bead): string[] {
    return []
  },

  // ---------------------------------------------------------------------
  // Resolve / lookup
  // ---------------------------------------------------------------------

  /**
   * Resolve a user-supplied id-or-alias to a node id. Returns the full
   * ULID, or `null` when nothing matches. Wraps `resolveShortId`.
   */
  resolve(repo: Repo, idRef: string): string | null {
    return resolveShortId(idRef, { repo })
  },

  /** Fetch a single bead by id, alias, or short id. */
  get(repo: Repo, idRef: string): Bead | null {
    return fnGetIssue(idRef, { repo }) as Bead | null
  },

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  /**
   * Query beads with filters. Repo first; subsequent args mirror the
   * legacy `queryIssues` signature.
   */
  query(
    repo: Repo,
    filter?: BeadFilter,
    scopePath?: string,
    boardTag?: string,
    opts?: { boardRoots?: string[]; dependentCountMap?: Map<string, number> },
  ): Bead[] {
    return fnQueryIssues(filter, scopePath, boardTag, { repo, ...opts }) as Bead[]
  },

  /**
   * Query ready beads (unblocked, todo, sorted by priority). Repo first.
   */
  queryReady(
    repo: Repo,
    filter?: Partial<BeadFilter>,
    scopePath?: string,
    boardTag?: string,
    opts?: { boardRoots?: string[]; dependentCountMap?: Map<string, number> },
  ): Bead[] {
    return fnQueryReady(filter, scopePath, boardTag, { repo, ...opts }) as Bead[]
  },

  /** Immediate child beads from in-file children and sibling-directory files. */
  children(repo: Repo, bead: Bead, opts?: { dependentCountMap?: Map<string, number> }): Bead[] {
    return fnGetChildBeads(repo, bead, opts) as Bead[]
  },

  // ---------------------------------------------------------------------
  // Predicates
  // ---------------------------------------------------------------------

  /** Is this bead blocked (has at least one open blocker)? */
  isBlocked(bead: Bead, opts?: BeadsQueryOptions): boolean {
    return fnIsBlocked(bead, opts)
  },

  // ---------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------

  /**
   * Create a new bead — returns a detached node tree for the caller to
   * persist via `repo.addNode(parentId, node)`. Repo is required for
   * symmetry; the prefix for short-id generation MUST come from
   * `options.prefix` (read from `.km/config.yaml`), not from `repo`.
   */
  create(_repo: Repo, title: string, options: BeadCreateOptions): { node: KNode; shortId: string; children: KNode[] } {
    return fnCreateBeadNode(title, options)
  },

  /** Update bead fields. Returns a partial node for `repo.updateNode`. */
  update(_repo: Repo, bead: Bead, changes: UpdateBeadChanges): Partial<KNode> {
    return fnUpdateBeadFields(bead, changes)
  },

  /** Close (mark done). Returns a partial node for `repo.updateNode`. */
  close(_repo: Repo, _bead: Bead, reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
    return fnCloseBeadFields(reason, currentData)
  },

  /** Drop (mark won't-do). Returns a partial node for `repo.updateNode`. */
  drop(_repo: Repo, _bead: Bead, reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
    return fnDropBeadFields(reason, currentData)
  },

  // ---------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------

  /** Add a `blocked-by` dependency. */
  addDependency(
    _repo: Repo,
    bead: Bead,
    dependsOn: string,
  ): { props: Record<string, unknown>; propsRaw: Record<string, string> } {
    return fnAddDependency(bead, dependsOn)
  },

  /** Remove a `blocked-by` dependency. Returns null when no-op. */
  removeDependency(
    _repo: Repo,
    bead: Bead,
    dependsOn: string,
  ): { props: Record<string, unknown>; propsRaw: Record<string, string> } | null {
    return fnRemoveDependency(bead, dependsOn)
  },

  /**
   * Get all dependencies for a bead — the union of `blockedBy` (props)
   * and inbound `blocks::` wikilinks.
   */
  getDependencies(repo: Repo, bead: Bead): string[] {
    return fnGetDependencies(bead, repo)
  },

  /**
   * Merge dependency props into existing node data. See `mergeDepProps`
   * in deps.ts for the empty-props-deletes-blocked-by semantic. The
   * `_repo` arg is reserved for future symmetry; the function is pure.
   */
  mergeDepProps(
    _repo: Repo | undefined,
    existingData: Record<string, unknown> | undefined,
    depProps: { props: Record<string, unknown>; propsRaw: Record<string, string> },
  ): Record<string, unknown> {
    return fnMergeDepProps(existingData, depProps)
  },
} as const
