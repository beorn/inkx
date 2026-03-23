/**
 * Layout components bound to silvery
 */

import { Box, Text, useStdout } from "@silvery/ag-react"
import { createLayoutComponents } from "./factory.tsx"

// Re-export everything from factory (types, pure utilities, hooks)
export * from "./factory.tsx"

// Create and export silvery-bound components
const components = createLayoutComponents({ Box, Text, useStdout })

export const { ConstraintRoot, FlexRow, TruncatedText, ScrollableList, useTruncatedText, useScrollState } = components
