/**
 * Layout Factory
 *
 * Constraint-based layout components for silvery TUI applications.
 * Provides dimension awareness via React context.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ComponentType,
  type ReactNode,
  type ReactElement,
} from "react"
import { constrainText, displayWidth, wrapText, truncateText, padText } from "@silvery/ag-react"

// =============================================================================
// Text Utilities (re-export from silvery with aliases)
// =============================================================================

/** Alias for displayWidth for compatibility */
export const displayLength = displayWidth

export { constrainText, wrapText, truncateText, padText }

/**
 * Simple scroll offset calculator for centering selected item in view.
 * Use calculateScrollState for full virtualized list handling.
 */
export function calcScrollOffset(selectedIndex: number, maxVisible: number, totalCount: number): number {
  return Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, totalCount - maxVisible)))
}

// =============================================================================
// Constraint Context
// =============================================================================

/** Terminal dimensions */
export interface TerminalSize {
  columns: number
  rows: number
}

/** Computed dimensions passed via context */
export interface ComputedSize {
  width: number
  height: number
}

/** Context value */
export interface ConstraintContextValue {
  terminal: TerminalSize
  parent: ComputedSize
}

/** The context - starts undefined, must be wrapped in ConstraintRoot */
export const ConstraintContext = createContext<ConstraintContextValue | undefined>(undefined)

/**
 * Hook to access the constraint context.
 * Returns default values if not in a ConstraintRoot (for testing).
 */
export function useConstraintContext(): ConstraintContextValue {
  const context = useContext(ConstraintContext)

  if (context) {
    return context
  }

  // Default fallback for tests
  return {
    terminal: { columns: 80, rows: 24 },
    parent: { width: 80, height: 24 },
  }
}

/**
 * Hook to access just the computed parent size.
 */
export function useComputedSize(): ComputedSize {
  const { parent } = useConstraintContext()
  return parent
}

/**
 * Hook to access terminal dimensions.
 */
export function useTerminalSize(): TerminalSize {
  const { terminal } = useConstraintContext()
  return terminal
}

// =============================================================================
// FlexItem Component
// =============================================================================

/** Configuration for a flex item */
export interface FlexItemConfig {
  /** Flex grow factor (default 1 for FlexItem, 0 for raw children) */
  flex?: number
  /** Fixed width (takes precedence over flex) */
  width?: number
  /** Minimum width */
  minWidth?: number
  /** Maximum width */
  maxWidth?: number
  /** Allow shrinking below minWidth when necessary */
  squish?: boolean
}

export interface FlexItemProps extends FlexItemConfig {
  children: ReactNode
}

/**
 * FlexItem is a marker component that FlexRow reads props from.
 * The actual rendering is done by FlexRow.
 */
export function FlexItem({ children }: FlexItemProps): ReactElement {
  return <>{children}</>
}

/**
 * Distribute available space among items using integer math.
 * Avoids floating-point errors that cause 1-char gaps.
 */
export function distributeSpace(total: number, configs: FlexItemConfig[], gap: number): number[] {
  if (configs.length === 0) {
    return []
  }

  const gapTotal = Math.max(0, configs.length - 1) * gap
  let available = Math.max(0, total - gapTotal)

  const widths: number[] = new Array<number>(configs.length).fill(0)

  // Pass 1: Allocate fixed widths
  let flexTotal = 0

  configs.forEach((config, i) => {
    if (config.width !== undefined) {
      widths[i] = config.width
      available -= config.width
    } else {
      const flex = config.flex ?? 1
      flexTotal += flex
    }
  })

  available = Math.max(0, available)

  // Pass 2: Distribute remaining space to flex items using integer division
  if (flexTotal > 0 && available > 0) {
    let remaining = available

    configs.forEach((config, i) => {
      if (config.width === undefined) {
        const flex = config.flex ?? 1
        const share = Math.floor((available * flex) / flexTotal)
        widths[i] = share
        remaining -= share
      }
    })

    // Distribute remainder to first flex items (1 char each)
    for (let i = 0; remaining > 0 && i < configs.length; i++) {
      if (configs[i]?.width === undefined) {
        const w = widths[i]
        if (w !== undefined) widths[i] = w + 1
        remaining--
      }
    }
  }

  // Pass 3: Apply min/max constraints
  configs.forEach((config, i) => {
    const currentWidth = widths[i] ?? 0

    if (config.minWidth !== undefined && currentWidth < config.minWidth) {
      if (!config.squish) {
        widths[i] = config.minWidth
      }
    }

    if (config.maxWidth !== undefined && currentWidth > config.maxWidth) {
      widths[i] = config.maxWidth
    }
  })

  return widths
}

