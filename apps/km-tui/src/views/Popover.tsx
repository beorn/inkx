/**
 * Popover System — hover-to-preview for links and node details.
 *
 * Architecture (Tippy.js singleton + Floating UI patterns):
 * - Zustand store holds popover state (content, anchor, timers)
 * - PopoverProvider creates the store and renders a persistent overlay
 * - PopoverOverlay subscribes to store — swaps content in place (no remount)
 * - Show delay (400ms) for cold start, instant swap when already visible
 * - Hide delay (150ms) grace period to move into popover
 * - Warm window (200ms) for instant re-show after recent hide
 * - Lazy render callback: expensive React trees only built when popover is visible
 *
 * Era2b migration path: Zustand store → createModel() with signal() accessors.
 */

import React, { createContext, useContext, useMemo } from "react"
import { createStore, useStore } from "zustand"
import { Box, Link, Spinner, Text } from "@silvery/ag-react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"

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
// Zustand store
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

  return createStore<PopoverStoreState>((set, get) => ({
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
  const content = useStore(store, (s) => s.content)
  const anchor = useStore(store, (s) => s.anchor)

  if (!content || !anchor) return null

  const maxWidth = content.maxWidth ?? 60
  const top = anchor.y + 1
  const left = anchor.x
  const { cancelHide, hide } = store.getState()

  return (
    <Box
      position="absolute"
      marginTop={top}
      marginLeft={left}
      maxWidth={maxWidth}
      maxHeight={30}
      flexDirection="column"
      borderStyle="round"
      borderColor="$border"
      backgroundColor="$popover-bg"
      paddingX={1}
      overflow="hidden"
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
      onClick={(e: SilveryMouseEvent) => {
        // Stop clicks inside the popover from selecting cards behind it.
        // Wikilink navigation (Cmd-click) is handled by the Link/Text id prop
        // via the board's click handler — but only if the click reaches it.
        // For now, just prevent passthrough.
        e.stopPropagation()
      }}
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
