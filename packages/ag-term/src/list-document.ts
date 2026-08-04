/**
 * Canonical row model spanning frozen history + live content.
 *
 * Frozen rows (from HistoryBuffer) occupy rows 0..frozenRows-1.
 * Live rows follow at frozenRows..totalRows-1.
 * All row indices are document-global.
 */

import type { HistoryBuffer } from "./history-buffer"
import { computeMatchRanges, type SearchMatch } from "./search-overlay"

export interface LiveItemBlock {
  key: string | number
  itemIndex: number
  rows: string[]
  plainTextRows: string[]
}

export interface DocumentSource {
  type: "frozen" | "live"
  itemKey?: string | number
  itemIndex?: number
  localRow: number
}

export interface ListDocument {
  readonly totalRows: number
  readonly frozenRows: number
  readonly liveRows: number
  getRows(startRow: number, count: number): string[]
  getPlainTextRows(startRow: number, count: number): string[]
  getSource(row: number): DocumentSource | null
  search(query: string): SearchMatch[]
}

export function createListDocument(
  history: HistoryBuffer,
  getLiveItems: () => LiveItemBlock[],
): ListDocument {
  function liveRowCount(): number {
    let total = 0
    for (const block of getLiveItems()) {
      total += block.rows.length
    }
    return total
  }

  return {
    get totalRows(): number {
      return history.totalRows + liveRowCount()
    },

    get frozenRows(): number {
      return history.totalRows
    },

    get liveRows(): number {
      return liveRowCount()
    },

    getRows(startRow: number, count: number): string[] {
      const frozen = history.totalRows
      const result: string[] = []
      for (let r = startRow; r < startRow + count; r++) {
        if (r < 0 || r >= this.totalRows) {
          result.push("")
        } else if (r < frozen) {
          result.push(...history.getRows(r, 1))
        } else {
          let liveRow = r - frozen
          let found = false
          for (const block of getLiveItems()) {
            if (liveRow < block.rows.length) {
              result.push(block.rows[liveRow]!)
              found = true
              break
            }
            liveRow -= block.rows.length
          }
          if (!found) result.push("")
        }
      }
      return result
    },

    getPlainTextRows(startRow: number, count: number): string[] {
      const frozen = history.totalRows
      const result: string[] = []
      for (let r = startRow; r < startRow + count; r++) {
        if (r < 0 || r >= this.totalRows) {
          result.push("")
        } else if (r < frozen) {
          result.push(...history.getPlainTextRows(r, 1))
        } else {
          let liveRow = r - frozen
          let found = false
          for (const block of getLiveItems()) {
            if (liveRow < block.plainTextRows.length) {
              result.push(block.plainTextRows[liveRow]!)
              found = true
              break
            }
            liveRow -= block.plainTextRows.length
          }
          if (!found) result.push("")
        }
      }
      return result
    },

    getSource(row: number): DocumentSource | null {
      const frozen = history.totalRows
      if (row < 0 || row >= this.totalRows) return null
      if (row < frozen) {
        const hit = history.getItemAtRow(row)
        if (!hit) return null
        return {
          type: "frozen",
          itemKey: hit.item.key,
          localRow: hit.localRow,
        }
      }
      // Live: walk item blocks
      const liveItems = getLiveItems()
      let liveRow = row - frozen
      for (const block of liveItems) {
        if (liveRow < block.rows.length) {
          return { type: "live", itemIndex: block.itemIndex, localRow: liveRow }
        }
        liveRow -= block.rows.length
      }
      return null
    },

    search(query: string): SearchMatch[] {
      if (!query) return []
      const matches: SearchMatch[] = []
      const frozen = history.totalRows

      // Search frozen rows
      const frozenRowMatches = history.search(query)
      for (const row of frozenRowMatches) {
        const plainRows = history.getPlainTextRows(row, 1)
        for (const range of computeMatchRanges(plainRows[0] ?? "", query)) {
          matches.push({ row, startCol: range.start, endCol: range.end })
        }
      }

      // Search live rows (walk item blocks)
      let rowOffset = 0
      for (const block of getLiveItems()) {
        for (let i = 0; i < block.plainTextRows.length; i++) {
          for (const range of computeMatchRanges(block.plainTextRows[i] ?? "", query)) {
            matches.push({
              row: frozen + rowOffset + i,
              startCol: range.start,
              endCol: range.end,
            })
          }
        }
        rowOffset += block.plainTextRows.length
      }

      return matches
    },
  }
}