// =============================================================================
// ScrollableList Types and calculateScrollState
// =============================================================================

export interface ScrollState<T = unknown> {
  /** Items visible in the viewport */
  visible: { item: T; index: number }[]
  /** Current scroll offset (index of first visible item) */
  scrollOffset: number
  /** Number of items above the viewport */
  overflowTop: number
  /** Number of items below the viewport */
  overflowBottom: number
}

/**
 * Calculate scroll state for a list with a selected item.
 */
export function calculateScrollState<T>(
  items: T[],
  selectedIndex: number,
  availableHeight: number,
  itemHeight: number,
  gap: number,
  hasOverflowIndicator: boolean,
  getItemHeight?: (item: T, index: number) => number,
): ScrollState<T> {
  if (items.length === 0) {
    return {
      visible: [],
      scrollOffset: 0,
      overflowTop: 0,
      overflowBottom: 0,
    }
  }

  const indicatorHeight = hasOverflowIndicator ? 1 : 0

  if (getItemHeight) {
    return calculateVariableHeightScrollState(
      items,
      selectedIndex,
      availableHeight,
      gap,
      indicatorHeight,
      getItemHeight,
    )
  }

  // Fixed height algorithm
  const effectiveItemHeight = itemHeight + gap

  const maxWithoutIndicators = Math.floor(availableHeight / effectiveItemHeight)

  if (items.length <= maxWithoutIndicators) {
    return {
      visible: items.map((item, index) => ({ item, index })),
      scrollOffset: 0,
      overflowTop: 0,
      overflowBottom: 0,
    }
  }

  let maxVisible = Math.max(1, Math.floor((availableHeight - indicatorHeight * 2) / effectiveItemHeight))

  const halfVisible = Math.floor(maxVisible / 2)
  let scrollOffset = Math.max(0, selectedIndex - halfVisible)
  scrollOffset = Math.min(scrollOffset, items.length - maxVisible)

  const willShowTop = scrollOffset > 0
  const willShowBottom = scrollOffset + maxVisible < items.length
  const actualIndicatorSpace = (willShowTop ? indicatorHeight : 0) + (willShowBottom ? indicatorHeight : 0)

  if (hasOverflowIndicator) {
    maxVisible = Math.max(1, Math.floor((availableHeight - actualIndicatorSpace) / effectiveItemHeight))

    scrollOffset = Math.max(0, selectedIndex - Math.floor(maxVisible / 2))
    scrollOffset = Math.min(scrollOffset, items.length - maxVisible)
  }

  const visible = items.slice(scrollOffset, scrollOffset + maxVisible).map((item, i) => ({
    item,
    index: scrollOffset + i,
  }))

  return {
    visible,
    scrollOffset,
    overflowTop: scrollOffset,
    overflowBottom: Math.max(0, items.length - scrollOffset - maxVisible),
  }
}

/**
 * Calculate scroll state for variable-height items.
 */
