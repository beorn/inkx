import { ulid } from "ulid";

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
  childNumber: number
): string {
  return `${parentShortId}.${childNumber}`;
}

// Note: resolveShortId will need storage access - stub for now
export async function resolveShortId(shortId: string): Promise<string | null> {
  // TODO: Query storage for node with data.short_id matching
  void shortId;
  return null;
}
