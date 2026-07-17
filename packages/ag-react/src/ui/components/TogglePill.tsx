/**
 * TogglePill Component
 *
 * A compact, clickable toggle rendered as an inline pill — the general-purpose
 * form of ag code's bottom-bar mode toggles (focus / fast). Pills sit VERY dim
 * when idle, brighten when their group is hovered, and reach their active colour
 * (plus a hover background) under the pointer. Clicking toggles. Group hover is
 * tracked by `TogglePillGroup` and shared through context, so hovering anywhere
 * in the group lifts every pill together — and, because a pill always renders
 * its label (only the colour changes), the row never reflows on hover.
 *
 * Usage:
 * ```tsx
 * <TogglePillGroup label="FILTER">
 *   <TogglePill label="[p]ending" active={pending} onToggle={togglePending} />
 *   <TogglePill label="[r]unning" active={running} onToggle={toggleRunning} />
 * </TogglePillGroup>
 * ```
 */
import React, { createContext, useContext } from "react"
import { useHover } from "../../hooks/useHover"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Group-hover context
// =============================================================================

/** True when the enclosing TogglePillGroup is hovered. */
const TogglePillGroupContext = createContext<boolean>(false)

// =============================================================================
// Colour ladder
// =============================================================================

/** The idle "very dim" tone for an inactive pill / the group label. */
const PILL_IDLE_COLOR = "$border-default"
/** The idle tone for an ACTIVE pill — dim but still readable. */
const PILL_ACTIVE_IDLE_COLOR = "$fg-muted"

/**
 * Three-state colour ladder (idle → group-hover → item-hover), mirroring ag
 * code's `bottomBarToggleColor`. An idle inactive pill sits at the extra-muted
 * border tone; an idle active pill stays readable at `$fg-muted`; hovering the
 * group lifts active pills into `activeColor`, and the pill under the pointer
 * reaches `activeHoverColor`. Inactive pills only ever brighten to `$fg-muted`,
 * so "on" always reads brighter than "off".
 */
export function togglePillColor({
  active,
  groupHovered,
  itemHovered,
  activeColor,
  activeHoverColor,
}: {
  active: boolean
  groupHovered: boolean
  itemHovered: boolean
  activeColor: string
  activeHoverColor: string
}): string {
  if (!groupHovered) return active ? PILL_ACTIVE_IDLE_COLOR : PILL_IDLE_COLOR
  if (active) return itemHovered ? activeHoverColor : activeColor
  return itemHovered ? PILL_ACTIVE_IDLE_COLOR : PILL_IDLE_COLOR
}

// =============================================================================
// TogglePill
// =============================================================================

export interface TogglePillProps extends Omit<BoxProps, "children" | "onClick"> {
  /** Pill text (e.g. `"[p]ending"`). Always rendered, so the row never reflows. */
  label: string
  /** Whether the pill is toggled on. */
  active: boolean
  /** Called when the pill is clicked. */
  onToggle: () => void
  /** Colour when active and the group is hovered. Default `$fg`. */
  activeColor?: string
  /** Brighter colour when active and the pill itself is hovered. Default `$fg-accent`. */
  activeHoverColor?: string
}

/**
 * A single clickable toggle pill. Reads group-hover state from the nearest
 * `TogglePillGroup`; used standalone it is simply never group-hovered.
 */
export function TogglePill({
  label,
  active,
  onToggle,
  activeColor = "$fg",
  activeHoverColor = "$fg-accent",
  ...rest
}: TogglePillProps): React.ReactElement {
  const hover = useHover()
  const groupHovered = useContext(TogglePillGroupContext)
  const color = togglePillColor({
    active,
    groupHovered,
    itemHovered: hover.isHovered,
    activeColor,
    activeHoverColor,
  })
  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      minWidth={0}
      onClick={onToggle}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
      backgroundColor={hover.isHovered ? "$bg-surface-hover" : undefined}
      {...rest}
    >
      <Text color={color}>{label}</Text>
    </Box>
  )
}

// =============================================================================
// TogglePillGroup
// =============================================================================

export interface TogglePillGroupProps extends Omit<BoxProps, "children"> {
  /** Optional leading label, rendered at the same dim idle tone as the pills. */
  label?: string
  /** The `TogglePill`s. */
  children: React.ReactNode
  /** Gap between the label and pills. Default 1. */
  gap?: number
}

/**
 * Row wrapper that tracks group hover and shares it with its `TogglePill`
 * children through context, so the whole cluster lifts out of its dim idle
 * state together. Renders an optional leading label at the pill idle tone.
 */
export function TogglePillGroup({
  label,
  children,
  gap = 1,
  ...rest
}: TogglePillGroupProps): React.ReactElement {
  const hover = useHover()
  return (
    <TogglePillGroupContext.Provider value={hover.isHovered}>
      <Box
        flexDirection="row"
        flexShrink={0}
        minWidth={0}
        gap={gap}
        onMouseEnter={hover.onMouseEnter}
        onMouseLeave={hover.onMouseLeave}
        {...rest}
      >
        {label !== undefined && (
          <Text color={hover.isHovered ? PILL_ACTIVE_IDLE_COLOR : PILL_IDLE_COLOR}>{label}</Text>
        )}
        {children}
      </Box>
    </TogglePillGroupContext.Provider>
  )
}
