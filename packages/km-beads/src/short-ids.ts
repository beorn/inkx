import { ulid } from "ulid";
import { getDb } from "@km/storage";
import type { Vault } from "@km/storage";

const PREFIX = "km";
const SEPARATOR = "-";
const AUTO_LENGTH = 4;

/** Options for short ID functions */
export interface ShortIdOptions {
  /** Vault to use for queries (preferred). Falls back to singleton if not provided. */
  vault?: Vault;
}

export function generateShortId(): string {
  const id = ulid();
  const suffix = id.slice(-AUTO_LENGTH).toLowerCase();
  return `${PREFIX}${SEPARATOR}${suffix}`;
}

export function generateCustomId(custom: string): string {
  return `${PREFIX}${SEPARATOR}${custom}`;
}

export function generateSubId(
  parentShortId: string,
  childNumber: number,
): string {
  return `${parentShortId}.${childNumber}`;
}

/**
 * Resolve a short ID (e.g., "km-a1b2") to a full node ID
 * Queries storage for nodes with matching data.short_id
 * @param shortId - The short ID to resolve
 * @param options - Optional options (vault for DI)
 */
export function resolveShortId(
  shortId: string,
  options?: ShortIdOptions,
): string | null {
  const sql = `SELECT id FROM nodes WHERE json_extract(data, '$.short_id') = ? LIMIT 1`;
  const params = [shortId];

  if (options?.vault) {
    const rows = options.vault.rawQuery<{ id: string }>(sql, params);
    return rows[0]?.id ?? null;
  }

  // Fallback to singleton
  const db = getDb();
  const row = db.prepare(sql).get(...params) as { id: string } | undefined;
  return row?.id ?? null;
}
