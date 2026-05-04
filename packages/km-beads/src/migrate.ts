/**
 * Beads Migration
 *
 * Migrate issues from .beads/issues.jsonl to km markdown tasks.
 */

import { join, dirname } from "node:path"
import { stringify as stringifyYaml, parse as parseYaml } from "yaml"
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
 * Render a per-source subsection appended to an existing memory file
 * when slugs collide across imports. Format:
 *
 *   ## From <sourceLabel>
 *
 *   <memory body>
 *
 * The `From <sourceLabel>` heading doubles as an idempotency marker —
 * re-running migrate against the same source short-circuits before
 * appending a duplicate.
 */
function renderMemorySubsection(mem: BeadsMemory, sourceLabel: string): string {
  return `## From ${sourceLabel}\n\n${mem.value.trim()}`
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

  // Comments — render as a `## Comments @comments` body subsection,
  // chronological by created_at. Same line format as runtime
  // `bd comment add`: `- @<author> (<timestamp>): <text>`. Inner
  // newlines are flattened to ` ↵ ` so each comment stays on a single
  // markdown list item (round-trip with `bd comment list` works).
  if (issue.comments && issue.comments.length > 0) {
    const sorted = [...issue.comments].sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (issue.description) lines.push("")
    lines.push(COMMENTS_SECTION_HEADING)
    lines.push("")
    for (const c of sorted) {
      const text = c.text.replace(/\r?\n/g, " ↵ ")
      lines.push(`- @${c.author} (${c.created_at}): ${text}`)
    }
  }

  return lines.join("\n")
}

/**
 * Markdown heading used to delimit the bead's comment timeline. Both
 * `issueToMarkdown` (write side) and `bd comment add/list` (runtime
 * side) anchor on this exact string.
 */
export const COMMENTS_SECTION_HEADING = "## Comments @comments"

