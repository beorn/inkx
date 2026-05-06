/**
 * Beads Mutation Functions
 *
 * Create, update, and close issues.
 */

import { ulid } from "ulid"
import { stringify as stringifyYaml } from "yaml"
import type { KNode } from "@km/core"
import { getMarkerForStatus } from "@km/core"
import type { Bead, BeadCreateOptions } from "./types.ts"
import { mintBeadName, normalizeBdRef, mintSubBeadName } from "./short-ids.ts"
import { normalizePriority } from "./priority.ts"

/**
 * Create a new issue.
 *
 * Returns a detached KNode tree (node + optional description/notes children).
 * Callers pass the node to `repo.addNode(parentId, node)` which persists
 * through the `@km/storage` emitter down to the markdown file.
 */
export function createBeadNode(
  title: string,
  options: BeadCreateOptions,
): { node: KNode; shortId: string; children: KNode[] } {
  const now = Date.now()
  const id = ulid()

  // Generate short ID — prefix MUST come from repo config
  // (.km/config.yaml `beads.prefix`). No default: a missing prefix would
  // silently produce `km-…` ids in non-`km` repos (cloudi, pam, pim vault).
  if (!options.prefix) {
    throw new Error(
      "createBeadNode: options.prefix is required — read from .km/config.yaml `beads.prefix` (e.g. via loadKmBdConfig).",
    )
  }
  const prefix = options.prefix
  let shortId: string
  if (options.customId) {
    shortId = normalizeBdRef(options.customId, prefix)
  } else if (options.parentId) {
    // For sub-issues, we'd need to query existing children
    // For now, use timestamp-based suffix
    const childNum = Math.floor(Date.now() % 1000)
    shortId = mintSubBeadName(options.parentId, childNum)
  } else {
    shortId = mintBeadName(prefix)
  }

  // Build content with metadata
  let content = title

  // Add type tag — skip the default (`task`). Every bead is implicitly a
  // task unless tagged `#bug` / `#feature` / `#epic`, so emitting `#task`
  // adds noise to every H1 without conveying information.
  if (options.type && options.type !== "task") {
    content += ` #${options.type}`
  }

  // Add priority tag.
  //
  // Normalize to canonical `P0`..`P4` form regardless of input shape:
  //   --priority 0   → "P0"
  //   --priority P0  → "P0"
  //   --priority p0  → "P0"
  // Without this, `bd create --priority 0` wrote tag `#0` while peer beads
  // had `#P0`, and `bd list --priority 0` (query `#0`) would miss the
  // canonical-form ones (and vice versa). Both `nodeToBead` (read) and
  // queryIssues (filter) normalize input, but the on-disk tag stays in
  // whatever form was first written — so we canonicalize at the boundary.
  const priority = normalizePriority(options.priority) ?? "P2"
  content += ` #${priority}`

  // Add assignee
  if (options.assignee) {
    content += ` @${options.assignee}`
  }

  // Add additional labels
  if (options.labels) {
    for (const label of options.labels) {
      content += ` #${label}`
    }
  }

  // Add @issue marker for queryability
  content += " @issue"

  const node: KNode = {
    id,
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    parent_id: null, // Will be set based on path
    parent_idx: 0,
    content,
    // priority dropped at SCHEMA_VERSION=11 — the value is preserved in
    // data.tags below, where getNodePriority() reads it.
    data: {
      short_id: shortId,
      // `data.tags` was dissolved into the `links` table; tags now live
      // as `#<tag>` markers in the H1 content (assembled by
      // `buildBeadHeading`) and the parser emits link rows for them.
      // See @km/all/dissolve-data-tags-to-links.
      mentions: options.assignee ? [options.assignee] : [],
    },
    created_at: now,
    updated_at: now,
    version: "",
  }

  // Build child nodes for description and notes
  const children: KNode[] = []
  if (options.description) {
    children.push({
      id: ulid(),
      type: "p",
      parent_id: id,
      parent_idx: 0,
      content: options.description,
      data: {},
      created_at: now,
      updated_at: now,
      version: "",
    })
  }
  if (options.notes) {
    children.push({
      id: ulid(),
      type: "p",
      parent_id: id,
      parent_idx: children.length,
      content: options.notes,
      data: {},
      created_at: now,
      updated_at: now,
      version: "",
    })
  }

  return { node, shortId, children }
}

