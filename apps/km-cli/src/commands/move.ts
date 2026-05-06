/**
 * Move Command — polymorphic dispatch
 *
 * `km move <node...> <target>` resolves `<target>` polymorphically:
 *
 *   1. existing node id/path/name  → reparent (newParentId)
 *   2. new path-form id (`@scope/name`, no node exists)
 *                                  → rename + ref-rewrite (newCanonicalId)
 *   3. --to-root flag              → move to root (newParentId = null)
 *   4. --project <name>            → reparent under named project
 *
 * Both reparent and rename go through one ref-rewrite engine —
 * `repo.moveNodeWithRefs` — so they cannot diverge by construction.
 *
 *   km move foo @scope/existing             # reparent under existing node
 *   km move foo bar baz @scope/existing     # bulk reparent N sources under one target
 *   km move foo @scope/new-id               # rename: rewrites the canonical id + refs
 *   km move foo --to-root                   # move to root
 *   km move foo --project "Inbox"           # reparent under named project
 *   km move --where "status:done" --project "Done"  # bulk reparent matched nodes
 *
 * `--include-prose` opts into bare-id prose-mention rewriting (slow, off
 * by default; mirrors `bd rename --include-prose`).
 *
 * Path-form detection: a `<target>` is treated as a new-canonical-id
 * candidate only if (a) it looks like a path-form id (`^@<word>/...`)
 * AND (b) no node currently resolves to it. This keeps the common case
 * of `km move foo @existing-board` working as a reparent — the engine
 * tries the existing-node lookup first.
 *
 * Bulk semantics (@km/cli/bulk-multi-id-or-where):
 *   - Multiple positional sources OR `--where "<query>"` (mutually
 *     exclusive). All sources move under the same target. Rename mode
 *     (target is a fresh path-form id) is single-source-only — the
 *     target is a unique canonical id and can't be assigned to N nodes.
 *   - `--dry-run` previews matches per-source.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { findProject } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { relocateBeadSiblingTree } from "@km/beads"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"
import { getNodeDisplayName } from "@km/tree"
import type { KNode, KLink } from "@km/core"
import { resolveShortId, formatAmbiguityError } from "../utils/short-id.ts"

/**
 * Path-form heuristic: matches `@<scope>/...` (sigil + at least one slash
 * separator). Used to recognize the rename-mode target shape so a user
 * mistyped existing-id never silently routes to rename.
 */
function looksLikePathFormId(s: string): boolean {
  return /^@[^/\s]+\/.+/.test(s)
}

/**
 * Resolve one source-node argument the way move has always done:
 * prefer the `.md` file over a same-named folder when the ref looks
 * path-shaped, else fall back to the short-id resolver. Returns the
 * resolved node, or `null` when the ref didn't resolve.
 */
function resolveSourceNode(repo: Awaited<ReturnType<typeof loadRepo>>, nodeRef: string): KNode | null {
  if (nodeRef.includes("/") && !nodeRef.endsWith(".md")) {
    const direct = repo.resolveNode(`${nodeRef}.md`)
    if (direct) return direct
  }
  const result = resolveShortId(repo, nodeRef)
  if (result.candidates.length > 0) {
    return null // signal ambiguity by returning null + caller checks
  }
  return result.node
}

