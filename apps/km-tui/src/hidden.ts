/**
 * Board Hidden System
 *
 * Reads/writes `.km/hidden` to hide nodes from the board view.
 * Nodes still exist in SQLite — they're just filtered at display time.
 *
 * Format: one path per line, # comments, blank lines ignored.
 * - Files: relative fs_path (e.g., "done.md")
 * - Folders: relative fs_path + "/" (e.g., "archive/")
 * - Sections: "file#slug" (e.g., "tasks.md#done")
 * - Bare slugs: "#slug" (matches in any file)
 *
 * Migration: reads `.km/ignored` as fallback for backwards compatibility.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs"
import { join, dirname } from "node:path"
import { KNode } from "@km/core"
import type { Repo } from "./repo-context.tsx"

// =============================================================================
// File I/O
// =============================================================================

function hiddenFilePath(repoPath: string): string {
  const newPath = join(repoPath, ".km", "hidden")
  if (!existsSync(newPath)) {
    // One-time migration: rename .km/ignored → .km/hidden
    const oldPath = join(repoPath, ".km", "ignored")
    if (existsSync(oldPath)) {
      try {
        renameSync(oldPath, newPath)
      } catch {
        return oldPath // Fall back to old path if rename fails
      }
    }
  }
  return newPath
}

/**
 * Read the set of hidden paths from `.km/hidden`.
 * Auto-migrates from `.km/ignored` on first access.
 * Returns empty set if file doesn't exist.
 */
export function readBoardHidden(repoPath: string): Set<string> {
  const filePath = hiddenFilePath(repoPath)
  if (!existsSync(filePath)) return new Set()

  try {
    const content = readFileSync(filePath, "utf-8")
    const paths = new Set<string>()
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith("#")) {
        paths.add(trimmed)
      }
    }
    return paths
  } catch {
    return new Set()
  }
}

/**
 * Add a path to `.km/hidden`.
 * Creates the file and `.km/` directory if needed.
 */
export function addHidden(repoPath: string, path: string): void {
  const filePath = hiddenFilePath(repoPath)
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const existing = readBoardHidden(repoPath)
  if (existing.has(path)) return

  const fileExists = existsSync(filePath)
  const content = fileExists ? `\n${path}\n` : `# .km/hidden — paths hidden from board view\n\n${path}\n`
  writeFileSync(filePath, content, { flag: "a" })
}

/**
 * Remove a path from `.km/hidden`.
 */
export function removeHidden(repoPath: string, path: string): void {
  const filePath = hiddenFilePath(repoPath)
  if (!existsSync(filePath)) return

  try {
    const content = readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const filtered = lines.filter((line) => line.trim() !== path)
    writeFileSync(filePath, filtered.join("\n"))
  } catch {
    // Ignore errors
  }
}

// =============================================================================
// Hidden Path Computation
// =============================================================================

/**
 * Compute the hidden path for a node.
 *
 * - Files/folders: use fs_path relative to repo root
 * - Sections: "parent-file#slug"
 * - Other: "parent-file#parent-section/slug"
 */
export function computeHiddenPath(node: KNode, repo: Repo): string | null {
  // File or folder with fs_path
  if (node.fs_path) {
    return KNode.isOutline(node) && node.fstype === "folder" ? node.fs_path + "/" : node.fs_path
  }

  // Section or child item — walk up to find parent file
  const slug = slugify(node.name || node.title || node.content || "")
  if (!slug) return null

  // Find the nearest ancestor with an fs_path
  let parentFile: KNode | null = null
  let parentSection: KNode | null = null
  let current: KNode | null | undefined = node.parent_id ? repo.getNode(node.parent_id) : undefined

  while (current) {
    if (current.fs_path) {
      parentFile = current
      break
    }
    if (KNode.isOutline(current) && current.fstype === "mdsection" && !parentSection) {
      parentSection = current
    }
    current = current.parent_id ? repo.getNode(current.parent_id) : undefined
  }

  if (!parentFile?.fs_path) {
    // No parent file — use bare slug
    return `#${slug}`
  }

  if (KNode.isOutline(node) && node.fstype === "mdsection") {
    return `${parentFile.fs_path}#${slug}`
  }

  if (parentSection) {
    const sectionSlug = slugify(parentSection.name || parentSection.title || "")
    return `${parentFile.fs_path}#${sectionSlug}/${slug}`
  }

  return `${parentFile.fs_path}#${slug}`
}

/**
 * Check if a node is hidden by the given set of hidden paths.
 */
export function isHidden(hiddenPaths: Set<string>, node: KNode, repo: Repo): boolean {
  if (hiddenPaths.size === 0) return false

  const path = computeHiddenPath(node, repo)
  if (!path) return false

  // Direct match
  if (hiddenPaths.has(path)) return true

  // Folder prefix match (e.g., "archive/" matches "archive/old.md")
  if (node.fs_path) {
    for (const p of hiddenPaths) {
      if (p.endsWith("/") && node.fs_path.startsWith(p)) return true
    }
  }

  return false
}

// =============================================================================
// Helpers
// =============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
