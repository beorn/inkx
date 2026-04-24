/** Hover-to-popover glue: `HoverTarget` wrapper that delay-shows a popover on mouse dwell via silvery's `usePopoverHandlers`. */
import React from "react"
import { Text, usePopoverHandlers, type PopoverContent } from "silvery"

export { usePopoverHandlers }

/**
 * HoverTarget wraps inline content in a <Text> with popover hover handlers.
 * Use for single-line segments (pills, truncated strings). For multi-line
 * content (stacked body lines), call usePopoverHandlers directly and attach
 * the handlers to a <Box>.
 *
 * The hook comes from silvery — it also returns `isHovered` for "armed" hover
 * styling, which we discard here because inline pills already style hover via
 * the row-level `onMouseEnter`/`onMouseLeave`.
 */
export function HoverTarget({ content, children }: { content: PopoverContent; children: React.ReactNode }) {
  const { onMouseEnter, onMouseLeave } = usePopoverHandlers(content)
  return (
    <Text onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {children}
    </Text>
  )
}
