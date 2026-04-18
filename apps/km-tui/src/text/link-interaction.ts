/**
 * Link interaction — shared hover/popover/styling for all inline link kinds.
 *
 * Every inline link component (InlineLink, InlineBareURL, InlineWikiLink)
 * shares the same interaction model:
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

export type LinkKind = "url" | "wiki" | "sigil"

export interface UseLinkInteractionOpts {
  kind: LinkKind
  /** For kind === "url": the URL to fetch metadata for on hover. */
  url?: string
  /** For kind === "wiki" or "sigil": optional rich popover content; else falls back to internalTitle. */
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
      // Wikilink + sigil share the internal-link popover path: rich content
      // from buildLinkPopover if provided, title fallback otherwise.
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
 * Respects colorOverride:
 *   undefined → normal (link uses its own $link color)
 *   string    → override (link paints in that color)
 *   null      → inherit (link uses nearest colored ancestor via silvery cascade)
 *
 * The null→"inherit" mapping (previously null→strip) leans on silvery's
 * color="inherit" cascade primitive: when a cursor row wraps the link in
 * $cursor fg, the link naturally adopts $cursor without an explicit string
 * override. See bead km-silvery.color-inherit.
 */
export function linkTextProps(
  kind: LinkKind,
  hovered: boolean,
  colorOverride: string | null | undefined,
): LinkTextProps {
  const overrideColor = colorOverride === null ? "inherit" : colorOverride
  const honorOverride = colorOverride !== undefined
  switch (kind) {
    case "url":
      return {
        color: honorOverride ? overrideColor : "$link",
        underlineStyle: hovered ? "single" : "dotted",
        underlineColor: hovered ? "$link" : "$border",
      }
    case "wiki": {
      // Wikilinks are colored like URLs at rest so they're visibly
      // distinguishable from plain text; on hover a subtle pill bg replaces
      // the dotted underline. colorOverride (e.g. cursor inverse) always wins.
      const pillBg = hovered && colorOverride === undefined ? "#404050" : undefined
      return {
        color: honorOverride ? overrideColor : "$link",
        backgroundColor: pillBg,
        underlineStyle: hovered ? false : "dotted",
        underlineColor: "$link",
      }
    }
    case "sigil": {
      // Sigil-links (@mentions, #tags, +projects that resolve to a vault
      // node) share wikilink interaction but keep their own fg color — the
      // sigil color (from sigilColors map / resolveSigilColor) is the visual
      // anchor, and we add a dotted underline to signal navigability.
      // Color is supplied by the caller via SigilText.
      return {
        color: undefined, // caller wraps with its own sigil color
        underlineStyle: hovered ? "single" : "dotted",
        underlineColor: hovered ? "$link" : "$border",
      }
    }
  }
}
