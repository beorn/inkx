/**
 * Link interaction — shared hover/popover/styling for all inline link kinds.
 *
 * Every inline link component (InlineLink, InlineBareURL, InlineWikiLink,
 * InlineBlockRef) shares the same interaction model:
 *   - hovered state (tracked via ref for async guards)
 *   - popover on enter, hide on leave
 *   - visual signal that degrades gracefully without a popover
 *
 * Kinds diverge in popover content (URL metadata fetch vs internal title)
 * and style (color, bg pill, underline). `useLinkInteraction` handles the
 * shared bits; `linkTextProps` returns kind-specific styling.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import {
  usePopover,
  urlPopoverContent,
  richUrlPopoverContent,
  internalLinkPopoverContent,
  type PopoverContent,
} from "../views/Popover.tsx"
import { getCachedMetadata, fetchUrlMetadata } from "./url-metadata.ts"

export type LinkKind = "url" | "wikilink" | "blockref"

export interface UseLinkInteractionOpts {
  kind: LinkKind
  /** For kind === "url": the URL to fetch metadata for on hover. */
  url?: string
  /**
   * For kind === "wikilink" | "blockref":
   * optional rich popover content. If absent, falls back to internalTitle.
   */
  internalPopover?: PopoverContent | null
  /** Fallback title when internalPopover is absent. */
  internalTitle?: string
}

export interface LinkInteractionHandlers {
  hovered: boolean
  onMouseEnter: (e: SilveryMouseEvent) => void
  onMouseLeave: () => void
}

export function useLinkInteraction(opts: UseLinkInteractionOpts): LinkInteractionHandlers {
  const popover = usePopover()
  const hoveredRef = useRef(false)
  const [hovered, setHovered] = useState(false)

  useEffect(
    () => () => {
      hoveredRef.current = false
    },
    [],
  )

  const { kind, url, internalPopover, internalTitle } = opts

  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      hoveredRef.current = true
      setHovered(true)
      if (!popover) return
      const anchor = { x: e.clientX, y: e.clientY }
      if (kind === "url" && url) {
        const cached = getCachedMetadata(url)
        if (cached) {
          popover.show(richUrlPopoverContent(url, cached), anchor)
          return
        }
        popover.show(urlPopoverContent(url, { loading: true }), anchor)
        void fetchUrlMetadata(url).then((meta) => {
          if (!hoveredRef.current) return
          popover.update(meta ? richUrlPopoverContent(url, meta) : urlPopoverContent(url))
        })
        return
      }
      const content = internalPopover ?? internalLinkPopoverContent(internalTitle ?? "")
      popover.show(content, anchor)
    },
    [popover, kind, url, internalPopover, internalTitle],
  )

  const onMouseLeave = useCallback(() => {
    hoveredRef.current = false
    setHovered(false)
    popover?.hide()
  }, [popover])

  return { hovered, onMouseEnter, onMouseLeave }
}

export interface LinkTextProps {
  color?: string
  backgroundColor?: string
  bold?: boolean
  underlineStyle?: "single" | "dotted" | "dashed" | false
  underlineColor?: string
}

/**
 * Kind-specific styling props for a link at rest or on hover.
 * Respects colorOverride (undefined → normal, string → override, null → strip).
 */
export function linkTextProps(
  kind: LinkKind,
  hovered: boolean,
  colorOverride: string | null | undefined,
): LinkTextProps {
  const honorOverride = colorOverride !== undefined
  switch (kind) {
    case "url":
      return {
        color: honorOverride ? (colorOverride ?? undefined) : "$link",
        underlineStyle: hovered ? "single" : "dotted",
        underlineColor: hovered ? "$link" : "$border",
      }
    case "wikilink": {
      // Hover replaces the underline with a subtle pill bg, except when
      // colorOverride is active (pill clashes with colored card bgs).
      const pillBg = hovered && colorOverride === undefined ? "#404050" : undefined
      return {
        color: hovered
          ? honorOverride
            ? (colorOverride ?? undefined)
            : "$link"
          : honorOverride
            ? (colorOverride ?? undefined)
            : undefined,
        backgroundColor: pillBg,
        underlineStyle: hovered ? false : "dotted",
        underlineColor: "$border",
      }
    }
    case "blockref":
      return {
        bold: true,
        color: honorOverride ? (colorOverride ?? undefined) : undefined,
        underlineStyle: hovered ? "single" : "dotted",
        underlineColor: hovered ? "$link" : "$border",
      }
  }
}
