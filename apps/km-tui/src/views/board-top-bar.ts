/**
 * Board top bar - path segments rendering
 */
import { createTerm, type StyleChain } from "inkx"
import { isOutline, type KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { renderPlain, colorize } from "../text/index.ts"

/**
 * Create a term instance with truecolor support.
 * Called per-invocation to avoid module-level mutable state.
 */
function createTermStyle(): StyleChain {
  return createTerm({ color: "truecolor" })
}

export interface PathSegment {
  id: string | null
  name: string
  sep: string
  isWithinBoard: boolean
  node: KNode | null
}

/**
 * Build path segments for colorized display
 * Returns segments with: { id, name, sep, isWithinBoard }
 * isWithinBoard distinguishes the board root path from path within the board
 * Always includes a repo root segment (📁) at the start
 *
 * @param repo - Repo for node lookups
 * @param nodeId - Target node ID
 * @param boardRootId - Board root ID for determining "within board" segments
 */
export function getPathSegments(repo: Repo, nodeId: string | null, boardRootId: string | null): PathSegment[] {
  // Repo root segment - always present (folder icon)
  const repoRootSegment: PathSegment = {
    id: null,
    name: "\uD83D\uDCC1 ", // folder 📁 (trailing space before repo name)
    sep: "",
    isWithinBoard: false,
    node: null,
  }

  if (!nodeId) {
    return [repoRootSegment]
  }

  // Collect all nodes from root to target
  const nodes: KNode[] = []
  let currentId: string | null = nodeId
  while (currentId) {
    const node = repo.getNode(currentId)
    if (!node) break
    nodes.unshift(node)
    currentId = node.parent_id
  }

  if (nodes.length === 0) {
    return [{ id: null, name: "/", sep: "", isWithinBoard: false, node: null }]
  }

  // Find index where we enter the board (nodes after boardRootId)
  let boardRootIndex = -1
  if (boardRootId) {
    boardRootIndex = nodes.findIndex((n) => n.id === boardRootId)
  }

  // Build segments with separators
  // Filesystem segments use / and # separators; within-board segments use >
  // for clear hierarchy indication (e.g., "Project > Category > Task")
  const segments: PathSegment[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node) continue
    // Strip wiki link brackets and show alias for display
    const rawName = getNodeDisplayName(repo, node)
    const name = renderPlain(rawName)
    const isWithinBoard = boardRootIndex >= 0 && i > boardRootIndex

    if (node.type === "oi" && (node.fstype === "folder" || node.fstype === "file" || node.fstype === "mdfile")) {
      const sep = segments.length === 0 ? "" : isWithinBoard ? ">" : "/"
      segments.push({ id: node.id, name, sep, isWithinBoard, node })
    } else if (node.type === "oi" && node.fstype === "mdsection") {
      const sep = isWithinBoard ? ">" : "#"
      segments.push({ id: node.id, name, sep, isWithinBoard, node })
    } else if (isOutline(node.type)) {
      if (segments.length === 0) {
        segments.push({
          id: node.id,
          name,
          sep: "",
          isWithinBoard: false,
          node,
        })
      }
    } else {
      // Other types (paragraph, task, etc.)
      const sep = segments.length === 0 ? "" : isWithinBoard ? ">" : "/"
      segments.push({ id: node.id, name, sep, isWithinBoard, node })
    }
  }

  // Always prepend repo root segment (folder icon)
  return [repoRootSegment, ...segments]
}

/**
 * Render top bar content as plain string (no chalk styling)
 * Color is controlled by the parent Text component's color prop
 * Board root segment gets special formatting via term.bold
 */
export function renderTopBarContent(
  segments: Array<{ name: string; sep: string; isWithinBoard?: boolean }>,
  isBoardSelected: boolean,
  boardColor?: string,
): string {
  const style = createTermStyle()
  // Find the board root index:
  // - If there are isWithinBoard segments, board root is the last one before them
  // - If no isWithinBoard segments, the last segment is the board root
  const firstWithinBoardIdx = segments.findIndex((s) => s.isWithinBoard)
  const boardRootIdx =
    firstWithinBoardIdx > 0 ? firstWithinBoardIdx - 1 : firstWithinBoardIdx === -1 ? segments.length - 1 : 0

  // Build content: " ● " prefix + segments
  // Use style only for bold (board root) and dim (other segments)
  // Base color is inherited from parent Text component
  const boldStyle = isBoardSelected ? style.black.bold : style.gray.bold
  const dimStyle = isBoardSelected ? style.black.dim : style.gray.dim

  let content = boardColor ? " " + colorize("●", boardColor) + " " : " "

  segments.forEach((seg, idx) => {
    const sepPart = seg.sep ? ` ${seg.sep} ` : ""
    const isBoardRoot = idx === boardRootIdx

    if (isBoardRoot) {
      // Board root: bold, prominent (sep is dimmed)
      content += dimStyle(sepPart) + boldStyle(seg.name)
    } else {
      // Path segments before/after board root: dimmed
      content += dimStyle(sepPart + seg.name)
    }
  })

  return content
}
