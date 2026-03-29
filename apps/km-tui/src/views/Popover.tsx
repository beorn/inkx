/**
 * Popover System — hover-to-preview for links and other content.
 *
 * Architecture:
 * - PopoverProvider at the root provides show/hide API via context
 * - PopoverOverlay renders the floating popover using absolute positioning
 * - Link components trigger popovers via onMouseEnter/onMouseLeave
 *
 * Hover intent best practices:
 * - Show delay (400ms): prevents flicker when mousing across many links
 * - Hide delay (150ms): allows moving mouse into the popover itself
 * - Warm window (200ms): moving between targets shows immediately
 * - Popover is hoverable: entering it cancels the hide timer
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { Box, Link, Spinner, Text } from "@silvery/ag-react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import type { KNode } from "@km/core"

// =============================================================================
// Types
// =============================================================================

export interface PopoverContent {
  /** Lines to display in the popover */
  lines: PopoverLine[]
  /** URL for the popover (used for clickable title + URL display) */
  href?: string
  /** Max width of the popover box (default: 60) */
  maxWidth?: number
  /** Show a loading spinner (e.g. while fetching metadata) */
  loading?: boolean
}

export interface PopoverLine {
  text: string
  dim?: boolean
  color?: string
  bold?: boolean
  /** Wrap mode: "wrap" (default) or "truncate" */
  wrap?: "wrap" | "truncate"
  /** Render as a clickable link (opens on click, no Cmd required) */
  link?: boolean
}

export interface PopoverAnchor {
  /** Terminal column (0-indexed) */
  x: number
  /** Terminal row (0-indexed) */
  y: number
}

interface PopoverState {
  content: PopoverContent
  anchor: PopoverAnchor
}

// =============================================================================
// Context
// =============================================================================

interface PopoverAPI {
  /** Request a popover to show (subject to delay) */
  show(content: PopoverContent, anchor: PopoverAnchor): void
  /** Update content of a currently visible popover. No-op if not visible. */
  update(content: PopoverContent): void
  /** Request the popover to hide (subject to delay) */
  hide(): void
  /** Cancel any pending show — used when mouse leaves before delay fires */
  cancel(): void
}

const PopoverCtx = createContext<PopoverAPI | null>(null)

/** Access the popover API from any child component */
export function usePopover(): PopoverAPI | null {
  return useContext(PopoverCtx)
}

// =============================================================================
// Timing constants
// =============================================================================

/** Delay before showing popover on hover (ms) */
const SHOW_DELAY = 400
/** Delay before hiding popover when mouse leaves (ms) */
const HIDE_DELAY = 150
/** Window after hiding where re-hover shows immediately (ms) */
const WARM_WINDOW = 200

// =============================================================================
// Provider
// =============================================================================

export function PopoverProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHideTimeRef = useRef(0)

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const api = useMemo<PopoverAPI>(
    () => ({
      show(content: PopoverContent, anchor: PopoverAnchor) {
        // Cancel any pending hide
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }

        // If warm (recently hidden), show immediately
        const sinceLastHide = Date.now() - lastHideTimeRef.current
        if (sinceLastHide < WARM_WINDOW) {
          if (showTimerRef.current) {
            clearTimeout(showTimerRef.current)
            showTimerRef.current = null
          }
          setPopover({ content, anchor })
          return
        }

        // Cancel existing show timer and start new one
        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current)
        }
        showTimerRef.current = setTimeout(() => {
          showTimerRef.current = null
          setPopover({ content, anchor })
        }, SHOW_DELAY)
      },

      update(content: PopoverContent) {
        // Only update if currently visible (not pending show/hide)
        setPopover((prev) => (prev ? { ...prev, content } : null))
      },

      hide() {
        // Cancel pending show
        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current)
          showTimerRef.current = null
        }

        // Delay hide to allow moving into popover
        if (hideTimerRef.current) return // already hiding
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null
          lastHideTimeRef.current = Date.now()
          setPopover(null)
        }, HIDE_DELAY)
      },

      cancel() {
        clearTimers()
      },
    }),
    [clearTimers],
  )

  return (
    <PopoverCtx.Provider value={api}>
      {children}
      {popover && <PopoverOverlay state={popover} onMouseEnter={clearTimers} onHide={() => api.hide()} />}
    </PopoverCtx.Provider>
  )
}

// =============================================================================
// Overlay
// =============================================================================

interface PopoverOverlayProps {
  state: PopoverState
  onMouseEnter: () => void
  onHide: () => void
}

