/**
 * Layout components bound to hightea
 */

import { Box, Text, useStdout } from "@hightea/term"
import { createLayoutComponents } from "./factory.tsx"

// Re-export everything from factory (types, pure utilities, hooks)
export * from "./factory.tsx"

// Create and export hightea-bound components
const components = createLayoutComponents({ Box, Text, useStdout })

export const { ConstraintRoot, FlexRow, TruncatedText, ScrollableList, useTruncatedText, useScrollState } = components
