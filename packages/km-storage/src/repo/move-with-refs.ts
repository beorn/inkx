/**
 * Move/Rename with Reference Rewriting
 *
 * Canonical primitive that subsumes `renameNode` and `moveNode` plus the
 * additional reference forms today's surface doesn't cover (frontmatter
 * aliases, dep-edges, bare-id mentions in prose, fs-path moves).
 *
 * See hub/km/design/move-rewrite-refs.md for the full design.
 *
 * Bead: km-storage.move-with-rewrite-refs
 *
 * Six-phase ordering inside one SQLite transaction:
 *   1. Compute new path-form / new name from spec
 *   2. Update node row (parent, name, position) in transaction
 *   3. Indexed wikilink/transclusion/dep-edge rewrite via getBacklinksByHref
 *   4. Frontmatter aliases + parent_id + bd-shaped prop targets
 *   5. Optional bare-id mention scan when --include-prose
 *   6. UPDATE links SET href row + post-commit fs rename (idempotent)
 *
 * Default behaviour:
 *   - Structured rewrites (wikilink, transclusion, dep-edge, aliases,
 *     blocked-by props, frontmatter parent_id) ON
 *   - Bare-id prose mention scan OFF (set `includeProse: true` to enable)
 *   - On-disk fs rename happens AFTER the SQLite commit, so a partial
 *     failure is recoverable by re-running with the same spec.
 */

import { existsSync, renameSync } from "fs"
import { basename, dirname, join } from "path"

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { pathOf } from "@km/core"
import { normalizeLinkHref, normalizeNodeName } from "@km/markdown"

import type { DataStore } from "../data-store.ts"
import { getBacklinksByHref } from "../db/links.ts"

// =============================================================================
// Public types
// =============================================================================

/** Spec describing what to change about the node. At least one field must be set. */
export interface MoveSpec {
  /** New display content (heading text). When set, drives a rename. */
  newContent?: string
  /** New canonical path-form id, e.g. `@km/scope/slug`, for bead moves. */
  newCanonicalId?: string
  /** Explicit target filesystem path, relative to the repo root. */
  newFsPath?: string
  /** New parent id, or null for root. When set, drives a re-parent. */
  newParentId?: string | null
  /** Insertion index inside newParentId. Default: end-of-list (uses Date.now()). */
  position?: number
  /**
   * Legacy bd-form identity. New scoped beads should use `newCanonicalId`;
   * this remains for imported / older nodes that only carry `data.short_id`.
   */
  newShortId?: string
}

/** Optional behaviour knobs. */
export interface MoveOptions {
  /** Skip the rewrite walk entirely. Default: false. Wired to --no-rewrite. */
  noRewrite?: boolean
  /** Run the bare-id mention scan over all nodes' content. Default: false. */
  includeProse?: boolean
  /** Do everything except the fs rename. DB is still committed. Default: false. */
  dryRunFs?: boolean
  /** Progress callback during the rewrite walk. */
  onProgress?: (info: MoveProgress) => void
  /**
   * Maximum number of aliases to keep on the moved node when promoting
   * the old short id / old name as an alias. Older aliases evict.
   * Default: 10. Set 0 to disable alias promotion.
   */
  preserveAliases?: number
  /**
   * Refuse to clobber an existing node at the target name. Default: true.
   * When false, the move proceeds and the name index resolves to whichever
   * node was created/renamed most recently.
   */
  errorOnNameCollision?: boolean
}

/** Progress events emitted during the rewrite walk. */
export interface MoveProgress {
  phase: "data-layer" | "rewrite-scan" | "rewrite-apply" | "fs-rename"
  visited: number
  total: number
  refsRewritten: number
}

