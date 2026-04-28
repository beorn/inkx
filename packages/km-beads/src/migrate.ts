/**
 * Beads Migration
 *
 * Migrate issues from .beads/issues.jsonl to km markdown tasks.
 */

import { join, dirname } from "node:path"
import { createLogger } from "loggily"
import type { BeadsFs } from "./types.ts"
import { parseBeadsIssuesJsonl, type BeadsIssue, type BeadsMemory } from "./schema.ts"

const log = createLogger("km:beads:migrate")

// Re-export for backwards compatibility
export type { BeadsIssue } from "./schema.ts"

/**
 * Find the .beads directory starting from a path
 */
export function findBeadsDir(fs: BeadsFs, startFrom?: string): string | null {
  let dir = startFrom || process.cwd()

  while (dir !== "/") {
    const beadsDir = join(dir, ".beads")
    if (fs.existsSync(beadsDir)) {
      return beadsDir
    }
    dir = dirname(dir)
  }

  return null
}

/**
 * Read issues from .beads/issues.jsonl with validation
 */
export function readBeadsIssues(fs: BeadsFs, beadsDir: string): BeadsIssue[] {
  return readBeadsExport(fs, beadsDir).issues
}

/**
 * Read both issues and memories from .beads/issues.jsonl with validation.
 * `bd export` interleaves both record types in a single file.
 */
export function readBeadsExport(
  fs: BeadsFs,
  beadsDir: string,
): { issues: BeadsIssue[]; memories: BeadsMemory[] } {
  const issuesPath = join(beadsDir, "issues.jsonl")
  if (!fs.existsSync(issuesPath)) {
    return { issues: [], memories: [] }
  }

  const content = fs.readFileSync(issuesPath, "utf-8")
  const { issues, memories, errors } = parseBeadsIssuesJsonl(content)

  // Log validation errors but don't fail - allows partial recovery
  if (errors.length > 0) {
    log.warn?.(`Skipped ${errors.length} malformed lines in ${issuesPath}`)
  }

  return { issues, memories }
}

/**
 * Convert a bd memory record to a sectioned `.md` file under the
 * vault's `mem/` root. Returns `{ filename, content }` ready to write.
 *
 * Memories are stored one-per-file with a single `## <title> @memory`
 * section so the @memory sigil sweep finds them and shows them in the
 * mem board view.
 */
export function memoryToMarkdown(mem: BeadsMemory): { filename: string; content: string } {
  // Title: humanize the slug for display.
  const title = mem.key.split("-").map(capitalizeWord).join(" ").replace(/\s+/g, " ").trim()
  const lines = [
    `## ${title || mem.key} @memory`,
    "",
    mem.value.trim(),
    "",
  ]
  return { filename: `${mem.key}.md`, content: lines.join("\n") }
}

