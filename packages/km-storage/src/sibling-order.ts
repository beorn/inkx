/**
 * Sibling Order Persistence
 *
 * Persists user-defined sibling order to `.km/sibling-order.json`.
 * Without this, folder-backed columns reset to filesystem alphabetical
 * order whenever state.db is rebuilt.
 *
 * Format:
 * ```json
 * {
 *   ".": ["column-b", "column-a", "column-c"],
 *   "some/subfolder": ["child-2", "child-1"]
 * }
 * ```
 *
 * Keys are parent fs_path (relative to repo root, "." for root).
 * Values are ordered arrays of child entry names (basename, not full path).
 * Only parents with user-defined order are stored — the absence of a key
 * means "use filesystem order" (backward compatible).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { createLogger } from "loggily"

const log = createLogger("km:storage:sibling-order")

/** Map of parent fs_path → ordered child names */
export type SiblingOrderMap = Record<string, string[]>

const FILENAME = "sibling-order.json"

/**
 * Read persisted sibling orders from `.km/sibling-order.json`.
 * Returns an empty map if the file doesn't exist or is invalid.
 */
export function readSiblingOrder(repoRoot: string): SiblingOrderMap {
  const kmDir = join(repoRoot, ".km")
  const filePath = join(kmDir, FILENAME)

  if (!existsSync(filePath)) return {}

  try {
    const raw = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      log.warn?.(`invalid sibling-order.json format, ignoring`)
      return {}
    }
    // Validate structure: every value must be a string array
    const result: SiblingOrderMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        result[key] = value as string[]
      } else {
        log.warn?.(`invalid entry in sibling-order.json for key "${key}", ignoring`)
      }
    }
    return result
  } catch (e) {
    log.warn?.(`failed to read sibling-order.json: ${e}`)
    return {}
  }
}

/**
 * Write the sibling order for a specific parent.
 * Merges with existing orders (other parents are preserved).
 *
 * @param repoRoot - Root directory of the repo
 * @param parentFsPath - Relative fs_path of the parent ("." for root)
 * @param childNames - Ordered array of child entry names
 */
export function writeSiblingOrder(repoRoot: string, parentFsPath: string, childNames: string[]): void {
  const kmDir = join(repoRoot, ".km")
  const filePath = join(kmDir, FILENAME)

  // Read existing
  const existing = readSiblingOrder(repoRoot)

  // Update the specific parent
  existing[parentFsPath] = childNames

  // Remove empty entries
  for (const key of Object.keys(existing)) {
    if (existing[key]!.length === 0) {
      delete existing[key]
    }
  }

  // Write atomically
  if (!existsSync(kmDir)) {
    mkdirSync(kmDir, { recursive: true })
  }

  writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
  log.debug?.(`wrote sibling order for parent="${parentFsPath}": [${childNames.join(", ")}]`)
}

/**
 * Apply persisted sibling order to a list of filesystem entries.
 *
 * Returns a map from entry name to the order index that should be used
 * as `parent_idx`. Entries not in the persisted order are placed after
 * the ordered ones, preserving their relative filesystem order.
 *
 * @param persistedOrder - The persisted child name ordering
 * @param entryNames - The actual child names found on the filesystem
 * @returns Map from entry name to order index
 */
export function applySiblingOrder(
  persistedOrder: string[],
  entryNames: string[],
): Map<string, number> {
  const result = new Map<string, number>()
  const persistedSet = new Set(persistedOrder)

  // First, assign indices to persisted entries in their stored order
  let idx = 0
  for (const name of persistedOrder) {
    if (entryNames.includes(name)) {
      result.set(name, idx++)
    }
    // Skip entries that no longer exist on disk
  }

  // Then, assign indices to entries not in the persisted order
  // (new files/folders added since the order was saved)
  for (const name of entryNames) {
    if (!persistedSet.has(name)) {
      result.set(name, idx++)
    }
  }

  return result
}
