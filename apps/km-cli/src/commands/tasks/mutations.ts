/**
 * Task Mutations
 *
 * `createTask` — `task new <content>` action handler. Lifecycle verbs
 * (claim, release, close, drop, reopen) live in `./lifecycle.ts` after
 * task-bd-collapse Wave 3 — they're workflow transitions with
 * source-state validation, not raw field writes.
 *
 * File-vs-inline write paths (Wave 6 of @km/cli/task-bd-collapse):
 *
 *   `task new "Title"`                                — inline addNode under
 *                                                       parent (cwd-scoped or
 *                                                       inbox).
 *   `task new "Title" --id @scope/foo`                — materialize a real
 *                                                       .md file at the
 *                                                       canonical path.
 *   `task new "Title" --id @scope/foo --type bug`     — file with type tag.
 *   `task new "Title" --id @scope/foo --description ...
 *                              --notes ...`           — file with description
 *                                                       and notes sections.
 *
 * The path-form materialization shipped here lets `bd create` collapse
 * to a thin shim that forwards to `task new`. Same write path as bd's
 * legacy renderBeadFile / renderInboxCapture; consolidated single source
 * of truth for fresh-bead disk shape.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { type Repo } from "@km/storage"
import { Task } from "@km/storage"
import { resolvePathArg } from "@km/fs-mount"
import { loadRepo } from "../../load-repo.ts"
import { getRootPath } from "../../program.ts"
import { Bead, renderBeadFile, renderInboxCapture } from "@km/beads"
import { loadKmBdConfig } from "../bd-load-config.ts"
import { planNewTask } from "./mutations-plan.ts"

// Re-export the planner so existing imports keep working.
export { planNewTask, type PlanNewTaskOptions, type PlannedTaskNode } from "./mutations-plan.ts"

/**
 * Options for `tasks --new`. Flags surface bead-frontmatter fields so a
 * task can be created with the same shape `bd create` produces, without
 * routing through bd. Pure extension — every flag is optional.
 */
export interface CreateTaskOptions {
  json?: boolean
  /** Bead-style type tag (bug, feature, epic, …). `task` is implicit and
   * stays untagged. Mirrored into `data.tags` next to priority. */
  type?: string
  /** Explicit canonical id (path-form or bare scope/slug). Stored at
   * `data.id` so `tasks <id>` resolves it. Skips the auto-id helper.
   * The `-i, --id` boolean display flag on the parent `tasks` command
   * was renamed to `--show-ids`, freeing the `--id <id>` slot for this
   * create-time string flag. */
  id?: string
  /** Comma-separated alias list, written to `data.aliases`. */
  aliases?: string
  /** Explicit parent ref (id, path, or filename). Resolved via
   * `repo.resolveNode` + `repo.resolveByName`. Overrides the positional
   * `pathOrId` argument when both are given. */
  parent?: string
  /** Priority hashtag value (P0..P4 / 0..4). Mirrored into `data.tags`. */
  priority?: string
  /** Initial assignee. Stored at `node.assigned_to`. */
  owner?: string
  /** Natural-language due date (`tmrw`, `friday`, `+2w`, ISO). Parsed via
   * `parseDate` in the planner; bad input aborts before mutating. */
  due?: string
  /** Natural-language start/scheduled date. Same parsing as `due`. */
  start?: string
  /** Description text — added as a first body paragraph (file mode only).
   * Mirrors `bd create --description`. */
  description?: string
  /** Notes text — appended as a second body paragraph (file mode only).
   * Mirrors `bd create --notes`. */
  notes?: string
  /** Assignee (alias for --owner; mirrors `bd create --assignee`). */
  assignee?: string
  /** Labels (mirrors `bd create --label`). Stored as data.tags entries. */
  label?: string[]
}

/**
 * Resolve the parent for `tasks --new`. `--parent` flag wins; the
 * positional `pathOrId` is the bd-compat fallback. Returns null when no
 * parent was specified, or when the user's input failed to resolve.
 */
function resolveCreateParent(
  repo: Repo,
  pathOrId: string | undefined,
  options: Pick<CreateTaskOptions, "parent">,
): { parentId: string | null; error?: string } {
  const ref = options.parent ?? pathOrId
  if (!ref) return { parentId: null }
  const direct = Task.findByPathOrId(repo, ref, (r) => Bead.resolve(repo, r))
  if (direct) return { parentId: direct.id }
  // `--parent` allows arbitrary refs (path / name / id). Try the lower-
  // level resolvers as a fallback so a path like `@km/scope` reparents.
  if (options.parent) {
    const fallback = repo.resolveNode(ref) ?? repo.resolveByName(ref)
    if (fallback) return { parentId: fallback.id }
  }
  return { parentId: null, error: `Parent not found: ${ref}` }
}

/**
 * Detect whether `--id` is a fully-qualified path-form (`@<prefix>/<scope>/<leaf>`).
 * Path-form ids always trigger file materialization. Bare leaf ids
 * (`foo`, `scope/leaf`) flow through the inline addNode path.
 */
function isPathFormId(id: string, prefix: string): boolean {
  if (!id) return false
  // `@<anything>/<at-least-one-segment>` — sigil + slash separator.
  if (id.startsWith("@") && id.includes("/")) return true
  // `<prefix>-...` (bd-form) is also accepted; canonicalisation happens
  // before this. We only check for explicit path-form here.
  if (id.startsWith(`${prefix}-`)) return true
  return false
}