/**
 * Rewrite `<prefix>-<scope>.<slug>` and `<prefix>-<scope>-<slug>`
 * occurrences in prose to `@<prefix>/<scope>/<slug>` (canonical
 * sigil-prefixed path-form). Skips matches already inside a wikilink
 * (`[[…]]`) or fenced code block — those are either intentional
 * verbatim or already addressed by alias props.
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
 *   km-q5hji                                  → @km/inbox/q5hji
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
  // No dots → bare auto-id (km-q5hji etc). Park under @<prefix>/inbox/
  // so they round-trip without colliding with scoped issues. Fresh
  // `km bd create` (no --parent) lands here too — single triage zone.
  if (!stripped.includes(".")) {
    return `${sigilRoot}/inbox/${stripped}`
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
 *      under `inbox/`, splitting the scope-bead from its children.
 *
 *   2. Slug-augmentation for numeric-leaf ids: `km-rev-code-0203.1`
 *      → `@km/rev-code-0203/1-add-keyboard-nav` so filenames stay
 *      legible. Skipped when the id is itself a parent (would break
 *      the child directory path).
 *
 * Used by {@link migrateBeadsToMarkdown} so wikilink targets,
 * id props, and filenames all agree on the same resolved form
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
  // route to `@<prefix>/<scope>.md` (overrides the default inbox/ rule).
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
   * Bead id prefix in the source vault, read from
   * `<source>/.beads/config.yaml` `issue-prefix` (e.g. `"km"`,
   * `"gbrain"`). Used to strip the prefix when computing canonical
   * path-form ids and to recognize self-vault dependency references.
   * Defaults to `"km"` when omitted.
   */
  sourcePrefix?: string
  /**
   * Directory for migrated memory files (one `.md` per memory).
   * Defaults to `<targetDir>/@memory` so memories live alongside the
   * per-source `@<prefix>/` board directories under the same beads root.
   * The CLI passes `resolveMemDir(repoRoot, config)` so multi-source
   * imports merge into one flat `<beadsRoot>/@memory/` directory.
   */
  memDir?: string
  /**
   * Source label appended as a `## From <label>` subsection when a
   * memory key collides with an existing file (e.g. multiple bd dbs
   * imported into the same vault). Without this, collisions are
   * skipped — content from the second source is silently dropped.
   * Typically the import slug (`<source>-<YYYY-MM-DD>`).
   */
  memSourceLabel?: string
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
  // Resolve every id once up-front so wikilink targets, id props,
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
  // `@<prefix>/` under the same `targetDir` (now `@memory/` under the
  // configured beads root when called via `bd migrate`). Memories are
  // insights (not prefix-tagged); the @memory layout is FLAT, so
  // multiple bd-source imports merge by slug. On collision, append a
  // `## From <memSourceLabel>` subsection to the existing file rather
  // than skipping (which silently dropped content from the second
  // source) or mangling slugs into per-source subdirs.
  const memDir = options.memDir ?? join(options.targetDir, "@memory")
  for (const mem of memories) {
    try {
      const { filename, content } = memoryToMarkdown(mem)
      const filepath = join(memDir, filename)
      if (fs.existsSync(filepath)) {
        // Collision: merge if a source label was given, else skip.
        if (options.memSourceLabel && !options.dryRun) {
          const existing = fs.readFileSync(filepath, "utf-8")
          const subsection = renderMemorySubsection(mem, options.memSourceLabel)
          // Idempotent: skip the append if this source label already
          // appears as a subsection header. Re-running migrate against
          // the same source must not stack duplicates.
          if (!existing.includes(`## From ${options.memSourceLabel}`)) {
            fs.writeFileSync(filepath, `${existing.trimEnd()}\n\n${subsection}\n`, "utf-8")
            result.memoriesMigrated++
            result.files.push(filepath)
          } else {
            result.memoriesSkipped++
          }
        } else {
          result.memoriesSkipped++
        }
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
 * ADD-only frontmatter fields recapture honors. These are the
 * non-recomputable fields that `migrate-completeness` taught
 * `issueToMarkdown` to emit; older imports written before that change
 * are missing them. Recapture backfills exactly these fields and never
 * touches anything else (body, scalars, timestamps).
 *
 * `metadata` is special-cased: when both source and target have
 * non-empty content, they are merged with a `\n---\n` separator instead
 * of being replaced. Everything else is strict ADD-only — present means
 * "leave alone".
 */
const RECAPTURE_FIELDS = [
  "started_at",
  "owner",
  "assignee",
  "metadata",
  "dependencies",
  "legacy_deps",
  "children",
] as const

export interface RecaptureOptions {
  /** Filesystem implementation (DI). */
  fs: BeadsFs
  /**
   * Resolve a bd issue id (or one of its aliases) to an absolute target
   * file path inside the vault. Return `null` when no target exists.
   *
   * The CLI wires this to a vault scanner; tests can pass an in-memory map.
   */
  resolveTarget: (issue: BeadsIssue) => string | null
  /** When true, skip writing files (still computes the patch report). */
  dryRun?: boolean
  /**
   * Bead id prefix in the source vault (mirrors {@link MigrateOptions}).
   * Currently unused by recapture proper but kept on the surface so
   * future logic that path-form-translates new fields has it available.
   */
  sourcePrefix?: string
}

export interface RecapturePatch {
  /** Source bd id whose frontmatter the patch derives from. */
  bdId: string
  /** Absolute path of the target markdown file. */
  filepath: string
  /** Field names that were added (or merged for `metadata`). Empty = no-op. */
  fieldsChanged: string[]
}

export interface RecaptureResult {
  /** Issues whose target was found and patched (fieldsChanged.length > 0). */
  patched: RecapturePatch[]
  /** Issues whose target was found but already complete (no missing fields). */
  unchanged: number
  /** Issues with no resolvable target file in the vault. */
  skipped: { bdId: string; reason: string }[]
  /** Per-issue exceptions from parsing/writing (frontmatter malformed, etc). */
  errors: { bdId: string; error: string }[]
}

/**
 * Backfill missing frontmatter fields on existing vault beads from a bd
 * export, ADD-only. For each issue in the export:
 *
 *   1. Resolve the target file via `resolveTarget`. Skip with a warning
 *      when no target exists (a `--restore` mode would create the file
 *      here; left as a future hook).
 *   2. Parse the existing frontmatter. For each field in
 *      {@link RECAPTURE_FIELDS}: ADD if absent or empty in the target,
 *      NEVER overwrite when present and non-empty. `metadata` merges
 *      both blobs with `\n---\n` instead of replacing.
 *   3. NEVER touches body content, scalar fields (status, priority,
 *      title, assignee, …), or timestamps (created_at, updated_at,
 *      closed_at) — vault state may have drifted from the export.
 *   4. Write the file back only when something changed (idempotent).
 *
 * Use case: an earlier `km bd migrate` ran before
 * `migrate-completeness` taught the emitter to preserve every
 * non-recomputable field. This function recovers the lost state from
 * the original export without overwriting subsequent hand edits.
 */
export function recaptureFromExport(beadsDirOrFile: string, options: RecaptureOptions): RecaptureResult {
  const { fs } = options
  const { issues } = readBeadsExport(fs, beadsDirOrFile)
  const result: RecaptureResult = {
    patched: [],
    unchanged: 0,
    skipped: [],
    errors: [],
  }

  for (const issue of issues) {
    try {
      const filepath = options.resolveTarget(issue)
      if (!filepath) {
        result.skipped.push({ bdId: issue.id, reason: "no target file" })
        continue
      }
      if (!fs.existsSync(filepath)) {
        result.skipped.push({ bdId: issue.id, reason: `target missing: ${filepath}` })
        continue
      }

      const content = fs.readFileSync(filepath, "utf-8")
      const split = splitFrontmatter(content)
      if (!split) {
        result.errors.push({ bdId: issue.id, error: `no frontmatter in ${filepath}` })
        continue
      }

      const fm = (parseYaml(split.frontmatter) ?? {}) as Record<string, unknown>
      const before = JSON.stringify(fm)
      const fieldsChanged = applyAddOnlyPatch(fm, issue)
      const after = JSON.stringify(fm)

      if (fieldsChanged.length === 0 || before === after) {
        result.unchanged++
        continue
      }

      const newContent = rebuildWithFrontmatter(fm, split.body)
      if (!options.dryRun) {
        fs.writeFileSync(filepath, newContent, "utf-8")
      }
      result.patched.push({ bdId: issue.id, filepath, fieldsChanged })
    } catch (error) {
      result.errors.push({
        bdId: issue.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

/**
 * Apply ADD-only patch in-place on the parsed frontmatter object,
 * returning the list of field names that changed. Implements the field
 * policy documented on {@link recaptureFromExport}.
 */
export function applyAddOnlyPatch(fm: Record<string, unknown>, issue: BeadsIssue): string[] {
  const changed: string[] = []

  // Scalar string fields — ADD only when target is absent or empty.
  for (const key of ["started_at", "owner", "assignee"] as const) {
    const sourceVal = issue[key]
    if (sourceVal === undefined || sourceVal === null || sourceVal === "") continue
    if (isEmpty(fm[key])) {
      fm[key] = sourceVal
      changed.push(key)
    }
  }

  // Array fields — ADD when target is absent or empty array.
  if (issue.children && issue.children.length > 0 && isEmpty(fm.children)) {
    fm.children = [...issue.children]
    changed.push("children")
  }
  if (issue.dependencies && issue.dependencies.length > 0 && isEmpty(fm.dependencies)) {
    fm.dependencies = issue.dependencies
    changed.push("dependencies")
  }

  // legacy_deps — only emitted on pre-v1.0 exports; ADD when absent.
  const sourceLegacy: Record<string, string[]> = {}
  if (issue.blocked_by && issue.blocked_by.length > 0) sourceLegacy.blocked_by = issue.blocked_by
  if (issue.blocks && issue.blocks.length > 0) sourceLegacy.blocks = issue.blocks
  if (Object.keys(sourceLegacy).length > 0 && isEmpty(fm.legacy_deps)) {
    fm.legacy_deps = sourceLegacy
    changed.push("legacy_deps")
  }

  // metadata — merge both blobs when both non-empty (rather than overwrite).
  if (issue.metadata !== undefined && issue.metadata !== "" && issue.metadata !== "{}") {
    const targetMeta = fm.metadata
    if (isEmpty(targetMeta)) {
      fm.metadata = issue.metadata
      changed.push("metadata")
    } else if (typeof targetMeta === "string" && targetMeta !== issue.metadata) {
      fm.metadata = `${targetMeta}\n---\n${issue.metadata}`
      changed.push("metadata")
    }
  }

  return changed
}

/**
 * "Empty" for ADD-only purposes: undefined, null, empty string, empty
 * array, empty object literal `"{}"` (bd's metadata sentinel), or the
 * empty plain object. Any other value counts as present.
 */
function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === "string") return v.trim() === "" || v.trim() === "{}"
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length === 0
  return false
}

interface FrontmatterSplit {
  frontmatter: string
  body: string
}

/**
 * Split a markdown file into `{ frontmatter, body }`. Returns null when
 * the file has no leading `---` block. Body includes everything after
 * the closing `---` (preserving the original separator newline so
 * round-trip is byte-identical for files we don't patch).
 */
export function splitFrontmatter(content: string): FrontmatterSplit | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return null
  return { frontmatter: match[1]!, body: match[2]! }
}

function rebuildWithFrontmatter(fm: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(fm).trimEnd()}\n---\n${body}`
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
