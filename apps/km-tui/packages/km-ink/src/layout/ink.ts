/**
 * Layout components bound to vanilla ink
 */

import { Box, Text, useStdout } from "ink";
import { createLayoutComponents } from "./factory.tsx";

// Re-export everything from factory (types, pure utilities)
export * from "./factory.tsx";

// Create and export ink-bound components
const components = createLayoutComponents({ Box, Text, useStdout });

export const {
  ConstraintRoot,
  FlexRow,
  TruncatedText,
  ScrollableList,
  useTruncatedText,
  useScrollState,
} = components;
