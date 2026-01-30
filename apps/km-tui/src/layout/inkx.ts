/**
 * Layout components bound to inkx
 */

import { Box, Text, useStdout } from "inkx"
import { createLayoutComponents } from "./factory.tsx"

// Re-export everything from factory (types, pure utilities, hooks)
export * from "./factory.tsx"

// Create and export inkx-bound components
const components = createLayoutComponents({ Box, Text, useStdout })

export const {
  ConstraintRoot,
  FlexRow,
  TruncatedText,
  ScrollableList,
  useTruncatedText,
  useScrollState,
} = components
