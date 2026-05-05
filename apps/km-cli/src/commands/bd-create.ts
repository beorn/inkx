/**
 * Beads Create — `bd create <title> [flags]`
 *
 * Creates a new bead. Surface model (deliberately explicit, no
 * smart-positional heuristic):
 *
 *   bd create "Title"                                  → bd compat, lands in inbox
 *   bd create "Title" --path @km/beads/foo             → km canonical (full path encodes scope+leaf)
 *   bd create "Title" --id @km/beads/foo               → bd compat (--id accepts path-form too)
 *   bd create "Title" --parent @km/beads --id foo      → bd compat (split form)
 *
 * The earlier "smart positional" (treat arg as path if it starts with @
 * or contains /) was removed — it misclassified realistic titles like
 * "fix: handle / in regex" or "@alice please review", and made
 * `bd create km-beads.foo` (legacy bd-form id) silently land as a title.
 * /pro 4-leg review 2026-04-30 confirmed the heuristic was unsafe.
 *
 * Two write paths exist:
 *   1. Bare (no --parent, no --id): materializes a real .md file under
 *      <roots[0]>/<default_scope>/<short-id>.md via `renderInboxCapture`.
 *      Tracked: `@km/beads/create-orphan-must-materialize`.
 *   2. With --parent and/or --id: materializes a file at the canonical
 *      path-form id (`@<prefix>/<scope>/<leaf>.md`) via `renderBeadFile`.
 *      Tracked: `km-parent-id-leaf-materializes-inline`.
 *
 * Phase 2 (Wave 6 of task-bd-collapse) deleted the legacy "inline-addNode
 * fallback" the original IIFE returned `null` for. Every supported
 * input shape now produces a canonical id. Inputs that previously fell
 * through (`"foo.bar"`/`"foo/bar"` with no parent/no sigil) now route
 * to inbox with the literal leaf preserved — see
 * `@km/cli/bd-create-dead-canonical-fallback`.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead, parentIdFromCanonical, renderBeadFile, renderInboxCapture } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { resolveBdCreateCanonicalId } from "./bd-create-plan.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdCreate(parent: BdRegistrar): void {
  const createCmd = new Command("create")
    .argument("<title>", "Bead title")
    .description("Create a new issue")
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
      const configObj = await loadKmBdConfig(resolved.repoRoot)
      using repo = await loadRepo(resolved.repoRoot)

      // --path takes precedence over --id when both are given (warns).
      const titleForCreate = opts.title as string
      let customIdForCreate: string | undefined = opts.id
      if (opts.path) {
        if (opts.id && opts.id !== opts.path) {
          console.error(
            term.yellow(`Warning: both --path and --id given (path=${opts.path}, --id=${opts.id}). Using --path.`),
          )
        }
        customIdForCreate = opts.path as string
      }

      const { node, shortId, children } = Bead.create(repo, titleForCreate, {
        type: opts.type,
        priority: opts.priority,
        assignee: opts.assignee,
        labels: opts.label as string[] | undefined,
        customId: customIdForCreate,
        parentId: opts.parent,
        description: opts.description,
        notes: opts.notes,
        prefix: configObj.beads.prefix,
      })

      // Downstream canonical-id resolver reads opts.id; keep --path routed to it.
      if (opts.path && customIdForCreate) {
        opts.id = customIdForCreate
      }

      // Parent resolution rule:
      //   `--id @km/wt/1` (or `km-wt.1`)            → full identity, parent encoded in id
      //   `--parent @km/wt --id 1`                  → split form, leaf id under explicit parent
      //   `--parent @km/wt --id @km/wt/1`           → AMBIGUOUS, error out
      //   `--id 1` (no --parent)                    → bead at root, id = "1" literally
      //   `--id wt.1` (no --parent)                 → bead at root named "wt.1" literally
      //                                                (no auto-scope-derive any more)
      //
      // Bd-form (`km-wt.1`) and path-form (`@km/wt/1`) are equivalent fully-qualified
      // identities — both encode the parent. They're treated as path-form for the
      // ambiguity check.
      const explicitParent = opts.parent as string | undefined
      const idIsFullyQualified = (() => {
        if (typeof opts.id !== "string") return false
        const id = opts.id.trim()
        const prefix = configObj.beads.prefix
        if (id.startsWith(`@${prefix}/`) && id.includes("/", prefix.length + 2)) return true
        if (id.includes("/")) return true
        if (id.startsWith(`${prefix}-`) && id.includes(".")) return true
        return false
      })()

      if (explicitParent && idIsFullyQualified) {
        console.error(
          term.red(
            `Ambiguous: both --parent and a fully-qualified --id were given. Pass either --parent X --id <leaf> OR --id @${configObj.beads.prefix}/X/<leaf>, not both.`,
          ),
        )
        process.exitCode = 1
        return
      }

      let parentId: string | null = null
      if (explicitParent) {
        // Try bd-form / sigil-id first (resolveIssueArg), then path-form.
        const parentIssue = resolveIssueArg(repo, explicitParent)
        if (parentIssue) {
          parentId = parentIssue.id
        } else {
          const tries = [explicitParent]
          const prefix = configObj.beads.prefix
          if (explicitParent.startsWith(`${prefix}-`) && !explicitParent.includes(".")) {
            tries.push(`${explicitParent.slice(prefix.length + 1)}/`)
          }
          let resolvedParent = null
          for (const ref of tries) {
            resolvedParent = repo.resolveNode(ref)
            if (resolvedParent) break
          }
          if (resolvedParent) {
            parentId = resolvedParent.id
          } else {
            console.error(term.red(`Parent not found: ${explicitParent}`))
            process.exitCode = 1
            return
          }
        }
      }

      // No --parent, no --id: materialize a real file under
      // <roots[0]>/<default_scope>/<short-id>.md so the bead has a stable
      // on-disk identity instead of the index-only ghost (fs_path: null) the
      // bare addNode path used to produce. Filesystem is the source of truth;
      // the storage watcher will pick the file up and seed the DB on next sync.
      if (!explicitParent && !opts.id) {
        const primaryRoot = configObj.beads.roots[0] ?? "@km"
        const inboxScope = configObj.beads.default_scope
        const inboxDir = join(resolved.repoRoot, primaryRoot, inboxScope)
        const { filename, content } = renderInboxCapture(shortId, titleForCreate, {
          prefix: configObj.beads.prefix,
          type: opts.type as string | undefined,
          priority: opts.priority as string | undefined,
          description: opts.description as string | undefined,
          notes: opts.notes as string | undefined,
        })
        const filepath = join(inboxDir, filename)
        if (existsSync(filepath)) {
          // shortId collision is theoretically possible if the same id was
          // captured-then-deleted in the same second. Surface clearly.
          console.error(term.red(`File already exists at ${filepath} — short-id collision; retry.`))
          process.exitCode = 1
          return
        }
        mkdirSync(inboxDir, { recursive: true })
        writeFileSync(filepath, content, "utf-8")

        if (opts.json) {
          console.log(JSON.stringify({ shortId, fs_path: filepath }, null, 2))
        } else {
          console.log(term.green(`Created issue: ${shortId}`))
          console.log(`Title: ${titleForCreate}`)
          if (opts.type) console.log(`Type: ${opts.type}`)
          console.log(`Priority: ${opts.priority ?? "P2"}`)
          console.log(term.dim(`Path: ${filepath}`))
          console.log(
            term.dim(
              `Note: no scope — landed at @${configObj.beads.prefix}/${inboxScope}/. Use --parent @${configObj.beads.prefix}/<scope> to file directly under a scope.`,
            ),
          )
        }
        return
      }

      // --parent and/or --id given: materialize a file at the canonical
      // path-form id via the pure planner. Phase 2 (Wave 6) deleted the
      // legacy inline-addNode fallback the IIFE used to return null for —
      // every supported input shape now produces a usable canonical id.
      // See `@km/cli/bd-create-dead-canonical-fallback`.
      const parentNode = parentId !== null ? repo.getNode(parentId) : null
      const parentData = parentNode?.data as Record<string, unknown> | undefined
      const parentCanonicalId = typeof parentData?.id === "string" ? parentData.id : null
      const parentFsPathStripped = parentNode?.fs_path?.endsWith(".md") ? parentNode.fs_path.slice(0, -3) : null

      const canonicalId = resolveBdCreateCanonicalId({
        customId: typeof opts.id === "string" ? opts.id : undefined,
        explicitParent,
        parentCanonicalId,
        parentFsPathStripped,
        prefix: configObj.beads.prefix,
      })

      const { filename, content } = renderBeadFile(canonicalId, titleForCreate, {
        prefix: configObj.beads.prefix,
        type: opts.type as string | undefined,
        priority: opts.priority as string | undefined,
        description: opts.description as string | undefined,
        notes: opts.notes as string | undefined,
        parentId: parentIdFromCanonical(canonicalId, configObj.beads.prefix),
      })
      const filepath = join(resolved.repoRoot, filename)
      if (existsSync(filepath)) {
        console.error(term.red(`File already exists at ${filepath} — id collision; pick a different id.`))
        process.exitCode = 1
        return
      }
      mkdirSync(filepath.slice(0, filepath.lastIndexOf("/")), { recursive: true })
      writeFileSync(filepath, content, "utf-8")

      // children is populated by Bead.create; the renderBeadFile helper
      // already includes description/notes in the generated body. No
      // need to addNode them here — the file content is the source of
      // truth.
      void node
      void children

      if (opts.json) {
        console.log(JSON.stringify({ shortId, canonicalId, fs_path: filepath, node }, null, 2))
        return
      }

      console.log(term.green(`Created issue: ${canonicalId}`))
      console.log(`Title: ${titleForCreate}`)
      if (opts.type) console.log(`Type: ${opts.type}`)
      console.log(`Priority: ${opts.priority ?? "P2"}`)
      console.log(term.dim(`Path: ${filepath}`))
      if (opts.description) {
        console.log(`Description: ${opts.description.slice(0, 60)}${opts.description.length > 60 ? "..." : ""}`)
      }
    })
  parent.addCommand(createCmd)
}
