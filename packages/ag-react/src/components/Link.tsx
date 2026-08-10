/**
 * Link Component — URLs and App Actions
 *
 * Renders clickable text that reveals by becoming brighter. When `href`
 * is present, Link also paints an OSC 8 terminal hyperlink; action-only links
 * omit `href` and leave activation entirely to `onClick`.
 *
 * Reveal policy is derived from semantic role: content hyperlinks reveal on
 * Cmd+hover, while app controls reveal on plain hover. Underline is stable
 * content semantics and never appears as a hover effect.
 *
 * A revealed URL click emits `"link:open"` through the app event chain. App-owned
 * actions run their `onClick` handler without emitting a destination.
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit Example</Link>
 * <Link onClick={() => navigate()}>Action-only control</Link>
 * ```
 */

import { type ReactNode, useCallback, useContext, useState } from "react"
import {
  resolveInteractionTreatment,
  type InteractionRole,
  type InteractiveState,
} from "@silvery/ag"
import type { TextProps } from "./Text"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { Text } from "./Text"
import { useModifierKeys } from "../hooks/useModifierKeys"
import { ChainAppContext } from "../context"

// ============================================================================
// Props
// ============================================================================

interface LinkSharedProps extends Omit<TextProps, "children" | "onClick"> {
  /** Link text content */
  children?: ReactNode
  /** Semantic role. Omit to derive content-link from href, control otherwise. */
  role?: InteractionRole
  /** Foreground used while the role's reveal condition is active. */
  revealColor?: TextProps["color"]
}

/** A URL link may also intercept activation; an action-only link must handle it. */
export type LinkProps = LinkSharedProps &
  (
    | { href: string; onClick?: TextProps["onClick"] }
    | { href?: undefined; onClick: NonNullable<TextProps["onClick"]> }
  )

// ============================================================================
// Component
// ============================================================================

export function Link({
  href,
  children,
  color = "$fg-link",
  role = href === undefined ? "control" : "content-link",
  revealColor = "$fg",
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: LinkProps) {
  const chain = useContext(ChainAppContext)
  const handleClick = useCallback(
    (event: SilveryMouseEvent, revealed: boolean) => {
      const isRevealed = revealed || (role === "content-link" && event.metaKey)
      onClick?.(event)
      if (isRevealed && href !== undefined && !event.defaultPrevented) {
        chain?.events.emit("link:open", href)
        event.preventDefault()
      }
    },
    [role, href, onClick, chain],
  )

  return (
    <InteractiveText
      // Empty string is the explicit "no destination" value: it blocks
      // hyperlink inheritance while remaining falsey to OSC 8 emission.
      internal_hyperlink={href ?? ""}
      role={role}
      color={color}
      revealColor={revealColor}
      {...rest}
      onRevealedClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </InteractiveText>
  )
}

interface InteractiveTextProps extends Omit<TextProps, "children" | "onClick"> {
  children?: ReactNode
  role: InteractionRole
  revealColor: TextProps["color"]
  onRevealedClick: (event: SilveryMouseEvent, revealed: boolean) => void
}

function ModifierReveal({
  hovered,
  render,
}: {
  hovered: boolean
  render: (revealed: boolean) => React.ReactElement
}): React.ReactElement {
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  return render(hovered && cmdHeld)
}

/** Shared internal presentation for links and action-only navigation text. */
function InteractiveText({
  role,
  revealColor,
  children,
  onRevealedClick,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: InteractiveTextProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const render = (revealed: boolean): React.ReactElement => {
    const state: InteractiveState = {
      hovered: revealed,
      armed: false,
      selected: false,
      focused: false,
      dropTarget: false,
    }
    const treatment = resolveInteractionTreatment(state, role, {
      idle: { color: rest.color },
      revealed: { color: revealColor },
    })
    return (
      <Text
        {...rest}
        color={treatment.color}
        mouseCursor={treatment.mouseCursor}
        onClick={(event) => onRevealedClick(event, revealed)}
        onMouseEnter={(event) => {
          setHovered(true)
          onMouseEnter?.(event)
        }}
        onMouseLeave={(event) => {
          setHovered(false)
          onMouseLeave?.(event)
        }}
      >
        {children}
      </Text>
    )
  }
  return role === "content-link" ? (
    <ModifierReveal hovered={hovered} render={render} />
  ) : (
    render(hovered)
  )
}