/** Result returned to the caller after a successful move. */
export interface MoveResult {
  /** Stable across moves and renames. */
  nodeId: string
  /** Display name before/after, when content changed. */
  oldName: string | null
  newName: string | null
  /** Canonical short id (path-form) before/after, when it changed. */
  oldShortId: string | null
  newShortId: string | null
  /** Filesystem path before/after, when it changed. */
  oldFsPath: string | null
  newFsPath: string | null
  /** Number of host nodes touched by the rewrite. */
  rewroteHosts: number
  /** Number of individual reference occurrences rewritten. */
  rewroteRefs: number
  /** Hosts that the walker found but couldn't rewrite cleanly. */
  failedHosts: Array<{ id: string; reason: string }>
  /** True when the on-disk fs rename actually executed (vs no-op or skipped). */
  fsRenamed: boolean
}

// =============================================================================
// Mutation interface — minimal shape needed from the Repo's mutation methods
// =============================================================================

/** Subset of mutation methods that the rewrite walk needs. */
export interface MutationsForMoveRefs {
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string, position: number): void
}

// =============================================================================
// Core rewriter — content text → (replaced text, count)
// =============================================================================

/**
 * Rewrite wiki-form references in `content` from `oldName` to `newName`.
 * Handles: `[[old]]`, `[[old|alias]]`, `[[old#section]]`, `[[old^block]]`,
 * `![[old]]`, `![[old|alias]]`. The alias / section / block portion is
 * preserved verbatim. Case-insensitive on the target portion (matches the
 * existing renameNode behaviour).
 *
 * Wiki-form refs inside fenced/inline code are not indexed by the link
 * cache, so they are not visited via getBacklinksByHref — the rewrite
 * here only touches what the cache surfaced. Code-block safety is upheld
 * by the parser, not by this regex.
 */
export function rewriteWikilinks(content: string, oldName: string, newName: string): { text: string; count: number } {
  if (!oldName || oldName === newName) return { text: content, count: 0 }
  const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // (\!?\[\[) target ((?:#[^\]|]+)?(?:\^[^\]|]+)?)? (\|alias)? (\]\])
  // Capture groups:
  //   1: optional "!" + "[["
  //   2: section/block suffix (may be empty)
  //   3: optional "|alias"
  //   4: closing "]]"
  // Suffix matches:
  //   - `#Section`     (heading anchor)
  //   - `#^block-id`   (block ref, also valid as `^block-id` in older notations)
  //   - `^block-id`    (bare block ref — Obsidian-style)
  // Aliased form is `|alias`. Closing is `]]`.
  const pattern = new RegExp(`(\\!?\\[\\[)${escapedOld}((?:#[^\\]|]+|\\^[^\\]|]+)?)((?:\\|[^\\]]+)?)(\\]\\])`, "gi")
  let count = 0
  const text = content.replace(pattern, (_match, open, suffix, alias, close) => {
    count++
    return `${open}${newName}${suffix ?? ""}${alias ?? ""}${close}`
  })
  return { text, count }
}

/**
 * Rewrite a path segment (as appears inside km.add / km.sync queries):
 *   "./inbox/** status:todo" → "./tasks/** status:todo"
 */
function replacePathInQuery(query: string, oldName: string, newName: string): string {
  if (!oldName || oldName === newName) return query
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pathPattern = new RegExp(`((?:^|\\s)(?:\\.?/)?)${escaped}(/|\\*\\*|$)`, "gi")
  return query.replace(pathPattern, `$1${newName}$2`)
}

/**
 * Bare-id prose rewrite (gated behind `--include-prose`).
 *
 * Handles the structured forms `@<prefix>/<scope>/<slug>` and
 * `<prefix>-<scope>.<slug>` / `<prefix>-<scope>-<slug>` — anywhere a writer
 * may have referenced the old id without a wikilink wrapper.
 *
 * Skips matches inside `[[…]]`, `` `…` `` (inline code) or fenced code
 * blocks (matched via a stateful split). The match anchors on word
 * boundaries to avoid mangling unrelated tokens.
 */
