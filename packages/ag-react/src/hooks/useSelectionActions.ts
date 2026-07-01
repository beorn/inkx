/**
 * useSelectionActions — imperative actions on the current terminal selection
 * (copy to clipboard, clear), read from the SelectionFeature capability.
 *
 * Sibling to {@link useSelection} (which reads selection STATE). The `copy`
 * action extracts the current selection and writes it to the terminal clipboard
 * via OSC 52 — the SAME path mouse drag-copy and copy-mode yank use — so a host
 * can wire an explicit copy chord (e.g. Cmd-C) to it without reimplementing
 * selection extraction. Methods are `undefined` when the selection feature is
 * not installed (simple `run()` apps, or `withDomEvents`/selection disabled).
 */

import { useContext, useMemo } from "react"
import { CapabilityRegistryContext } from "../context"

// Must match SELECTION_CAPABILITY in @silvery/create/internal/capabilities and
// the sibling `useSelection` hook. Symbol.for is idempotent, so this resolves to
// the same registry key without importing @silvery/create internals into ag-react.
const SELECTION_CAPABILITY = Symbol.for("silvery.selection")

/** Imperative actions on the current selection. Each method is `undefined` when
 *  the selection feature is not installed. */
export interface SelectionActions {
  /** Copy the current selection to the clipboard (OSC 52). No-op when there is
   *  no selection. Reads the selection live, so call it at the moment of the
   *  copy gesture. */
  readonly copy: (() => void) | undefined
  /** Clear the current selection (dismiss the highlight). */
  readonly clear: (() => void) | undefined
}

interface SelectionFeatureActions {
  copy?(): void
  clear?(): void
}

/**
 * Access the current selection's imperative actions (copy / clear).
 *
 * Returns `{ copy: undefined, clear: undefined }` when no selection feature is
 * installed, so callers can `actions.copy?.()` unconditionally.
 */
export function useSelectionActions(): SelectionActions {
  const registry = useContext(CapabilityRegistryContext)
  const feature = registry?.get<SelectionFeatureActions>(SELECTION_CAPABILITY)
  return useMemo(() => ({ copy: feature?.copy, clear: feature?.clear }), [feature])
}
