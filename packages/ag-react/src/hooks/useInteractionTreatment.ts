import {
  resolveInteractionTreatment,
  type InteractionRole,
  type InteractionSurface,
  type InteractiveState,
} from "@silvery/ag"
import { useHover, type UseHoverReturn } from "./useHover"

const INACTIVE: Omit<InteractiveState, "hovered"> = {
  armed: false,
  selected: false,
  focused: false,
  dropTarget: false,
}

/** Hover tracking plus the canonical role/surface treatment resolver. */
export function useInteractionTreatment(
  role: InteractionRole,
  surface: InteractionSurface,
  enabled = true,
  state?: Partial<Omit<InteractiveState, "hovered">>,
): UseHoverReturn & { treatment: ReturnType<typeof resolveInteractionTreatment> } {
  const hover = useHover()
  const treatment = resolveInteractionTreatment(
    { ...INACTIVE, ...state, hovered: enabled && hover.isHovered },
    role,
    surface,
  )
  return { ...hover, treatment }
}
