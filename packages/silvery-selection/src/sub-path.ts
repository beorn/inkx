/**
 * Path sub-selection accessor (stub).
 *
 * Same pattern as text but for path selections. Methods are no-ops if kind doesn't match.
 */

import type { PathSelection, SubSelection } from "./types.ts"

export type PathAccessor = {
  /** Computed: current path selection, or null if not in path mode */
  (): PathSelection | null
  /** Enter path editing (stub) */
  edit(..._args: unknown[]): void
  /** Update path selection (stub) */
  select(..._args: unknown[]): void
  /** Exit path mode */
  deselect(): void
}

export function createPathAccessor(
  $sub: () => SubSelection | null,
  _doEdit: () => void,
  _doSelect: () => void,
  doDeselect: () => void,
): PathAccessor {
  function read(): PathSelection | null {
    const sub = $sub()
    return sub?.kind === "path" ? sub : null
  }

  read.edit = function edit(): void {
    // stub — no-op
  }

  read.select = function select(): void {
    // stub — no-op
  }

  read.deselect = function deselect(): void {
    const sub = $sub()
    if (sub === null || sub.kind !== "path") return
    doDeselect()
  }

  return read as PathAccessor
}
