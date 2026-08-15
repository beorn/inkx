/**
 * useHover — track whether the mouse is currently over an element.
 *
 * Returns `{ isHovered, onMouseEnter, onMouseLeave }`. This hook reports
 * pointer geometry only. Components that paint interaction feedback use
 * `useInteractionTreatment`, which derives the visual treatment from role.
 *
 * ```tsx
 * const interaction = useInteractionTreatment("control", "surfaceHover")
 * return (
 *   <Box
 *     onMouseEnter={interaction.onMouseEnter}
 *     onMouseLeave={interaction.onMouseLeave}
 *     backgroundColor={interaction.treatment.backgroundColor}
 *     onClick={doStuff}
 *   >
 *     …
 *   </Box>
 * )
 * ```
 *
 * Notes on semantics:
 * - Silvery dispatches mouse-enter / mouse-leave based on box-rect geometry,
 *   so nested Boxes each receive their own events independently.
 * - `e.stopPropagation()` is called on leave so parent boxes don't "flicker
 *   out" when the cursor transits between sibling hover targets.
 */

import { useCallback, useState } from "react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"

export interface UseHoverReturn {
  isHovered: boolean
  onMouseEnter: (e: SilveryMouseEvent) => void
  onMouseLeave: (e: SilveryMouseEvent) => void
}

export function useHover(): UseHoverReturn {
  const [isHovered, setIsHovered] = useState(false)

  const onMouseEnter = useCallback((_e: SilveryMouseEvent) => {
    setIsHovered(true)
  }, [])

  const onMouseLeave = useCallback((e: SilveryMouseEvent) => {
    e.stopPropagation()
    setIsHovered(false)
  }, [])

  return { isHovered, onMouseEnter, onMouseLeave }
}
