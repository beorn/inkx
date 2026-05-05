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
import { Bead, type Bead as BeadCtor, type UpdateBeadChanges } from "@km/beads"
import { setPriorityInContent } from "@km/core"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { resolveAssignee } from "../utils/assignee.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

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
      let newParentId: string | null = null
      if (opts.parent) {
        const parentRef = opts.parent as string
        const parentIssue = resolveIssueArg(repo, parentRef)
        if (parentIssue) {
          newParentId = parentIssue.id
        } else {
          const cfg = await loadKmBdConfig(resolved.repoRoot)
          const prefix = cfg.beads.prefix
          const tries = [parentRef]
          if (parentRef.startsWith(`${prefix}-`) && !parentRef.includes(".")) {
            tries.push(`${parentRef.slice(prefix.length + 1)}/`)
          }
          let parentNode = null
          for (const ref of tries) {
            parentNode = repo.resolveNode(ref)
            if (parentNode) break
          }
          if (!parentNode) {
            console.error(term.red(`Parent not found: ${opts.parent}`))
            process.exitCode = 1
            return
          }
          newParentId = parentNode.id
        }
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

      // Honor --priority by rewriting the `#P[0-4]` hashtag in the bead's
      // content (the H1 line, post-merge in file nodes). The legacy
      // `nodes.priority` column was dropped at SCHEMA_VERSION=11; the H1
      // hashtag is now the source of truth (per docs/future/beads.md).
      if (opts.priority !== undefined) {
        const node = repo.getNode(issue.id)
        const currentContent = updates.content ?? node?.content ?? ""
        const newPriority = opts.priority ? `P${opts.priority.replace(/^P/i, "")}` : undefined
        const newContent = setPriorityInContent(currentContent, newPriority)
        if (newContent !== currentContent) {
          updates.content = newContent
          updates.title = newContent
        }
      }

      repo.updateNode(issue.id, updates)

      // Handle --parent: move under the resolved new parent at end-of-list.
      if (newParentId) {
        const siblings = repo.getChildren(newParentId)
        repo.moveNode(issue.id, newParentId, siblings.length)
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
      if (newParentId) console.log(`  Moved under: ${opts.parent}`)
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