/**
 * Update issue fields
 *
 * Returns a partial node with updated fields. Callers merge this via
 * repo.updateNode(id, updates) — which routes columns (content,
 * priority, item, assigned_to) to the SQL schema and patches the `data`
 * blob for sigil-mirrored tags/mentions.
 */
export interface UpdateBeadChanges {
  status?: Bead["status"]
  priority?: string
  assignee?: string
  title?: string
  type?: string
}

export function updateBeadFields(bead: Bead, changes: UpdateBeadChanges): Partial<KNode> {
  const updates: Partial<KNode> = {
    updated_at: Date.now(),
  }

  if (changes.status !== undefined) {
    updates.item = { task: { status: changes.status, marker: getMarkerForStatus(changes.status) } }
  }

  // Priority is rewritten in the bead's content as a `#P[0-4]` hashtag
  // by the caller (apps/km-cli/src/commands/bd.ts handles --priority via
  // `setPriorityInContent`). This mutation no longer carries priority on
  // the changes record — the `nodes.priority` column was dropped at
  // SCHEMA_VERSION=11 and the H1 hashtag is the canonical surface (per
  // docs/future/beads.md). Normalize-and-discard preserves the input
  // contract for future telemetry / validation.
  if (changes.priority !== undefined) {
    void normalizePriority(changes.priority)
  }

  if (changes.title !== undefined) {
    updates.content = changes.title
  }

  if (changes.assignee !== undefined) {
    updates.assigned_to = changes.assignee
  }

  // `data.tags` is no longer synced from priority/type changes here —
  // the parser-side `kmRefsTransform` (km-markdown/extensions/km-refs.ts)
  // already populates `node.data.tags` from inline `#tag` markers in the
  // H1 line. When the bead's content is rewritten through the markdown
  // round-trip, the new tags land via the parser. The mutations-side
  // mirror was a redundant denormalization of the same source.
  // See @km/all/drop-data-tags.

  return updates
}

/**
 * Close an issue (mark as done).
 *
 * Sets `closed_at` to the current ISO timestamp on the data blob — this
 * is the lifecycle-transition marker that distinguishes `Bead.close` from
 * a raw `set status:done` field write (the latter does NOT touch
 * `closed_at`). Tested as an L4 invariant in apps/km-cli's lifecycle
 * property tests (Wave 3 of @km/cli/task-bd-collapse).
 *
 * Pass the node's full `data` blob via `currentData` so we can merge
 * — storage's `updateNode` treats `data: {...}` as a full replacement,
 * so omitting `currentData` would silently wipe sibling keys
 * (`id`, `aliases`, `short_id`, `mentions`, `tags`, …). Without that
 * merge, a `bd close <id> --reason "x"` strips the canonical id and the
 * issue vanishes from `bd list` / short-id resolution.
 *
 * Bead: km-beads.close-drop-data-wipe.
 */
export function closeBeadFields(reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
  const closedAt = new Date().toISOString()
  return {
    item: { task: { status: "done", marker: getMarkerForStatus("done") } },
    updated_at: Date.now(),
    data: {
      ...currentData,
      closed_at: closedAt,
      ...(reason ? { closeReason: reason } : {}),
    },
  }
}

/**
 * Drop an issue (mark as won't do).
 *
 * Same `closed_at` semantics + `currentData` discipline as
 * `closeBeadFields`. See its docstring for the rationale.
 *
 * Bead: km-beads.close-drop-data-wipe.
 */
export function dropBeadFields(reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
  const closedAt = new Date().toISOString()
  return {
    item: { task: { status: "dropped", marker: getMarkerForStatus("dropped") } },
    updated_at: Date.now(),
    data: {
      ...currentData,
      closed_at: closedAt,
      ...(reason ? { dropReason: reason } : {}),
    },
  }
}

