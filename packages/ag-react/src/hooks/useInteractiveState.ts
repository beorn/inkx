/**
 * useInteractiveState — read per-node interactive state in React components.
 *
 * Returns the current InteractiveState for the nearest ancestor AgNode,
 * or a default (all false) if no interactive state has been set.
 *
 * Interactive state is written synchronously by event processing (mouse,
 * focus, drag state machines), which triggers React re-renders. Reading
 * during render is sufficient — no signal subscription needed.
 */

import { useContext } from "react"
import { NodeContext } from "../context"
import type { InteractiveState } from "@silvery/ag/types"

/** Default state returned when no interactive state exists on the node */
const DEFAULT_STATE: Readonly<InteractiveState> = Object.freeze({
  hovered: false,
  armed: false,
  selected: false,
  focused: false,
  dropTarget: false,
})

/**
 * Read the interactive state of the current node.
 *
 * Returns a frozen default (all false) if the node has no interactive state.
 * The returned object should be treated as read-only.
 *
 * @example
 * ```tsx
 * function Button({ children }) {
 *   const state = useInteractiveState()
 *   const treatment = resolveInteractionTreatment(state, "control", "surfaceHoverFocused")
 *   return (
 *     <Box
 *       backgroundColor={treatment.backgroundColor}
 *     >
 *       {children}
 *     </Box>
 *   )
 * }
 * ```
 */
export function useInteractiveState(): Readonly<InteractiveState> {
  const node = useContext(NodeContext)
  if (!node?.interactiveState) return DEFAULT_STATE
  return node.interactiveState
}