function capitalizeWord(w: string): string {
  if (!w) return w
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/**
 * Convert beads status to task mark
 */
function statusToMark(status: BeadsIssue["status"]): string {
  switch (status) {
    case "open":
      return " "
    case "in_progress":
      return "/"
    case "closed":
      return "x"
    case "blocked":
      return "!"
    default:
      return " "
  }
}

/**
 * Convert beads issue to markdown content
 *
 * Format: Status expressed via task mark in heading, type/priority via tags
 *
 * ```markdown
 * ---
 * id: km-01c
 * created_by: beorn
 * created_at: 2024-01-15T...
 * ---
 *
 * # [x] Title @issue #feature #P2
 *
 * Description...
 * ```
 */
export function issueToMarkdown(issue: BeadsIssue, boardTag?: string, sourcePrefix = "km"): string {
  const lines: string[] = []

  // Frontmatter — canonical path-form id with bd-form variants as aliases.
  // Falls back to the raw bd id when path-form translation fails (e.g.
  // unrecognized prefix on a hand-edited entry).
  const canonicalId = bdIdToPathForm(issue.id, sourcePrefix) ?? issue.id
  const aliases = bdIdToAliases(issue.id)

  lines.push("---")
  lines.push(`id: ${canonicalId}`)
  if (aliases.length > 0) {
    lines.push(`aliases:`)
    for (const a of aliases) {
      lines.push(`  - ${a}`)
    }
  }
  if (issue.created_by) {
    lines.push(`created_by: ${issue.created_by}`)
  }
  lines.push(`created_at: ${issue.created_at}`)
  if (issue.closed_at) {
    lines.push(`closed_at: ${issue.closed_at}`)
  }
  if (issue.close_reason) {
    lines.push(`close_reason: "${issue.close_reason.replace(/"/g, '\\"')}"`)
  }
  if (issue.parent_id) {
    lines.push(`parent_id: ${issue.parent_id}`)
  }
  lines.push("---")
  lines.push("")

  // Build tags for heading
  const tags: string[] = []
  if (boardTag) {
    tags.push(`@${boardTag}`)
  }
  if (issue.issue_type) {
    tags.push(`#${issue.issue_type}`)
  }
  // bd v1.0 emits numeric priority (0-4); older exports emit "P0"-"P4".
  // Always render as #P0..#P4 so km bd queries and filters work uniformly.
  const priorityTag =
    typeof issue.priority === "number"
      ? `#P${issue.priority}`
      : issue.priority.startsWith("P")
        ? `#${issue.priority}`
        : `#P${issue.priority}`
  tags.push(priorityTag)
  if (issue.labels) {
    tags.push(...issue.labels.map((l) => `#${l}`))
  }
  if (issue.assignee) {
    tags.push(`@${issue.assignee}`)
  }

  // Title as h1 with task mark and tags
  const mark = statusToMark(issue.status)
  const tagStr = tags.length > 0 ? ` ${tags.join(" ")}` : ""
  lines.push(`# [${mark}] ${issue.title}${tagStr}`)
  lines.push("")

  // Cross-graph relations (bd v1.0 dependencies + legacy blocked_by/blocks).
  // Emit as Logseq-style multi-value inline-property wikilinks at the top
  // of the body. Targets are absolute path-form so they resolve correctly
  // regardless of the host file's location (basename collisions are
  // common after migration: silvery/1.md, 39k9/1.md, etc).
  const blockerEdges = collectDependencyEdges(issue, "blocks")
  const blockedByEdges = collectDependencyEdges(issue, "blocked-by")
  const relatedEdges = collectDependencyEdges(issue, "related")
  for (const [rel, edges] of [
    ["blocks", blockerEdges] as const,
    ["blocked-by", blockedByEdges] as const,
    ["related", relatedEdges] as const,
  ]) {
    if (edges.length > 0) {
      const links = edges.map((e) => `[[${bdIdToPathForm(e, sourcePrefix) ?? e}]]`).join(", ")
      lines.push(`${rel}:: ${links}`)
      lines.push("")
    }
  }

  // Description — rewrite legacy bd-form id mentions inline so prose
  // links resolve under the canonical @<prefix>/<path-form> shape after
  // migration. Aliases still cover edge-cases the regex misses; this
  // rewrite catches the bulk in one pass at import time so the runtime
  // resolver doesn't need a fallback scanner.
  if (issue.description) {
    lines.push(rewriteLegacyIdMentions(issue.description, sourcePrefix))
  }

  return lines.join("\n")
}

/**
 * Rewrite `<prefix>-<scope>.<slug>` and `<prefix>-<scope>-<slug>`
 * occurrences in prose to `@<prefix>/<scope>/<slug>` (canonical
 * sigil-prefixed path-form). Skips matches already inside a wikilink
 * (`[[…]]`) or fenced code block — those are either intentional
 * verbatim or already addressed by frontmatter aliases.
 *
 * The rewrite is generous on slug shape (any `[a-z0-9.-]+`) and
 * conservative on word boundaries to avoid mangling unrelated tokens
 * (e.g. `npm-tools-list` won't match unless `npm` is the prefix).
 */
export function rewriteLegacyIdMentions(text: string, sourcePrefix = "km"): string {
  const prefix = sourcePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // Anchor at non-word boundary on both ends; allow `.` and `-` inside slug.
  const pattern = new RegExp(
    String.raw`(\[\[[^\]]*\]\])|` + // group 1: existing wikilink — passthrough
      String.raw`(\x60[^\x60]*\x60)|` + // group 2: inline code — passthrough
      String.raw`\b(${prefix}-[a-z0-9][a-z0-9.\-]*[a-z0-9])\b`, // group 3: bare bd-id
    "g",
  )
  return text.replace(pattern, (match, wikilink, code, bdId) => {
    if (wikilink || code) return match
    const path = bdIdToPathForm(bdId, sourcePrefix)
    if (!path) return match
    return `@${sourcePrefix}/${path}`
  })
}

/**
 * Collect outbound dependency edges of a given relation type from a bd
 * issue, unioning the bd v1.0 `dependencies[]` array with the legacy
 * `blocked_by` / `blocks` shapes. Returns the bd-form ids (raw); the
 * caller path-form-translates each before emitting.
 */
function collectDependencyEdges(issue: BeadsIssue, rel: "blocks" | "blocked-by" | "related"): string[] {
  const out = new Set<string>()
  if (issue.dependencies) {
    for (const dep of issue.dependencies) {
      // dep_type values from bd v1.0: "blocks" | "parent-child" | "related"
      // The dep is described from issue_id's perspective: issue_id <rel> depends_on_id.
      // For our purposes:
      //   - dep_type "blocks" + issue_id == self → "blocks" edge to depends_on_id
      //   - dep_type "blocks" + depends_on_id == self → "blocked-by" edge from issue_id
      //   - dep_type "related" → symmetric
      const depType = dep.dep_type ?? "blocks"
      if (depType === "blocks") {
        if (rel === "blocks" && dep.issue_id === issue.id) out.add(dep.depends_on_id)
        else if (rel === "blocked-by" && dep.depends_on_id === issue.id) out.add(dep.issue_id)
      } else if (depType === "related" && rel === "related") {
        if (dep.issue_id === issue.id) out.add(dep.depends_on_id)
        else if (dep.depends_on_id === issue.id) out.add(dep.issue_id)
      }
      // parent-child: skip — already encoded by path-form filename hierarchy.
    }
  }
  // Legacy bd<v1.0 fields (still present in some exports).
  if (rel === "blocked-by" && issue.blocked_by) for (const b of issue.blocked_by) out.add(b)
  if (rel === "blocks" && issue.blocks) for (const b of issue.blocks) out.add(b)
  return [...out]
}

/**
 * Translate a bd-form id (`<prefix>-<scope>.<slug>`,
 * `<prefix>-<scope>.<sub>.<leaf>`) into the canonical path-form:
 * dots become path separators, the leading `<prefix>-` is stripped,
 * dashes inside slug segments are preserved.
 *
 *   km-silvercode.acp-rename                 → silvercode/acp-rename
 *   km-silvery.backdrop-hardening.slim-barrel → silvery/backdrop-hardening/slim-barrel
 *   km-q5hji                                  → _orphan/q5hji
 *
 * Returns null when the id is empty after stripping the prefix.
 */
export function bdIdToPathForm(bdId: string, sourcePrefix = "km"): string | null {
  const stripped = bdId.startsWith(`${sourcePrefix}-`) ? bdId.slice(sourcePrefix.length + 1) : bdId
  if (!stripped) return null
  // No dots → orphan auto-id (km-q5hji etc). Park under _orphan/ so they
  // round-trip without colliding with scoped issues.
  if (!stripped.includes(".")) {
    return `_orphan/${stripped}`
  }
  return stripped.split(".").join("/")
}

/**
 * Generate the alias list for a migrated issue: every bd-form variant
 * that prose may legitimately reference. Dot-form is the canonical
 * export; dash-form is the variant humans sometimes type when the dot
 * gets eaten by surrounding punctuation.
 */
export function bdIdToAliases(bdId: string): string[] {
  const aliases = new Set<string>()
  aliases.add(bdId)
  if (bdId.includes(".")) {
    aliases.add(bdId.replace(/\./g, "-"))
  }
  return [...aliases]
}

/**
 * Generate a safe filename from issue title
 */
function _slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
}