function calculateVariableHeightScrollState<T>(
  items: T[],
  selectedIndex: number,
  availableHeight: number,
  gap: number,
  indicatorHeight: number,
  getItemHeight: (item: T, index: number) => number,
): ScrollState<T> {
  const heights: number[] = items.map((item, i) => getItemHeight(item, i) + gap)
  const totalHeight = heights.reduce((sum, h) => sum + h, 0)

  if (totalHeight < availableHeight) {
    return {
      visible: items.map((item, index) => ({ item, index })),
      scrollOffset: 0,
      overflowTop: 0,
      overflowBottom: 0,
    }
  }

  const safeSelectedIndex = Math.min(selectedIndex, items.length - 1)
  const selectedHeight = heights[safeSelectedIndex] ?? 1
  let heightBefore = 0
  for (let i = 0; i < safeSelectedIndex; i++) heightBefore += heights[i] ?? 0

  const targetScrollTop = heightBefore - (availableHeight - selectedHeight) / 2

  // Find initial scroll offset
  let scrollOffset = 0
  let cumulativeHeight = 0
  for (let i = 0; i < items.length; i++) {
    if (cumulativeHeight >= targetScrollTop) {
      scrollOffset = i
      break
    }
    cumulativeHeight += heights[i] ?? 0
    scrollOffset = i + 1
  }
  scrollOffset = Math.max(0, Math.min(scrollOffset, items.length - 1))

  const willShowTop = scrollOffset > 0
  let effectiveHeight = availableHeight - (willShowTop ? indicatorHeight : 0)

  let { endIndex } = fillViewport(heights, scrollOffset, items.length, effectiveHeight, indicatorHeight)

  // Selected above viewport
  if (safeSelectedIndex < scrollOffset) {
    scrollOffset = safeSelectedIndex
    effectiveHeight = availableHeight - (scrollOffset > 0 ? indicatorHeight : 0)
    ;({ endIndex } = fillViewport(heights, scrollOffset, items.length, effectiveHeight, indicatorHeight))
  }
  // Selected below viewport
  else if (safeSelectedIndex >= endIndex) {
    // Walk backwards from selected to find scrollOffset
    let usedHeight = heights[safeSelectedIndex] ?? 1
    scrollOffset = safeSelectedIndex
    const hasBottom = safeSelectedIndex + 1 < items.length
    effectiveHeight = availableHeight - indicatorHeight - (hasBottom ? indicatorHeight : 0)
    for (let i = safeSelectedIndex - 1; i >= 0; i--) {
      const h = heights[i] ?? 0
      if (usedHeight + h <= effectiveHeight) {
        usedHeight += h
        scrollOffset = i
      } else {
        break
      }
    }
    effectiveHeight = availableHeight - (scrollOffset > 0 ? indicatorHeight : 0)
    ;({ endIndex } = fillViewport(heights, scrollOffset, items.length, effectiveHeight, indicatorHeight))
  }

  const visible = items.slice(scrollOffset, endIndex).map((item, i) => ({
    item,
    index: scrollOffset + i,
  }))

  return {
    visible,
    scrollOffset,
    overflowTop: scrollOffset,
    overflowBottom: Math.max(0, items.length - endIndex),
  }
}

// =============================================================================
// Framework-bound Components Factory
// =============================================================================

/**
 * Framework interface - the minimal API needed from ink/silvery
 */
export interface Framework {
  Box: ComponentType<{
    flexDirection?: "row" | "column"
    gap?: number
    width?: number
    children?: ReactNode
  }>
  Text: ComponentType<{
    children?: ReactNode
    backgroundColor?: string
    color?: string
  }>
  useStdout: () => { stdout: NodeJS.WriteStream | undefined }
}

// Component prop types
export interface ConstraintRootProps {
  children: ReactNode
  padding?: number | { x?: number; y?: number }
}

export interface FlexRowProps {
  children: ReactNode
  gap?: number
}

export interface TruncatedTextProps {
  children: string
  ellipsis?: string
  maxLines?: number
  width?: number
  pad?: boolean
}

export interface ScrollableListProps<T> {
  items: T[]
  selectedIndex: number
  itemHeight?: number
  getItemHeight?: (item: T, index: number) => number
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode
  renderOverflow?: (direction: "top" | "bottom", count: number) => ReactNode
  gap?: number
  height?: number
}

