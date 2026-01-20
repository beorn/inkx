/**
 * ink-measure - Constraint-based layout system for Ink
 *
 * Add dimension awareness to existing Ink apps incrementally via context.
 * Components automatically know their available width/height without
 * manual prop threading.
 *
 * ## Quick Start
 *
 * ```tsx
 * import { ConstraintRoot, TruncatedText, useComputedSize } from "ink-measure";
 * import { useStdout, Text } from "ink";
 *
 * function App() {
 *   const { stdout } = useStdout();
 *   return (
 *     <ConstraintRoot stdout={stdout} padding={1}>
 *       <MyComponent />
 *     </ConstraintRoot>
 *   );
 * }
 *
 * function MyComponent() {
 *   const { width, height } = useComputedSize();
 *   return (
 *     <TruncatedText renderLine={(line, i) => <Text key={i}>{line}</Text>}>
 *       {veryLongText}
 *     </TruncatedText>
 *   );
 * }
 * ```
 *
 * ## When to use ink-measure vs inkx
 *
 * - **ink-measure**: Existing Ink apps - add dimension awareness incrementally
 * - **inkx**: New TUI apps, or full migration - layout-first rendering
 */

// Context and hooks
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

// Components
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

// Text utilities
export {
  displayLength,
  stripAnsi,
  wrapText,
  truncateText,
  padText,
  constrainText,
  ANSI_REGEX,
} from "./text.ts";

/**
 * Simple scroll offset calculator for centering selected item in view.
 * Use calculateScrollState for full virtualized list handling.
 */
export function calcScrollOffset(
  selectedIndex: number,
  maxVisible: number,
  totalCount: number,
): number {
  return Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, totalCount - maxVisible),
    ),
  );
}
