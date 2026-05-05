import React from "react"
import {
  Link,
  Text,
  type PopoverContent,
  type SilveryMouseEvent,
} from "silvery"
import { HoverPreviewTarget } from "./HoverPreviewTarget.tsx"

export interface LinkedTermProps {
  href?: string
  children: React.ReactNode
  color: string
  backgroundColor?: string
  popoverBody: React.ReactNode
}

/**
 * Inline linked term: file path, node name, URL, or data token.
 *
 * Cmd-hover shows a preview. Cmd-click opens when `href` is present; otherwise
 * it pins the preview. As a nested AgNode it becomes the active interaction
 * surface over any surrounding chat-row disclosure.
 */
export function LinkedTerm({
  href,
  children,
  color,
  backgroundColor,
  popoverBody,
}: LinkedTermProps): React.ReactElement {
  const content = React.useMemo<PopoverContent>(() => ({ body: popoverBody }), [popoverBody])

  return (
    <HoverPreviewTarget popover={content}>
      {({ props, isArmed }) => {
        const onClick = (e: SilveryMouseEvent): void => {
          props.onClick?.(e)
          if (!isArmed && !e.metaKey) return
          e.preventDefault()
          e.stopPropagation()
        }
        const common = {
          color,
          backgroundColor,
          underline: isArmed ? true : undefined,
          onClick,
          onMouseEnter: props.onMouseEnter,
          onMouseLeave: props.onMouseLeave,
        }
        return href ? (
          <Link href={href} {...common}>
            {children}
          </Link>
        ) : (
          <Text {...common}>{children}</Text>
        )
      }}
    </HoverPreviewTarget>
  )
}
