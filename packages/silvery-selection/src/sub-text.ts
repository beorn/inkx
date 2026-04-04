/**
 * Text sub-selection accessor.
 *
 * Computed that filters sub() for kind="text", plus edit/select/deselect methods.
 * edit() ensures the parent node is selected via selectableAncestor.
 */

import type { DefaultSubSelection, ID, TextSelection } from "./types.ts"

export type TextAccessor = {
  /** Computed: current text selection, or null if not in text mode */
  (): TextSelection | null
  /** Enter text editing at nodeId/offset. Ensures node is selected. */
  edit(nodeId: ID, offset: number): void
  /** Move text cursor and/or set anchor (text range) */
  select(cursor?: number, anchor?: number): void
  /** Exit text mode */
  deselect(): void
}

export function createTextAccessor(
  $sub: () => DefaultSubSelection | null,
  doEdit: (nodeId: ID, offset: number) => void,
  doSelect: (cursor?: number, anchor?: number) => void,
  doDeselect: () => void,
): TextAccessor {
  function read(): TextSelection | null {
    const sub = $sub()
    return sub?.kind === "text" ? sub : null
  }

  read.edit = function edit(nodeId: ID, offset: number): void {
    doEdit(nodeId, offset)
  }

  read.select = function select(cursor?: number, anchor?: number): void {
    const sub = $sub()
    if (sub === null || sub.kind !== "text") return
    doSelect(cursor, anchor)
  }

  read.deselect = function deselect(): void {
    const sub = $sub()
    if (sub === null || sub.kind !== "text") return
    doDeselect()
  }

  return read as TextAccessor
}