export const moveCommand = new Command("move")
  .description("Move (reparent) or rename a node — rewrites incoming references by default")
  .argument("[args...]", "<node...> <target>: one or more sources, then the target (existing node or new path-form id)")
  .option("-p, --project <name>", "Move to project by name")
  .option("--to-root", "Move to root level (no parent)")
  .option("--no-rewrite", "Skip rewriting incoming references")
  .option("--include-prose", "Also rewrite bare-id mentions in body text (slower; off by default)")
  .option("--dry-run", "Print the diff without writing anything")
  .option("--where <query>", "Bulk select sources via query DSL (mutually exclusive with positional sources)")
  .option("--json", "Output as JSON")
  .action(async (args: string[], options) => {
    // Argument layout per the new bulk shape:
    //   - --to-root / --project: every positional is a source.
    //   - else: last positional is the target, all preceding are sources.
    //   - --where: every positional is a target (sources via query).
    args = args ?? []
    let positionalSources: string[] = []
    let targetArg: string | undefined

    if (options.toRoot || options.project) {
      positionalSources = args
    } else if (options.where !== undefined) {
      // With --where, the positional list is at most one target.
      if (args.length > 1) {
        console.error(term.red("With --where, pass at most one target argument"))
        process.exit(1)
      }
      targetArg = args[0]
    } else {
      if (args.length === 0) {
        console.error(term.red("No source nodes provided"))
        process.exit(1)
      }
      if (args.length === 1) {
        // Single arg: that's the source; target must come from a flag
        // (--to-root or --project). With neither flag we can't proceed.
        console.error(
          term.red(
            "Specify a target (existing-id to reparent, or new path-form id to rename), --project, or --to-root",
          ),
        )
        process.exit(1)
      }
      positionalSources = args.slice(0, -1)
      targetArg = args[args.length - 1]
    }

    // Resolve source nodes. Use the first positional source's path to
    // detect the repo root (mirrors the original single-source behavior
    // where `nodeArg` doubled as a vault-detection hint).
    const repoRootHint = positionalSources[0] ?? process.cwd()
    const resolvedRoot = resolvePathArg(repoRootHint, getRootPath())
    using repo = await loadRepo(resolvedRoot.repoRoot)

    const sources: Array<{ ref: string; node: KNode }> = []

    if (options.where !== undefined) {
      if (positionalSources.length > 0) {
        console.error(term.red("Cannot pass both positional sources and --where (mutually exclusive)"))
        process.exit(1)
      }
      let nodes: KNode[]
      try {
        nodes = repo.query(options.where)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(term.red(`--where query failed: ${msg}`))
        process.exit(1)
      }
      if (nodes.length === 0) {
        console.error(term.red(`--where "${options.where}" matched no nodes`))
        process.exit(1)
      }
      for (const n of nodes) {
        const data = n.data as { id?: unknown } | undefined
        const ref = typeof data?.id === "string" && data.id ? data.id : (n.fs_path ?? n.id)
        sources.push({ ref, node: n })
      }
    } else {
      for (const sourceArg of positionalSources) {
        const r = resolvePathArg(sourceArg, resolvedRoot.repoRoot)
        const sourceRef = r.nodeRef
        if (!sourceRef) {
          console.error(term.red(`Cannot move a directory: ${sourceArg}`))
          process.exit(1)
        }
        // Pre-flight ambiguity check (resolveSourceNode swallows it for
        // the bulk path; restore the historical "did you mean:" exit.)
        const ambiguity = resolveShortId(repo, sourceRef)
        if (ambiguity.candidates.length > 0) {
          console.error(term.red(formatAmbiguityError(sourceArg, ambiguity.candidates)))
          process.exit(1)
        }
        const node = resolveSourceNode(repo, sourceRef)
        if (!node) {
          console.error(term.red(`Node not found: ${sourceArg}`))
          process.exit(1)
        }
        sources.push({ ref: sourceArg, node })
      }
    }

    // ─── Determine mode: rename vs reparent ────────────────────────────
    // Rename mode (newCanonicalId path) is selected when:
    //   - target looks like a path-form id (@scope/...)
    //   - AND no existing node resolves to that target
    //   - AND no project / to-root flag is set
    // Otherwise we're in reparent mode (newParentId path).
    let renameMode = false
    let newCanonicalId: string | undefined
    let targetParent: KNode | null = null
    let targetParentId: string | null = null

    if (options.toRoot) {
      // Reparent → root. null parent.
      targetParentId = null
    } else if (options.project) {
      // Reparent → named project.
      targetParent = findProject(repo.database, options.project)
      if (!targetParent) {
        console.error(term.red(`Project not found: ${options.project}`))
        process.exit(1)
      }
      targetParentId = targetParent.id
    } else if (targetArg) {
      // Polymorphic dispatch:
      //   1. Try to resolve as existing node → reparent
      //   2. Else, if path-form-id-shaped → rename
      //   3. Else, error with both candidates listed
      const resolvedParent = resolvePathArg(targetArg, resolvedRoot.repoRoot)
      const parentRef = resolvedParent.nodeRef
      if (parentRef) {
        const parentResult = resolveShortId(repo, parentRef)
        if (parentResult.candidates.length > 0) {
          console.error(term.red(formatAmbiguityError(targetArg, parentResult.candidates)))
          process.exit(1)
        }
        targetParent = parentResult.node
      }

      if (!targetParent && looksLikePathFormId(targetArg)) {
        // Rename mode — target doesn't exist as a node and looks like
        // a canonical path-form id. This reuses the same engine
        // (`moveNodeWithRefs` with newCanonicalId) that bd rename uses.
        renameMode = true
        newCanonicalId = targetArg
      } else if (!targetParent) {
        console.error(
          term.red(
            `Target not found: ${targetArg}\n` +
              `Hint: pass an existing node id to reparent, or a fresh path-form id like '@scope/name' to rename.`,
          ),
        )
        process.exit(1)
      } else {
        targetParentId = targetParent.id
      }
    } else {
      console.error(
        term.red("Specify a target (existing-id to reparent, or new path-form id to rename), --project, or --to-root"),
      )
      process.exit(1)
    }

    // Rename mode is single-source-only — the new canonical id is unique
    // by construction and can't be assigned to N nodes.
    if (renameMode && sources.length > 1) {
      console.error(term.red("Rename mode (target is a fresh path-form id) requires exactly one source"))
      process.exit(1)
    }

    // Multi-source bulk dispatch. Each source goes through the same
    // moveNodeWithRefs engine independently; per-id atomicity is
    // preserved (single repo.updateNode per source) but cross-id
    // atomicity is NOT — a partial failure mid-loop leaves earlier
    // sources moved.
    if (sources.length > 1) {
      await runBulkMove({
        repo,
        sources,
        targetParentId,
        targetParent,
        options,
      })
      return
    }

    // Single-source compat: keep `node` and `nodeArg` references for the
    // historical code paths.
    const node = sources[0]!.node
    const nodeArg = sources[0]!.ref

    // ─── Validation common to both modes ───────────────────────────────
    if (!renameMode && targetParentId === node.id) {
      console.error(term.red("Cannot move a node to itself"))
      process.exit(1)
    }

    // No-op detection: in reparent mode, hitting the existing parent.
    if (!renameMode && targetParentId === node.parent_id) {
      if (options.json) {
        console.log(
          JSON.stringify({
            id: node.id,
            parent_id: targetParentId,
            unchanged: true,
          }),
        )
        return
      }
      console.log(term.yellow("Node is already at this location"))
      return
    }

    // ─── --dry-run: preview without writing ────────────────────────────
    // CI-gateable invariant: dry-run NEVER calls a mutation method.
    if (options.dryRun) {
      const impact = repo.getRenameImpact(node.id)
      const displayName = getNodeDisplayName(node)
      // For rename mode the "from" label is the user-supplied id (so the
      // output reads `Would rename @km/scope/old → @km/scope/new`), not
      // the node's display title. For reparent mode, fall back to the
      // display name as before — `Would move "Old issue" → "Inbox"`.
      const fromLabel = renameMode ? nodeArg : displayName
      const targetName = renameMode
        ? newCanonicalId!
        : targetParent
          ? getNodeDisplayName(targetParent)
          : "(root)"
      if (options.json) {
        console.log(
          JSON.stringify({
            dryRun: true,
            mode: renameMode ? "rename" : "reparent",
            id: node.id,
            from: { name: displayName, parent_id: node.parent_id, fs_path: node.fs_path },
            to: renameMode
              ? { canonicalId: newCanonicalId, name: displayName }
              : { name: displayName, parent_id: targetParentId },
            impact: {
              backlinks: impact.backlinks.length,
              childCount: impact.childCount,
              ruleRefs: impact.ruleRefs,
              propRefs: impact.propRefs,
              rewriteHosts: options.rewrite === false ? 0 : impact.backlinks.length,
            },
          }),
        )
        return
      }
      const verb = renameMode ? "rename" : "move"
      console.log(`Would ${verb} ${fromLabel} → ${targetName}`)
      if (renameMode && node.fs_path) {
        const newFsPath = `${newCanonicalId}.md`
        if (newFsPath !== node.fs_path) {
          console.log(`Would relocate file: ${node.fs_path} → ${newFsPath}`)
        }
      }
      const wouldRewrite = options.rewrite !== false
      if (wouldRewrite && impact.backlinks.length > 0) {
        console.log(
          `Would rewrite references in ${impact.backlinks.length} link${impact.backlinks.length === 1 ? "" : "s"}:`,
        )
        for (const link of impact.backlinks.slice(0, 25)) {
          // backlinksForNodeId enriches KLink with `host_id` — the
          // upstream node that contains the reference. The KLink type
          // doesn't pin this field at compile time, so we read it via
          // a structural cast.
          const hostId = (link as KLink & { host_id?: string }).host_id
          const host = hostId ? repo.getNode(hostId) : null
          const label = host?.fs_path ?? host?.name ?? hostId ?? "(unknown)"
          console.log(`  ${label}`)
        }
        if (impact.backlinks.length > 25) {
          console.log(`  … and ${impact.backlinks.length - 25} more`)
        }
      } else if (!wouldRewrite) {
        console.log(
          `(--no-rewrite: ${impact.backlinks.length} link${impact.backlinks.length === 1 ? "" : "s"} would be left dangling)`,
        )
      } else {
        console.log("No incoming references to rewrite.")
      }
      if (impact.childCount > 0) {
        console.log(`Would carry ${impact.childCount} child node${impact.childCount === 1 ? "" : "s"} along.`)
      }
      if (impact.ruleRefs > 0) {
        console.log(`Would update ${impact.ruleRefs} rule reference${impact.ruleRefs === 1 ? "" : "s"}.`)
      }
      if (impact.propRefs > 0) {
        console.log(`Would update ${impact.propRefs} property reference${impact.propRefs === 1 ? "" : "s"}.`)
      }
      console.log(term.dim("No changes written. Run without --dry-run to apply."))
      return
    }

    // ─── Apply: one engine for both modes ──────────────────────────────
    // moveNodeWithRefs accepts either spec shape (renameMode picks
    // newCanonicalId; reparent mode picks newParentId). Defaults:
    //   - rewrites wikilinks, transclusions, dep-edges, alias / parent_id
    //     props, blocked-by props.
    //   - bare-id prose mentions opt-in via --include-prose.
    //   - --no-rewrite skips the walk entirely.
    const oldFsPath = node.fs_path ?? null
    const spec = renameMode ? { newCanonicalId } : { newParentId: targetParentId }
    const result = repo.moveNodeWithRefs(node.id, spec, {
      noRewrite: options.rewrite === false,
      includeProse: options.includeProse === true,
    })

    // Post-rename sibling-tree relocation: handle any bead's child
    // directory shape (`@km/scope/parent.md` ↔ `@km/scope/parent/`). Only
    // applies in rename mode; reparent doesn't change the canonical path.
    if (renameMode) {
      const relocate = relocateBeadSiblingTree(repo, {
        repoRoot: resolvedRoot.repoRoot,
        oldFsPath,
        newFsPath: result.newFsPath ?? null,
      })
      if (relocate.warning) {
        console.warn(term.yellow(`Warning: ${relocate.warning}`))
      }
    }

    if (options.json) {
      console.log(
        JSON.stringify({
          mode: renameMode ? "rename" : "reparent",
          id: node.id,
          ...(renameMode
            ? { canonicalId: newCanonicalId, fs_path: result.newFsPath ?? null }
            : { parent_id: targetParentId }),
          rewroteHosts: result.rewroteHosts,
          rewroteRefs: result.rewroteRefs,
        }),
      )
      return
    }

    const displayName = getNodeDisplayName(node)
    // For rename mode the user expects to see canonical-id → canonical-id
    // (matches bd-rename). For reparent, fall back to display titles.
    const fromLabel = renameMode ? nodeArg : displayName
    const targetName = renameMode
      ? newCanonicalId!
      : targetParent
        ? getNodeDisplayName(targetParent)
        : "(root)"
    const verb = renameMode ? "Renamed" : "Moved"
    const refsSuffix =
      result.rewroteRefs > 0
        ? ` (rewrote ${result.rewroteRefs} ref${result.rewroteRefs === 1 ? "" : "s"} in ${result.rewroteHosts} file${result.rewroteHosts === 1 ? "" : "s"})`
        : ""
    console.log(term.green("→"), `${verb} ${fromLabel} → ${targetName}${refsSuffix}`)
    if (result.failedHosts.length > 0) {
      console.warn(
        term.yellow(
          `Warning: ${result.failedHosts.length} host${result.failedHosts.length > 1 ? "s" : ""} failed to rewrite (see logs)`,
        ),
      )
    }
  })

