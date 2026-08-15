import {
  resolveInteractionTreatment,
  type InteractionRole,
  type InteractionSurfaceInput,
  type InteractiveState,
} from "@silvery/ag"
import { useHover, type UseHoverReturn } from "./useHover"
import { useModifierKeys } from "./useModifierKeys"

const INACTIVE: Omit<InteractiveState, "hovered"> = {
  armed: false,
  selected: false,
  focused: false,
  dropTarget: false,
}

/** Hover tracking plus the canonical role/surface treatment resolver. */
export function useInteractionTreatment(
  role: InteractionRole,
  surface: InteractionSurfaceInput,
  enabled = true,
  state?: Partial<Omit<InteractiveState, "hovered">>,
): UseHoverReturn & {
  isRevealActive: boolean
  treatment: ReturnType<typeof resolveInteractionTreatment>
} {
  const hover = useHover()
  const requiresModifier = role === "content-link"
  const { super: commandHeld } = useModifierKeys({
    enabled: enabled && requiresModifier && hover.isHovered,
  })
  const revealed = enabled && hover.isHovered && (!requiresModifier || commandHeld)
  const treatment = resolveInteractionTreatment(
    { ...INACTIVE, ...state, hovered: revealed },
    role,
    surface,
  )
  return { ...hover, isRevealActive: revealed, treatment }
}
