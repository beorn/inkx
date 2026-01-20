/**
 * Constraint System for Ink
 *
 * Re-exports from ink-measure with inkx-specific adapters.
 *
 * @see ink-measure for the standalone package
 */

// Re-export text utilities from ink-measure
export {
  displayLength,
  stripAnsi,
  wrapText,
  truncateText,
  padText,
  constrainText,
  ANSI_REGEX,
  calcScrollOffset,
} from "@beorn/ink-measure";

// Inkx-specific context (wraps ink-measure with inkx's useStdout)
export {
  ConstraintRoot,
  ConstraintContext,
  useConstraintContext,
  useComputedSize,
  useTerminalSize,
  type ConstraintRootProps,
  type ConstraintContextValue,
  type ComputedSize,
  type TerminalSize,
} from "./context.tsx";

// Inkx-specific components
export {
  TruncatedText,
  useTruncatedText,
  type TruncatedTextProps,
} from "./TruncatedText.tsx";

export {
  FlexRow,
  FlexItem,
  distributeSpace,
  type FlexRowProps,
  type FlexItemProps,
  type FlexItemConfig,
} from "./FlexRow.tsx";

export {
  ScrollableList,
  calculateScrollState,
  useScrollState,
  type ScrollableListProps,
  type ScrollState,
} from "./ScrollableList.tsx";
