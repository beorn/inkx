/**
 * Task Lifecycle Action Handlers — `task close | drop | reopen | claim | release`
 *
 * These verbs are workflow transitions, NOT raw `set status:X` field
 * writes. The L4 invariant: `close <id>` always sets `closed_at`;
 * `set status:done` never does. Property tests pin this in
 * `tasks-lifecycle-properties.test.ts` (Wave 3 of @km/cli/task-bd-collapse).
 *
 * Pure planning lives in `lifecycle-plan.ts`; this file owns I/O
 * (commander wiring, repo load, `repo.updateNode`, terminal output,
 * JSON emission). Same separation as `mutations.ts` ↔ `mutations-plan.ts`.
 *
 * Implementation note: claim/release/close/drop/reopen all flow through
 * one `applyLifecyclePlan` helper so the field shape stays consistent.
 * That helper is also the seam the property tests drive — they call
 * `applyLifecyclePlan` (not the action handler) so they don't have to
 * synthesize commander/process exit semantics.
 *
 * Bulk surface (@km/cli/bulk-multi-id-or-where):
 *   - All five lifecycle verbs accept multiple positional ids
 *     (`task close foo bar baz`) and a `--where "<query>"` selector that
 *     resolves to a list via `repo.query`. Mutually exclusive with
 *     positional ids — passing both is an error.
 *   - `--dry-run` previews matches and the would-be transitions without
 *     writing. Validation runs in dry-run mode so the user sees which
 *     ids would be REJECTED before applying.
 *   - Cross-id atomicity is NOT enforced: each id's transition is atomic
 *     (one `repo.updateNode` via `applyLifecyclePlan`); a planner
 *     rejection on id #5 of 10 leaves ids 1-4 applied. Output reports
 *     `applied` and `skipped` lists separately; exit code is 1 if any
 *     id failed.
 */

import { getMarkerForStatus, type KNode } from "@km/core"
import type { Repo } from "@km/storage"
import { leaseMsForAssignee } from "@km/beads"
import { resolvePathArg } from "@km/fs-mount"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { resolveAssignee } from "../../utils/assignee.ts"
import { resolveShortId, formatAmbiguityError } from "../../utils/short-id.ts"
import { type LifecyclePlan, planClaim, planClose, planDrop, planRelease, planReopen } from "./lifecycle-plan.ts"

export {
  type LifecyclePlan,
  type LifecycleStatus,
  planClaim,
  planClose,
  planDrop,
  planRelease,
  planReopen,
} from "./lifecycle-plan.ts"

/**
 * Apply a lifecycle plan to a repo node atomically.
 *
 * Two paths:
 *
 *   1. **CAS path** (`update.claimCAS === true`, set by `planClaim`) —
 *      route through `repo.tryClaim`, which does a single SQL UPDATE
 *      with a WHERE clause that arbitrates concurrent claims. On
 *      contention failure, throws a holder-aware error so the caller
 *      can surface "claimed by <other>" without silently overwriting.
 *      This is the Phase 1.3 race-safety guarantee from
 *      `@km/agent/sigil-boards`.
 *
 *   2. **Standard path** (everything else) — single `repo.updateNode`
 *      call. The plan collapses status + marker + (optional)
 *      assigned_to + (optional) data mutation into one update so
 *      observers can never see an intermediate state.
 *
 * Returns the resolved owner (after the update) so callers can echo it.
 * No-ops on `plan.errors.length > 0` — caller MUST check first.
 *
 * Throws on contention failure (claim path only) — the caller's
 * responsibility to translate into a user-facing error message.
 */
