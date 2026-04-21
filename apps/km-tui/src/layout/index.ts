/**
 * TUI Layout Module (Layer 2 - TUI-only)
 *
 * Layout functions for the TUI that operate on styled ANSI strings.
 * These are TUI-specific and not needed by CLI commands.
 *
 * ## Text utilities (from silvery)
 * - `wrapText` - Word-wrap styled text
 * - `truncateText`, `padText` - Truncate and pad styled text
 * - `constrainText` - Combine wrap + truncate with limits
 * - `displayLength` - ANSI-aware string measurement
 *
 * ## Path rendering (km-ink specific)
 * - `renderPath`, `renderParentPath` - Smart breadcrumb path rendering
 *
 * ## Constraint components (silvery-bound)
 * - `ConstraintRoot` - Provides terminal dimensions via context
 * - `FlexRow`, `FlexItem` - Horizontal space distribution
 * - `TruncatedText` - Auto-truncating text component
 * - `ScrollableList` - Virtualized scrolling list
 */

// Text utilities from factory (which imports from silvery)
export { wrapText, truncateText, padText, constrainText, displayLength, calcScrollOffset } from "./factory.tsx"

// Path rendering (km-ink specific)
export {
  renderPath,
  renderParentPath,
  calcPathLength,
  clampSegmentLabel,
  clampSegmentLabels,
  type PathSegment,
} from "./path.ts"

// Constraint components and hooks (silvery-bound by default)
export {
  // Components
  ConstraintRoot,
  FlexRow,
  FlexItem,
  TruncatedText,
  ScrollableList,
  // Hooks
  useConstraintContext,
  useComputedSize,
  useTerminalSize,
  useTruncatedText,
  useScrollState,
  // Pure functions
  distributeSpace,
  calculateScrollState,
  // Context (for advanced usage)
  ConstraintContext,
  // Types
  type ConstraintRootProps,
  type FlexRowProps,
  type FlexItemProps,
  type TruncatedTextProps,
  type ScrollableListProps,
  type ConstraintContextValue,
  type ComputedSize,
  type TerminalSize,
  type FlexItemConfig,
  type ScrollState,
} from "./silvery.ts"
