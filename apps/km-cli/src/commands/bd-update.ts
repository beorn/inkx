/**
 * Beads Update — `bd update <id> [flags]`
 *
 * Multi-field mutator. Maps each `--status / --priority / --assignee /
 * --title / --description / --notes / --type / --parent / --claim` into
 * a `Bead.update` call (which builds a typed UpdateBeadChanges) plus a
 * post-update parent move and child paragraph mutations for description/
 * notes — those have to happen at the repo level since they're not part
 * of the bead's primary node.
 *
 * The `--parent` resolution mirrors `bd create`: try `resolveIssueArg`
 * first (handles bd-form, sigil-id, ULID), then fall back to path-form
 * lookups (`foo/`, `@km/foo/`).
 *
 * The `--priority` flag rewrites the `#P[0-4]` hashtag in the bead's
 * content (the H1 line, post-merge in file nodes). The legacy
 * `nodes.priority` column was dropped at SCHEMA_VERSION=11; the H1
 * hashtag is now the source of truth (per docs/future/beads.md).
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead, relocateBeadSiblingTree, type Bead as BeadCtor, type UpdateBeadChanges } from "@km/beads"
import { setPriorityInContent, type KNode } from "@km/core"
import type { Repo } from "@km/storage"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { resolveAssignee } from "../utils/assignee.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

interface ParentTarget {
  id: string
  canonicalId: string | null
}

export function registerBdUpdate(parent: BdRegistrar): void {
  const updateCmd = new Command("update")
    .argument("[id]", "Bead ID")
    .description("Update issue fields")
    .option("-s, --status <status>", "Set status (todo, wip, blocked, done, dropped)")
    .option("-p, --priority <value>", "Set priority (e.g. P0-P4 or 0-4)")
    .option("-a, --assignee <name>", "Set assignee")
    .option("-t, --title <title>", "Set title")
    .option("-d, --description <text>", "Set description (replaces first child paragraph)")
    .option("-n, --notes <text>", "Append notes (adds child paragraph)")
    .option("--type <type>", "Set issue type")
    .option("--parent <id>", "Move issue under a new parent (path-form, bd-form, or short id)")
    .option("--claim", "Claim issue (set status=wip + assignee to you)")
    .actionMerged(async (opts) => {
      if (!opts.id) {
        updateCmd.outputHelp()
        return
      }

      const resolved = resolvePathArg(undefined)
      using repo = await loadRepo(resolved.repoRoot)
      const issue = resolveIssueArg(repo, opts.id)
      if (!issue) {
        console.error(term.red(`Bead not found: ${opts.id}`))
        process.exitCode = 1
        return
      }

      // Resolve --parent up front so we fail fast before any mutation.
      // Try bd-form short id first (resolveIssueArg understands km-foo, @km/foo,
      // etc.), then fall back to path-form lookup (foo/, @km/foo/).
      const parentTarget = opts.parent
        ? await resolveParentTarget(repo, resolved.repoRoot, opts.parent as string)
        : null
      if (opts.parent && !parentTarget) {
        console.error(term.red(`Parent not found: ${opts.parent}`))
        process.exitCode = 1
        return
      }

      // Handle --claim: set status + assignee atomically
      if (opts.claim) {
        opts.status = opts.status ?? "wip"
        opts.assignee = opts.assignee ?? resolveAssignee()
      }

      const changes: UpdateBeadChanges = {}
      if (opts.status) changes.status = opts.status as BeadCtor["status"]
      if (opts.priority !== undefined) changes.priority = opts.priority
      if (opts.assignee) changes.assignee = opts.assignee
      if (opts.title) changes.title = opts.title
      if (opts.type) changes.type = opts.type

      const updates = Bead.update(repo, issue, changes)
      const issueNode = repo.getNode(issue.id)
      const parentMoveError = parentTarget ? validateParentMove(issue, issueNode, parentTarget) : null
      if (parentMoveError) {
        console.error(term.red(parentMoveError))
        process.exitCode = 1
        return
      }

      // Honor --priority by rewriting the `#P[0-4]` hashtag in the bead's
      // content (the H1 line, post-merge in file nodes). The legacy
      // `nodes.priority` column was dropped at SCHEMA_VERSION=11; the H1
      // hashtag is now the source of truth (per docs/future/beads.md).
      if (opts.priority !== undefined) {
        const currentContent = updates.content ?? issueNode?.content ?? ""
        const newPriority = opts.priority ? `P${opts.priority.replace(/^P/i, "")}` : undefined
        const newContent = setPriorityInContent(currentContent, newPriority)
        if (newContent !== currentContent) {
          updates.content = newContent
          updates.title = newContent
        }
      }

      repo.updateNode(issue.id, updates)

      // Handle --parent. File-backed beads express parentage through the
      // canonical sibling-directory filesystem shape:
      //   @km/scope/parent.md
      //   @km/scope/parent/child.md
      // Inline/non-file nodes keep using structural parent_id.
      if (parentTarget) {
        const parentMove = moveBeadUnderParent(repo, resolved.repoRoot, issue, issueNode, parentTarget)
        if (parentMove.warning) console.warn(term.yellow(`Warning: ${parentMove.warning}`))
      }

      // Handle --description: replace or create first child paragraph
      if (opts.description) {
        const children = repo.getChildren(issue.id)
        const firstParagraph = children.find((c) => c.type === "p" && !c.item?.task?.status)
        if (firstParagraph) {
          repo.updateNode(firstParagraph.id, { content: opts.description, updated_at: Date.now() })
        } else {
          repo.addNode(issue.id, {
            type: "p",
            content: opts.description,
            created_at: Date.now(),
            updated_at: Date.now(),
          })
        }
      }

      // Handle --notes: append as new child paragraph
      if (opts.notes) {
        repo.addNode(issue.id, {
          type: "p",
          content: opts.notes,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      }

      console.log(term.green(`Updated ${issue.shortId}:`))
      if (parentTarget) console.log(`  Moved under: ${opts.parent}`)
      if (opts.claim) console.log(`  Claimed by ${opts.assignee}`)
      if (updates.item?.task?.status && !opts.claim) console.log(`  Status: ${updates.item?.task?.status}`)
      if (opts.priority !== undefined) {
        console.log(`  Priority: ${opts.priority} (write-disabled — edit H1 #P[0-4] hashtag directly)`)
      }
      if (updates.content) console.log(`  Title: ${updates.content}`)
      if (opts.description) console.log(`  Description updated`)
      if (opts.notes) console.log(`  Notes appended`)
    })
  parent.addCommand(updateCmd)
}

async function resolveParentTarget(repo: Repo, repoRoot: string, parentRef: string): Promise<ParentTarget | null> {
  const parentIssue = resolveIssueArg(repo, parentRef)
  if (parentIssue) {
    return { id: parentIssue.id, canonicalId: parentIssue.shortId ?? null }
  }

  const cfg = await loadKmBdConfig(repoRoot)
  const prefix = cfg.beads.prefix
  const refs = [parentRef]
  if (parentRef.startsWith(`${prefix}-`) && !parentRef.includes(".")) {
    refs.push(`${parentRef.slice(prefix.length + 1)}/`)
  }

  for (const ref of refs) {
    const node = repo.resolveNode(ref)
    if (node) return { id: node.id, canonicalId: canonicalIdForNode(node) }
  }
  return null
}

function canonicalIdForNode(node: KNode): string | null {
  const data = node.data as Record<string, unknown> | undefined
  const dataId = typeof data?.id === "string" ? data.id : null
  const pathId = node.fs_path?.endsWith(".md") ? node.fs_path.slice(0, -3) : null
  return dataId ?? pathId
}

function moveBeadUnderParent(
  repo: Repo,
  repoRoot: string,
  issue: Bead,
  issueNode: KNode | null,
  parentTarget: ParentTarget,
): { warning?: string | null } {
  if (issueNode?.fs_path?.endsWith(".md")) {
    const childLeaf = childLeafForBead(issue)
    if (!parentTarget.canonicalId || !childLeaf) return {}

    const result = repo.moveNodeWithRefs(issue.id, { newCanonicalId: `${parentTarget.canonicalId}/${childLeaf}` }, {})
    const relocate = relocateBeadSiblingTree(repo, {
      repoRoot,
      oldFsPath: issueNode.fs_path,
      newFsPath: result.newFsPath ?? null,
    })
    return { warning: relocate.warning }
  }

  if (!issueNode?.fs_path) {
    const siblings = repo.getChildren(parentTarget.id)
    repo.moveNode(issue.id, parentTarget.id, siblings.length)
  }
  return {}
}

function validateParentMove(issue: Bead, issueNode: KNode | null, parentTarget: ParentTarget): string | null {
  if (!issueNode?.fs_path?.endsWith(".md")) return null
  if (!parentTarget.canonicalId) return `Cannot derive filesystem path for parent: ${parentTarget.id}`
  if (!childLeafForBead(issue)) return `Cannot derive child leaf from bead id: ${issue.shortId}`
  return null
}

function childLeafForBead(issue: Bead): string | null {
  const childLeaf = issue.shortId?.replace(/\.md$/, "").split("/").pop()
  return childLeaf && childLeaf.length > 0 ? childLeaf : null
}
