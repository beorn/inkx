/**
 * Pure planning for `km task dep add | rm | ls`.
 *
 * The planner does the work that doesn't need I/O — id resolution, error
 * collection, formatting — so unit tests can exercise it without spinning
 * up commander or pulling in the silvery-react import chain. The action
 * handler in `dep.ts` consumes a plan and routes it through `addGraphEdge`
 * / `removeGraphEdge` / `getGraphEdges` from `@km/storage`.
 *
 * Atomicity contract: planAddDeps / planRemoveDeps resolve every blocker
 * first; if any one fails to resolve, `errors` is non-empty and the
 * action handler must abort BEFORE making any storage call. Tests pin
 * this — bulk `dep add A B C D` on a missing C never partially writes.
 */

import { Bead, type Bead as BeadType } from "@km/beads"
import { getGraphEdges, type Repo } from "@km/storage"
import { resolveTaskNode } from "../../utils/resolve-task.ts"

// =============================================================================
// Types
// =============================================================================

/**
 * One resolved blocker from the user-supplied list. We carry the
 * canonical node id (what `addGraphEdge` wants) plus the original input
 * (what we echo back in messages).
 */
export interface ResolvedBlocker {
  input: string
  blockerNodeId: string
  blockerShortId?: string
}

/** Plan for `tasks dep add <id> <blocker...>`. */
export interface DepAddPlan {
  /** Resolved target (the dependent — the one that gets blocked-by). */
  targetNodeId?: string
  targetShortId?: string
  /** Resolved blockers, one per non-error input. */
  blockers: ResolvedBlocker[]
  /** Per-input errors (target unresolvable, blocker unresolvable, …). */
  errors: string[]
  /** Per-input non-fatal warnings (e.g. "self-blocking, skipped"). */
  warnings: string[]
}

/** Plan for `tasks dep rm <id> <blocker...>`. */
export interface DepRemovePlan extends DepAddPlan {}

/** One edge entry in the `tasks dep ls` output. */
export interface DepListEntry {
  direction: "in" | "out"
  /** The other node — for "in" it's the blocker, for "out" the dependent. */
  otherShortId?: string
  otherNodeId: string
  otherTitle?: string
}

/** Plan for `tasks dep ls <id>`. */
export interface DepListPlan {
  targetNodeId?: string
  targetShortId?: string
  /** Edges incident to target — both directions. */
  entries: DepListEntry[]
  errors: string[]
}

// =============================================================================
// Public planners
// =============================================================================

/**
 * Plan a `tasks dep add <id> <blocker...>` invocation.
 *
 * Resolves every input via `resolveTaskNode` (the same chain bd / tasks
 * use). Collects errors for unknown ids; the action handler should abort
 * on any non-empty error list (atomicity).
 *
 * Self-blocking (`dep add A A`) is filtered as a warning rather than an
 * error — it's harmless, just nonsensical.
 */
export function planAddDeps(repo: Repo, id: string, blockerInputs: string[]): DepAddPlan {
  const plan: DepAddPlan = { blockers: [], errors: [], warnings: [] }

  const target = resolveTaskNode(repo, id)
  if (!target) {
    plan.errors.push(`Task not found: ${id}`)
    return plan
  }
  plan.targetNodeId = target.id
  plan.targetShortId = readShortId(target.data)

  if (blockerInputs.length === 0) {
    plan.errors.push(`No blockers specified — use 'tasks dep add <id> <blocker> [<blocker>...]'`)
    return plan
  }

  for (const input of blockerInputs) {
    const blocker = resolveTaskNode(repo, input)
    if (!blocker) {
      plan.errors.push(`Blocker not found: ${input}`)
      continue
    }
    if (blocker.id === target.id) {
      plan.warnings.push(`Skipping self-blocking edge: ${input}`)
      continue
    }
    plan.blockers.push({
      input,
      blockerNodeId: blocker.id,
      blockerShortId: readShortId(blocker.data),
    })
  }

  return plan
}

/**
 * Plan a `tasks dep rm <id> <blocker...>` invocation.
 *
 * Symmetric to `planAddDeps`. The action handler still routes through
 * `removeGraphEdge`, which is idempotent — passing a not-currently-set
 * blocker is a silent no-op, NOT an error. We surface that as a warning
 * so the user knows nothing changed.
 */
