/**
 * Local helper for nested Cmd-hover previews.
 *
 * Public app vocabulary should stay at the call sites:
 * - EntryDisclosure: row/header click toggles an attached body.
 * - LinkedTerm: inline file/node/path term with preview/open behavior.
 *
 * This helper only prevents nested targets from fighting over hover previews:
 * the deepest hovered target owns the preview and armed state.
 */

import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react"
import { createScope } from "@silvery/scope"
import {
  HOVER_SHOW_DELAY_MS,
  type ModifierState,
  type PopoverAnchor,
  type PopoverContent,
  type SilveryMouseEvent,
  useModifierKeys,
  useMouseCursor,
  usePopover,
  useSelection,
} from "silvery"

type PopoverTrigger = "cmd-hover" | "hover"
type RequiredModifiers = Partial<Record<keyof ModifierState, boolean>>

export interface HoverPreviewTargetRenderProps {
  props: {
    onMouseEnter: (e: SilveryMouseEvent) => void
    onMouseLeave: (e: SilveryMouseEvent) => void
    onClick?: (e: SilveryMouseEvent) => void
  }
  isHovered: boolean
  isActive: boolean
  isArmed: boolean
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  toggleExpanded: () => void
}

export interface HoverPreviewTargetProps {
  children: (state: HoverPreviewTargetRenderProps) => React.ReactElement
  popover?: PopoverContent | null
  trigger?: PopoverTrigger
  modifiers?: RequiredModifiers
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onClick?: (e: SilveryMouseEvent) => void
  toggleOnClick?: boolean
  cursor?: boolean
}

interface ActiveTarget {
  id: string
  depth: number
}

interface HoverPreviewCtxValue {
  depth: number
  active: ActiveTarget | null
  setActive: React.Dispatch<React.SetStateAction<ActiveTarget | null>>
  clearActive(id: string): void
}

const HoverPreviewCtx = createContext<HoverPreviewCtxValue | null>(null)

function modifierMatches(mods: ModifierState, required: RequiredModifiers | undefined): boolean {
  if (!required) return true
  for (const [key, expected] of Object.entries(required) as Array<[keyof ModifierState, boolean]>) {
    if (mods[key] !== expected) return false
  }
  return true
}

function armedBy(trigger: PopoverTrigger, modifiers: RequiredModifiers | undefined, mods: ModifierState): boolean {
  if (trigger === "cmd-hover" && !mods.super) return false
  return modifierMatches(mods, modifiers)
}

export function HoverPreviewTarget({
  children,
  popover: popoverContent,
  trigger = "cmd-hover",
  modifiers,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onClick,
  toggleOnClick,
  cursor = true,
}: HoverPreviewTargetProps): React.ReactElement {
  const parent = useContext(HoverPreviewCtx)
  const id = useId()
  const depth = (parent?.depth ?? 0) + 1
  const [localActive, setLocalActive] = useState<ActiveTarget | null>(null)
  const active = parent?.active ?? localActive
  const setActive = parent?.setActive ?? setLocalActive
  const clearLocalActive = useCallback((clearId: string) => {
    setLocalActive((prev) => (prev?.id === clearId ? null : prev))
  }, [])
  const clearActive = parent?.clearActive ?? clearLocalActive
  const [hovered, setHovered] = useState(false)
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded)
  const anchorRef = useRef<PopoverAnchor | null>(null)
  const scope = useMemo(() => createScope("hover-preview-target"), [])
  const pendingShowRef = useRef<(() => void) | null>(null)
  const popover = usePopover()
  const subscribeToModifiers = hovered && (trigger === "cmd-hover" || modifiers !== undefined)
  const modifierState = useModifierKeys({ enabled: subscribeToModifiers })
  const selection = useSelection()
  const selectionActive = !!selection?.range || !!selection?.selecting
  const activeForThis = active?.id === id
  const effectiveExpanded = expanded ?? uncontrolledExpanded
  const shouldToggleOnClick = toggleOnClick ?? (expanded !== undefined || onExpandedChange !== undefined)

  const currentModifiers: ModifierState = useMemo(
    () => ({
      super: modifierState.super,
      ctrl: modifierState.ctrl,
      alt: modifierState.alt,
      shift: modifierState.shift,
    }),
    [modifierState.alt, modifierState.ctrl, modifierState.shift, modifierState.super],
  )
  const isArmed = !selectionActive && hovered && activeForThis && armedBy(trigger, modifiers, currentModifiers)
  useMouseCursor(cursor && isArmed ? "pointer" : null)

  const clearPending = useCallback(() => {
    if (!pendingShowRef.current) return
    pendingShowRef.current()
    pendingShowRef.current = null
  }, [])

  const setExpanded = useCallback(
    (next: boolean) => {
      if (expanded === undefined) setUncontrolledExpanded(next)
      onExpandedChange?.(next)
    },
    [expanded, onExpandedChange],
  )
  const toggleExpanded = useCallback(() => setExpanded(!effectiveExpanded), [effectiveExpanded, setExpanded])

  const schedulePopover = useCallback(() => {
    if (!popover || !popoverContent || effectiveExpanded) return
    const anchor = anchorRef.current
    if (!anchor) return
    clearPending()
    pendingShowRef.current = scope.timeout(() => {
      pendingShowRef.current = null
      if (!anchorRef.current || !popoverContent) return
      popover.show(popoverContent, anchor)
    }, HOVER_SHOW_DELAY_MS)
  }, [clearPending, effectiveExpanded, popover, popoverContent])

  useEffect(() => {
    if (!isArmed) {
      clearPending()
      if (activeForThis) popover?.hide()
      return
    }
    schedulePopover()
  }, [activeForThis, clearPending, isArmed, popover, schedulePopover])

  useEffect(() => {
    return () => {
      clearPending()
      clearActive(id)
      void scope[Symbol.asyncDispose]()
    }
  }, [clearActive, clearPending, id, scope])

  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      setHovered(true)
      anchorRef.current = { x: e.x, y: e.y }
      setActive((prev) => (prev && prev.depth > depth ? prev : { id, depth }))
    },
    [depth, id, setActive],
  )

  const onMouseLeave = useCallback(
    (e: SilveryMouseEvent) => {
      e.stopPropagation()
      setHovered(false)
      anchorRef.current = null
      clearPending()
      clearActive(id)
      if (activeForThis) popover?.hide()
    },
    [activeForThis, clearActive, clearPending, id, popover],
  )

  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      if (shouldToggleOnClick) toggleExpanded()
    },
    [onClick, shouldToggleOnClick, toggleExpanded],
  )

  const ctx = useMemo<HoverPreviewCtxValue>(
    () => ({ depth, active, setActive, clearActive }),
    [active, clearActive, depth, setActive],
  )

  return (
    <HoverPreviewCtx.Provider value={ctx}>
      {children({
        props: {
          onMouseEnter,
          onMouseLeave,
          onClick: onClick || shouldToggleOnClick ? handleClick : undefined,
        },
        isHovered: hovered,
        isActive: activeForThis,
        isArmed,
        expanded: effectiveExpanded,
        setExpanded,
        toggleExpanded,
      })}
    </HoverPreviewCtx.Provider>
  )
}
