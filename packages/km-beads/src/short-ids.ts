import { ulid } from "ulid";
import { getDb } from "@km/storage";

const PREFIX = "km";
const SEPARATOR = "-";
const AUTO_LENGTH = 4;

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
 */
export function resolveShortId(shortId: string): string | null {
  const db = getDb();

  // Query for node with matching short_id in data JSON field
  const row = db
    .prepare(
      `SELECT id FROM nodes WHERE json_extract(data, '$.short_id') = ? LIMIT 1`,
    )
    .get(shortId) as { id: string } | undefined;

  return row?.id ?? null;
}