/**
 * Reopen a closed/dropped issue — back to `todo`.
 *
 * Counterpart to `closeBeadFields` / `dropBeadFields`: clears the
 * `closed_at` timestamp and the `closeReason` / `dropReason` markers so
 * the bead's lifecycle history is symmetric (close → reopen → close
 * leaves a fresh `closed_at`, not an old one). Also clears
 * `assigned_to` — reopening returns the bead to the unclaimed-todo
 * state, mirroring `Bead.update({status:"todo", assignee:undefined})`.
 * The "todo ⟹ no owner" invariant is fuzz-tested in
 * apps/km-cli/tests/tasks-lifecycle-properties.test.ts.
 *
 * Like its siblings, requires `currentData` so the data merge preserves
 * siblings (id, aliases, short_id, …). The omitted closed_at /
 * closeReason / dropReason fields are stripped via destructuring so the
 * caller's `currentData` reference stays untouched (no `delete` mutation).
 *
 * Validation that the source state is `done` / `dropped` (not already
 * `todo` or `wip`) lives in the action handler, not here — this function
 * is the field-mutation primitive, parallel to the other two.
 */
export function reopenBeadFields(currentData?: Record<string, unknown>): Partial<KNode> {
  const { closed_at: _ca, closeReason: _cr, dropReason: _dr, ...rest } = (currentData ?? {}) as Record<string, unknown>
  return {
    item: { task: { status: "todo", marker: getMarkerForStatus("todo") } },
    assigned_to: undefined,
    updated_at: Date.now(),
    data: { ...rest },
  }
}

/**
 * Render a fresh-capture bead (no scope, no parent) as the markdown file
 * that lands at `<roots[0]>/<default_scope>/<short-id>.md` for `km bd
 * create 'title'`. Returns the canonical filename (relative — caller
 * joins with the roots[0]/default_scope dir) and the file content.
 *
 * Spec from `@km/beads/create-orphan-must-materialize`:
 *   - aliases include the bare short-id AND the bd-form `<prefix>-<short-id>`
 *   - NO redundant `id:` line — the file path IS the canonical id
 *   - title goes in a `# <title>` body heading; description/notes follow
 *
 * Pure function: no I/O. Caller writes the file. Easy to test.
 */
export function renderInboxCapture(
  shortId: string,
  title: string,
  options: {
    prefix: string
    type?: string
    priority?: string
    description?: string
    notes?: string
    createdAt?: Date
  },
): { filename: string; content: string } {
  const aliases = [shortId, `${options.prefix}-${shortId}`]
  // No `type:` or `priority:` in YAML — those are encoded as hashtags in
  // the H1 heading per docs/future/beads.md "Issue Type Tags" / "Priority
  // Tags". Single source of truth = the hashtag in the title; the parser
  // elevates it to node.type / node.priority columns at parse time.
  const frontmatter: Record<string, unknown> = {
    aliases,
    created_at: (options.createdAt ?? new Date()).toISOString(),
  }

  const fmYaml = stringifyYaml(frontmatter).trimEnd()
  const heading = buildBeadHeading(title, { type: options.type, priority: options.priority })
  const description = options.description?.trim() ?? ""
  const notes = options.notes?.trim() ?? ""
  const sections = [heading, description, notes].filter((s) => s.length > 0).join("\n\n")
  const content = `---\n${fmYaml}\n---\n\n${sections}\n`
  return { filename: `${shortId}.md`, content }
}

