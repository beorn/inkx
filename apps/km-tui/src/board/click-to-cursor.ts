import { getWrappedLines } from "@silvery/tea/text-cursor"
import type { TermEditContext } from "@silvery/ag-react"
import type { AgNode } from "@silvery/ag-react"

// The fold marker + space prefix before the editable text content
const PREFIX_WIDTH = 2

/**
 * Map terminal (x, y) to cursor offset within the active edit context's text.
 *
 * @param clickX - Absolute terminal column of the click
 * @param clickY - Absolute terminal row of the click
 * @param editCtx - The active TermEditContext (provides text and wrapWidth)
 * @param idNode - The AgNode with the node's `id` prop (its screenRect gives the title row bounds)
 */
export function clickToCursorOffset(clickX: number, clickY: number, editCtx: TermEditContext, idNode: AgNode): number {
  const rect = idNode.screenRect
  if (!rect) return editCtx.selectionStart
  const lines = getWrappedLines(editCtx.text, editCtx.wrapWidth)
  // Text content starts after the prefix (fold marker + space)
  const textStartX = rect.x + PREFIX_WIDTH
  const relativeX = clickX - textStartX
  const relativeY = clickY - rect.y
  const row = Math.max(0, Math.min(relativeY, lines.length - 1))
  const line = lines[row]
  if (!line) return editCtx.selectionStart
  const col = Math.max(0, Math.min(relativeX, line.line.length))
  return Math.min(line.startOffset + col, editCtx.text.length)
}