export function applyLifecyclePlan(repo: Repo, node: KNode, plan: LifecyclePlan): { owner: string | null } {
  if (plan.errors.length > 0 || !plan.update) {
    throw new Error(`applyLifecyclePlan called with errored plan: ${plan.errors.join("; ")}`)
  }
  const update = plan.update

  // CAS path — claim arbitration. The `assignedTo` is the actor; lease
  // policy is per-assignee (agent vs user shape) via @km/beads.
  if (update.claimCAS) {
    const actor = update.assignedTo
    if (typeof actor !== "string") {
      throw new Error("applyLifecyclePlan: claimCAS requires update.assignedTo to be a string actor")
    }
    const result = repo.tryClaim(node.id, actor, leaseMsForAssignee(actor))
    if (!result.ok) {
      // Translate to a holder-aware error. Caller catches and reports.
      if (result.reason === "closed") {
        throw new ClaimContentionError(`Task is closed; reopen before claiming: ${node.id}`, result)
      }
      if (result.reason === "not-found") {
        throw new ClaimContentionError(`Task not found: ${node.id}`, result)
      }
      const expiry = result.expiresAt ? ` (lease expires ~${new Date(result.expiresAt).toISOString()})` : ""
      throw new ClaimContentionError(
        `Task already claimed by ${result.currentOwner ?? "unknown"}${expiry}: ${node.id}`,
        result,
      )
    }
    return { owner: result.node.assigned_to ?? null }
  }

  // Standard path — non-claim transitions.
  //
  // Build the data merge for closed_at / reason tracking. Data is a
  // full-replacement column — any merge MUST start from the current
  // node.data so siblings (id, aliases, short_id, …) are preserved.
  // Mirrors closeBeadFields/dropBeadFields' currentData discipline (see
  // km-beads.close-drop-data-wipe).
  let dataPatch: Record<string, unknown> | undefined
  const currentData = (node.data ?? {}) as Record<string, unknown>
  if (update.setClosedAt) {
    dataPatch = { ...currentData, closed_at: new Date().toISOString() }
    if (update.reason) {
      // The reason key mirrors km-beads' shape: closeReason for close,
      // dropReason for drop. Status discriminates which slot to write.
      const reasonKey = update.status === "dropped" ? "dropReason" : "closeReason"
      dataPatch[reasonKey] = update.reason
    }
  } else if (update.clearClosedAt) {
    // Reopen — strip closed_at and the reason markers so a future
    // close/drop writes a fresh timestamp instead of stacking on top.
    const { closed_at: _ca, closeReason: _cr, dropReason: _dr, ...rest } = currentData
    dataPatch = { ...rest }
  }

  const updates: Partial<KNode> = {
    item: { task: { status: update.status, marker: getMarkerForStatus(update.status) } },
    updated_at: Date.now(),
  }
  if (update.assignedTo === null) updates.assigned_to = undefined
  else if (update.assignedTo !== undefined) updates.assigned_to = update.assignedTo
  if (dataPatch !== undefined) updates.data = dataPatch

  repo.updateNode(node.id, updates)

  // Compute resolved owner: explicit override wins; otherwise inherit
  // from the pre-update node (same value the caller already has).
  let owner: string | null
  if (update.assignedTo === null) owner = null
  else if (update.assignedTo !== undefined) owner = update.assignedTo
  else owner = node.assigned_to ?? null

  return { owner }
}

/**
 * Thrown by `applyLifecyclePlan` when the CAS claim path loses contention.
 *
 * Carries the underlying `tryClaim` failure result so callers can choose
 * to inspect `currentOwner` / `expiresAt` / `reason` rather than parse the
 * message. The bulk runner translates these into per-id `skipped` outcomes.
 */
export class ClaimContentionError extends Error {
  constructor(
    message: string,
    public readonly detail: Extract<ReturnType<Repo["tryClaim"]>, { ok: false }>,
  ) {
    super(message)
    this.name = "ClaimContentionError"
  }
}

/**
 * Look up a task by user-supplied ref via the canonical resolver chain.
 *
 * Wraps `resolveShortId` (which handles slug → scope/slug → full path-form)
 * with the lifecycle-handler convention of "print an error and exit on
 * ambiguity / not-found, return the node otherwise". Ambiguity is the
 * one case we surface specially — both bare-slug input ("close foo")
 * and path-shaped input that returned candidates print the
 * "did you mean:" list before exiting non-zero.
 */
function resolveOrExit(repo: Repo, ref: string): KNode {
  const result = resolveShortId(repo, ref)
  if (result.candidates.length > 0) {
    console.error(term.red(formatAmbiguityError(ref, result.candidates)))
    process.exit(1)
  }
  if (!result.node) {
    console.error(term.red(`Task not found: ${ref}`))
    process.exit(1)
  }
  return result.node
}