/**
 * Render a fully-qualified bead (with `--id` and/or `--parent <scope>`)
 * as the markdown file that lands at `<repoRoot>/<canonical-id>.md`.
 *
 * Bead: `km-parent-id-leaf-materializes-inline`.
 *
 * The canonical id is path-form (`@<prefix>/<scope>/<leaf>`); the on-disk
 * filename mirrors that 1:1, with `.md` appended. Frontmatter carries
 * `aliases:` only (legacy bd-form variants — dot-form
 * `<prefix>-<scope>.<leaf>` and dash-form `<prefix>-<scope>-<leaf>`) so
 * historical references resolve via the alias resolver.
 *
 * The redundant `id:` YAML field is NOT emitted — the file's location on
 * disk IS the canonical id. Storing it in YAML duplicated the file's
 * fs_path and created two sources of truth. See
 * @km/beads/frontmatter-path-rename.
 *
 * Mirrors the recipe `migrate.ts` already uses for migrated beads
 * (`bdIdToPathForm` / `bdIdToAliases` / `issueToMarkdown`), but at
 * runtime when `km bd create` produces a new bead with a known scope.
 *
 * Without this path the CLI lowered every `--parent <scope> --id <leaf>`
 * call to `repo.addNode(parentId, node)` — which appends `node` as an
 * inline checkbox child of `<scope>.md` rather than creating a new file
 * under `<scope>/`. `bd show` then reported `Path: @<prefix>/<scope>.md`
 * (the parent file), and the leaf id never reached the frontmatter.
 *
 * Pure function: no I/O. Caller writes the file. Tests use this directly.
 */
export function renderBeadFile(
  canonicalId: string,
  title: string,
  options: {
    prefix: string
    type?: string
    priority?: string
    description?: string
    notes?: string
    createdAt?: Date
  },
): { filename: string; content: string } {
  const sigil = `@${options.prefix}/`
  if (!canonicalId.startsWith(sigil)) {
    throw new Error(`renderBeadFile: canonicalId must start with @${options.prefix}/ (got: ${canonicalId})`)
  }
  const inner = canonicalId.slice(sigil.length)
  if (!inner) {
    throw new Error(`renderBeadFile: canonicalId has no path inside the sigil (got: ${canonicalId})`)
  }

  // Aliases: legacy bd-form (`<prefix>-<scope>.<leaf>` / `.<sub>.<leaf>`)
  // and dash-form (`<prefix>-<scope>-<leaf>`). Mirrors `bdIdToAliases` in
  // migrate.ts so prose / external tools / link resolvers that index by
  // bd-form keep working.
  const dotForm = `${options.prefix}-${inner.split("/").join(".")}`
  const dashForm = dotForm.replace(/\./g, "-")
  const aliases: string[] = [dotForm]
  if (dashForm !== dotForm) aliases.push(dashForm)

  // No `type:` or `priority:` in YAML — those are encoded as hashtags in
  // the H1 per docs/future/beads.md. The parser elevates them to
  // node.type / node.priority columns; the hashtag is the single source.
  const frontmatter: Record<string, unknown> = {
    aliases,
    created_at: (options.createdAt ?? new Date()).toISOString(),
  }
  const fmYaml = stringifyYaml(frontmatter).trimEnd()
  const heading = buildBeadHeading(title, { type: options.type, priority: options.priority })
  const description = options.description?.trim() ?? ""
  const notes = options.notes?.trim() ?? ""
  const sections = [heading, description, notes].filter((s) => s.length > 0).join("\n\n")
  const content = `---\n${fmYaml}\n---\n\n${sections}\n`
  return { filename: `${canonicalId}.md`, content }
}

/**
 * Build the H1 heading for a bead, encoding type and priority as hashtags
 * (`# Title #task #P1`). This is the canonical authored form per
 * docs/future/beads.md — single source of truth, no YAML duplication.
 */
function buildBeadHeading(title: string, opts: { type?: string; priority?: string }): string {
  const tags: string[] = []
  // Skip the default (`task`). Every bead is implicitly a task unless tagged
  // `#bug` / `#feature` / `#epic`; emitting `#task` adds noise to every H1
  // without conveying information.
  if (opts.type && opts.type !== "task") tags.push(`#${opts.type}`)
  if (opts.priority) {
    // Normalize to `#P[0-4]` regardless of input shape (numeric, lowercase, etc).
    const normalized = opts.priority.match(/^P?([0-4])$/i)
    if (normalized?.[1]) tags.push(`#P${normalized[1]}`)
  }
  const suffix = tags.length > 0 ? ` ${tags.join(" ")}` : ""
  return `# ${title}${suffix}`
}
