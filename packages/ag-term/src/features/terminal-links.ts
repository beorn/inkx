/**
 * Opt-in terminal-link projection for opaque Island cell grids.
 *
 * Silvery owns cell projection and activation order, not link discovery or
 * capability policy. Applications inject a detector and href resolver. Guest
 * OSC 8 cells have precedence over detected spans, while the same resolver is
 * applied to both sources before anything reaches the host terminal or the
 * `link:open` event rail.
 */

import type { AgNode } from "@silvery/ag/types"
import type { Buffer } from "../runtime/types"

export interface TerminalLinkSpan {
  /** UTF-16 offset into the rendered Island row. */
  start: number
  /** Exclusive UTF-16 offset into the rendered Island row. */
  end: number
  href: string
}

export interface WithTerminalLinksOptions {
  /** Detect links in one rendered Island row. Omit for explicit OSC 8 links only. */
  detect?: (text: string) => readonly TerminalLinkSpan[]
  /** Return an allowed/normalized href, or null to suppress it. Defaults to identity. */
  resolveHref?: (href: string) => string | null
}

export interface TerminalLinksFeature {
  /** Project explicit and detected Island links onto one freshly rendered frame. */
  decorate(root: AgNode | null, frame: Buffer): Buffer
  /** Resolve an already-decorated Island cell for modifier-click activation. */
  hrefAt(root: AgNode | null, frame: Buffer, x: number, y: number): string | null
}

function visitIslands(node: AgNode | null, visit: (island: AgNode) => void): void {
  if (!node) return
  if (node.type === "silvery-island") visit(node)
  for (const child of node.children) visitIslands(child, visit)
}

function containsPoint(node: AgNode, x: number, y: number): boolean {
  const rect = node.boxRect
  return Boolean(
    rect && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
  )
}

function assertSpan(span: TerminalLinkSpan, textLength: number): void {
  if (
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < 0 ||
    span.end <= span.start ||
    span.end > textLength ||
    span.href.length === 0
  ) {
    throw new Error(
      `Invalid terminal link span: ${JSON.stringify(span)} for row length ${textLength}`,
    )
  }
}

/**
 * Create the terminal-link feature passed as `run(..., { terminalLinks })`.
 * The returned object is inert until explicitly installed on a run.
 */
export function withTerminalLinks(options: WithTerminalLinksOptions = {}): TerminalLinksFeature {
  const resolveHref = options.resolveHref ?? ((href: string) => href)

  return {
    decorate(root, frame) {
      const buffer = frame._buffer
      visitIslands(root, (island) => {
        const rect = island.boxRect
        if (!rect) return
        const left = Math.max(0, Math.floor(rect.x))
        const top = Math.max(0, Math.floor(rect.y))
        const right = Math.min(buffer.width, Math.ceil(rect.x + rect.width))
        const bottom = Math.min(buffer.height, Math.ceil(rect.y + rect.height))

        for (let y = top; y < bottom; y++) {
          const explicitColumns = new Set<number>()
          const offsets: Array<{ column: number; start: number; end: number }> = []
          let text = ""

          for (let x = left; x < right; x++) {
            const cell = buffer.getCell(x, y)
            if (cell.hyperlink !== undefined && cell.hyperlink !== "") {
              explicitColumns.add(x)
              const resolved = resolveHref(cell.hyperlink)
              if (resolved !== cell.hyperlink) {
                buffer.setCell(x, y, { ...cell, hyperlink: resolved ?? undefined })
              }
            }
            if (cell.continuation) continue
            const start = text.length
            text += cell.char
            offsets.push({ column: x, start, end: text.length })
          }

          if (!options.detect || text.length === 0) continue
          for (const span of options.detect(text)) {
            assertSpan(span, text.length)
            const href = resolveHref(span.href)
            if (href === null || href === "") continue
            for (const offset of offsets) {
              if (
                offset.end > span.start &&
                offset.start < span.end &&
                !explicitColumns.has(offset.column)
              ) {
                const cell = buffer.getCell(offset.column, y)
                buffer.setCell(offset.column, y, { ...cell, hyperlink: href })
              }
            }
          }
        }
      })
      return frame
    },

    hrefAt(root, frame, x, y) {
      let insideIsland = false
      visitIslands(root, (island) => {
        if (containsPoint(island, x, y)) insideIsland = true
      })
      if (!insideIsland || !frame._buffer.inBounds(x, y)) return null
      return frame._buffer.getCell(x, y).hyperlink ?? null
    },
  }
}
