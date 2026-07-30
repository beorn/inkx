/**
 * Silvery Box Component
 *
 * The primary layout primitive for Silvery. Box is a flexbox container that can hold
 * other Box or Text components. It supports all standard flexbox properties,
 * dimensions, spacing, and borders.
 *
 * Box renders to an 'silvery-box' host element that the reconciler converts to an
 * SilveryNode with an associated Yoga layout node.
 *
 * Box provides NodeContext to its children, enabling useBoxRect/useScrollRect hooks.
 * It also supports forwardRef for imperative access and onLayout for layout callbacks.
 */

import {
  type ForwardedRef,
  type JSX,
  type ReactNode,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { effect as signalEffect } from "@silvery/signals"
import { NodeContext, ScrollInteractionContext } from "../context"
import { getLayoutSignals, observeLayoutSignal } from "@silvery/ag/layout-signals"
import type { BoxProps as BoxPropsType, AgNode, Rect } from "@silvery/ag/types"
import type { SilveryWheelEvent } from "@silvery/ag/mouse-event-types"
import { useKineticScroll } from "../hooks/useKineticScroll"
import { StylePriorityContext } from "../style-priority"

// ============================================================================
// Props
// ============================================================================

export interface BoxProps extends BoxPropsType {
  /** Child elements */
  children?: ReactNode
}

/**
 * Methods exposed via ref on Box component.
 */
export interface BoxHandle {
  /** Get the underlying SilveryNode */
  getNode(): AgNode | null
  /** Get the current content-relative layout rect */
  getBoxRect(): Rect | null
  /** Get the current screen-relative layout rect */
  getScrollRect(): Rect | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * Flexbox container component for terminal UIs.
 *
 * Provides NodeContext to children, enabling useBoxRect/useScrollRect hooks.
 * Supports forwardRef for imperative access and onLayout for layout callbacks.
 *
 * @example
 * ```tsx
 * // Basic vertical layout (default)
 * <Box>
 *   <Text>Line 1</Text>
 *   <Text>Line 2</Text>
 * </Box>
 *
 * // Horizontal layout with spacing
 * <Box flexDirection="row" gap={2}>
 *   <Box width={10}><Text>Left</Text></Box>
 *   <Box flexGrow={1}><Text>Center</Text></Box>
 *   <Box width={10}><Text>Right</Text></Box>
 * </Box>
 *
 * // With border
 * <Box borderStyle="single" borderColor="green" padding={1}>
 *   <Text>Boxed content</Text>
 * </Box>
 *
 * // With ref and onLayout
 * const boxRef = useRef<BoxHandle>(null);
 * <Box
 *   ref={boxRef}
 *   onLayout={(layout) => console.log('Size:', layout.width, layout.height)}
 * >
 *   <Text>Content</Text>
 * </Box>
 * ```
 */
const BoxPrimitive = forwardRef(function BoxPrimitive(
  props: BoxProps,
  ref: ForwardedRef<BoxHandle>,
): JSX.Element {
  const { children, onLayout, ...callerProps } = props
  const nodeRef = useRef<AgNode | null>(null)
  const [node, setNode] = useState<AgNode | null>(null)
  const scrollInteraction = useContext(ScrollInteractionContext)
  const stylePriority = useContext(StylePriorityContext)
  const restProps = {
    ...callerProps,
    ...(stylePriority?.foreground === undefined ? {} : { color: stylePriority.foreground }),
    ...(stylePriority?.background === undefined
      ? {}
      : { backgroundColor: stylePriority.background }),
  }

  // Track the last layout we reported to onLayout to avoid duplicate calls
  const lastReportedLayout = useRef<Rect | null>(null)

  // After mount, ref points to the SilveryNode. Update state once to provide
  // the node to children via context. Only runs on mount ([] deps).
  useLayoutEffect(() => {
    if (nodeRef.current) {
      setNode(nodeRef.current)
    }
  }, [])

  // `overflow="scroll"` is an interaction contract. Announce the mounted
  // capability independently of who owns scroll physics (`Box` default,
  // ListView, ScrollArea, or another explicit onWheel handler).
  useLayoutEffect(() => {
    if (restProps.overflow !== "scroll") return
    return scrollInteraction?.acquire()
  }, [restProps.overflow, scrollInteraction])

  // Wire up onLayout callback - subscribe via layout signals
  useLayoutEffect(() => {
    if (!onLayout || !node) return

    const releaseObservation = observeLayoutSignal(node, "boxRect")
    const signals = getLayoutSignals(node)
    const onLayoutRef = { current: onLayout }
    onLayoutRef.current = onLayout

    const dispose = signalEffect(() => {
      const layout = signals.boxRect()
      if (!layout) return

      // Only call onLayout if layout actually changed
      const last = lastReportedLayout.current
      if (
        !last ||
        last.x !== layout.x ||
        last.y !== layout.y ||
        last.width !== layout.width ||
        last.height !== layout.height
      ) {
        lastReportedLayout.current = layout
        onLayoutRef.current(layout)
      }
    })

    return () => {
      dispose()
      releaseObservation()
    }
  }, [node, onLayout])

  // Expose imperative methods via ref
  useImperativeHandle(
    ref,
    () => ({
      getNode: () => nodeRef.current,
      getBoxRect: () => nodeRef.current?.boxRect ?? null,
      getScrollRect: () => nodeRef.current?.scrollRect ?? null,
    }),
    [],
  )

  // Render silvery-box with ref, wrap children in NodeContext
  // The reconciler creates an SilveryNode, ref gives us access to it
  return (
    <silvery-box ref={nodeRef} {...restProps}>
      <NodeContext.Provider value={node}>{children}</NodeContext.Provider>
    </silvery-box>
  )
})

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") {
    ref(value)
  } else if (ref !== null) {
    ref.current = value
  }
}