/**
 * Common output options for lifecycle subcommands.
 *
 * - `json`: emit machine-readable JSON instead of the human summary.
 * - `dryRun`: classify-only; never call `repo.updateNode`. Mirrors
 *   `move.ts --dry-run` discipline.
 * - `where`: query DSL string; resolves via `repo.query` to the target
 *   set. Mutually exclusive with positional refs.
 */
export interface LifecycleOptions {
  json?: boolean
  dryRun?: boolean
  where?: string
}

/** Options bag for `task close | drop`. */
export interface CloseDropOptions extends LifecycleOptions {
  reason?: string
}

/** A single id's outcome in a bulk lifecycle run. */
interface BulkOutcome {
  /** Display label — sigil path-form when known, else node id. */
  ref: string
  /** Underlying node id (only present once resolution succeeds). */
  nodeId?: string
  /** When the transition would apply: from-status → to-status. */
  from?: string
  to?: string
  /** When skipped: human-readable reason (may be a planner error). */
  reason?: string
  /** Dispatch outcome — `applied` means the planner said yes. */
  outcome: "applied" | "skipped"
}

/**
 * Look up nodes for the bulk run.
 *
 * Three input shapes (validated mutually exclusive at the wrapper):
 *   - one or more positional refs → resolve each; not-found / ambiguous
 *     refs become `skipped` outcomes (we don't `process.exit(1)` early
 *     so the user sees the full report).
 *   - `--where "<query>"` → run `repo.query`. Empty match is a hard
 *     error (matches `--where` semantics in other CLIs: a no-match is
 *     suspicious enough to fail loud rather than silently no-op).
 *
 * Returns parallel arrays of `(node, ref)` so the caller can build
 * outcome rows that mention the user's input verbatim.
 */
function resolveBulkTargets(
  repo: Repo,
  refs: string[],
  where: string | undefined,
): { resolved: Array<{ node: KNode; ref: string }>; skipped: BulkOutcome[]; fatal?: string } {
  const resolved: Array<{ node: KNode; ref: string }> = []
  const skipped: BulkOutcome[] = []

  if (where !== undefined) {
    if (refs.length > 0) {
      return {
        resolved,
        skipped,
        fatal: "Cannot pass both positional ids and --where (mutually exclusive)",
      }
    }
    let nodes: KNode[]
    try {
      nodes = repo.query(where)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { resolved, skipped, fatal: `--where query failed: ${msg}` }
    }
    if (nodes.length === 0) {
      return { resolved, skipped, fatal: `--where "${where}" matched no nodes` }
    }
    for (const node of nodes) {
      const data = node.data as { id?: unknown } | undefined
      const ref = typeof data?.id === "string" && data.id ? data.id : (node.fs_path ?? node.id)
      resolved.push({ node, ref })
    }
    return { resolved, skipped }
  }

  if (refs.length === 0) {
    return { resolved, skipped, fatal: "Task ID or --where required" }
  }

  for (const ref of refs) {
    const result = resolveShortId(repo, ref)
    if (result.candidates.length > 0) {
      skipped.push({
        ref,
        outcome: "skipped",
        reason: formatAmbiguityError(ref, result.candidates),
      })
      continue
    }
    if (!result.node) {
      skipped.push({ ref, outcome: "skipped", reason: `not found` })
      continue
    }
    resolved.push({ node: result.node, ref })
  }
  return { resolved, skipped }
}

/** Verb name → status the planner would target on success. */
type LifecycleVerb = "claim" | "release" | "close" | "drop" | "reopen"

/** Planner factory selected by verb. Wraps the per-verb argument shape. */
function selectPlan(
  verb: LifecycleVerb,
  node: KNode,
  ref: string,
  ctx: { actor?: string; reason?: string },
): LifecyclePlan {
  switch (verb) {
    case "claim":
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- caller ensures actor is set when verb === "claim"
      return planClaim(node, ref, ctx.actor!)
    case "release":
      return planRelease(node, ref)
    case "close":
      return planClose(node, ref, ctx.reason)
    case "drop":
      return planDrop(node, ref, ctx.reason)
    case "reopen":
      return planReopen(node, ref)
  }
}

