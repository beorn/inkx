/**
 * Beads Create — `bd create <title> [flags]`
 *
 * Wave 6 thin alias shim. Translates bd-style argv (--path, --id +
 * --parent split form, --priority, --description, --notes, --type, …)
 * into a canonical path-form id and forwards to `task new`. The
 * underlying file materialization (renderBeadFile / renderInboxCapture)
 * lives in `tasks/mutations.ts` — single source of truth for fresh-bead
 * disk shape.
 *
 * BD_ALIASES table (see bd.ts):
 *   create → ["task", "new"]
 *
 * The bd→task delegation handles canonicalisation in this shim
 * (resolving --parent + --id → --id @scope/leaf via the
 * resolveBdCreateCanonicalId planner), then forwards to `task new`'s
 * file materializer.
 *
 * The `resolveBdCreateCanonicalId` planner stays in `bd-create-plan.ts`
 * because it owns the bd-specific id-shape matrix (six interacting flag
 * forms); `task new --id @path` only accepts the resolved path-form
 * output. One id-resolver, one materializer.
 *
 * Bare `bd create "title"` (no --parent, no --id) routes through
 * `Bead.create` to allocate an auto short-id, then forwards to
 * `task new` with a synthesized inbox path-form id.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { resolveBdCreateCanonicalId } from "./bd-create-plan.ts"
import { createTask } from "./tasks/mutations.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdCreate(parent: BdRegistrar): void {
  const createCmd = new Command("create")
    .argument("<title>", "Bead title")
    .description("Create a new issue (alias for `km task new`; bd-style argv translation)")
    .option("--path <path>", "Canonical path-form id (e.g. @km/beads/foo) — encodes scope + leaf in one arg")
    .option("-t, --type <type>", "Bead type (bug, feature, epic, task, docs)")
    .option("-p, --priority <value>", "Priority (e.g. P0-P4 or 0-4, default: P2)")
    .option("-a, --assignee <name>", "Assign to person")
    .option("-l, --label <labels...>", "Add labels")
    .option("-d, --description <text>", "Bead description")
    .option("-n, --notes <text>", "Additional notes")
    .option("--id <custom>", "(bd compat) Custom short ID; prefer --path for new code")
    .option("--parent <id>", "(bd compat) Parent issue; prefer --path for new code")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(undefined)
      const cfg = await loadKmBdConfig(resolved.repoRoot)
      const prefix = cfg.beads.prefix

      // --path takes precedence over --id when both are given.
      let customId: string | undefined = opts.id
      if (opts.path) {
        if (opts.id && opts.id !== opts.path) {
          console.error(
            term.yellow(`Warning: both --path and --id given (path=${opts.path}, --id=${opts.id}). Using --path.`),
          )
        }
        customId = opts.path as string
      }

      // Bare bd create (no --parent, no --id): allocate an auto short-id
      // via Bead.create's inbox path, then forward to task new with the
      // synthesized inbox path-form id so file materialization lives in
      // one place (tasks/mutations.ts).
      if (!opts.parent && !customId) {
        using repo = await loadRepo(resolved.repoRoot)
        const { shortId } = Bead.create(repo, opts.title as string, {
          type: opts.type,
          priority: opts.priority,
          assignee: opts.assignee,
          labels: opts.label as string[] | undefined,
          customId: undefined,
          parentId: undefined,
          description: opts.description,
          notes: opts.notes,
          prefix,
        })
        // The synthesized inbox id mirrors the rendered file path
        // (`<primary-root>/<inbox-scope>/<short>.md`). Note that
        // primaryRoot already starts with `@<prefix>`, so the canonical
        // id is `<primaryRoot>/<inboxScope>/<short>`.
        const primaryRoot = cfg.beads.roots[0] ?? `@${prefix}`
        const canonicalId = `${primaryRoot}/${cfg.beads.default_scope}/${shortId}`
        await createTask(undefined, opts.title as string, {
          id: canonicalId,
          type: opts.type,
          priority: opts.priority,
          assignee: opts.assignee,
          label: opts.label as string[] | undefined,
          description: opts.description,
          notes: opts.notes,
          json: opts.json,
        })
        return
      }

      // Validate --parent + fully-qualified --id ambiguity (bd compat).
      const explicitParent = opts.parent as string | undefined
      const idIsFullyQualified = (() => {
        if (typeof customId !== "string") return false
        const id = customId.trim()
        if (id.startsWith(`@${prefix}/`) && id.includes("/", prefix.length + 2)) return true
        if (id.includes("/")) return true
        if (id.startsWith(`${prefix}-`) && id.includes(".")) return true
        return false
      })()

      if (explicitParent && idIsFullyQualified) {
        console.error(
          term.red(
            `Ambiguous: both --parent and a fully-qualified --id were given. Pass either --parent X --id <leaf> OR --id @${prefix}/X/<leaf>, not both.`,
          ),
        )
        process.exitCode = 1
        return
      }

      // Resolve --parent to a canonical path-form for the planner.
      let parentCanonicalId: string | null = null
      let parentFsPathStripped: string | null = null
      if (explicitParent) {
        using repo = await loadRepo(resolved.repoRoot)
        const parentIssue = resolveIssueArg(repo, explicitParent)
        let parentNode = parentIssue ? repo.getNode(parentIssue.id) : null
        if (!parentNode) {
          const tries = [explicitParent]
          if (explicitParent.startsWith(`${prefix}-`) && !explicitParent.includes(".")) {
            tries.push(`${explicitParent.slice(prefix.length + 1)}/`)
          }
          for (const ref of tries) {
            parentNode = repo.resolveNode(ref)
            if (parentNode) break
          }
        }
        if (!parentNode) {
          console.error(term.red(`Parent not found: ${explicitParent}`))
          process.exitCode = 1
          return
        }
        const parentData = parentNode.data as Record<string, unknown> | undefined
        parentCanonicalId = typeof parentData?.id === "string" ? parentData.id : null
        parentFsPathStripped = parentNode.fs_path?.endsWith(".md") ? parentNode.fs_path.slice(0, -3) : null
      }

      // Resolve final canonical path-form via the bd-specific planner.
      const canonicalId = resolveBdCreateCanonicalId({
        customId,
        explicitParent,
        parentCanonicalId,
        parentFsPathStripped,
        prefix,
      })

      // Forward to task new — the file materializer lives there now.
      await createTask(undefined, opts.title as string, {
        id: canonicalId,
        type: opts.type,
        priority: opts.priority,
        assignee: opts.assignee,
        label: opts.label as string[] | undefined,
        description: opts.description,
        notes: opts.notes,
        json: opts.json,
      })
    })
  parent.addCommand(createCmd)
}