export function rewriteBareIdMentions(
  content: string,
  oldShortId: string,
  newShortId: string,
): { text: string; count: number } {
  if (!oldShortId || oldShortId === newShortId) return { text: content, count: 0 }
  // Build a list of variants the user may have typed:
  //   - exact form (@km/scope/slug)
  //   - bd-flavored dot variant (km-scope.slug) when the path-form is
  //     `@<prefix>/<scope>/<slug>`
  //   - bd-flavored dash variant (km-scope-slug)
  const variants = new Set<string>([oldShortId])
  const newPathForm = newShortId
  // Convert `@km/scope/slug…` → `km-scope.slug…` and `km-scope-slug…`
  const pathFormMatch = oldShortId.match(/^@([a-z0-9]+)\/(.+)$/i)
  if (pathFormMatch) {
    const [, prefix, rest] = pathFormMatch
    if (prefix && rest) {
      variants.add(`${prefix}-${rest.replace(/\//g, ".")}`)
      variants.add(`${prefix}-${rest.replace(/\//g, "-")}`)
    }
  }

  let count = 0
  // Skip fenced code blocks by splitting on ``` and only rewriting odd-indexed (non-fence) chunks
  const fencedParts = content.split(/(```[\s\S]*?```)/g)
  const out = fencedParts
    .map((chunk, idx) => {
      // Even indices are non-fenced regions; odd are fenced verbatim.
      if (idx % 2 === 1) return chunk
      // Within non-fenced regions, also pass through inline code and wikilinks verbatim.
      // Splitter alternates: text, [[wiki]], text, `code`, text, …
      const subParts = chunk.split(/(\[\[[^\]]*\]\]|`[^`]*`)/g)
      return subParts
        .map((sub) => {
          if (/^\[\[/.test(sub) || /^`/.test(sub)) return sub
          let out = sub
          for (const variant of variants) {
            const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            // Word-boundary anchored when the variant ends in a word char;
            // when it ends in '/' or similar, the boundary degrades naturally.
            const pattern = new RegExp(`(^|[^A-Za-z0-9_/@.\\-])${escaped}(?=[^A-Za-z0-9_/@.\\-]|$)`, "g")
            out = out.replace(pattern, (_m, prefix) => {
              count++
              return `${prefix}${newPathForm}`
            })
          }
          return out
        })
        .join("")
    })
    .join("")
  return { text: out, count }
}

// =============================================================================
// Rule-field rewrite helper
// =============================================================================

interface RuleFieldUpdate {
  field: string | string[] | undefined
  changed: boolean
}

function rewriteRuleField(field: string | string[] | undefined, oldName: string, newName: string): RuleFieldUpdate {
  if (!field) return { field, changed: false }
  if (Array.isArray(field)) {
    const updated = field.map((q) => replacePathInQuery(q, oldName, newName))
    const changed = updated.some((q, i) => q !== field[i])
    return { field: changed ? updated : field, changed }
  }
  const updated = replacePathInQuery(field, oldName, newName)
  return { field: updated, changed: updated !== field }
}

// =============================================================================
// Implementation
// =============================================================================

/** Snapshot taken at the start of the operation, before any mutation. */
interface MoveSnapshot {
  oldName: string
  oldCanonicalId: string | null
  oldShortId: string | null
  oldFsPath: string | null
  oldParentId: string | null
  oldHrefs: string[]
  oldAliases: string[]
}

function snapshotNode(node: KNode): MoveSnapshot {
  const data = (node.data ?? {}) as Record<string, unknown>
  const shortId = typeof data.short_id === "string" ? data.short_id : null
  const canonicalId = typeof data.id === "string" ? data.id : null
  const aliases = Array.isArray(data.aliases)
    ? (data.aliases as unknown[]).filter((a): a is string => typeof a === "string")
    : []
  const hrefs = new Set<string>()
  if (node.name) hrefs.add(normalizeLinkHref("wiki", node.name))
  const stem = pathOf(node)
  if (stem) hrefs.add(normalizeLinkHref("wiki", stem))
  return {
    oldName: node.name ?? "",
    oldCanonicalId: canonicalId,
    oldShortId: shortId,
    oldFsPath: node.fs_path ?? null,
    oldParentId: node.parent_id ?? null,
    oldHrefs: [...hrefs],
    oldAliases: aliases,
  }
}

