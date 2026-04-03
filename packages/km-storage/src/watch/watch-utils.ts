/**
 * Shared utilities for file watching (used by withFsWriter and withSync)
 */

import type { Database } from "bun:sqlite"
import { KNode } from "@km/core"
import { getNode } from "../index.ts"

/**
 * Find the file node that contains a given node (walk up parent chain).
 */
export function findFileNode(db: Database, node: KNode): KNode | null {
  if (KNode.isOutline(node) && (node.fstype === "file" || node.fstype === "mdfile")) return node
  if (!node.parent_id) return null

  const parent = getNode(db, node.parent_id)
  if (!parent) return null

  return findFileNode(db, parent)
}

/**
 * Convert a title to a safe filename.
 * Preserves case, replaces unsafe chars with dashes, appends .md.
 */
export function titleToFilename(title: string): string {
  const name = title
    .trim()
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return (name || "untitled") + ".md"
}
