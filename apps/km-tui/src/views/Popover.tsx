/**
 * Popover System — hover-to-preview for links and node details.
 *
 * Architecture (Tippy.js singleton + Floating UI patterns):
 * - Signal store holds popover state (content, anchor, timers)
 * - PopoverProvider creates the store and renders a persistent overlay
 * - PopoverOverlay subscribes to store — swaps content in place (no remount)
 * - Show delay (400ms) for cold start, instant swap when already visible
 * - Hide delay (300ms) grace period to move into popover
 * - Warm window (200ms) for instant re-show after recent hide
 * - Lazy render callback: expensive React trees only built when popover is visible
 *
 * Uses alien-signals via createSignalStore (Zustand API-compatible).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { createSignalStore, useSignalStore } from "../state/signal-store.ts"
import { Box, Link, Spinner, Text } from "@silvery/ag-react"
import { useApp as useAppStore } from "@silvery/create"
import type { SilveryMouseEvent, SilveryWheelEvent } from "@silvery/ag-term/mouse-events"
import type { BoardAppStore } from "../state/board-app-store.ts"

// =============================================================================
// Types
// =============================================================================

export interface PopoverContent {
  /** Lines to display (text-only mode for URL popovers) */
  lines: PopoverLine[]
  /** Lazy React content (rich mode — called only when popover is visible) */
  render?: () => React.ReactNode
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
  wrap?: "wrap" | "truncate"
  link?: boolean
}

export interface PopoverAnchor {
  x: number
  y: number
  /** Bounding box of the trigger element (e.g., a card). When provided,
   *  the popover overlaps the card using corner-aligned cascade positioning. */
  cardRect?: { x: number; y: number; width: number; height: number }
}

// =============================================================================
// Timing constants (aligned with Floating UI / Tippy.js)
// =============================================================================

/** Delay before showing popover on hover (cold start) */
const SHOW_DELAY = 400
/** Delay before swapping popover content when already visible (coalesce rapid mouse movement) */
const SWAP_DELAY = 100
/** Delay before hiding popover when mouse leaves (grace period) */
const HIDE_DELAY = 300
/** Window after hiding where re-hover shows immediately */
const WARM_WINDOW = 200

// =============================================================================
// Corner cascade positioning (overlap mode)
// =============================================================================

interface ViewportDims {
  cols: number
  rows: number
}

/**
 * Compute popover position using corner-aligned overlap positioning.
 *
 * The popover overlaps the card — its corner aligns with the card's corner,
 * covering it with expanded content. Tries each corner in order:
 *   1. Top-left aligned (preferred) — popover's top-left = card's top-left
 *   2. Top-right aligned — popover's top-right = card's top-right
 *   3. Bottom-left aligned — popover's bottom-left = card's bottom-left
 *   4. Bottom-right aligned — popover's bottom-right = card's bottom-right
 *
 * Falls back to the first (top-left) if none fit perfectly.
 */
export function computeOverlapPosition(
  cardRect: { x: number; y: number; width: number; height: number },
  popoverWidth: number,
  popoverHeight: number,
  viewport: ViewportDims,
): { top: number; left: number } {
  // 1. Top-left aligned: popover's top-left = card's top-left
  const tlTop = cardRect.y
  const tlLeft = cardRect.x
  if (tlTop >= 0 && tlLeft >= 0 && tlTop + popoverHeight <= viewport.rows && tlLeft + popoverWidth <= viewport.cols) {
    return { top: tlTop, left: tlLeft }
  }

  // 2. Top-right aligned: popover's top-right = card's top-right
  const trTop = cardRect.y
  const trLeft = cardRect.x + cardRect.width - popoverWidth
  if (trTop >= 0 && trLeft >= 0 && trTop + popoverHeight <= viewport.rows && trLeft + popoverWidth <= viewport.cols) {
    return { top: trTop, left: trLeft }
  }

  // 3. Bottom-left aligned: popover's bottom-left = card's bottom-left
  const blTop = cardRect.y + cardRect.height - popoverHeight
  const blLeft = cardRect.x
  if (blTop >= 0 && blLeft >= 0 && blTop + popoverHeight <= viewport.rows && blLeft + popoverWidth <= viewport.cols) {
    return { top: blTop, left: blLeft }
  }

  // 4. Bottom-right aligned: popover's bottom-right = card's bottom-right
  const brTop = cardRect.y + cardRect.height - popoverHeight
  const brLeft = cardRect.x + cardRect.width - popoverWidth
  if (brTop >= 0 && brLeft >= 0 && brTop + popoverHeight <= viewport.rows && brLeft + popoverWidth <= viewport.cols) {
    return { top: brTop, left: brLeft }
  }

  // Fallback: top-left aligned, clamped to viewport
  return {
    top: Math.max(0, Math.min(tlTop, viewport.rows - popoverHeight)),
    left: Math.max(0, Math.min(tlLeft, viewport.cols - popoverWidth)),
  }
}