/**
 * Multi-source bulk move runner.
 *
 * Loops the moveNodeWithRefs engine over each source, all under one
 * shared target (parent or root). Outputs an aggregated summary
 * (applied / skipped / no-op) instead of the rich single-source
 * impact tree — a 100-node bulk move would be unreadable otherwise.
 *
 * Cross-id atomicity is NOT enforced (per @km/cli/bulk-multi-id-or-where
 * spec): a failure on source #5 leaves sources 1-4 already moved. The
 * exit code is 1 when any source failed.
 */
async function runBulkMove(params: {
  repo: Awaited<ReturnType<typeof loadRepo>>
  sources: Array<{ ref: string; node: KNode }>
  targetParentId: string | null
  targetParent: KNode | null
  options: {
    dryRun?: boolean
    json?: boolean
    rewrite?: boolean
    includeProse?: boolean
  }
}): Promise<void> {
  const { repo, sources, targetParentId, targetParent, options } = params

  type Outcome = {
    ref: string
    nodeId: string
    outcome: "applied" | "noop" | "skipped"
    reason?: string
    rewroteHosts?: number
    rewroteRefs?: number
  }
  const outcomes: Outcome[] = []

  for (const { ref, node } of sources) {
    if (targetParentId === node.id) {
      outcomes.push({ ref, nodeId: node.id, outcome: "skipped", reason: "cannot move a node to itself" })
      continue
    }
    if (targetParentId === node.parent_id) {
      outcomes.push({ ref, nodeId: node.id, outcome: "noop", reason: "already at this location" })
      continue
    }

    if (options.dryRun) {
      outcomes.push({ ref, nodeId: node.id, outcome: "applied" })
      continue
    }

    const result = repo.moveNodeWithRefs(
      node.id,
      { newParentId: targetParentId },
      {
        noRewrite: options.rewrite === false,
        includeProse: options.includeProse === true,
      },
    )
    outcomes.push({
      ref,
      nodeId: node.id,
      outcome: "applied",
      rewroteHosts: result.rewroteHosts,
      rewroteRefs: result.rewroteRefs,
    })
  }

  const targetLabel = targetParent ? getNodeDisplayName(targetParent) : "(root)"
  const applied = outcomes.filter((o) => o.outcome === "applied")
  const noop = outcomes.filter((o) => o.outcome === "noop")
  const skipped = outcomes.filter((o) => o.outcome === "skipped")

  if (options.json) {
    console.log(
      JSON.stringify({
        dryRun: options.dryRun ?? false,
        target: { parent_id: targetParentId, name: targetLabel },
        applied: applied.map((o) => ({ id: o.nodeId, ref: o.ref, rewroteHosts: o.rewroteHosts, rewroteRefs: o.rewroteRefs })),
        noop: noop.map((o) => ({ id: o.nodeId, ref: o.ref })),
        skipped: skipped.map((o) => ({ id: o.nodeId, ref: o.ref, reason: o.reason })),
      }),
    )
    return
  }

  const verb = options.dryRun ? "Would move" : "Moved"
  if (applied.length > 0) {
    console.log(`${verb} ${applied.length} node(s) → ${targetLabel}:`)
    for (const o of applied) console.log(`  ${term.green("→")} ${o.ref}`)
  }
  if (noop.length > 0) {
    console.log(term.yellow(`Already at ${targetLabel} — ${noop.length} node(s) skipped:`))
    for (const o of noop) console.log(`  ${term.yellow("-")} ${o.ref}`)
  }
  if (skipped.length > 0) {
    console.log(term.red(`Skipped ${skipped.length} node(s):`))
    for (const o of skipped) console.log(`  ${term.red("-")} ${o.ref} ${term.dim(`(${o.reason ?? "unknown"})`)}`)
  }
  if (applied.length === 0 && noop.length === 0 && skipped.length === 0) {
    console.log(term.dim("No nodes to move."))
  }

  if (skipped.length > 0) process.exit(1)
}
