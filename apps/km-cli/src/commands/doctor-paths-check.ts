/**
 * Doctor: data.id vs derived parent-path drift check.
 *
 * Soft sanity check. For every node carrying an `id` prop
 * (in `data.id`), derive the path by walking the
 * parent chain and joining `node.name` with "/". Drift between the
 * declared id and the derived path means the file was likely moved or
 * renamed without `km bd rename`. We only report — no enforcement, no
 * derive-on-read.
 */

import type { Database } from "bun:sqlite"

export interface DriftFinding {
  nodeId: string
  declared: string
  derived: string
}

export interface FindPathDriftOptions {
  includeFixtures?: boolean
}

// Test-fixture corpora carry hardcoded ULID `data.id` values intentionally
// — they're synthetic artifacts, not real beads. Skip them by default so
// `km doctor paths` doesn't surface false-positive drift on every run.
// Pass `--include-fixtures` (or `{ includeFixtures: true }`) to scan them.
const DEFAULT_FIXTURE_PATHS = [
  "**/fidelity-corpus/**",
  "**/__fixtures__/**",
  "**/test-fixtures/**",
  "**/tests/fixtures/**",
]

// Tiny matcher for the `**/<segment>/**` shape only — we don't need full
// glob semantics. Equivalent to "any path containing this segment between
// two slashes." Patterns that don't match the shape fall back to literal
// substring match so future entries don't silently no-op.
function matchesAny(path: string, patterns: readonly string[]): boolean {
  for (const pattern of patterns) {
    const m = pattern.match(/^\*\*\/(.+)\/\*\*$/)
    if (m && m[1] !== undefined) {
      const segment = m[1]
      if (path.includes(`/${segment}/`) || path.startsWith(`${segment}/`)) return true
    } else if (path.includes(pattern)) {
      return true
    }
  }
  return false
}

interface NameRow {
  name: string | null
  parent_id: string | null
}

function buildNameMap(db: Database): Map<string, NameRow> {
  const rows = db.query("SELECT id, name, parent_id FROM nodes").all() as Array<{
    id: string
    name: string | null
    parent_id: string | null
  }>
  const map = new Map<string, NameRow>()
  for (const row of rows) {
    map.set(row.id, { name: row.name, parent_id: row.parent_id })
  }
  return map
}

function deriveNodePath(nodeId: string, nameMap: Map<string, NameRow>): string | null {
  const parts: string[] = []
  let cursor: string | null = nodeId
  const seen = new Set<string>()
  while (cursor) {
    if (seen.has(cursor)) return null // cycle guard
    seen.add(cursor)
    const node = nameMap.get(cursor)
    if (!node) break
    if (node.name) parts.unshift(node.name)
    cursor = node.parent_id
  }
  return parts.length > 0 ? parts.join("/") : null
}

export function findPathDrift(db: Database, options: FindPathDriftOptions = {}): DriftFinding[] {
  const rows = db.query(`SELECT id, data FROM nodes WHERE json_extract(data, '$.id') IS NOT NULL`).all() as Array<{
    id: string
    data: string | Record<string, unknown> | null
  }>

  const findings: DriftFinding[] = []
  if (rows.length === 0) return findings

  const nameMap = buildNameMap(db)
  const skipFixtures = !options.includeFixtures

  for (const row of rows) {
    const data =
      typeof row.data === "string" ? (JSON.parse(row.data) as Record<string, unknown>) : (row.data ?? undefined)
    const declared = data && typeof data === "object" ? (data as Record<string, unknown>).id : undefined
    if (typeof declared !== "string" || declared.length === 0) continue

    const derived = deriveNodePath(row.id, nameMap)
    if (derived === null) continue

    if (declared !== derived) {
      if (skipFixtures && (matchesAny(row.id, DEFAULT_FIXTURE_PATHS) || matchesAny(derived, DEFAULT_FIXTURE_PATHS))) {
        continue
      }
      findings.push({ nodeId: row.id, declared, derived })
    }
  }

  return findings
}

export function countPathDriftCheckable(db: Database): number {
  const row = db.query(`SELECT COUNT(*) as count FROM nodes WHERE json_extract(data, '$.id') IS NOT NULL`).get() as {
    count: number
  }
  return row.count
}
