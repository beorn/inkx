/**
 * Index File Writer
 *
 * Shared helpers for generating index file content and computing filenames.
 * `buildIndexContent()` is the SINGLE entry point for all index file generation.
 */

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { isOutline } from "@km/core"
import { findIndexFile, isSlotNode } from "@km/tree"
import { getChildren, getSubtree } from "./db-queries/tree-traversal.ts"
import { getAllNodes } from "./db-queries/utils.ts"
import { nodesToMarkdown } from "@km/markdown"

/**
 * Build index file content for a folder, preserving existing body.
 *
 * This is the SINGLE entry point for all index file generation.
 * - Title comes from folder node
 * - If an existing index file exists, its non-slot body is preserved
 *   using the full markdown serializer (lossless round-trip)
 * - Child slots come from folder's outline children
 *
 * Returns null if the folder has no title/name.
 */
export function buildIndexContent(
  db: Database,
  folder: KNode,
  config: { materialization: "metadata" | "full"; naming: string },
): string | null {
  const title = folder.content ?? folder.name ?? ""
  if (!title) return null

  const children = getChildren(db, folder.id)
  const existingIndex = findIndexFile(folder, children)

  // Preserve existing body from index file using proper serialization
  const body = existingIndex ? extractBodyFromIndex(db, existingIndex) : ""

  const childSlots = children.filter((c) => (!existingIndex || c.id !== existingIndex.id) && isOutline(c.type, c.item))

  return generateIndexFileContent(
    title,
    body,
    childSlots.map((c) => ({ name: c.name ?? "" })),
    config.materialization,
  )
}

/**
 * Extract body content from an existing index file using lossless markdown
 * serialization. Serializes the full index file subtree, then strips the
 * title heading and any trailing slot lines to isolate body content.
 *
 * This ensures code blocks, blockquotes, lists, and other complex markdown
 * survive index file regeneration — unlike the lossy `.content` join.
 */
function extractBodyFromIndex(db: Database, indexFile: KNode): string {
  const indexChildren = getChildren(db, indexFile.id)
  const bodyNodes = indexChildren.filter((c) => !isOutline(c.type, c.item) && !isSlotNode(c))
  if (bodyNodes.length === 0) return ""

  // Serialize the full index file subtree — this gives us perfectly round-tripped markdown
  const subtree = getSubtree(db, indexFile.id)
  const fullMarkdown = nodesToMarkdown(subtree, getAllNodes(db))

  // Strip the title (# Heading\n\n) from the beginning
  const titleMatch = fullMarkdown.match(/^(?:---\n[\s\S]*?---\n\n)?# [^\n]*\n\n/)
  if (!titleMatch) return ""
  let body = fullMarkdown.slice(titleMatch[0].length)

  // Strip trailing slot lines (![[./name]]\n) from the end
  const slotPattern = /(?:\n?(?:!\[\[\.\/.+?\]\]\n)+)$/
  body = body.replace(slotPattern, "")

  return body.trim()
}

/**
 * Generate markdown content for an index file.
 *
 * - "metadata": title (H1) + body paragraphs only
 * - "full": title + body + `![[./child-name]]` embed slots for each child in order
 */
export function generateIndexFileContent(
  title: string,
  body: string,
  children: Array<{ name: string }>,
  materialization: "metadata" | "full",
): string {
  if (!title) {
    throw new Error("generateIndexFileContent: title must not be empty")
  }
  let result = `# ${title}\n`

  // Body paragraphs (if any)
  const trimmedBody = body.trim()
  if (trimmedBody) {
    result += `\n${trimmedBody}\n`
  }

  // Child slots (full mode only)
  if (materialization === "full" && children.length > 0) {
    result += "\n"
    for (const child of children) {
      result += `![[./${child.name}]]\n`
    }
  }

  return result
}

/**
 * Compute the filename for a new index file.
 *
 * - "same-name": folderName + ".md"
 * - "index": "index.md"
 * - "dot-md": ".md"
 */
export function indexFileName(folderName: string, naming: "same-name" | "index" | "dot-md"): string {
  switch (naming) {
    case "same-name":
      return `${folderName}.md`
    case "index":
      return "index.md"
    case "dot-md":
      return ".md"
  }
}
