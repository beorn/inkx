/**
 * Favorites Registry
 *
 * Mutable map of key → board ID for quick navigation.
 * Accessible to both keybinding generation and TUI action handlers.
 *
 * Any single printable key can be a favorite, except reserved keys
 * used by system locations and picker locations.
 */

/** Default favorites: common boards accessed via digit keys */
const favorites = new Map<string, string>([
  ["0", "@inbox"],
  ["1", "@next"],
  ["2", "@someday"],
  ["3", "@waiting"],
  ["4", "@someday"],
  ["5", "@projects"],
  ["6", "@areas"],
  ["7", "@archive"],
  ["8", "@reference"],
  ["9", "@goals"],
])

/**
 * Keys reserved by system locations (h,i,j,a,p,g,G) and picker locations (#,@,+,[).
 * These cannot be assigned as favorites. Mirrored from verb-locations.ts to avoid
 * circular dependency (verb-locations imports from favorites).
 */
const RESERVED_KEY_LABELS: Record<string, string> = {
  h: "home",
  i: "inbox",
  j: "journal",
  a: "archive",
  p: "parent",
  g: "first",
  G: "last",
  "#": "tag",
  "@": "assignee",
  "+": "project",
  "[": "item",
}

export const RESERVED_KEYS: ReadonlySet<string> = new Set(Object.keys(RESERVED_KEY_LABELS))

/** Get the board ID for a favorite key */
export function getFavorite(key: string): string | undefined {
  return favorites.get(key)
}

/** Assign a board to a favorite key */
export function setFavorite(key: string, boardId: string): void {
  favorites.set(key, boardId)
}

/** Clear a favorite key assignment */
export function clearFavorite(key: string): void {
  favorites.delete(key)
}

/** Get all favorites as a read-only map */
export function getAllFavorites(): ReadonlyMap<string, string> {
  return favorites
}

/** Get the human-readable label for a reserved key, or undefined if not reserved */
export function getReservedKeyLabel(key: string): string | undefined {
  return RESERVED_KEY_LABELS[key]
}
