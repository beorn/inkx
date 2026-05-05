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

  // Add type tag
  if (options.type) {
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

  // TODO @km/all/path-name-id-redesign: priority is now read from the H1
  // `#P[0-4]` hashtag (data.tags via kmRefsTransform). The legacy
  // nodes.priority column was dropped at SCHEMA_VERSION=11. To honor a
  // `bd update --priority P1` request, we must rewrite the bead's H1
  // markdown content so the parser re-derives the tag. That rework is
  // staged separately; for now this mutation is a no-op so the column
  // write stays gone.
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
 * Pass the node's full `data` blob via `currentData` when a `reason` is
 * provided — storage's `updateNode` treats `data: {...}` as a full
 * replacement, so we MUST merge with the existing data to preserve
 * sibling keys (`id`, `aliases`, `short_id`, `mentions`, `tags`, …).
 * Without `currentData`, a `bd close <id> --reason "x"` silently wipes
 * the canonical id and aliases — the issue stays addressable by its
 * ULID but vanishes from `bd list` / short-id resolution.
 *
 * Bead: km-beads.close-drop-data-wipe.
 */
export function closeBeadFields(reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
  const updates: Partial<KNode> = {
    item: { task: { status: "done", marker: getMarkerForStatus("done") } },
    updated_at: Date.now(),
  }

  if (reason) {
    updates.data = { ...currentData, closeReason: reason }
  }

  return updates
}

/**
 * Drop an issue (mark as won't do).
 *
 * Same `currentData` discipline as `closeBeadFields`. See its docstring
 * for the rationale.
 *
 * Bead: km-beads.close-drop-data-wipe.
 */
export function dropBeadFields(reason?: string, currentData?: Record<string, unknown>): Partial<KNode> {
  const updates: Partial<KNode> = {
    item: { task: { status: "dropped", marker: getMarkerForStatus("dropped") } },
    updated_at: Date.now(),
  }

  if (reason) {
    updates.data = { ...currentData, dropReason: reason }
  }

  return updates
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
  if (opts.type) tags.push(`#${opts.type}`)
  if (opts.priority) {
    // Normalize to `#P[0-4]` regardless of input shape (numeric, lowercase, etc).
    const normalized = opts.priority.match(/^P?([0-4])$/i)
    if (normalized?.[1]) tags.push(`#P${normalized[1]}`)
  }
  const suffix = tags.length > 0 ? ` ${tags.join(" ")}` : ""
  return `# ${title}${suffix}`
}
