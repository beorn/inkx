import React from "react"
import { type PopoverContent, type SilveryMouseEvent } from "silvery"
import { HoverPreviewTarget } from "./HoverPreviewTarget.tsx"

export interface ChatEntryDisclosureState {
  surfaceProps: {
    onMouseEnter: (e: SilveryMouseEvent) => void
    onMouseLeave: (e: SilveryMouseEvent) => void
    onClick?: (e: SilveryMouseEvent) => void
  }
  isHovered: boolean
  isActive: boolean
  isArmed: boolean
  expanded: boolean
  toggleExpanded: () => void
  collapse: () => void
}

export interface ChatEntryDisclosureProps {
  children: (state: ChatEntryDisclosureState) => React.ReactElement
  popover?: PopoverContent | null
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  interactive?: boolean
  canExpand?: boolean
}

/**
 * Transcript row disclosure.
 *
 * The row/header is one interactive surface: hover highlights it, Cmd-hover
 * shows a preview, click toggles expansion, and expanded attached content can
 * call `collapse()` to close itself. Inline `LinkedTerm` children are deeper
 * AgNodes, so Silvery's interaction ownership makes them the front-most
 * surface without parent-specific code.
 */
export function ChatEntryDisclosure({
  children,
  popover,
  defaultExpanded,
  expanded,
  onExpandedChange,
  interactive = true,
  canExpand = true,
}: ChatEntryDisclosureProps): React.ReactElement {
  return (
    <HoverPreviewTarget
      popover={interactive ? popover : null}
      defaultExpanded={defaultExpanded}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      toggleOnClick={interactive && canExpand}
      cursor={interactive && canExpand}
    >
      {(state) =>
        children({
          surfaceProps: state.props,
          isHovered: state.isHovered,
          isActive: state.isActive,
          isArmed: state.isArmed,
          expanded: state.expanded,
          toggleExpanded: state.toggleExpanded,
          collapse: () => state.setExpanded(false),
        })
      }
    </HoverPreviewTarget>
  )
}