function PopoverOverlay({ state, onMouseEnter, onHide }: PopoverOverlayProps): React.ReactElement {
  const { content, anchor } = state
  const maxWidth = content.maxWidth ?? 60

  // Position: below the anchor, offset right by 1
  // The marginTop/marginLeft use absolute positioning
  const top = anchor.y + 1
  const left = anchor.x

  return (
    <Box
      position="absolute"
      marginTop={top}
      marginLeft={left}
      maxWidth={maxWidth}
      flexDirection="column"
      borderStyle="round"
      borderColor="$border"
      backgroundColor="$surface-bg"
      paddingLeft={1}
      paddingRight={1}
      id="popover"
      data-popover="true"
      onMouseEnter={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onMouseEnter()
      }}
      onMouseLeave={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        onHide()
      }}
    >
      {content.lines.map((line, i) =>
        line.link && content.href ? (
          <Link
            key={i}
            href={content.href}
            variant="arm-on-hover"
            color={line.color}
            dimColor={line.dim}
            bold={line.bold}
            wrap={line.wrap ?? "wrap"}
          >
            {line.text}
          </Link>
        ) : (
          <Text key={i} color={line.color} dimColor={line.dim} bold={line.bold} wrap={line.wrap ?? "wrap"}>
            {line.text}
          </Text>
        ),
      )}
      {content.loading && <Spinner label="Loading" color="$muted" />}
    </Box>
  )
}

// =============================================================================
// Helpers for building popover content
// =============================================================================

/** Build popover content for an external URL (before metadata is fetched) */
export function urlPopoverContent(url: string, options?: { loading?: boolean }): PopoverContent {
  let parsed: URL
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
  } catch {
    return { lines: [{ text: url, dim: true }], href: url, loading: options?.loading }
  }

  const domain = parsed.hostname.replace(/^www\./, "")
  const path = decodeURIComponent(parsed.pathname)
  const query = parsed.search
  const fragment = parsed.hash

  const lines: PopoverLine[] = [{ text: domain, bold: true, color: "$link", link: true }]

  // Show path if non-trivial
  if (path && path !== "/") {
    const fullPath = path + (query || "") + (fragment || "")
    lines.push({ text: fullPath, dim: true })
  } else if (query || fragment) {
    lines.push({ text: (query || "") + (fragment || ""), dim: true })
  }

  return { lines, href: url, loading: options?.loading }
}

/** Build rich popover content for an external URL with fetched metadata. */
export function richUrlPopoverContent(
  url: string,
  meta: { title?: string; description?: string; siteName?: string },
): PopoverContent {
  let parsed: URL
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
  } catch {
    return { lines: [{ text: url, dim: true }], href: url }
  }

  const domain = parsed.hostname.replace(/^www\./, "")
  const lines: PopoverLine[] = []

  // Title — clickable link (opens on click, no Cmd required)
  const title = meta.title ?? meta.siteName
  if (title) {
    lines.push({ text: title, bold: true, link: true })
  }

  // Description (wraps naturally)
  if (meta.description) {
    lines.push({ text: meta.description, dim: true })
  }

  // URL — rendered as a clickable link
  const prettyUrl = domain + (parsed.pathname !== "/" ? decodeURIComponent(parsed.pathname) : "")
  lines.push({ text: prettyUrl, color: "$link", link: true, wrap: "truncate" })

  return { lines, href: url, maxWidth: 60 }
}

/** Build popover content for an internal link (wikilink/blockref) */
export function internalLinkPopoverContent(title: string, preview?: string): PopoverContent {
  const lines: PopoverLine[] = [{ text: title, bold: true }]
  if (preview) {
    lines.push({ text: preview, dim: true })
  }
  return { lines }
}

/** Build popover content for a node detail preview (Cmd+hover on card). */
export function nodeDetailPopoverContent(node: KNode, children: KNode[], backlinkCount: number): PopoverContent {
  const lines: PopoverLine[] = []

  // Title
  const title = node.content ?? "(untitled)"
  lines.push({ text: title, bold: true, wrap: "truncate" })

  // Metadata
  if (node.task_status) lines.push({ text: `Status: ${node.task_status}`, dim: true })
  if (node.due_at) lines.push({ text: `Due: ${node.due_at}`, dim: true })
  if (node.assigned_to) lines.push({ text: `Assigned: ${node.assigned_to}`, dim: true })
  if (node.priority) lines.push({ text: `Priority: P${node.priority}`, dim: true })

  // Body preview: first few body children (non-item text blocks)
  const bodyChildren = children.filter((c) => !c.item)
  const maxBodyLines = 3
  for (const child of bodyChildren.slice(0, maxBodyLines)) {
    if (child.content) {
      lines.push({ text: child.content, dim: true, wrap: "truncate" })
    }
  }
  if (bodyChildren.length > maxBodyLines) {
    lines.push({ text: `  +${bodyChildren.length - maxBodyLines} more`, dim: true })
  }

  // Structural children count
  const itemChildren = children.filter((c) => c.item)
  if (itemChildren.length > 0) {
    lines.push({ text: `${itemChildren.length} children`, dim: true })
  }

  // Backlinks
  if (backlinkCount > 0) {
    lines.push({ text: `${backlinkCount} backlinks`, dim: true })
  }

  return { lines, maxWidth: 50 }
}