/**
 * Default interaction owner for a plain `overflow="scroll"` Box.
 *
 * Explicit `onWheel` opts out so virtualized and application-specific
 * surfaces retain their existing scroll state machines.
 */
const AutoScrollingBox = forwardRef(function AutoScrollingBox(
  props: BoxProps,
  ref: ForwardedRef<BoxHandle>,
): JSX.Element {
  const localRef = useRef<BoxHandle | null>(null)
  const externalOffsetRef = useRef(props.scrollOffset)
  const scrollToRef = useRef(props.scrollTo)
  const { scrollOffset, onWheel, setScrollOffset, reset } = useKineticScroll({
    initialOffset: props.scrollOffset ?? 0,
    maxScroll: () => {
      const state = localRef.current?.getNode()?.scrollState
      return state ? Math.max(0, state.contentHeight - state.viewportHeight) : 0
    },
    getInitialFloat: () => localRef.current?.getNode()?.scrollState?.offset ?? 0,
  })

  const attachRef = useCallback(
    (handle: BoxHandle | null) => {
      localRef.current = handle
      setForwardedRef(ref, handle)
    },
    [ref],
  )

  // An explicit offset is programmatic intent, not an opt-out from wheel
  // interaction. Sync only when the caller changes it so unrelated renders
  // do not snap a user-scrolled viewport back to a stale value.
  useEffect(() => {
    if (externalOffsetRef.current === props.scrollOffset) return
    externalOffsetRef.current = props.scrollOffset
    if (props.scrollOffset !== undefined) setScrollOffset(props.scrollOffset)
  }, [props.scrollOffset, setScrollOffset])

  // Declarative ensure-visible runs in the layout phase. Reseed the kinetic
  // state from that resolved offset on the next wheel packet.
  useEffect(() => {
    if (scrollToRef.current === props.scrollTo) return
    scrollToRef.current = props.scrollTo
    reset()
  }, [props.scrollTo, reset])

  const handleWheel = useCallback(
    (event: SilveryWheelEvent) => {
      const state = localRef.current?.getNode()?.scrollState
      const maxScroll = state ? Math.max(0, state.contentHeight - state.viewportHeight) : 0
      if (maxScroll <= 0) return
      event.preventDefault()
      event.stopPropagation()
      onWheel(event)
    },
    [onWheel],
  )

  return (
    <BoxPrimitive {...props} ref={attachRef} scrollOffset={scrollOffset} onWheel={handleWheel} />
  )
})

/**
 * Flexbox container with user-scrollable overflow by default.
 *
 * A bounded `overflow="scroll"` Box automatically owns kinetic wheel
 * scrolling. Pass `onWheel` to replace that default with a specialized owner.
 */
export const Box = forwardRef(function Box(
  props: BoxProps,
  ref: ForwardedRef<BoxHandle>,
): JSX.Element {
  if (props.overflow === "scroll" && props.onWheel === undefined) {
    return <AutoScrollingBox {...props} ref={ref} />
  }
  return <BoxPrimitive {...props} ref={ref} />
})
