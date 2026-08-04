/**
 * Link Component — Armed URLs and App Actions
 *
 * Renders clickable text that arms with an underline and pointer. When `href`
 * is present, Link also paints an OSC 8 terminal hyperlink; action-only links
 * omit `href` and leave activation entirely to `onClick`.
 *
 * Two arming variants:
 * - `arm-on-cmd-hover` (default): Arms on Cmd+hover (Kitty protocol) or Ctrl+click (SGR)
 * - `arm-on-hover`: Arms on plain hover (no modifier needed)
 *
 * An armed URL click emits `"link:open"` through the app event chain. App-owned
 * actions run their `onClick` handler without emitting a destination.
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit Example</Link>
 * <Link href="https://example.com" variant="arm-on-hover">Always Clickable</Link>
 * <Link variant="arm-on-hover" onClick={() => navigate()}>Action-only link</Link>
 * ```
 */

import { type ReactNode, useCallback, useContext, useState } from "react"
import type { TextProps } from "./Text"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { Text } from "./Text"
import { useModifierKeys } from "../hooks/useModifierKeys"
import { ChainAppContext } from "../context"

// ============================================================================
// Props
// ============================================================================

export interface LinkProps extends Omit<TextProps, "children"> {
  /** Optional URL exposed as an OSC 8 hyperlink. Omit for app-owned actions. */
  href?: string
  /** Link text content */
  children?: ReactNode
  /**
   * How the link arms (shows underline + pointer cursor):
   * - `'arm-on-cmd-hover'` (default): Arms when hovered while holding Cmd/Super
   * - `'arm-on-hover'`: Arms on plain hover (no modifier needed)
   */
  variant?: "arm-on-cmd-hover" | "arm-on-hover"
}

// ============================================================================
// Component
// ============================================================================

export function Link({
  href,
  children,
  color = "$fg-link",
  variant = "arm-on-cmd-hover",
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: LinkProps) {
  const chain = useContext(ChainAppContext)
  const handleClick = useCallback(
    (event: SilveryMouseEvent, armed: boolean) => {
      const isArmed = armed || (variant === "arm-on-cmd-hover" && event.metaKey)
      onClick?.(event)
      if (isArmed && href !== undefined && !event.defaultPrevented) {
        chain?.events.emit("link:open", href)
        event.preventDefault()
      }
    },
    [variant, href, onClick, chain],
  )

  return (
    <ArmedText
      color={color}
      internal_hyperlink={href}
      variant={variant}
      {...rest}
      onArmedClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </ArmedText>
  )
}

interface ArmedTextProps extends Omit<TextProps, "children" | "onClick"> {
  children?: ReactNode
  variant: NonNullable<LinkProps["variant"]>
  onArmedClick: (event: SilveryMouseEvent, armed: boolean) => void
}

function ModifierArmedState({
  hovered,
  render,
}: {
  hovered: boolean
  render: (armed: boolean) => React.ReactElement
}): React.ReactElement {
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  return render(hovered && cmdHeld)
}

/** Shared internal presentation for links and action-only navigation text. */
function ArmedText({
  variant,
  children,
  onArmedClick,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ArmedTextProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const render = (armed: boolean): React.ReactElement => (
    <Text
      mouseCursor={armed ? "pointer" : undefined}
      {...rest}
      underline={armed ? true : rest.underline}
      onClick={(event) => onArmedClick(event, armed)}
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
  return variant === "arm-on-hover" ? (
    render(hovered)
  ) : (
    <ModifierArmedState hovered={hovered} render={render} />
  )
}
