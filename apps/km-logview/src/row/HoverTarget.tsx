/** Hover-to-popover glue: `usePopoverHandlers` hook + `HoverTarget` wrapper that delay-shows a popover on mouse dwell and hides it on leave. */
import React, { useCallback, useRef } from "react"
import { Text } from "silvery"
import type { SilveryMouseEvent } from "silvery/term"
import { usePopover, type PopoverContent } from "../Popover.tsx"

/** Hover dwell before showing a popover — short enough to feel responsive,
 * long enough that casual cursor transits don't flash a popover. */
export const HOVER_SHOW_DELAY_MS = 500

/**
 * Hook: returns { onMouseEnter, onMouseLeave } handlers that show a popover
 * after HOVER_SHOW_DELAY_MS of dwell and hide on leave. Consumers spread
 * the handlers onto whichever host element they render (Text or Box) —
 * this avoids the Box-inside-Text nesting restriction.
 *
 * Dwell semantics: enter starts the timer; leave cancels any pending show
 * AND hides an already-visible popover via the provider's grace window.
 */
export function usePopoverHandlers(content: PopoverContent) {
  const popover = usePopover()
  const pendingShowRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPending = useCallback(() => {
    if (pendingShowRef.current) {
      clearTimeout(pendingShowRef.current)
      pendingShowRef.current = null
    }
  }, [])

  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      if (!popover) return
      // Capture the anchor eagerly — `e` is pooled and may be invalidated
      // by the time the timer fires.
      const anchor = { x: e.clientX, y: e.clientY }
      clearPending()
      pendingShowRef.current = setTimeout(() => {
        pendingShowRef.current = null
        popover.show(content, anchor)
      }, HOVER_SHOW_DELAY_MS)
    },
    [popover, content, clearPending],
  )
  const onMouseLeave = useCallback(
    (e: SilveryMouseEvent) => {
      if (!popover) return
      e.stopPropagation()
      clearPending()
      popover.hide()
    },
    [popover, clearPending],
  )
  return { onMouseEnter, onMouseLeave }
}

/**
 * HoverTarget wraps inline content in a <Text> with popover hover handlers.
 * Use for single-line segments (pills, truncated strings). For multi-line
 * content (stacked body lines), call usePopoverHandlers directly and attach
 * the handlers to a <Box>.
 */
export function HoverTarget({ content, children }: { content: PopoverContent; children: React.ReactNode }) {
  const handlers = usePopoverHandlers(content)
  return <Text {...handlers}>{children}</Text>
}
