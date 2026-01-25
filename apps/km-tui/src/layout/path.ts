/**
 * Path Rendering (Layer 2 - TUI Layout)
 *
 * Smart breadcrumb path rendering with truncation.
 */

import type { KNode } from "@km/core"

/**
 * Path segment for breadcrumb rendering.
 */
export interface PathSegment {
  id: string | null
  name: string
  sep: string
  isWithinBoard: boolean
  node: KNode | null
}

/**
 * Calculate display length of path segments.
 * Accounts for separator padding (shown as " sep ").
 */
export function calcPathLength(segments: PathSegment[]): number {
  return segments.reduce(
    (acc, seg) => acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0),
    0,
  )
}

/**
 * Render a path with smart truncation to fit within maxWidth.
 * Truncates from start of within-board segments first, then root path.
 *
 * @param segments - Path segments to render
 * @param width - Maximum width in characters
 * @returns Truncated path segments
 */
export function renderPath(
  segments: PathSegment[],
  width?: number,
): PathSegment[] {
  if (!width || calcPathLength(segments) <= width) return segments

  const rootSegs = segments.filter((s) => !s.isWithinBoard)
  const boardSegs = segments.filter((s) => s.isWithinBoard)

  // Truncate within-board segments from start
  while (
    boardSegs.length > 1 &&
    calcPathLength([...rootSegs, ...boardSegs]) > width
  ) {
    boardSegs.shift()
    const first = boardSegs[0]
    if (first) {
      boardSegs[0] = { ...first, name: "…" + first.name }
    }
    break
  }

  const combined = [...rootSegs, ...boardSegs]

  // Truncate root segments if still too long
  if (calcPathLength(combined) > width && combined.length > 1) {
    while (combined.length > 1 && calcPathLength(combined) > width) {
      combined.shift()
    }
    const first = combined[0]
    if (first) {
      combined[0] = { ...first, name: "…" + first.name, sep: "" }
    }
  }

  return combined
}

/**
 * Render a parent context path, right-aligned with left truncation.
 *
 * @param path - The parent path to render
 * @param width - Maximum width in characters
 * @returns Right-aligned string, truncated from left with "…" if needed
 */
export function renderParentPath(path: string, width: number): string {
  if (path.length <= width) {
    return path.padStart(width)
  }
  return "…" + path.slice(-(width - 1))
}
