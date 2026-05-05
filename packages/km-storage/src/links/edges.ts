/**
 * Typed graph-edge API — internal `km link` infrastructure.
 *
 * The user-facing surface today is `km task dep add/rm/ls`. This module is
 * the single writer it (and any future `km link --rel <kind>` command) goes
 * through, so we have one authoritative path for adding/removing/reading
 * task-domain edges.
 *
 * # Why a separate module from `db/links.ts`?
 *
 * `db/links.ts` is the **content link cache** — the `links` table populated
 * by re-parsing every node's content (`rel ∈ { 'link', 'embed' }`, see
 * `docs/design/model/klink.md`). Typed predicates like `blocked-by`,
 * `author`, `cites` are listed in klink.md as "deferred — when they land,
 * `rel` widens to `string`".
 *
 * Until that widening lands and a typed-rel writer is wired through the
 * markdown parser, `blocked-by` (and any other typed edge a user wants to
 * mutate today) is stored as an inline Logseq-style property on the host
 * node — `node.data.props["blocked-by"]`. The serializer round-trips it
 * back to `blocked-by:: [[blocker]]` in the markdown.
 *
 * So this module is a **dispatcher**:
 *
 *   - rel === "blocks" / "blocked-by"  →  props-based blocked-by writer
 *   - rel === anything else            →  throws "not yet supported"
 *
 * When the canonical typed-rel `links` table lands per
 * `@km/storage/link-rel-taxonomy`, the dispatcher's "blocks" arm switches
 * to that table and the props arm becomes a back-compat read fallback.
 * Callers don't change.
 *
 * # Direction convention
 *
 * `addLink({ from: A, to: B, rel: "blocks" })` reads as "A blocks B" — i.e.
 * A is the blocker, B is the dependent. This matches the bd / GitHub
 * Issues convention where `blocks` and `blocked-by` are duals.
 *
 * On disk we store the inverse — `B.data.props["blocked-by"] = [A]` — so
 * the serialized `blocks::` / `blocked-by::` markdown syntax stays in
 * exactly one place (the dependent node's frontmatter), matching how
 * humans author it.
 *
 * `getLinks(B, { direction: "in" })` returns edges *into* B; for
 * rel="blocks" that's the same set as "what blocks B", i.e. B's blockers.
 */

import type { Repo } from "../repo/repo.ts"

/**
 * Node id alias — the canonical id form `repo.getNode` accepts. Aliased
 * here as documentation; storage doesn't currently brand the type.
 */
export type NodeId = string

// =============================================================================
// Public types
// =============================================================================

/**
 * Closed enum of typed graph-edge relations supported by the dep / link API.
 *
 * `blocks` is the canonical direction (A blocks B); `blocked-by` is the
 * inverse spelling and resolves to the same underlying storage. Both
 * spellings are accepted on input so callers don't have to translate.
 *
 * Other rels (`related`, `duplicates`, `child-of`, …) are reserved for
 * when the canonical typed-rel `links` schema lands. Calling addLink with
 * one of them throws today.
 */
export type LinkRel = "blocks" | "blocked-by" | "related" | "duplicates" | "child-of"

/**
 * A typed edge in the node graph. `from` and `to` are canonical node ids
 * (the same value `repo.getNode(id)` accepts).
 */
export interface GraphEdge {
  from: NodeId
  to: NodeId
  rel: LinkRel
}