/** Read the current task status off a KNode for outcome reporting. */
function statusOf(node: KNode): string {
  return node.item?.task?.status ?? "todo"
}

/** Per-verb display config — labels and the headline single-id glyph. */
const VERB_DISPLAY: Record<
  LifecycleVerb,
  { applied: string; verbing: string; glyph: string; color: "green" | "yellow" | "dim" }
> = {
  claim: { applied: "Claimed", verbing: "claim", glyph: "◐", color: "green" },
  release: { applied: "Released", verbing: "release", glyph: "○", color: "dim" },
  close: { applied: "Closed", verbing: "close", glyph: "✓", color: "green" },
  drop: { applied: "Dropped", verbing: "drop", glyph: "⊘", color: "yellow" },
  reopen: { applied: "Reopened", verbing: "reopen", glyph: "↺", color: "green" },
}

/**
 * Bulk lifecycle runner — the shared core for all five verbs.
 *
 * Resolves targets (positional or `--where`), runs the per-verb planner
 * against each, classifies into `applied` / `skipped`, optionally
 * applies (when not dry-run), and emits the summary.
 *
 * Cross-id atomicity is NOT enforced: see file header for rationale.
 * Per-id atomicity is preserved by `applyLifecyclePlan` (one
 * `repo.updateNode` per node).
 *
 * Returns the outcome object so callers can override formatting in the
 * single-id case (we still print the historical "Closed: <hash>"
 * one-liner when one id resolves and applies, to avoid noisy output for
 * the common case).
 */
async function runLifecycleBulk(
  verb: LifecycleVerb,
  refs: string[],
  options: LifecycleOptions & { reason?: string },
): Promise<{ outcomes: BulkOutcome[]; hadError: boolean }> {
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const { resolved: targets, skipped: preSkipped, fatal } = resolveBulkTargets(repo, refs, options.where)
  if (fatal) {
    console.error(term.red(fatal))
    process.exit(1)
  }

  const actor = verb === "claim" ? resolveAssignee() : undefined
  const outcomes: BulkOutcome[] = [...preSkipped]
  let hadError = preSkipped.length > 0

  for (const { node, ref } of targets) {
    const plan = selectPlan(verb, node, ref, { actor, reason: options.reason })
    if (plan.errors.length > 0) {
      outcomes.push({
        ref,
        nodeId: node.id,
        outcome: "skipped",
        reason: plan.errors.join("; "),
      })
      hadError = true
      continue
    }
    const targetStatus = plan.update?.status ?? "?"
    const fromStatus = statusOf(node)
    if (!options.dryRun) {
      try {
        applyLifecyclePlan(repo, node, plan)
      } catch (err) {
        // ClaimContentionError surfaces as a per-id `skipped` outcome
        // (race-loss reporting). Other errors propagate.
        if (err instanceof ClaimContentionError) {
          outcomes.push({
            ref,
            nodeId: node.id,
            outcome: "skipped",
            reason: err.message,
          })
          hadError = true
          continue
        }
        throw err
      }
    }
    outcomes.push({
      ref,
      nodeId: node.id,
      outcome: "applied",
      from: fromStatus,
      to: targetStatus,
    })
  }

  emitBulkOutput(verb, outcomes, options)
  return { outcomes, hadError }
}

/**
 * Render the bulk outcome — JSON or pretty.
 *
 * Single-id, single-applied path keeps the historical one-liner shape
 * (`✓ Closed: <hash>`) so existing callers / scripts that grep for
 * "Closed:" don't break. Multi-id always uses the grouped summary.
 */
