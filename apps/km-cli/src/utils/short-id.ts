/**
 * Short-id resolution — taskwarrior-style typing economy for `km` commands.
 *
 * The lifecycle and show commands all accept a `<id>` argument. Today the
 * canonical id is the path-form (e.g. `@km/storage/move-with-rewrite-refs`).
 * Typing the full path is expensive when the slug is unique. This module
 * resolves user-supplied refs through three tiers, in order:
 *
 *   1. **Slug match** — the last `/`-separated segment of a node's
 *      canonical id (the bare filename without `.md`). Unique slug → match.
 *   2. **Scope/slug match** — refs containing `/` that aren't already
 *      sigil-prefixed (e.g. `storage/move-with-rewrite-refs`). Treated as
 *      a path-form suffix; delegates to the existing path resolver.
 *   3. **Full path-form / ULID** — the canonical chain via
 *      `Task.findByPathOrId` (which wires Bead.resolve + repo.resolveNode).
 *
 * On ambiguity (a bare slug typed by the user matches multiple nodes),
 * `resolveShortId` returns `{ node: null, candidates: [...] }` so callers
 * can render a helpful "did you mean: …" error.
 *
 * Performance: the slug→nodes map is built once per `repo` instance via
 * a WeakMap-keyed cache. Subsequent resolutions are O(1) lookups; the
 * initial scan is O(N) over `repo.data.getAllNodes()`.
 */

import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"
import { Task } from "@km/storage"
import { Bead } from "@km/beads"

export interface ShortIdResolution {
  /** Resolved node, or `null` when not found / ambiguous. */
  node: KNode | null
  /**
   * When ambiguous (slug typed by user, multiple nodes share that slug),
   * holds every matching candidate so callers can print "did you mean:
   * <list>?". Empty when not-found, or when a unique resolution was made.
   */
  candidates: KNode[]
}

/**
 * Per-repo slug → nodes index. Built lazily on first resolveShortId call.
 *
 * Keyed by `Repo` via a WeakMap so each fresh `using repo = await loadRepo(...)`
 * invocation gets its own index — no stale data from a prior command's
 * repo. Built off `repo.data.getAllNodes()`; entries with multiple nodes
 * sharing the same slug surface as candidate lists, not silent ambiguity.
 */
const slugIndexCache = new WeakMap<Repo, Map<string, KNode[]>>()

/**
 * Compute the slug for a node — the last `/`-separated segment of its
 * canonical id, without `.md`. The "canonical id" is the most stable
 * identifier we can derive:
 *
 *   - `data.id` (path-form sigil id, written by km-beads migrate)
 *   - `fs_path` (relative path from repo root)
 *   - `name` (the file/folder basename)
 *
 * We try in that order and take the last segment of the first hit. Nodes
 * without any of these (e.g. inline list items, in-file blocks) are
 * skipped — they don't have a typeable slug.
 */
function computeSlug(node: KNode): string | null {
  const data = node.data as { id?: unknown } | undefined
  const dataId = typeof data?.id === "string" ? data.id : null
  const candidate = dataId ?? node.fs_path ?? node.name ?? null
  if (!candidate) return null
  const lastSlash = candidate.lastIndexOf("/")
  const last = lastSlash >= 0 ? candidate.slice(lastSlash + 1) : candidate
  return last.replace(/\.md$/i, "").toLowerCase()
}

/**
 * Build (or fetch from cache) the slug → nodes index for a repo. Walks
 * every node once; multi-entry slugs surface as candidate lists in
 * `resolveShortId`'s ambiguity branch.
 */
function getSlugIndex(repo: Repo): Map<string, KNode[]> {
  const cached = slugIndexCache.get(repo)
  if (cached) return cached

  const index = new Map<string, KNode[]>()
  for (const node of repo.data.getAllNodes()) {
    const slug = computeSlug(node)
    if (!slug) continue
    const existing = index.get(slug)
    if (existing) existing.push(node)
    else index.set(slug, [node])
  }
  slugIndexCache.set(repo, index)
  return index
}

/**
 * Resolve a user-supplied id ref to a node, or to a candidates list when
 * ambiguous.
 *
 * Strategy (in order — first non-empty resolution wins):
 *
 *   1. **Path-shaped or canonical** (`@<prefix>/…`, `…/…`, ULID): delegate
 *      to `Task.findByPathOrId`. This handles full path-form, scope/slug
 *      suffix, ULID prefix/suffix, content match, etc.
 *   2. **Bare slug** (no `/`, no leading sigil): consult the slug index.
 *      Unique → match. Ambiguous → return candidates. Not found → fall
 *      through to (3).
 *   3. **Fallback** to `Task.findByPathOrId` for any oddly-shaped ref the
 *      slug index missed (e.g. content-only nodes).
 *
 * Pure over `repo` — no I/O, no terminal output. Callers print errors and
 * exit non-zero based on the returned shape.
 */
export function resolveShortId(repo: Repo, raw: string): ShortIdResolution {
  if (!raw?.trim()) return { node: null, candidates: [] }
  const trimmed = raw.trim()

  // Path-shaped or canonical refs: existing chain handles these. The slug
  // index is bare-only — for `@km/scope/foo` or `scope/foo`, defer to the
  // path resolver.
  const isPathShaped = trimmed.startsWith("@") || trimmed.includes("/")
  if (isPathShaped) {
    const found = Task.findByPathOrId(repo, trimmed, (r) => Bead.resolve(repo, r))
    return { node: found, candidates: [] }
  }

  // Bare slug — consult the slug index first so we can surface ambiguity.
  // Lower-cased to match `computeSlug`'s normalization.
  const index = getSlugIndex(repo)
  const matches = index.get(trimmed.toLowerCase())
  if (matches?.length === 1) {
    return { node: matches[0] ?? null, candidates: [] }
  }
  if (matches && matches.length > 1) {
    return { node: null, candidates: [...matches] }
  }

  // Slug missed — fall through to the canonical chain. Catches ULID
  // prefixes, content matches, and anything else the slug index doesn't
  // cover.
  const fallback = Task.findByPathOrId(repo, trimmed, (r) => Bead.resolve(repo, r))
  return { node: fallback, candidates: [] }
}

/**
 * Render an ambiguity error message including up to N candidate display
 * forms. Used by command handlers to print a consistent "did you mean:"
 * error before `process.exit(1)`.
 *
 * Display form per candidate: `data.id` if present (canonical sigil
 * path-form), else `fs_path`, else the ULID tail. Sorted alphabetically
 * for deterministic output.
 */
export function formatAmbiguityError(raw: string, candidates: KNode[], maxShow = 8): string {
  const labels = candidates
    .map((n) => {
      const data = n.data as { id?: unknown } | undefined
      if (typeof data?.id === "string" && data.id) return data.id
      if (n.fs_path) return n.fs_path.replace(/\.md$/i, "")
      return n.id.slice(-8)
    })
    .sort((a, b) => a.localeCompare(b))
  const shown = labels.slice(0, maxShow)
  const more = labels.length > maxShow ? ` (+${labels.length - maxShow} more)` : ""
  return `Ambiguous id '${raw}' — did you mean: ${shown.join(", ")}${more}?`
}
