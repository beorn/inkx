/**
 * Constraint System for Ink
 *
 * A constraint-based layout system that exposes computed dimensions to child
 * components, eliminating manual width threading.
 *
 * @see .beads/km-inkx.3-design.md for full design specification
 *
 * ## Usage
 *
 * ```tsx
 * import {
 *   ConstraintRoot,
 *   TruncatedText,
 *   useComputedSize,
 * } from "../constraints/index.ts";
 *
 * // Wrap your app in ConstraintRoot
 * <ConstraintRoot padding={1}>
 *   <MyComponent />
 * </ConstraintRoot>
 *
 * // Components automatically know their available width
 * function MyComponent() {
 *   return <TruncatedText maxLines={2}>{longText}</TruncatedText>;
 * }
 *
 * // Or access size directly
 * function CustomComponent() {
 *   const { width, height } = useComputedSize();
 *   return <Text>Available: {width}x{height}</Text>;
 * }
 * ```
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