export interface MigrateOptions {
  /** Directory to write markdown files to */
  targetDir: string
  /** Board tag to add to issues (e.g., "issue") */
  boardTag?: string
  /** Only migrate issues with these statuses */
  statusFilter?: string[]
  /** Dry run - don't write files */
  dryRun?: boolean
  /** Filesystem implementation (DI - avoids direct node:fs import) */
  fs: BeadsFs
  /**
   * Issue id prefix in the source vault, read from
   * `<source>/.beads/config.yaml` `issue-prefix` (e.g. `"km"`,
   * `"gbrain"`). Used to strip the prefix when computing canonical
   * path-form ids and to recognize self-vault dependency references.
   * Defaults to `"km"` when omitted.
   */
  sourcePrefix?: string
  /**
   * Directory for migrated memory files (one `.md` per memory).
   * Defaults to `<parent-of-targetDir>/mem` so memories live at
   * vault root alongside the issue tree, not nested inside it.
   */
  memDir?: string
}

export interface MigrateResult {
  migrated: number
  skipped: number
  errors: string[]
  files: string[]
  memoriesMigrated: number
  memoriesSkipped: number
}

/**
 * Migrate issues from .beads/issues.jsonl to markdown files
 */
export function migrateBeadsToMarkdown(beadsDir: string, options: MigrateOptions): MigrateResult {
  const { fs } = options
  const { issues, memories } = readBeadsExport(fs, beadsDir)
  const result: MigrateResult = {
    migrated: 0,
    skipped: 0,
    errors: [],
    files: [],
    memoriesMigrated: 0,
    memoriesSkipped: 0,
  }

  // Filter by status if specified
  let filtered = issues
  if (options.statusFilter && options.statusFilter.length > 0) {
    const { statusFilter } = options
    filtered = issues.filter((i) => statusFilter.includes(i.status))
  }

  // Ensure target directory exists
  if (!options.dryRun && !fs.existsSync(options.targetDir)) {
    fs.mkdirSync(options.targetDir, { recursive: true })
  }

  const sourcePrefix = options.sourcePrefix ?? "km"
  for (const issue of filtered) {
    try {
      // Path-form filename: km-silvercode.acp-rename → silvercode/acp-rename.md
      const pathForm = bdIdToPathForm(issue.id, sourcePrefix) ?? issue.id
      const filename = `${pathForm}.md`
      const filepath = join(options.targetDir, filename)

      // Skip if file already exists
      if (fs.existsSync(filepath)) {
        result.skipped++
        continue
      }

      const content = issueToMarkdown(issue, options.boardTag, sourcePrefix)

      if (!options.dryRun) {
        // Ensure parent directory exists for nested path-form filenames.
        const parentDir = dirname(filepath)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }
        fs.writeFileSync(filepath, content, "utf-8")
      }

      result.migrated++
      result.files.push(filepath)
    } catch (error) {
      result.errors.push(`${issue.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Memories — write each to <memDir>/<key>.md (sibling to targetDir).
  // memDir defaults to <parent-of-targetDir>/mem so memories live at
  // vault root, not nested inside the issue tree.
  const memDir = options.memDir ?? join(dirname(options.targetDir), "mem")
  for (const mem of memories) {
    try {
      const { filename, content } = memoryToMarkdown(mem)
      const filepath = join(memDir, filename)
      if (fs.existsSync(filepath)) {
        result.memoriesSkipped++
        continue
      }
      if (!options.dryRun) {
        if (!fs.existsSync(memDir)) {
          fs.mkdirSync(memDir, { recursive: true })
        }
        fs.writeFileSync(filepath, content, "utf-8")
      }
      result.memoriesMigrated++
      result.files.push(filepath)
    } catch (error) {
      result.errors.push(`memory:${mem.key}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return result
}

/**
 * Get migration stats without migrating
 */
export function getMigrationStats(
  fs: BeadsFs,
  beadsDir: string,
): {
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
} {
  const issues = readBeadsIssues(fs, beadsDir)

  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}

  for (const issue of issues) {
    byStatus[issue.status] = (byStatus[issue.status] || 0) + 1
    const type = issue.issue_type || "task"
    byType[type] = (byType[type] || 0) + 1
  }

  return {
    total: issues.length,
    byStatus,
    byType,
  }
}
