/**
 * Path Rendering (Layer 2 - TUI Layout)
 *
 * Smart breadcrumb path rendering with truncation.
 */

import type { KNode } from "@km/core"
import { displayLength } from "../text/rich.ts"

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
  return segments.reduce((acc, seg) => acc + displayLength(seg.name) + (seg.sep ? displayLength(seg.sep) + 2 : 0), 0)
}

/**
 * Clamp a segment label to a single line.
 *
 * Body cards (paragraphs, tasks, quotes) can hold multi-line content. When
 * their content is used verbatim as a breadcrumb segment, embedded `\n`s cause
 * the top bar to span multiple rows and bleed into the board area. The
 * breadcrumb must always be a single row, so segment labels must never contain
 * newlines. If the label is clamped, append an ellipsis so the user can see it
 * was truncated.
 */
export function clampSegmentLabel(name: string): string {
  const newlineIdx = name.search(/\r\n|\r|\n/)
  if (newlineIdx === -1) return name
  const firstLine = name.slice(0, newlineIdx)
  return firstLine + "\u2026"
}

/**
 * Apply {@link clampSegmentLabel} to every segment. Safe to call with an
 * already-clamped segment list (idempotent).
 */
export function clampSegmentLabels(segments: PathSegment[]): PathSegment[] {
  let changed = false
  const out = segments.map((seg) => {
    const clamped = clampSegmentLabel(seg.name)
    if (clamped === seg.name) return seg
    changed = true
    return { ...seg, name: clamped }
  })
  return changed ? out : segments
}

/**
 * Render a path with smart truncation to fit within maxWidth.
 * Truncates from start of within-board segments first, then root path.
 *
 * @param segments - Path segments to render
 * @param width - Maximum width in characters
 * @returns Truncated path segments
 */
export function renderPath(segments: PathSegment[], width?: number): PathSegment[] {
  if (!width || calcPathLength(segments) <= width) return segments

  const rootSegs = segments.filter((s) => !s.isWithinBoard)
  const boardSegs = segments.filter((s) => s.isWithinBoard)

  // Truncate within-board segments from start
  while (boardSegs.length > 1 && calcPathLength([...rootSegs, ...boardSegs]) > width) {
    boardSegs.shift()
    const first = boardSegs[0]
    if (first) {
      boardSegs[0] = { ...first, name: "⋯" + first.name }
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
      combined[0] = { ...first, name: "⋯" + first.name, sep: "" }
    }
  }

  return combined
}

/**
 * Render a parent context path, right-aligned with left truncation.
 *
 * @param path - The parent path to render
 * @param width - Maximum width in characters
 * @returns Right-aligned string, truncated from left with "⋯" if needed
 */
export function renderParentPath(path: string, width: number): string {
  if (path.length <= width) {
    return path.padStart(width)
  }
  return "⋯" + path.slice(-(width - 1))
}