/** Options for `getLinks`. */
export interface GetLinksOptions {
  /** Filter to a specific rel; default is all supported rels. */
  rel?: LinkRel
  /**
   * "out" — edges *from* this node (e.g. for rel="blocks", "what does this
   *  node block?")
   * "in"  — edges *to* this node (e.g. for rel="blocks", "what blocks
   *  this node?" — i.e. its blockers)
   * "both" — union of in + out (default)
   */
  direction?: "out" | "in" | "both"
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Add a typed edge to the graph. Idempotent — adding the same edge twice
 * is a no-op (no duplicate row, no duplicate prop entry).
 *
 * For rel="blocks" / "blocked-by": writes the dependent's
 * `data.props["blocked-by"]` list to include the blocker. The host node
 * is the `to` side because that's where the markdown
 * `blocked-by:: [[blocker]]` line lives — the dependent declares its
 * blockers, not the other way round.
 *
 * Throws when the rel is reserved-but-not-yet-implemented, or when
 * either node id doesn't resolve.
 */
export function addLink(repo: Repo, edge: GraphEdge): void {
  const rel = canonicalizeRel(edge.rel)
  if (rel !== "blocks") throw notYetSupported(edge.rel)

  const fromNode = repo.getNode(edge.from)
  if (!fromNode) throw new Error(`addLink: 'from' node not found: ${edge.from}`)
  const toNode = repo.getNode(edge.to)
  if (!toNode) throw new Error(`addLink: 'to' node not found: ${edge.to}`)

  // For "A blocks B", the dependent (B = edge.to) carries the blocked-by
  // prop. We store the blocker by its short id (the bd-style id users
  // type) when the blocker has one; fall back to the canonical id form
  // otherwise. Mirrors how `Bead.addDependency` derives the value the bd
  // dep command writes.
  const blockerKey = blockerStorageKey(repo, edge.from)
  const blockers = readBlockedBy(toNode)
  if (blockers.includes(blockerKey)) return // idempotent

  writeBlockedBy(repo, edge.to, [...blockers, blockerKey])
}

/**
 * Remove a typed edge from the graph. Idempotent — removing an edge that
 * doesn't exist is a no-op.
 *
 * Throws when the rel is reserved-but-not-yet-implemented, or when
 * either node id doesn't resolve.
 */
export function removeLink(repo: Repo, edge: GraphEdge): void {
  const rel = canonicalizeRel(edge.rel)
  if (rel !== "blocks") throw notYetSupported(edge.rel)

  const fromNode = repo.getNode(edge.from)
  if (!fromNode) throw new Error(`removeLink: 'from' node not found: ${edge.from}`)
  const toNode = repo.getNode(edge.to)
  if (!toNode) throw new Error(`removeLink: 'to' node not found: ${edge.to}`)

  const blockerKey = blockerStorageKey(repo, edge.from)
  const blockers = readBlockedBy(toNode)
  if (!blockers.includes(blockerKey)) return // idempotent

  writeBlockedBy(
    repo,
    edge.to,
    blockers.filter((b) => b !== blockerKey),
  )
}

/**
 * Read the typed edges incident to a node. The default returns both
 * directions; pass `direction: "out"` for outbound only or `"in"` for
 * inbound only.
 *
 * Returned edges always have the canonical node ids on `from`/`to` (so
 * callers can pass them straight back to `addLink`/`removeLink`); the
 * blocker storage key (if different from the node id) is normalized away.
 *
 * For rel="blocks":
 *   - direction="in"  surfaces the node's blockers (this node is blocked by …)
 *   - direction="out" surfaces what the node blocks (this node blocks …)
 *
 * For rel="blocked-by" the directions are flipped (it's the inverse rel),
 * so the result set is the same — only the spelling on the returned
 * `rel` field changes.
 */
export function getLinks(repo: Repo, nodeId: NodeId, options: GetLinksOptions = {}): GraphEdge[] {
  const rel = options.rel ? canonicalizeRel(options.rel) : "blocks"
  if (rel !== "blocks") throw notYetSupported(options.rel ?? "blocks")
  const direction = options.direction ?? "both"

  const node = repo.getNode(nodeId)
  if (!node) return []

  const out: GraphEdge[] = []
  const reportedRel: LinkRel = options.rel === "blocked-by" ? "blocked-by" : "blocks"

  if (direction === "in" || direction === "both") {
    // Inbound: this node's own blocked-by list — each entry is "A blocks me".
    for (const blockerKey of readBlockedBy(node)) {
      const blockerId = resolveBlocker(repo, blockerKey)
      if (!blockerId) continue
      out.push({ from: blockerId, to: nodeId, rel: reportedRel })
    }
  }

  if (direction === "out" || direction === "both") {
    // Outbound: scan all nodes for those whose blocked-by mentions us.
    // SQL-indexed via `deps` / fallback property scan — see
    // `findDependents` below for why we go through the repo's raw query
    // surface rather than scanning every node in JS.
    const myKey = blockerStorageKey(repo, nodeId)
    for (const dependent of findDependents(repo, myKey)) {
      out.push({ from: nodeId, to: dependent, rel: reportedRel })
    }
  }

  return out
}

// =============================================================================
// Internals — props-based blocked-by storage
// =============================================================================

/**
 * Normalize the user-facing rel name to its storage form. We accept both
 * "blocks" and "blocked-by" because users don't translate consistently —
 * some think "A blocks B" and some "B blocked-by A". They resolve to the
 * same underlying edge.
 */
function canonicalizeRel(rel: LinkRel): "blocks" | "related" | "duplicates" | "child-of" {
  if (rel === "blocked-by") return "blocks"
  return rel as "blocks" | "related" | "duplicates" | "child-of"
}

function notYetSupported(rel: LinkRel): Error {
  return new Error(
    `addLink/removeLink: rel='${rel}' not yet supported. ` +
      `Today only 'blocks' / 'blocked-by' are wired through the props-based ` +
      `blocked-by storage. Other rels land when the typed-rel links schema ` +
      `ships (see @km/storage/link-rel-taxonomy).`,
  )
}

interface PropEntry {
  type: string
  target?: string
  value?: unknown
  values?: Array<{ target: string; type?: string }>
}

interface NodeData {
  props?: Record<string, PropEntry>
  propsRaw?: Record<string, string>
  [key: string]: unknown
}

function readBlockedBy(node: { data?: unknown } | null | undefined): string[] {
  if (!node) return []
  const data = node.data as NodeData | undefined
  const entry = data?.props?.["blocked-by"]
  if (!entry) return []
  if (entry.type === "link" && entry.target) return [entry.target]
  if (entry.type === "list" && entry.values) return entry.values.map((v) => v.target)
  return []
}

/**
 * Materialize the props-based blocked-by entry for a list of blockers
 * and merge it into the host node's data blob, then route through
 * `repo.updateNode` so emitter / undo hooks see the change.
 *
 * Mirrors `buildBlockedByProps` + `mergeDepProps` from `@km/beads/deps.ts`
 * — kept inline here to avoid a layering reverse (storage importing
 * beads). Beads will land on top of this API in a follow-up commit (see
 * "single writer" goal).
 */
function writeBlockedBy(repo: Repo, hostId: NodeId, blockers: string[]): void {
  const node = repo.getNode(hostId)
  const existingData = ((node?.data ?? {}) as NodeData) || {}
  const existingProps: Record<string, PropEntry> = { ...existingData.props }
  const existingPropsRaw: Record<string, string> = { ...existingData.propsRaw }

  if (blockers.length === 0) {
    delete existingProps["blocked-by"]
    delete existingPropsRaw["blocked-by"]
  } else if (blockers.length === 1) {
    existingProps["blocked-by"] = { type: "link", target: blockers[0] }
    existingPropsRaw["blocked-by"] = `[[${blockers[0]}]]`
  } else {
    existingProps["blocked-by"] = {
      type: "list",
      values: blockers.map((b) => ({ type: "link", target: b })),
    }
    existingPropsRaw["blocked-by"] = blockers.map((b) => `[[${b}]]`).join(", ")
  }

  const nextData = {
    ...existingData,
    props: existingProps,
    propsRaw: existingPropsRaw,
  }

  repo.updateNode(hostId, { data: nextData })
}

// =============================================================================
// Internals — id ↔ blocker-key bridging
// =============================================================================

/**
 * The storage key we write into `blocked-by` for a given blocker node.
 *
 * Beads have a short id (`@km/scope/slug` or legacy `km-scope.slug`) on
 * `data.id` / `data.short_id`; using that key keeps the serialized
 * markdown human-readable (`blocked-by:: [[@km/foo/bar]]`).
 *
 * Non-bead nodes (no short id) fall back to the canonical node id (ULID).
 * That's lossy for round-trip rendering — but addLink for non-beads is a
 * developer-only path today and the canonical id is at least
 * unambiguous.
 */
function blockerStorageKey(repo: Repo, nodeId: NodeId): string {
  const node = repo.getNode(nodeId)
  if (!node) return nodeId
  const data = (node.data ?? {}) as { id?: unknown; short_id?: unknown }
  if (typeof data.id === "string" && data.id.length > 0) return data.id
  if (typeof data.short_id === "string" && data.short_id.length > 0) return data.short_id
  return nodeId
}

/**
 * Resolve a blocker key (whatever was stored in `blocked-by`) back to a
 * canonical node id. Tries:
 *
 *   1. `data.id` exact match  — the canonical path-form id (`@km/scope/slug`)
 *   2. `data.aliases` includes — legacy bd-form, dash-form, etc.
 *   3. `data.short_id` exact   — legacy short id
 *   4. raw node id             — ULID fallback for non-bead blockers
 *
 * Returns null when nothing matches (the `blocked-by` entry is dangling —
 * surfaced to the user by `getDependencies` / `getLinks` as a missing
 * entry rather than crashing).
 */
function resolveBlocker(repo: Repo, blockerKey: string): NodeId | null {
  // Direct node id hit (short circuit for non-bead blockers).
  if (repo.getNode(blockerKey)) return blockerKey

  // Indexed lookup via the raw query surface — short_id is indexed in
  // the deps materialized view since schema v7. We try data.id /
  // data.aliases / data.short_id in one query.
  type Row = { id: string }
  const rows = repo.rawQuery<Row>(
    `SELECT id FROM nodes WHERE
       json_extract(data, '$.id') = ?
       OR json_extract(data, '$.short_id') = ?
       OR EXISTS (
         SELECT 1 FROM json_each(json_extract(data, '$.aliases'))
         WHERE value = ?
       )
     LIMIT 1`,
    [blockerKey, blockerKey, blockerKey],
  )
  return rows[0]?.id ?? null
}

/**
 * Find every node whose `blocked-by` list mentions `blockerKey`.
 *
 * Uses the materialized `deps` view when the blocker is a bead with a
 * short id (kept current by triggers since schema v7 — see
 * `db/schema.ts` DEPS_DDL). Falls back to a JSON-extract scan over
 * `nodes.data.props["blocked-by"]` otherwise, which handles non-bead
 * blockers (`data.id`-less nodes) and any newly-added rows the trigger
 * hasn't materialized yet.
 */
function findDependents(repo: Repo, blockerKey: string): NodeId[] {
  type Row = { id: string }

  // Indexed path: `deps` materialized view, populated by SQLite triggers
  // from `data.props["blocked-by"]`. `kind = 'blocked-by'` rows store
  // (host_id, target) where host_id = dependent's node id and target =
  // the blocker's short id.
  const indexed = repo.rawQuery<Row>(
    `SELECT DISTINCT host_id AS id FROM deps
       WHERE kind = 'blocked-by' AND target = ?`,
    [blockerKey],
  )

  // Fallback scan — catches non-bead blockers and pre-trigger rows.
  // Cheap because SQLite short-circuits the JSON extract when the prop
  // is absent. The `blocked-by` key needs JSON-pointer quoting because
  // it contains a dash.
  const scanned = repo.rawQuery<Row>(
    `SELECT id FROM nodes
       WHERE json_extract(data, '$.props."blocked-by".target') = ?
          OR EXISTS (
            SELECT 1 FROM json_each(
              json_extract(data, '$.props."blocked-by".values')
            )
            WHERE json_extract(value, '$.target') = ?
          )`,
    [blockerKey, blockerKey],
  )

  // Union without duplicates, preserving the indexed-path order.
  const seen = new Set<string>()
  const out: NodeId[] = []
  for (const row of [...indexed, ...scanned]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row.id)
  }
  return out
}