function emitBulkOutput(
  verb: LifecycleVerb,
  outcomes: BulkOutcome[],
  options: LifecycleOptions & { reason?: string },
): void {
  const display = VERB_DISPLAY[verb]
  const applied = outcomes.filter((o) => o.outcome === "applied")
  const skipped = outcomes.filter((o) => o.outcome === "skipped")

  if (options.json) {
    console.log(
      JSON.stringify({
        dryRun: options.dryRun ?? false,
        verb,
        applied: applied.map((o) => ({ id: o.nodeId, ref: o.ref, from: o.from, to: o.to })),
        skipped: skipped.map((o) => ({ id: o.nodeId, ref: o.ref, reason: o.reason })),
      }),
    )
    return
  }

  // Single-id, single-applied: keep the historical one-liner.
  const isSingleSimple = outcomes.length === 1 && applied.length === 1 && !options.dryRun
  if (isSingleSimple) {
    const o = applied[0]
    if (o !== undefined) {
      const colorize = display.color === "green" ? term.green : display.color === "yellow" ? term.yellow : term.dim
      console.log(colorize(display.glyph), `${display.applied}:`, (o.nodeId ?? "").slice(-8))
      if (options.reason) console.log(term.dim(`  Reason: ${options.reason}`))
      return
    }
  }

  const action = options.dryRun ? `Would ${display.verbing}` : display.applied
  if (applied.length > 0) {
    const colorize = display.color === "green" ? term.green : display.color === "yellow" ? term.yellow : term.dim
    console.log(`${action} ${applied.length} task(s):`)
    for (const o of applied) {
      console.log(`  ${colorize("✓")} ${o.ref}${o.from !== o.to ? term.dim(` (${o.from} → ${o.to})`) : ""}`)
    }
    if (options.reason) console.log(term.dim(`  Reason: ${options.reason}`))
  }
  if (skipped.length > 0) {
    console.log(term.yellow(`Skipped ${skipped.length} task(s):`))
    for (const o of skipped) {
      console.log(`  ${term.yellow("-")} ${o.ref} ${term.dim(`(reason: ${o.reason ?? "unknown"})`)}`)
    }
  }
  if (applied.length === 0 && skipped.length === 0) {
    console.log(term.dim("No tasks matched."))
  }
}

/**
 * Normalize the action-handler `id` argument into a refs[] array.
 *
 * Commander's variadic argument shape is an array of strings; the
 * single-id form (used by bd shims and historical action signatures)
 * passes a bare string. Accept either so the bulk path doesn't push a
 * breaking change down to the bd surface.
 */
function asRefs(input: string | string[] | undefined): string[] {
  if (input === undefined) return []
  if (Array.isArray(input)) return input
  return [input]
}

/** `task claim <id...>` action handler. */
export async function claimTaskLifecycle(
  ref: string | string[] | undefined,
  options: LifecycleOptions = {},
): Promise<void> {
  const { hadError } = await runLifecycleBulk("claim", asRefs(ref), options)
  if (hadError) process.exit(1)
}

/** `task release <id...>` action handler. */
export async function releaseTaskLifecycle(
  ref: string | string[] | undefined,
  options: LifecycleOptions = {},
): Promise<void> {
  const { hadError } = await runLifecycleBulk("release", asRefs(ref), options)
  if (hadError) process.exit(1)
}

/** `task close <id...> [--reason TEXT]` action handler. */
export async function closeTaskLifecycle(
  ref: string | string[] | undefined,
  options: CloseDropOptions = {},
): Promise<void> {
  const { hadError } = await runLifecycleBulk("close", asRefs(ref), options)
  if (hadError) process.exit(1)
}

/** `task drop <id...> [--reason TEXT]` action handler. */
export async function dropTaskLifecycle(
  ref: string | string[] | undefined,
  options: CloseDropOptions = {},
): Promise<void> {
  const { hadError } = await runLifecycleBulk("drop", asRefs(ref), options)
  if (hadError) process.exit(1)
}

/** `task reopen <id...>` action handler. */
export async function reopenTaskLifecycle(
  ref: string | string[] | undefined,
  options: LifecycleOptions = {},
): Promise<void> {
  const { hadError } = await runLifecycleBulk("reopen", asRefs(ref), options)
  if (hadError) process.exit(1)
}

// Keep a single-id resolveOrExit export-shim for any external import
// site that grew up before bulk; its semantics didn't change.
export { resolveOrExit }