/**
 * Materialize a fresh-capture or scoped bead as a .md file. Returns the
 * absolute filepath written.
 *
 * Lifted from bd-create.ts as part of Wave 6 collapse — single source
 * of truth for fresh-bead disk shape lives in `task new` now; bd-create
 * is a thin shim over this path.
 */
function materializeBeadFile(
  repoRoot: string,
  canonicalId: string,
  title: string,
  options: {
    prefix: string
    type?: string
    priority?: string
    description?: string
    notes?: string
  },
): { filepath: string; error?: string } {
  const { filename, content } = renderBeadFile(canonicalId, title, options)
  const filepath = join(repoRoot, filename)
  if (existsSync(filepath)) {
    return { filepath, error: `File already exists at ${filepath} — id collision; pick a different id.` }
  }
  mkdirSync(dirname(filepath), { recursive: true })
  writeFileSync(filepath, content, "utf-8")
  return { filepath }
}

/**
 * Materialize an inbox capture (no scope, auto short-id) as a .md file.
 * Used when `task new` is invoked with no --id and no --parent — the
 * "what's the lowest-friction path?" landing zone.
 */
function materializeInboxFile(
  repoRoot: string,
  primaryRoot: string,
  inboxScope: string,
  shortId: string,
  title: string,
  options: {
    prefix: string
    type?: string
    priority?: string
    description?: string
    notes?: string
  },
): { filepath: string; error?: string } {
  const inboxDir = join(repoRoot, primaryRoot, inboxScope)
  const { filename, content } = renderInboxCapture(shortId, title, options)
  const filepath = join(inboxDir, filename)
  if (existsSync(filepath)) {
    return { filepath, error: `File already exists at ${filepath} — short-id collision; retry.` }
  }
  mkdirSync(inboxDir, { recursive: true })
  writeFileSync(filepath, content, "utf-8")
  return { filepath }
}

/**
 * Create a task under a parent. Two write paths:
 *
 *   - `--id @<prefix>/<scope>/<leaf>` (path-form) → materialize a real .md
 *     file at the canonical path. Same shape as `bd create` produces.
 *   - else → inline `addNode` under the resolved parent (or null = root).
 *     Legacy quick-capture path; fast, no file.
 */
export async function createTask(
  pathOrId: string | undefined,
  content: string,
  options: CreateTaskOptions,
): Promise<void> {
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  using repo = await loadRepo(resolved.repoRoot)

  const cfg = await loadKmBdConfig(resolved.repoRoot)
  const prefix = cfg.beads.prefix

  // Owner alias: `--assignee` → `--owner`. Mirrors bd create.
  if (options.assignee && !options.owner) {
    options.owner = options.assignee
  }

  // Path-form file materialization — when --id looks like
  // @<prefix>/<scope>/<leaf>, write a real .md file via renderBeadFile
  // rather than an inline addNode. The watcher picks it up; output
  // shape matches `bd create`.
  if (options.id && isPathFormId(options.id, prefix)) {
    const result = materializeBeadFile(resolved.repoRoot, options.id, content, {
      prefix,
      type: options.type,
      priority: options.priority,
      description: options.description,
      notes: options.notes,
    })
    if (result.error) {
      console.error(term.red(result.error))
      process.exit(1)
    }
    if (options.json) {
      console.log(JSON.stringify({ canonicalId: options.id, fs_path: result.filepath }))
      return
    }
    console.log(term.green("Created task:"), options.id)
    console.log(term.dim(`Path: ${result.filepath}`))
    return
  }

  const { parentId, error } = resolveCreateParent(repo, pathOrId, options)
  if (error) {
    console.error(term.red(error))
    process.exit(1)
  }

  // `--id <id>` flows directly into the planner's `id` slot. The display
  // flag that used to claim `-i, --id` is now `--show-ids`, so the create
  // surface gets the natural `--id` name.
  const { node, errors } = planNewTask(content, options)
  if (errors.length > 0) {
    for (const err of errors) console.error(term.red(err))
    process.exit(1)
  }
  const nodeId = repo.addNode(parentId, node)

  if (options.json) {
    console.log(JSON.stringify({ id: nodeId }))
    return
  }

  console.log(term.green("Created task:"), nodeId.slice(-8))
}

/**
 * Inbox-capture materialization — drives the bd-create thin shim. Keeps
 * one source of truth for "no --id, no --parent" disk shape.
 */
export async function captureInboxTask(
  shortId: string,
  content: string,
  options: CreateTaskOptions,
): Promise<{ filepath: string }> {
  const resolved = resolvePathArg(process.cwd(), getRootPath())
  const cfg = await loadKmBdConfig(resolved.repoRoot)
  const primaryRoot = cfg.beads.roots[0] ?? `@${cfg.beads.prefix}`
  const inboxScope = cfg.beads.default_scope
  const result = materializeInboxFile(resolved.repoRoot, primaryRoot, inboxScope, shortId, content, {
    prefix: cfg.beads.prefix,
    type: options.type,
    priority: options.priority,
    description: options.description,
    notes: options.notes,
  })
  if (result.error) {
    throw new Error(result.error)
  }
  return { filepath: result.filepath }
}
