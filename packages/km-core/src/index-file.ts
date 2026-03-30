/**
 * Index File Detection & Name Utilities
 *
 * Pure functions for detecting folder index files (same-name.md, index.md, .md)
 * and comparing node names. These depend only on KNode types and string operations.
 *
 * Used by storage layer (write path) and view layer (column promotion).
 * Moved from @km/tree to @km/core to fix layer violations (@km/storage → @km/tree).
 */

import { KNode } from "./interfaces/index.ts"

// ── Name normalization ──────────────────────────────────────────────

/**
 * Normalize a name for comparison
 * - Removes # prefixes from sections
 * - Removes .md extension
 * - Treats underscores and hyphens as spaces
 * - Lowercases everything
 */
export function normalizeName(name: string): string {
  return name
    .replace(/^#+\s*/, "") // Remove leading # from sections
    .replace(/\.md$/i, "") // Remove .md extension
    .replace(/[-_]/g, " ") // Treat - and _ as spaces
    .replace(/[^\w\s]/g, "") // Remove special chars
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .toLowerCase()
}

/**
 * Check if two names are substantially the same
 */
export function namesAreSimilar(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b)
}

// ── Index file detection ────────────────────────────────────────────

/**
 * Find the index file among a folder's children.
 *
 * Priority: same-name.md > index.md > .md (unnamed)
 * Only considers mdfile children.
 */
export function findIndexFile(folderNode: KNode, children: KNode[]): KNode | null {
  const folderName = folderNode.name ?? ""
  if (!folderName) return null

  let indexMatch: KNode | null = null
  let dotMdMatch: KNode | null = null

  for (const child of children) {
    if (!isMdFile(child)) continue

    const childName = child.name ?? ""

    // Priority 1: same-name match (e.g., early-orbit/early-orbit.md)
    if (namesAreSimilar(folderName, childName)) {
      return child
    }

    // Priority 2: index.md
    if (childName.toLowerCase() === "index") {
      indexMatch = child
    }

    // Priority 3: .md (empty name — the file is literally ".md")
    if (childName === "") {
      dotMdMatch = child
    }
  }

  return indexMatch ?? dotMdMatch
}

/**
 * Check if a single child is an index file for a folder.
 */
export function isIndexFile(folderName: string, child: KNode): boolean {
  if (!isMdFile(child)) return false
  const childName = child.name ?? ""
  return namesAreSimilar(folderName, childName) || childName.toLowerCase() === "index" || childName === ""
}

/**
 * Check if a section heading is a structural child slot.
 *
 * Matches content like `![[./mip]]` — the `./` prefix indicates
 * a reference to a child of the containing folder.
 *
 * Returns the child name (without `./`) or null if not a slot.
 */
export function getChildSlotTarget(node: KNode): string | null {
  const content = node.content?.trim() ?? ""
  const match = content.match(/^!\[\[\.\/([^\]]+)\]\]$/)
  return match?.[1] ?? null
}

/**
 * Check if a node is a pure slot reference (content is entirely `![[./name]]` lines).
 */
export function isSlotNode(node: KNode): boolean {
  if (getChildSlotTarget(node)) return true
  const content = node.content?.trim() ?? ""
  if (!content) return false
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const slotPattern = /^!\[\[\.\/([^\]]+)\]\]$/
  return lines.length > 0 && lines.every((line) => slotPattern.test(line))
}

/**
 * Extract all child slot targets from an index file's direct children.
 * A child is a slot reference if its ENTIRE trimmed content is one or more
 * standalone `![[./name]]` lines (no surrounding text).
 */
export function extractSlotTargets(children: KNode[]): string[] {
  const targets: string[] = []
  for (const child of children) {
    // Single-embed: exact match via existing getChildSlotTarget
    const single = getChildSlotTarget(child)
    if (single) {
      targets.push(single)
      continue
    }
    // Multi-embed: content is ONLY slot lines (no prose)
    const content = child.content?.trim() ?? ""
    if (!content) continue
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const slotPattern = /^!\[\[\.\/([^\]]+)\]\]$/
    const allSlots = lines.every((line) => slotPattern.test(line))
    if (allSlots && lines.length > 0) {
      for (const line of lines) {
        const match = slotPattern.exec(line)
        if (match?.[1]) targets.push(match[1])
      }
    }
  }
  return targets
}

/** Check if a node is an md file (outline item with fstype mdfile) */
function isMdFile(node: KNode): boolean {
  return KNode.isOutline(node) && node.fstype === "mdfile"
}
