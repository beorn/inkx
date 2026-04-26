/**
 * PaneHeader — opt-in 1-row header strip per pane (Zellij-style).
 *
 * Bead: km-silvercode.pane-headers (v2 of pane-management). v1 was
 * chrome-minimal: no border, no header strip — separation only via the
 * 1-col `│` / 1-row `─` divider plus a `▎` accent bar for the active
 * pane. This component is the v2 OPT-IN add-on: when the user passes
 * `--pane-headers` on the command line, every leaf renders this strip
 * above its SessionCard.
 *
 * Layout (1 row):
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ session-id-truncated…              ▤ + _ ×  │
 *   └─────────────────────────────────────────────┘
 *
 *   - Title: session id (`pending` until session-init), truncated to fit
 *     the available width with an ellipsis.
 *   - `⇄` (visually `▤`): drag-move handle placeholder. The actual
 *     drag-move wiring already lives in PaneGrid's LeafContainer (mouse-
 *     down on the top-left cell). The header glyph is a visual cue, not
 *     a separate drag origin — clicking it is a no-op for now.
 *   - `+`: spawn split-right (same effect as Ctrl+G v).
 *   - `_`: minimize toggle. When minimized, the pane shrinks to just
 *     the header strip (parent decides the height collapse — the header
 *     itself doesn't manage state).
 *   - `×`: close pane (same effect as Ctrl+G x).
 *
 * Buttons use silvery semantic tokens ($accent on hover/active, $muted
 * otherwise) so they pick up theme changes automatically. No raw ANSI
 * codes, no hardcoded colors — see vendor/silvery/docs/guide/styling.md.
 */

import React from "react"
import { Box, Text, useHover } from "silvery"

export type PaneHeaderProps = {
  /** Session id rendered as the title. Trimmed if it overflows. */
  sessionId: string
  /** Whether this pane is currently focused — controls the title color. */
  isFocused: boolean
  /** True when the pane is minimized. The `_` glyph swaps to `□` so the
   * user can tell which state the pane is in at a glance. */
  isMinimized: boolean
  onSplitRight: () => void
  onClose: () => void
  onToggleMinimize: () => void
  /** Drag-move placeholder. The real drag is in PaneGrid's LeafContainer
   * grab handle; this exists so future drag-from-header is one wire-up
   * away. v1: no-op. */
  onDragMove?: () => void
}

export function PaneHeader({
  sessionId,
  isFocused,
  isMinimized,
  onSplitRight,
  onClose,
  onToggleMinimize,
  onDragMove,
}: PaneHeaderProps): React.ReactElement {
  // Header bg uses the subtle surface token so it reads as a chrome
  // strip distinct from the message body, but stays soft enough not to
  // dominate when the pane is unfocused.
  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      height={1}
      backgroundColor={isFocused ? "$bg-surface" : "$bg-surface-subtle"}
      paddingX={1}
    >
      {/* Title — flexGrow=1 so it eats the slack and the buttons stay
          flush right. minWidth=0 lets the Text truncate instead of
          pushing the buttons off-screen on narrow panes. */}
      <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="row">
        <Text color={isFocused ? "$primary" : "$muted"} wrap="truncate">
          {sessionId}
        </Text>
      </Box>
      {/* Buttons — fixed right edge, 1 cell apart. Order matches Zellij /
          tmux pane chrome muscle memory: drag-handle, add, minimize,
          close. */}
      <HeaderButton glyph="⇄" label="drag" onClick={onDragMove} />
      <HeaderButton glyph="+" label="split-right" onClick={onSplitRight} />
      <HeaderButton glyph={isMinimized ? "□" : "_"} label="minimize" onClick={onToggleMinimize} />
      <HeaderButton glyph="×" label="close" onClick={onClose} />
    </Box>
  )
}

/**
 * One clickable header glyph. Hover lifts it to $accent so the user
 * sees the affordance — without hover it stays $muted to keep the strip
 * visually quiet. The 1-cell gap between buttons (paddingLeft=1) gives
 * mouse hit-testing some slack on narrow displays.
 */
function HeaderButton({
  glyph,
  onClick,
}: {
  glyph: string
  /** Currently unused — kept on the prop type so future a11y wiring can
   * thread an aria-label / debug-print without changing call sites. */
  label: string
  onClick?: () => void
}): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  return (
    <Box flexShrink={0} paddingLeft={1} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <Text color={isHovered ? "$accent" : "$muted"}>{glyph}</Text>
    </Box>
  )
}
