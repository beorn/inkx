/**
 * Beads Migration
 *
 * Migrate issues from .beads/issues.jsonl to km markdown tasks.
 */

import { join, dirname } from "node:path"
import { stringify as stringifyYaml } from "yaml"
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
 *
 * Accepts either a `.beads` directory (resolves to `<dir>/issues.jsonl`)
 * or a direct path to a `.jsonl` file. The latter form is what `km bd
 * migrate --file <path>` uses for one-off imports of foreign exports.
 */
export function readBeadsExport(fs: BeadsFs, dirOrFile: string): { issues: BeadsIssue[]; memories: BeadsMemory[] } {
  const issuesPath = dirOrFile.endsWith(".jsonl") ? dirOrFile : join(dirOrFile, "issues.jsonl")
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
  const lines = [`## ${title || mem.key} @memory`, "", mem.value.trim(), ""]
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
 * Format: Status expressed via task mark in heading, type/priority via tags.
 * Board sigil is the prefix-qualified scope (`@<prefix>/<scope>`) — preserves
 * the vault prefix so cross-vault refs disambiguate (`@km/beads` vs another
 * vault's `@beads`).
 *
 * ```markdown
 * ---
 * id: beads/cutover
 * created_by: beorn
 * created_at: 2024-01-15T...
 * ---
 *
 * # [x] Title @km/beads #feature #P2
 *
 * Description...
 * ```
 */
export function issueToMarkdown(issue: BeadsIssue, sourcePrefix = "km", idMap?: ReadonlyMap<string, string>): string {
  const lines: string[] = []

  // Frontmatter — canonical path-form id with bd-form variants as aliases.
  // Falls back to the raw bd id when path-form translation fails (e.g.
  // unrecognized prefix on a hand-edited entry). idMap (when provided)
  // supplies the slug-augmented form for numeric-leaf ids.
  const basePathForm = bdIdToPathForm(issue.id, sourcePrefix)
  const canonicalId = idMap?.get(issue.id) ?? basePathForm ?? issue.id
  const aliases = bdIdToAliases(issue.id, basePathForm && basePathForm !== canonicalId ? basePathForm : null)
  // Board tag = `@<prefix>/<scope>` — first non-sigil path segment of the
  // canonical id. Canonical ids start with `@<prefix>/` (the sigil dir),
  // so the scope sits at index 1 after split: `@km/beads/cutover` →
  // segments `["@km", "beads", "cutover"]` → scope `beads` → tag `@km/beads`.
  const segments = canonicalId.split("/")
  const scope = segments[0]?.startsWith("@") ? (segments[1] ?? null) : (segments[0] ?? null)

  // Build the frontmatter object and serialize via yaml.stringify so
  // multi-line values (close_reason commonly contains markdown bullets,
  // bold text with `*`, embedded quotes) round-trip safely. Hand-rolled
  // emission previously broke on lines like `**file**: text` — `*` is
  // YAML alias syntax outside quoted scalars, and our zero-indented
  // continuation lines fell out of the scalar context entirely
  // (BAD_ALIAS warning at parse time).
  // Frontmatter — captures every non-recomputable field bd export ships
  // (counts like dependency_count/dependent_count/comment_count are dropped:
  // they're derivable from `dependencies` + comment-section markdown).
  // Order: identity → authorship → lifecycle → ownership → graph → blob.
  // Anything missing or empty is omitted entirely.
  const frontmatter: Record<string, unknown> = { id: canonicalId }
  if (aliases.length > 0) frontmatter.aliases = aliases
  if (issue.created_by) frontmatter.created_by = issue.created_by
  frontmatter.created_at = issue.created_at
  if (issue.started_at) frontmatter.started_at = issue.started_at
  if (issue.closed_at) frontmatter.closed_at = issue.closed_at
  if (issue.close_reason) frontmatter.close_reason = issue.close_reason
  if (issue.defer_until) frontmatter.defer_until = issue.defer_until
  if (issue.owner) frontmatter.owner = issue.owner
  if (issue.assignee) frontmatter.assignee = issue.assignee
  if (issue.work_type) frontmatter.work_type = issue.work_type
  if (issue.parent_id) frontmatter.parent_id = issue.parent_id
  if (issue.children && issue.children.length > 0) frontmatter.children = issue.children
  // Dependency edges preserved verbatim (every field bd ships per edge —
  // type, depends_on_id, issue_id, created_at, created_by, metadata).
  // The Logseq inline `blocks::`/`blocked-by::` lines below are a derived
  // view of the same graph, not the source of truth.
  if (issue.dependencies && issue.dependencies.length > 0) {
    frontmatter.dependencies = issue.dependencies
  }
  // Pre-v1.0 bd exports used flat blocked_by/blocks arrays. When present in
  // source, preserve under legacy_deps so the round-trip is loss-free even
  // for archives that predate the dependencies[] schema.
  const legacyDeps: Record<string, string[]> = {}
  if (issue.blocked_by && issue.blocked_by.length > 0) legacyDeps.blocked_by = issue.blocked_by
  if (issue.blocks && issue.blocks.length > 0) legacyDeps.blocks = issue.blocks
  if (Object.keys(legacyDeps).length > 0) frontmatter.legacy_deps = legacyDeps
  // Freeform metadata blob — bd emits as a JSON-encoded string. Skip the
  // empty-object case ("{}") since it's noise on >90% of issues.
  if (issue.metadata && issue.metadata !== "{}") frontmatter.metadata = issue.metadata

  lines.push("---")
  lines.push(stringifyYaml(frontmatter).trimEnd())
  lines.push("---")
  lines.push("")

  // Build tags for heading
  const tags: string[] = []
  if (scope) {
    tags.push(`@${sourcePrefix}/${scope}`)
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
      const links = edges.map((e) => `[[${idMap?.get(e) ?? bdIdToPathForm(e, sourcePrefix) ?? e}]]`).join(", ")
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
    lines.push(rewriteLegacyIdMentions(issue.description, sourcePrefix, idMap))
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
export function rewriteLegacyIdMentions(
  text: string,
  sourcePrefix = "km",
  idMap?: ReadonlyMap<string, string>,
): string {
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
    // path-form already starts with `@<prefix>/` (since bdIdToPathForm and
    // bdIdToPathFormWithSlug both prepend the sigil). Emit verbatim — no
    // further wrapping.
    const path = idMap?.get(bdId) ?? bdIdToPathForm(bdId, sourcePrefix)
    if (!path) return match
    return path
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
      // bd v1.0 emits `type`; older internal docs / tests used `dep_type`.
      // Values: "blocks" | "parent-child" | "related". The dep is described
      // from issue_id's perspective: issue_id <rel> depends_on_id.
      //   - "blocks" + issue_id == self → "blocks" edge to depends_on_id
      //   - "blocks" + depends_on_id == self → "blocked-by" edge from issue_id
      //   - "related" → symmetric
      const depType = dep.type ?? dep.dep_type ?? "blocks"
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
 * `@<prefix>/` becomes the first path segment (matching the board sigil
 * 1:1 — `@km` is a name-matched node distinct from a plain `km` folder),
 * dots become path separators, dashes inside slug segments are preserved.
 *
 *   km-silvercode.acp-rename                 → @km/silvercode/acp-rename
 *   km-silvery.backdrop-hardening.slim-barrel → @km/silvery/backdrop-hardening/slim-barrel
 *   km-q5hji                                  → @km/_orphan/q5hji
 *
 * The literal `@` prefix is load-bearing: wikilink resolution matches by
 * node.name, so `[[@km/foo/bar]]` resolves to a node named `@km` (the
 * board sigil). A bare `km/` directory would create a different node.
 *
 * Returns null when the id is empty after stripping the prefix.
 */
export function bdIdToPathForm(bdId: string, sourcePrefix = "km"): string | null {
  const stripped = bdId.startsWith(`${sourcePrefix}-`) ? bdId.slice(sourcePrefix.length + 1) : bdId
  if (!stripped) return null
  const sigilRoot = `@${sourcePrefix}`
  // No dots → orphan auto-id (km-q5hji etc). Park under @<prefix>/_orphan/
  // so they round-trip without colliding with scoped issues.
  if (!stripped.includes(".")) {
    return `${sigilRoot}/_orphan/${stripped}`
  }
  return `${sigilRoot}/${stripped.split(".").join("/")}`
}

/**
 * Generate the alias list for a migrated issue: every bd-form variant
 * that prose may legitimately reference. Dot-form is the canonical
 * export; dash-form is the variant humans sometimes type when the dot
 * gets eaten by surrounding punctuation.
 *
 * `extraPathForm` (optional) is the bare path-form (without slug
 * augmentation) — included as an alias when numeric-leaf ids get a
 * title-derived slug appended, so prose using `@km/scope/3` still
 * resolves alongside `@km/scope/3-fix-the-thing`.
 */
export function bdIdToAliases(bdId: string, extraPathForm?: string | null): string[] {
  const aliases = new Set<string>()
  aliases.add(bdId)
  if (bdId.includes(".")) {
    aliases.add(bdId.replace(/\./g, "-"))
  }
  if (extraPathForm) {
    aliases.add(extraPathForm)
  }
  return [...aliases]
}

/**
 * Like {@link bdIdToPathForm} but appends `-<slug>` derived from the
 * issue title when the trailing path segment is purely numeric.
 *
 * bd auto-numbers sub-ids when callers don't supply a custom suffix
 * (`km-rev-code-0203.1`, `.2`, …); the bare numeric leaf is unhelpful
 * as a filename or card label after migration. Augmenting with a
 * title-slug recovers legibility while keeping the bare form as an
 * alias (back-compat for prose that already references `scope/3`).
 *
 *   bdId="km-rev-code-0203.1", title="Add keyboard nav"
 *     → "rev-code-0203/1-add-keyboard-nav"
 *
 *   bdId="km-silvercode.acp.rename", title="…"  (non-numeric leaf)
 *     → "silvercode/acp/rename"  (unchanged)
 *
 * Returns null when the id strips to empty, like {@link bdIdToPathForm}.
 */
export function bdIdToPathFormWithSlug(bdId: string, title: string, sourcePrefix = "km"): string | null {
  const base = bdIdToPathForm(bdId, sourcePrefix)
  if (!base) return null
  const slashIdx = base.lastIndexOf("/")
  const leaf = slashIdx >= 0 ? base.slice(slashIdx + 1) : base
  if (!/^\d+$/.test(leaf)) return base
  const slug = _slugify(title)
  if (!slug) return base
  return `${base}-${slug}`
}

/**
 * Build an `id → path-form` map for a batch of issues, applying:
 *
 *   1. Scope-epic routing: a no-dot id (`km-silvery`, `km-beads`)
 *      with at least one dotted child in the same batch is a scope
 *      epic — emit `@<prefix>/<scope>.md` (sibling file to the
 *      `@<prefix>/<scope>/` directory of children). Without this,
 *      `bdIdToPathForm`'s default no-dot rule parks scope epics
 *      under `_orphan/`, splitting the scope-bead from its children.
 *
 *   2. Slug-augmentation for numeric-leaf ids: `km-rev-code-0203.1`
 *      → `@km/rev-code-0203/1-add-keyboard-nav` so filenames stay
 *      legible. Skipped when the id is itself a parent (would break
 *      the child directory path).
 *
 * Used by {@link migrateBeadsToMarkdown} so wikilink targets,
 * frontmatter ids, and filenames all agree on the same resolved form
 * within a single migration pass. Callers fall back via
 * `idMap.get(id) ?? bdIdToPathForm(id)` — the map only contains
 * entries that differ from the default routing.
 */
export function buildIdMap(issues: BeadsIssue[], sourcePrefix = "km"): Map<string, string> {
  // First pass: collect (a) parent paths so slug-augmentation skips
  // them, and (b) known scopes — no-dot ids that are the prefix of
  // other ids in this batch (i.e., have children).
  const parentPaths = new Set<string>()
  const idsWithDot = new Set<string>()
  const stripped = new Map<string, string>() // bd-id → stripped form
  for (const issue of issues) {
    const base = bdIdToPathForm(issue.id, sourcePrefix)
    if (!base) continue
    let idx = base.indexOf("/")
    while (idx >= 0) {
      parentPaths.add(base.slice(0, idx))
      idx = base.indexOf("/", idx + 1)
    }
    const s = issue.id.startsWith(`${sourcePrefix}-`) ? issue.id.slice(sourcePrefix.length + 1) : issue.id
    stripped.set(issue.id, s)
    if (s.includes(".")) idsWithDot.add(s.split(".")[0]!)
  }

  const map = new Map<string, string>()

  // Scope-epic detection: no-dot id with at least one dotted child →
  // route to `@<prefix>/<scope>.md` (overrides the default _orphan/ rule).
  const sigilRoot = `@${sourcePrefix}`
  for (const issue of issues) {
    const s = stripped.get(issue.id)
    if (!s) continue
    if (s.includes(".")) continue
    if (idsWithDot.has(s)) {
      map.set(issue.id, `${sigilRoot}/${s}`)
    }
  }

  // Slug-augmentation pass.
  for (const issue of issues) {
    const base = bdIdToPathForm(issue.id, sourcePrefix)
    if (!base || parentPaths.has(base)) continue
    if (map.has(issue.id)) continue // scope-epic routing already set
    const resolved = bdIdToPathFormWithSlug(issue.id, issue.title, sourcePrefix)
    if (resolved && resolved !== base) {
      map.set(issue.id, resolved)
    }
  }
  return map
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
  /** Directory to write markdown files to (typically the vault repoRoot) */
  targetDir: string
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
   * Defaults to `<targetDir>/mem` so memories live at vault root
   * alongside the per-scope issue directories.
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
  // Resolve every id once up-front so wikilink targets, frontmatter ids,
  // and filenames agree across the batch (numeric-leaf ids get a
  // title-derived slug appended; see bdIdToPathFormWithSlug).
  const idMap = buildIdMap(filtered, sourcePrefix)
  for (const issue of filtered) {
    try {
      // Path-form filename, slug-augmented when the leaf is numeric.
      const pathForm = idMap.get(issue.id) ?? bdIdToPathForm(issue.id, sourcePrefix) ?? issue.id
      const filename = `${pathForm}.md`
      const filepath = join(options.targetDir, filename)

      // Skip if file already exists
      if (fs.existsSync(filepath)) {
        result.skipped++
        continue
      }

      const content = issueToMarkdown(issue, sourcePrefix, idMap)

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

  // Memories — write each to <memDir>/<key>.md. Default sits next to
  // `@<prefix>/` under the same `targetDir`. Memories are insights
  // (not prefix-tagged); the import-root containing both `mem/` and
  // `@<prefix>/` is the unit of provenance, not the sigil dir.
  const memDir = options.memDir ?? join(options.targetDir, "mem")
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