export function planRemoveDeps(repo: Repo, id: string, blockerInputs: string[]): DepRemovePlan {
  const plan: DepRemovePlan = { blockers: [], errors: [], warnings: [] }

  const target = resolveTaskNode(repo, id)
  if (!target) {
    plan.errors.push(`Task not found: ${id}`)
    return plan
  }
  plan.targetNodeId = target.id
  plan.targetShortId = readShortId(target.data)

  if (blockerInputs.length === 0) {
    plan.errors.push(`No blockers specified — use 'tasks dep rm <id> <blocker> [<blocker>...]'`)
    return plan
  }

  for (const input of blockerInputs) {
    const blocker = resolveTaskNode(repo, input)
    if (!blocker) {
      plan.errors.push(`Blocker not found: ${input}`)
      continue
    }
    plan.blockers.push({
      input,
      blockerNodeId: blocker.id,
      blockerShortId: readShortId(blocker.data),
    })
  }

  return plan
}

/**
 * Plan a `tasks dep ls <id>` invocation.
 *
 * Reads both directions in one go — outbound (this task blocks …) and
 * inbound (this task is blocked by …). Each entry carries the other
 * node's short id (or canonical id) and a friendly title for the
 * formatter.
 */
export function planListDeps(repo: Repo, id: string): DepListPlan {
  const plan: DepListPlan = { entries: [], errors: [] }

  const target = resolveTaskNode(repo, id)
  if (!target) {
    plan.errors.push(`Task not found: ${id}`)
    return plan
  }
  plan.targetNodeId = target.id
  plan.targetShortId = readShortId(target.data)

  // Inbound — the target's own blocked-by list. Surface via the bead
  // view so we get the union of props-based + inbound `blocks::`-link
  // dependencies (kept consistent with `bd dep list`).
  //
  // `Bead.from` returns null on a non-bead node (no short id). For
  // those, we still want to surface props-based blockers — fall back
  // to a direct read off the node's data.
  const targetBead = Bead.from(target, { repo })
  const blockerKeys = targetBead ? Bead.getDependencies(repo, targetBead) : readBlockedByDirect(target.data)
  for (const blockerKey of blockerKeys) {
    const node = resolveTaskNode(repo, blockerKey)
    plan.entries.push({
      direction: "in",
      otherShortId: blockerKey,
      otherNodeId: node?.id ?? blockerKey,
      otherTitle: node?.content,
    })
  }

  // Outbound — what this task blocks. Routed through the same
  // `getGraphEdges` API the dep-add/rm path uses, so the read view is
  // consistent with the writer.
  const outEdges = getGraphEdges(repo, target.id, { rel: "blocks", direction: "out" })
  for (const edge of outEdges) {
    const node = repo.getNode(edge.to)
    if (!node) continue
    const dependentBead = node.data ? maybeBead(node, repo) : undefined
    plan.entries.push({
      direction: "out",
      otherShortId: dependentBead?.shortId,
      otherNodeId: edge.to,
      otherTitle: node.content,
    })
  }

  return plan
}

// =============================================================================
// Helpers
// =============================================================================

function readShortId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined
  const d = data as Record<string, unknown>
  if (typeof d.id === "string") return d.id
  if (typeof d.short_id === "string") return d.short_id
  return undefined
}

function maybeBead(node: { data?: unknown }, repo: Repo): BeadType | undefined {
  // Defensive: Bead.from returns null on non-beads. We collapse to
  // undefined so callers can use `bead?.shortId` directly.
  try {
    return Bead.from(node as Parameters<typeof Bead.from>[0], { repo }) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Direct prop read for non-bead nodes (Bead.getDependencies needs a
 * Bead). Mirrors `resolveBlockedBy` in @km/beads/queries.ts; kept inline
 * here to avoid importing internals.
 */
function readBlockedByDirect(data: unknown): string[] {
  if (!data || typeof data !== "object") return []
  const props = (
    data as { props?: Record<string, { type?: string; target?: string; values?: Array<{ target: string }> }> }
  ).props
  const entry = props?.["blocked-by"]
  if (!entry) return []
  if (entry.type === "link" && entry.target) return [entry.target]
  if (entry.type === "list" && entry.values) return entry.values.map((v) => v.target)
  return []
}