/**
 * Create layout components bound to a specific framework (ink or silvery)
 */
export function createLayoutComponents(fw: Framework) {
  const { Box, Text, useStdout } = fw

  /**
   * Root component that provides terminal dimensions via context
   */
  function ConstraintRoot({ children, padding = 0 }: ConstraintRootProps): ReactElement {
    const { stdout } = useStdout()
    const [terminal, setTerminal] = useState<TerminalSize>({
      columns: stdout?.columns ?? 80,
      rows: stdout?.rows ?? 24,
    })

    useEffect(() => {
      const handle = () => {
        setTerminal({
          columns: stdout?.columns ?? 80,
          rows: stdout?.rows ?? 24,
        })
      }

      handle()

      stdout?.on("resize", handle)
      return () => {
        stdout?.off("resize", handle)
      }
    }, [stdout])

    const px = typeof padding === "number" ? padding : (padding.x ?? 0)
    const py = typeof padding === "number" ? padding : (padding.y ?? 0)

    const parent: ComputedSize = {
      width: Math.max(1, terminal.columns - px * 2),
      height: Math.max(1, terminal.rows - py * 2),
    }

    return <ConstraintContext.Provider value={{ terminal, parent }}>{children}</ConstraintContext.Provider>
  }

  /**
   * FlexRow distributes horizontal space among children
   */
  function FlexRow({ children, gap = 0 }: FlexRowProps): ReactElement {
    const context = useConstraintContext()
    const { parent, terminal } = context
    const childArray = React.Children.toArray(children)

    const configs: FlexItemConfig[] = childArray.map((child) => {
      if (React.isValidElement(child) && child.type === FlexItem) {
        const props = child.props as FlexItemProps
        return {
          flex: props.flex,
          width: props.width,
          minWidth: props.minWidth,
          maxWidth: props.maxWidth,
          squish: props.squish,
        }
      }
      return { flex: 1 }
    })

    const widths = useMemo(() => distributeSpace(parent.width, configs, gap), [parent.width, configs, gap])

    return (
      <Box flexDirection="row" gap={gap}>
        {childArray.map((child, i) => {
          const width = widths[i] ?? 0
          const childSize: ComputedSize = { width, height: parent.height }

          const content =
            React.isValidElement(child) && child.type === FlexItem ? (child.props as FlexItemProps).children : child

          return (
            <ConstraintContext.Provider key={i} value={{ terminal, parent: childSize }}>
              <Box width={width}>{content}</Box>
            </ConstraintContext.Provider>
          )
        })}
      </Box>
    )
  }

  /**
   * TruncatedText with automatic width from context
   */
  function TruncatedText({
    children,
    ellipsis = "⋯",
    maxLines = 1,
    width: widthOverride,
    pad = false,
  }: TruncatedTextProps): ReactElement {
    let contextSize: ComputedSize | null = null
    try {
      contextSize = useComputedSize()
    } catch {
      // Not inside ConstraintRoot
    }

    const width = widthOverride ?? contextSize?.width ?? 80

    const { lines } = useMemo(
      () => constrainText(children, width, maxLines, pad, ellipsis),
      [children, width, maxLines, pad, ellipsis],
    )

    return (
      <>
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </>
    )
  }

  /**
   * Hook for truncated text (returns lines instead of rendering)
   */
  function useTruncatedText(
    text: string,
    options: {
      maxLines?: number
      width?: number
      pad?: boolean
      ellipsis?: string
    } = {},
  ): { lines: string[]; truncated: boolean } {
    const { maxLines = 1, width: widthOverride, pad = false, ellipsis } = options

    let contextSize: ComputedSize | null = null
    try {
      contextSize = useComputedSize()
    } catch {
      // Not inside ConstraintRoot
    }

    const width = widthOverride ?? contextSize?.width ?? 80

    return useMemo(() => constrainText(text, width, maxLines, pad, ellipsis), [text, width, maxLines, pad, ellipsis])
  }

  /**
   * Default overflow indicator
   */
  function DefaultOverflow({ direction, count }: { direction: "top" | "bottom"; count: number }): ReactElement {
    const arrow = direction === "top" ? "▲" : "▼"
    const text = `${arrow} ${count} more`
    return (
      <Text backgroundColor={"$muted"} color={"$fg"}>
        {text}
      </Text>
    )
  }

  /**
   * ScrollableList with virtualized scrolling
   */
  function ScrollableList<T>({
    items,
    selectedIndex,
    itemHeight = 1,
    getItemHeight,
    renderItem,
    renderOverflow,
    gap = 0,
    height: heightOverride,
  }: ScrollableListProps<T>): ReactElement {
    const { parent } = useConstraintContext()
    const availableHeight = heightOverride ?? parent.height

    const hasOverflowIndicator = true // Always show indicators

    const { visible, overflowTop, overflowBottom } = useMemo(
      () =>
        calculateScrollState(
          items,
          selectedIndex,
          availableHeight,
          itemHeight,
          gap,
          hasOverflowIndicator,
          getItemHeight,
        ),
      [items, selectedIndex, availableHeight, itemHeight, gap, hasOverflowIndicator, getItemHeight],
    )

    const renderOverflowIndicator = (direction: "top" | "bottom", count: number): ReactNode => {
      if (renderOverflow) {
        return renderOverflow(direction, count)
      }
      return <DefaultOverflow direction={direction} count={count} />
    }

    return (
      <Box flexDirection="column" gap={gap}>
        {overflowTop > 0 && renderOverflowIndicator("top", overflowTop)}
        {visible.map(({ item, index }) => (
          <React.Fragment key={index}>{renderItem(item, index, index === selectedIndex)}</React.Fragment>
        ))}
        {overflowBottom > 0 && renderOverflowIndicator("bottom", overflowBottom)}
      </Box>
    )
  }

  /**
   * Hook to calculate scroll state from context
   */
  function useScrollState<T>(
    items: T[],
    selectedIndex: number,
    options: {
      itemHeight?: number
      gap?: number
      height?: number
      hasOverflowIndicator?: boolean
      getItemHeight?: (item: T, index: number) => number
    } = {},
  ): ScrollState<T> {
    const { parent } = useConstraintContext()
    const { itemHeight = 1, gap = 0, height: heightOverride, hasOverflowIndicator = true, getItemHeight } = options

    const availableHeight = heightOverride ?? parent.height

    return useMemo(
      () =>
        calculateScrollState(
          items,
          selectedIndex,
          availableHeight,
          itemHeight,
          gap,
          hasOverflowIndicator,
          getItemHeight,
        ),
      [items, selectedIndex, availableHeight, itemHeight, gap, hasOverflowIndicator, getItemHeight],
    )
  }

  return {
    // Components
    ConstraintRoot,
    FlexRow,
    FlexItem, // Pass through from this module
    TruncatedText,
    ScrollableList,
    // Hooks
    useTruncatedText,
    useScrollState,
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Fill the viewport starting from startIndex, reserving space for bottom
 * overflow indicators when more items follow. Used by variable-height scroll
 * calculation to avoid duplicating the same forward-fill loop.
 */
function fillViewport(
  heights: number[],
  startIndex: number,
  totalItems: number,
  effectiveHeight: number,
  indicatorHeight: number,
): { endIndex: number; usedHeight: number } {
  let usedHeight = 0
  let endIndex = startIndex
  for (let i = startIndex; i < totalItems; i++) {
    const itemH = heights[i] ?? 1
    const needsBottomIndicator = i + 1 < totalItems
    const reserveForBottom = needsBottomIndicator ? indicatorHeight : 0
    if (usedHeight + itemH <= effectiveHeight - reserveForBottom) {
      usedHeight += itemH
      endIndex = i + 1
    } else {
      break
    }
  }
  return { endIndex, usedHeight }
}