/**
 * Compute popover position for point-based anchors (inline links, URL hovers).
 * Places the popover below the anchor point, clamped to viewport.
 */
export function computePointPosition(
  anchor: PopoverAnchor,
  popoverWidth: number,
  popoverHeight: number,
  viewport: ViewportDims,
): { top: number; left: number } {
  const top = Math.min(anchor.y + 1, Math.max(0, viewport.rows - popoverHeight))
  const left = Math.min(anchor.x, Math.max(0, viewport.cols - popoverWidth))
  return { top, left }
}

// =============================================================================
// Signal store
// =============================================================================

interface PopoverStoreState {
  content: PopoverContent | null
  anchor: PopoverAnchor | null
  /** True when mouse is inside the popover box */
  popoverHovered: boolean
  show(content: PopoverContent, anchor: PopoverAnchor): void
  update(content: PopoverContent): void
  hide(): void
  cancel(): void
  /** Cancel hide timer — used when mouse enters the popover itself */
  cancelHide(): void
}

type PopoverStore = ReturnType<typeof createPopoverStore>

function createPopoverStore() {
  // Timers live outside the reactive state — they don't trigger renders
  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let lastHideTime = 0

  function clearShow() {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
  }
  function clearHide() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  return createSignalStore<PopoverStoreState>((set, get) => ({
    content: null,
    anchor: null,
    popoverHovered: false,

    show(content, anchor) {
      clearHide()

      // Mouse is inside the popover and this is a link-hover (lines, no render callback):
      // suppress to prevent links inside the popover from replacing the node detail.
      // Card hovers (with render callback) are always allowed through.
      if (get().popoverHovered && !content.render) return

      // Already visible → debounced swap to coalesce rapid mouse movement.
      // Without this, moving the mouse across cards with Cmd held causes each
      // card's popover to render sequentially, "chasing" the cursor.
      if (get().content !== null) {
        clearShow()
        showTimer = setTimeout(() => {
          showTimer = null
          set({ content, anchor, popoverHovered: false })
        }, SWAP_DELAY)
        return
      }

      // Warm window → instant show
      if (Date.now() - lastHideTime < WARM_WINDOW) {
        clearShow()
        set({ content, anchor })
        return
      }

      // Cold start → delayed show
      clearShow()
      showTimer = setTimeout(() => {
        showTimer = null
        set({ content, anchor })
      }, SHOW_DELAY)
    },

    update(content) {
      if (get().content) set({ content })
    },

    hide() {
      clearShow()
      if (hideTimer) return // already hiding
      hideTimer = setTimeout(() => {
        hideTimer = null
        // Re-check: if mouse entered popover during the delay, don't hide
        if (get().popoverHovered) return
        lastHideTime = Date.now()
        set({ content: null, anchor: null, popoverHovered: false })
      }, HIDE_DELAY)
    },

    cancel() {
      clearShow()
      clearHide()
    },

    cancelHide() {
      clearHide()
    },
  }))
}

