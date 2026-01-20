/**
 * Constraint System for Vanilla Ink
 *
 * Re-exports from @beorn/ink-measure with ink-specific adapters.
 *
 * @see @beorn/ink-measure for the standalone package
 */

// Re-export text utilities from @beorn/ink-measure
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

// Ink-specific context (wraps @beorn/ink-measure with ink's useStdout)
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

// Ink-specific components
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
