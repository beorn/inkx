/**
 * Crop sub-selection accessor (stub).
 *
 * Same pattern as text but for crop selections. Methods are no-ops if kind doesn't match.
 */

import type { CropSelection, SubSelection } from "./types.ts"

export type CropAccessor = {
  /** Computed: current crop selection, or null if not in crop mode */
  (): CropSelection | null
  /** Enter crop editing (stub) */
  edit(..._args: unknown[]): void
  /** Update crop selection (stub) */
  select(..._args: unknown[]): void
  /** Exit crop mode */
  deselect(): void
}

export function createCropAccessor(
  $sub: () => SubSelection | null,
  _doEdit: () => void,
  _doSelect: () => void,
  doDeselect: () => void,
): CropAccessor {
  function read(): CropSelection | null {
    const sub = $sub()
    return sub?.kind === "crop" ? sub : null
  }

  read.edit = function edit(): void {
    // stub — no-op
  }

  read.select = function select(): void {
    // stub — no-op
  }

  read.deselect = function deselect(): void {
    const sub = $sub()
    if (sub === null || sub.kind !== "crop") return
    doDeselect()
  }

  return read as CropAccessor
}
