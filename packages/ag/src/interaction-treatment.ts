import type { InteractiveState } from "./types"

/** Semantic kind of interactive element. Roles determine reveal policy. */
export type InteractionRole = "content-link" | "control" | "region"

/** Visual values supplied by a design-system surface, independent of state. */
export type InteractionVisual = Readonly<{
  color?: string
  backgroundColor?: string
  bold?: boolean
  dim?: boolean
  inverse?: boolean
}>

/** Resting and state overlays for one visual surface. */
export type InteractionSurface = Readonly<{
  idle?: InteractionVisual
  revealed?: InteractionVisual
  armed?: InteractionVisual
  selected?: InteractionVisual
  focused?: InteractionVisual
}>

export type InteractionTreatment = InteractionVisual &
  Readonly<{
    /** Content links reveal with the command modifier; controls and regions reveal directly. */
    reveal: "cmd-hover" | "hover"
    /** Regional treatments must communicate their extent with a gutter cue. */
    extent: "gutter" | undefined
    mouseCursor: "pointer" | undefined
  }>

/**
 * Resolve one interaction language over Silvery's existing node state.
 *
 * `hovered` means the role's reveal condition has been met. For a content
 * link, the component gates physical hover through the command modifier before
 * calling this resolver; controls and regions pass physical hover directly.
 * Underline is deliberately absent: it is content semantics, never a changing
 * interaction treatment.
 */
export function resolveInteractionTreatment(
  state: Readonly<InteractiveState>,
  role: InteractionRole,
  surface: InteractionSurface,
): InteractionTreatment {
  return {
    ...surface.idle,
    ...(state.hovered ? surface.revealed : undefined),
    ...(state.focused ? surface.focused : undefined),
    ...(state.selected ? surface.selected : undefined),
    ...(state.armed ? surface.armed : undefined),
    reveal: role === "content-link" ? "cmd-hover" : "hover",
    extent: role === "region" ? "gutter" : undefined,
    mouseCursor: state.hovered ? "pointer" : undefined,
  }
}
