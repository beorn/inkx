import { ulid } from "ulid"
import type { Repo } from "@km/storage"

const PREFIX = "km"
const SEPARATOR = "-"
const AUTO_LENGTH = 4

/** Options for short ID functions */
export interface ShortIdOptions {
  /** Repo to use for queries. Required for functions that access storage. */
  repo?: Repo
}

export function generateShortId(): string {
  const id = ulid()
  const suffix = id.slice(-AUTO_LENGTH).toLowerCase()
  return `${PREFIX}${SEPARATOR}${suffix}`
}

export function generateCustomId(custom: string): string {
  return `${PREFIX}${SEPARATOR}${custom}`
}

export function generateSubId(parentShortId: string, childNumber: number): string {
  return `${parentShortId}.${childNumber}`
}

/**
 * Resolve a user-supplied id reference to a full node ID.
 *
 * Accepts three input forms, in priority order:
 *   1. Canonical path-form id    `silvercode/acp/rename`         → match `data.id`
 *   2. Sigil-prefixed path-form  `@km/silvercode/acp/rename`     → strip `@<prefix>/`, match `data.id`
 *   3. Legacy bd-form id         `km-silvercode.acp-rename`      → match `data.short_id` or any entry in `data.aliases`
 *
 * The three are tried in order; first match wins. The legacy paths are
 * compatibility shims for the bd→km bd cutover (see docs/future/beads.md).
 */
export function resolveShortId(input: string, options: ShortIdOptions): string | null {
  if (!options.repo) {
    throw new Error("resolveShortId requires a repo instance")
  }
  const repo = options.repo

  // Strip a leading `@<prefix>/` sigil to get the bare canonical path.
  const canonical = input.replace(/^@[^/]+\//, "")

  // 1. Frontmatter `id:` — the canonical path-form set on each .md file.
  const byCanonical = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes WHERE json_extract(data, '$.id') = ? LIMIT 1`,
    [canonical],
  )
  if (byCanonical[0]) return byCanonical[0].id

  // 2. Legacy bd-form short_id — still emitted by km bd create / generateShortId.
  const byShortId = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes WHERE json_extract(data, '$.short_id') = ? LIMIT 1`,
    [input],
  )
  if (byShortId[0]) return byShortId[0].id

  // 3. Frontmatter `aliases:` list — bd-form ids registered as historical names.
  const byAlias = repo.rawQuery<{ id: string }>(
    `SELECT id FROM nodes
     WHERE EXISTS (
       SELECT 1 FROM json_each(json_extract(data, '$.aliases')) WHERE value = ?
     )
     LIMIT 1`,
    [input],
  )
  if (byAlias[0]) return byAlias[0].id

  return null
}
