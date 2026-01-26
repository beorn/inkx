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

export function generateSubId(
  parentShortId: string,
  childNumber: number,
): string {
  return `${parentShortId}.${childNumber}`
}

/**
 * Resolve a short ID (e.g., "km-a1b2") to a full node ID
 * Queries storage for nodes with matching data.short_id
 * @param shortId - The short ID to resolve
 * @param options - Optional options (repo for DI)
 */
export function resolveShortId(
  shortId: string,
  options: ShortIdOptions,
): string | null {
  if (!options.repo) {
    throw new Error("resolveShortId requires a repo instance")
  }

  const sql = `SELECT id FROM nodes WHERE json_extract(data, '$.short_id') = ? LIMIT 1`
  const params = [shortId]
  const rows = options.repo.rawQuery<{ id: string }>(sql, params)
  return rows[0]?.id ?? null
}