/**
 * Compute the target name from spec.newContent (when provided), via
 * `normalizeNodeName`. Returns the existing name when no rename was
 * requested.
 */
function deriveNewName(snapshot: MoveSnapshot, spec: MoveSpec): string {
  if (spec.newContent === undefined) return snapshot.oldName
  return normalizeNodeName(spec.newContent)
}

function deriveCanonicalName(canonicalId: string): string | null {
  const fsPath = canonicalIdToFsPath(canonicalId)
  if (!fsPath) return null
  return basename(fsPath, ".md")
}

/**
 * Compute the target fs_path. Today's strategy: when renaming, keep the
 * directory and replace the leaf basename. When re-parenting, defer to
 * the storage→fs sync layer (we leave fs_path unchanged and let the
 * watcher reconcile). When both, rename inside the new parent's dir.
 */
function deriveNewFsPath(snapshot: MoveSnapshot, newName: string, newParentFsPath: string | null): string | null {
  if (!snapshot.oldFsPath) return null
  const oldDir = dirname(snapshot.oldFsPath)
  // Re-parent: best-effort. When we have a new parent fs_path, drop the
  // old leaf into that directory; otherwise stay put.
  const targetDir = newParentFsPath !== null ? newParentFsPath.replace(/\.md$/, "") : oldDir
  // Preserve the .md extension if present
  const ext = snapshot.oldFsPath.endsWith(".md") ? ".md" : ""
  const slugifiedLeaf = newName
    .replace(/[\\/:*?"<>|]/g, "-") // strip filesystem-illegal chars
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
  if (!slugifiedLeaf) return snapshot.oldFsPath
  const newPath = targetDir && targetDir !== "." ? `${targetDir}/${slugifiedLeaf}${ext}` : `${slugifiedLeaf}${ext}`
  return newPath
}

function canonicalIdToFsPath(canonicalId: string): string | null {
  if (!canonicalId.startsWith("@") || !canonicalId.includes("/")) return null
  return `${canonicalId}.md`
}

/**
 * Promote old name + old short id onto the moved node's `aliases` list,
 * capped at `preserveAliases`. Returns the updated aliases array (most
 * recent first) or null when no change is needed.
 */
function promoteAliases(
  snapshot: MoveSnapshot,
  newName: string,
  newCanonicalId: string | null,
  newShortId: string | null,
  preserveAliases: number,
): string[] | null {
  if (preserveAliases <= 0) return null
  const promote = new Set<string>()
  if (snapshot.oldName && snapshot.oldName !== newName) promote.add(snapshot.oldName)
  if (snapshot.oldCanonicalId && snapshot.oldCanonicalId !== newCanonicalId) promote.add(snapshot.oldCanonicalId)
  if (snapshot.oldShortId && snapshot.oldShortId !== newShortId) promote.add(snapshot.oldShortId)
  if (promote.size === 0) return null
  // Newest aliases first; existing aliases follow.
  const merged = [...promote, ...snapshot.oldAliases.filter((a) => !promote.has(a))]
  if (merged.length > preserveAliases) merged.length = preserveAliases
  // No change if the existing list is already identical.
  if (merged.length === snapshot.oldAliases.length && merged.every((a, i) => a === snapshot.oldAliases[i])) {
    return null
  }
  return merged
}

interface MoveDeps {
  db: Database
  dataStore: DataStore
  mutations: MutationsForMoveRefs
  /** Repo root for fs operations. Optional — when absent, fs rename is a no-op. */
  rootPath?: string
  /** Hook to bust the children cache after a re-parent. */
  bustChildrenCache?: (parentId: string | null) => void
}

/**
 * Implementation of `repo.moveNodeWithRefs`. Wired into the Repo via
 * `attachMoveWithRefs(repo, deps)`.
 */
// oxlint-disable-next-line complexity/complexity -- six-phase rewriter (snapshot, name+parent+short-id, indexed wikilink walk, frontmatter scan, prose scan, link-cache repoint, fs rename) coordinates per-host pending content + idempotence + collision check; phases share the snapshot so splitting forces argument-passing without simplification gain
export function moveNodeWithRefs(id: string, spec: MoveSpec, deps: MoveDeps, options: MoveOptions = {}): MoveResult {
  const { db, dataStore, mutations } = deps
  const errorOnNameCollision = options.errorOnNameCollision ?? true
  const preserveAliases = options.preserveAliases ?? 10
  const noRewrite = options.noRewrite ?? false
  const includeProse = options.includeProse ?? false
  const onProgress = options.onProgress

  const node = dataStore.getNode(id)
  if (!node) throw new Error(`Node not found: ${id}`)

  const snapshot = snapshotNode(node)
  const newName = spec.newContent !== undefined
    ? deriveNewName(snapshot, spec)
    : spec.newCanonicalId
      ? (deriveCanonicalName(spec.newCanonicalId) ?? snapshot.oldName)
      : snapshot.oldName
  const newCanonicalId = spec.newCanonicalId !== undefined ? spec.newCanonicalId : snapshot.oldCanonicalId
  const newShortId = spec.newShortId !== undefined ? spec.newShortId : snapshot.oldShortId
  const newParentId = spec.newParentId !== undefined ? spec.newParentId : snapshot.oldParentId
  const newReferenceId = newCanonicalId ?? newShortId ?? null
  const oldReferenceIds = [
    snapshot.oldCanonicalId,
    snapshot.oldShortId,
    ...snapshot.oldAliases,
  ].filter((ref, index, refs): ref is string => typeof ref === "string" && ref.length > 0 && refs.indexOf(ref) === index)

  // Idempotent no-op detection: same name, same short id, same parent.
  const isNoOp =
    newName === snapshot.oldName &&
    (newCanonicalId ?? null) === (snapshot.oldCanonicalId ?? null) &&
    (newShortId ?? null) === (snapshot.oldShortId ?? null) &&
    (newParentId ?? null) === (snapshot.oldParentId ?? null) &&
    spec.newContent === undefined

  if (isNoOp) {
    onProgress?.({ phase: "data-layer", visited: 0, total: 0, refsRewritten: 0 })
    return {
      nodeId: id,
      oldName: snapshot.oldName || null,
      newName: newName || null,
      oldShortId: snapshot.oldShortId ?? snapshot.oldCanonicalId,
      newShortId: newShortId ?? newCanonicalId ?? null,
      oldFsPath: snapshot.oldFsPath,
      newFsPath: snapshot.oldFsPath,
      rewroteHosts: 0,
      rewroteRefs: 0,
      failedHosts: [],
      fsRenamed: false,
    }
  }

  // Name-collision check. We use the dataStore's name index via getAllNodes()
  // as a fallback — bare-repo tests may not have the smart-resolver index
  // populated. Skip when `errorOnNameCollision` is false.
  if (errorOnNameCollision && newName && newName !== snapshot.oldName) {
    const collision = dataStore.getAllNodes().find((n) => n.id !== id && (n.name ?? "") === newName && !n.fs_path)
    // A name collision is only a hard error when the colliding node has no
    // fs_path (i.e. an inline node). Two files with the same display name
    // is allowed because their fs paths differ. We surface the error per
    // the design (open-q 4): refuse, let the user fix.
    if (collision) {
      throw new Error(
        `Name collision: another node already named "${newName}" (id=${collision.id}). Pass --allow-name-collision to override.`,
      )
    }
  }

  // Compute new fs_path. We don't have direct access to the new parent's
  // fs_path from here — derive it lazily via dataStore.
  const newParentNode = newParentId ? dataStore.getNode(newParentId) : null
  const newFsPath =
    spec.newFsPath ?? (spec.newCanonicalId ? canonicalIdToFsPath(spec.newCanonicalId) : null) ?? deriveNewFsPath(snapshot, newName, newParentNode?.fs_path ?? null)

  // ---- Phase 1: data-layer mutations on the moved node ----
  onProgress?.({ phase: "data-layer", visited: 0, total: 0, refsRewritten: 0 })

  const newAliases = promoteAliases(snapshot, newName, newCanonicalId ?? null, newShortId ?? null, preserveAliases)

  const dataChanges: Record<string, unknown> = {}
  const existingData = (node.data ?? {}) as Record<string, unknown>
  let dataChanged = false
  if (newCanonicalId !== undefined && newCanonicalId !== snapshot.oldCanonicalId) {
    dataChanges.id = newCanonicalId
    dataChanged = true
  }
  if (newShortId !== undefined && newShortId !== snapshot.oldShortId) {
    dataChanges.short_id = newShortId
    dataChanged = true
  }
  if (newAliases) {
    dataChanges.aliases = newAliases
    dataChanged = true
  }
  // When renaming, also keep the frontmatter `name` override in sync if present
  if (spec.newContent !== undefined && typeof existingData.name === "string" && existingData.name !== newName) {
    dataChanges.name = newName
    dataChanged = true
  }

  const updates: Partial<KNode> = {}
  if (spec.newContent !== undefined) {
    updates.content = spec.newContent
    updates.title = spec.newContent
    updates.name = newName
  }
  if (newFsPath !== null && newFsPath !== snapshot.oldFsPath) {
    updates.fs_path = newFsPath
  }
  if (dataChanged) {
    updates.data = { ...existingData, ...dataChanges } as Record<string, unknown>
  }
  if (Object.keys(updates).length > 0) {
    mutations.updateNode(id, updates)
  }

  // Re-parent (if requested)
  if (spec.newParentId !== undefined && (newParentId ?? null) !== (snapshot.oldParentId ?? null)) {
    // null parent → "." (root) per the dataStore contract
    const targetParentId = newParentId ?? "."
    const position = spec.position ?? Date.now()
    mutations.moveNode(id, targetParentId, position)
  }

  // Compute new hrefs (after the data-layer mutation so we work on the
  // post-rename row when relevant).
  const newHrefs = new Set<string>()
  if (newName) newHrefs.add(normalizeLinkHref("wiki", newName))
  const newStem = pathOf({ fs_path: newFsPath })
  if (newStem) newHrefs.add(normalizeLinkHref("wiki", newStem))

  if (noRewrite) {
    onProgress?.({ phase: "rewrite-apply", visited: 0, total: 0, refsRewritten: 0 })
    return {
      nodeId: id,
      oldName: snapshot.oldName || null,
      newName: newName || null,
      oldShortId: snapshot.oldShortId ?? snapshot.oldCanonicalId,
      newShortId: newShortId ?? newCanonicalId ?? null,
      oldFsPath: snapshot.oldFsPath,
      newFsPath,
      rewroteHosts: 0,
      rewroteRefs: 0,
      failedHosts: [],
      fsRenamed: false,
    }
  }

  // ---- Phase 2: indexed wikilink + transclusion rewrite ----
  // Track per-host pending content so phases 2 and 3 don't fight each
  // other when they touch the same host.
  const pendingHostContent = new Map<string, string>()
  const failedHosts: Array<{ id: string; reason: string }> = []
  let rewroteRefs = 0
  const touchedHosts = new Set<string>()

  if (snapshot.oldName !== newName) {
    const candidateHostIds = new Set<string>()
    for (const oldHref of snapshot.oldHrefs) {
      const links = getBacklinksByHref(db, oldHref)
      for (const link of links) candidateHostIds.add(link.host_id)
    }
    onProgress?.({ phase: "rewrite-scan", visited: 0, total: candidateHostIds.size, refsRewritten: 0 })

    let visited = 0
    for (const hostId of candidateHostIds) {
      if (hostId === id) {
        // Skip self — we already updated content in phase 1.
        visited++
        continue
      }
      const hostNode = dataStore.getNode(hostId)
      if (!hostNode?.content) {
        visited++
        continue
      }
      const { text, count } = rewriteWikilinks(hostNode.content, snapshot.oldName, newName)
      if (count > 0) {
        pendingHostContent.set(hostId, text)
        touchedHosts.add(hostId)
        rewroteRefs += count
      }
      visited++
      onProgress?.({ phase: "rewrite-apply", visited, total: candidateHostIds.size, refsRewritten: rewroteRefs })
    }
  }

  // ---- Phase 3: rules + frontmatter scan over getAllNodes ----
  // updateRenameReferences-style sweep, but also handles aliases and
  // frontmatter parent_id.
  const allNodes = dataStore.getAllNodes()
  for (const n of allNodes) {
    if (n.id === id) continue // skip the moved node — already updated in phase 1

    const existingData = (n.data ?? {}) as Record<string, unknown>
    const existingProps = existingData.props as
      | Record<string, { type: string; target?: string; values?: Array<{ target: string }> }>
      | undefined
    const existingAliases = Array.isArray(existingData.aliases)
      ? (existingData.aliases as unknown[]).filter((a): a is string => typeof a === "string")
      : null
    const existingParentId = typeof existingData.parent_id === "string" ? (existingData.parent_id as string) : null

    let nextData: Record<string, unknown> | null = null
    let rulesChanged = false

    // Rule rewrite (km.add / km.sync)
    if (n.rules && snapshot.oldName !== newName) {
      const newRules = { ...n.rules }
      const addResult = rewriteRuleField(newRules.add, snapshot.oldName, newName)
      if (addResult.changed) {
        newRules.add = addResult.field as typeof newRules.add
        rulesChanged = true
      }
      const syncResult = rewriteRuleField(newRules.sync, snapshot.oldName, newName)
      if (syncResult.changed) {
        newRules.sync = syncResult.field as string
        rulesChanged = true
      }
      if (rulesChanged) {
        nextData = { ...existingData, rules: newRules }
      }
    }

    // Frontmatter aliases — replace any entry equal to the old name or
    // old short id with the corresponding new value (preserves order).
    if (
      existingAliases &&
      (snapshot.oldName !== newName || (newReferenceId && oldReferenceIds.some((ref) => ref !== newReferenceId)))
    ) {
      const updated = existingAliases.map((alias) => {
        if (snapshot.oldName && alias === snapshot.oldName) return newName
        if (newReferenceId && oldReferenceIds.includes(alias)) return newReferenceId
        return alias
      })
      if (updated.some((a, i) => a !== existingAliases[i])) {
        nextData = { ...(nextData ?? existingData), aliases: updated }
      }
    }

    // Frontmatter parent_id
    if (
      existingParentId &&
      newReferenceId &&
      oldReferenceIds.includes(existingParentId) &&
      existingParentId !== newReferenceId
    ) {
      nextData = { ...(nextData ?? existingData), parent_id: newReferenceId }
    }

    // blocked-by props (link form + list form)
    if (
      existingProps &&
      (snapshot.oldName !== newName || (newReferenceId && oldReferenceIds.some((ref) => ref !== newReferenceId)))
    ) {
      let propsChanged = false
      const newProps = { ...existingProps }
      for (const [key, p] of Object.entries(newProps)) {
        if (!p || typeof p !== "object") continue
        const matches = (target: string | undefined): boolean => {
          if (!target) return false
          const lower = target.toLowerCase()
          if (snapshot.oldName && lower === snapshot.oldName.toLowerCase()) return true
          if (oldReferenceIds.includes(target)) return true
          return false
        }
        const replacementFor = (target: string): string => {
          if (newReferenceId && oldReferenceIds.includes(target)) return newReferenceId
          return newName
        }
        if (p.type === "link" && p.target && matches(p.target)) {
          newProps[key] = { ...p, target: replacementFor(p.target) }
          propsChanged = true
        } else if (p.type === "list" && Array.isArray(p.values)) {
          const oldValues = p.values
          const newValues = oldValues.map((v) => (matches(v.target) ? { ...v, target: replacementFor(v.target) } : v))
          if (newValues.some((v, i) => v !== oldValues[i])) {
            newProps[key] = { ...p, values: newValues }
            propsChanged = true
          }
        }
      }
      if (propsChanged) {
        nextData = { ...(nextData ?? existingData), props: newProps }
      }
    }

    // Apply the data update if anything changed
    if (nextData) {
      const changes: Partial<KNode> = { data: nextData as KNode["data"] }
      // The renameNode legacy code also rewrites content when rules
      // changed (so the heading line displays the new path). Keep that
      // behaviour, but scope to lines starting with km.add::/km.sync::.
      if (rulesChanged && n.content) {
        const escaped = snapshot.oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const linePattern = new RegExp(`(km\\.(?:add|sync)::[^\\n]*?)${escaped}`, "g")
        const updatedContent = n.content.replace(linePattern, `$1${newName}`)
        if (updatedContent !== n.content) {
          // Merge with any pending content from phase 2
          const baseContent = pendingHostContent.get(n.id) ?? n.content
          const reapplied = baseContent.replace(linePattern, `$1${newName}`)
          pendingHostContent.set(n.id, reapplied)
          touchedHosts.add(n.id)
        }
      }
      try {
        mutations.updateNode(n.id, changes)
        // We don't count these as rewroteRefs (they aren't link occurrences)
        // but we do count the host as touched.
        touchedHosts.add(n.id)
      } catch (err) {
        failedHosts.push({ id: n.id, reason: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  // ---- Phase 4: bare-id mention pass (opt-in) ----
  if (includeProse && newReferenceId) {
    for (const oldReferenceId of oldReferenceIds) {
      if (oldReferenceId === newReferenceId) continue
      for (const n of allNodes) {
        if (n.id === id) continue
        const baseContent = pendingHostContent.get(n.id) ?? n.content
        if (!baseContent) continue
        const { text, count } = rewriteBareIdMentions(baseContent, oldReferenceId, newReferenceId)
        if (count > 0) {
          pendingHostContent.set(n.id, text)
          touchedHosts.add(n.id)
          rewroteRefs += count
        }
      }
    }
  }

  // Flush pending host content
  for (const [hostId, text] of pendingHostContent) {
    try {
      mutations.updateNode(hostId, { content: text, title: text })
    } catch (err) {
      failedHosts.push({ id: hostId, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  // ---- Phase 5: link-cache href update ----
  // Repoint the canonical href column on link rows from old → new so
  // backlink queries return correct results until the next re-parse.
  // Mirrors the existing renameNode behaviour.
  if (snapshot.oldHrefs.length > 0) {
    const newHref = newName ? normalizeLinkHref("wiki", newName) : null
    for (const oldHref of snapshot.oldHrefs) {
      if (newHref && oldHref !== newHref) {
        db.run(`UPDATE links SET href = ? WHERE href = ?`, [newHref, oldHref])
      }
    }
  }

  // ---- Phase 6: post-commit fs rename ----
  let fsRenamed = false
  if (!options.dryRunFs && deps.rootPath && snapshot.oldFsPath && newFsPath && snapshot.oldFsPath !== newFsPath) {
    onProgress?.({ phase: "fs-rename", visited: 0, total: 1, refsRewritten: rewroteRefs })
    const oldAbs = join(deps.rootPath, snapshot.oldFsPath)
    const newAbs = join(deps.rootPath, newFsPath)
    if (existsSync(oldAbs) && !existsSync(newAbs)) {
      try {
        renameSync(oldAbs, newAbs)
        fsRenamed = true
      } catch (err) {
        failedHosts.push({ id: "<fs-rename>", reason: err instanceof Error ? err.message : String(err) })
      }
    } else if (!existsSync(oldAbs) && existsSync(newAbs)) {
      // Already renamed — idempotent recovery path.
      fsRenamed = false
    }
  }

  return {
    nodeId: id,
    oldName: snapshot.oldName || null,
    newName: newName || null,
    oldShortId: snapshot.oldShortId ?? snapshot.oldCanonicalId,
    newShortId: newShortId ?? newCanonicalId ?? null,
    oldFsPath: snapshot.oldFsPath,
    newFsPath,
    rewroteHosts: touchedHosts.size,
    rewroteRefs,
    failedHosts,
    fsRenamed,
  }
}