// =============================================================================
// Context + hooks
// =============================================================================

const PopoverCtx = createContext<PopoverStore | null>(null)

/** Access the popover store from any child component */
export function usePopover(): PopoverStoreState | null {
  const store = useContext(PopoverCtx)
  // Return the store's getState() so callers get stable action refs
  return store ? store.getState() : null
}

// =============================================================================
// Provider
// =============================================================================

export function PopoverProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const store = useMemo(() => createPopoverStore(), [])
  // Cancel all pending timers on unmount to prevent stale callbacks
  useEffect(
    () => () => {
      store.getState().cancel()
    },
    [store],
  )

  return (
    <PopoverCtx.Provider value={store}>
      {children}
      <PopoverOverlay store={store} />
    </PopoverCtx.Provider>
  )
}

// =============================================================================
// Overlay (persistent mount — subscribes to store, swaps content in place)
// =============================================================================

const PopoverOverlay = React.memo(function PopoverOverlay({ store }: { store: PopoverStore }) {
  const content = useSignalStore(store, (s) => s.content)
  const anchor = useSignalStore(store, (s) => s.anchor)
  const [scrollOffset, setScrollOffset] = useState(0)

  // Reset scroll when content changes
  useEffect(() => {
    setScrollOffset(0)
  }, [content])

  const onWheel = useCallback((e: SilveryWheelEvent) => {
    e.stopPropagation()
    e.preventDefault()
    // Clamp at 0 — silvery's scroll container handles the upper bound
    setScrollOffset((prev) => Math.max(0, prev + (e.deltaY > 0 ? 1 : -1)))
  }, [])

  // Viewport dimensions for position clamping and corner cascade
  const dims = useAppStore<BoardAppStore, { columns: number; rows: number }>((s) => s.ui.dimensions)

  if (!content || !anchor) return null

  const maxWidth = content.maxWidth ?? 60
  const maxHeight = 30
  const viewport = { cols: dims.columns, rows: dims.rows }

  // Corner-aligned overlap positioning when a card bounding box is provided;
  // otherwise fall back to point-based positioning below the anchor.
  const { top, left } = anchor.cardRect
    ? computeOverlapPosition(anchor.cardRect, maxWidth, maxHeight, viewport)
    : computePointPosition(anchor, maxWidth, maxHeight, viewport)

  const { cancelHide, hide } = store.getState()

  return (
    <Box
      position="absolute"
      marginTop={top}
      marginLeft={left}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      flexDirection="column"
      borderStyle="round"
      borderColor="$border"
      backgroundColor="$popover-bg"
      paddingX={1}
      overflow="scroll"
      scrollOffset={scrollOffset}
      userSelect="contain"
      id="popover"
      data-popover="true"
      onMouseEnter={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        store.setState({ popoverHovered: true })
        cancelHide()
      }}
      onMouseLeave={(e: SilveryMouseEvent) => {
        e.stopPropagation()
        store.setState({ popoverHovered: false })
        hide()
      }}
      onClick={(e: SilveryMouseEvent) => e.stopPropagation()}
      onWheel={onWheel}
    >
      {content.render
        ? content.render()
        : content.lines.map((line, i) =>
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
})

// =============================================================================
// Content builders (for URL popovers — text-only mode)
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

  const title = meta.title ?? meta.siteName
  if (title) lines.push({ text: title, bold: true, link: true })
  if (meta.description) lines.push({ text: meta.description, dim: true })

  const prettyUrl = domain + (parsed.pathname !== "/" ? decodeURIComponent(parsed.pathname) : "")
  lines.push({ text: prettyUrl, color: "$link", link: true, wrap: "truncate" })

  return { lines, href: url, maxWidth: 60 }
}

/** Build popover content for an internal link (wikilink/blockref) */
export function internalLinkPopoverContent(title: string, preview?: string): PopoverContent {
  const lines: PopoverLine[] = [{ text: title, bold: true }]
  if (preview) lines.push({ text: preview, dim: true })
  return { lines }
}
