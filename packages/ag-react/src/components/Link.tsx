/**
 * Link Component — OSC 8 Terminal Hyperlinks
 *
 * Renders clickable hyperlinks using the OSC 8 terminal escape sequence.
 * Text inside `<Link>` is underlined by default and wrapped in OSC 8 sequences,
 * making it clickable in supporting terminals (iTerm2, Ghostty, Kitty, etc.).
 *
 * Two arming variants:
 * - `arm-on-cmd-hover` (default): Arms on Cmd+hover (Kitty protocol) or Ctrl+click (SGR)
 * - `arm-on-hover`: Arms on plain hover (no modifier needed)
 *
 * On click (when armed), emits a `"link:open"` event via RuntimeContext. The app
 * handles the actual URL opening (keeps silvery runtime-agnostic).
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

// ============================================================================
// Component
// ============================================================================

/**
 * Renders a terminal hyperlink using OSC 8 escape sequences.
 *
 * The text is wrapped in OSC 8 open/close sequences so supporting terminals
 * render it as a clickable link. The component also registers an onClick
 * handler for mouse-driven interaction within silvery.
 *
 * Supports Cmd+hover armed state: when hovered and Cmd is held, shows underline.
 * Only the hovered link subscribes to modifier keys — zero cost for others.
 */
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

  // Give app routing first refusal. If it does not prevent the default, an
  // armed click emits link:open. For arm-on-cmd-hover, e.metaKey is accurate
  // thanks to keyboard modifier tracking merged into mouse events by silvery's runtime.
  const handleClick = useCallback(
    (e: SilveryMouseEvent, armed: boolean) => {
      const isArmed = armed || (variant === "arm-on-cmd-hover" && e.metaKey)
      onClick?.(e)
      if (isArmed && href !== undefined && !e.defaultPrevented) {
        chain?.events.emit("link:open", href)
        e.preventDefault()
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
